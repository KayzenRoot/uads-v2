import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseNameStatusZ } from "../src/kernel/change-digest.js";
import {
  buildOrRefreshIndex,
  lastIndexScan,
  setDiscoveryLimitsForTests,
  setRepoIdentityProviderForTests,
} from "../src/kernel/index-engine.js";
import { buildImpactAndPack, currentOrRefreshIndex } from "../src/kernel/intelligence.js";
import { IndexIncompleteError } from "../src/kernel/intelligence-types.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";

function write(root: string, rel: string, contents: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function gitHead(root: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

describe("context intelligence correction 01", () => {
  afterEach(() => {
    setRepoIdentityProviderForTests(null);
    setDiscoveryLimitsForTests(null);
  });

  it("parses git name-status -z including renames", () => {
    const entries = parseNameStatusZ("M\0src/a.ts\0R100\0src/old.ts\0src/new.ts\0D\0src/gone.ts\0");
    expect(entries).toEqual([
      { code: "M", path: "src/a.ts" },
      { code: "R1", path: "src/new.ts", origPath: "src/old.ts" },
      { code: "D", path: "src/gone.ts" },
    ]);
  });

  it("refreshes a clean commit-to-commit change of an already indexed file", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c01a.git");
    write(repo, "src/keep.ts", "export const keep = 1;\n");
    write(repo, "src/app.ts", `import { keep } from "./keep";\nexport const v = keep;\n`);
    gitCommit(repo, "commit-a");
    const paths = ensureWorkspace("aaaaaaaaaaaaaaaa", home);
    const first = buildOrRefreshIndex({ repoRoot: repo, projectId: "aaaaaaaaaaaaaaaa", paths });
    const headA = gitHead(repo);
    expect(first.state.gitHead).toBe(headA);
    write(repo, "src/app.ts", `import { keep } from "./keep";\nexport const v = keep + 1;\n`);
    gitCommit(repo, "commit-b");
    const headB = gitHead(repo);
    expect(headB).not.toBe(headA);
    const second = currentOrRefreshIndex({ repoRoot: repo, projectId: "aaaaaaaaaaaaaaaa", paths });
    expect(second.state.gitHead).toBe(headB);
    expect(second.state.stale).toBe(false);
    const app = second.state.files.find((file) => file.path === "src/app.ts");
    const prevApp = first.state.files.find((file) => file.path === "src/app.ts");
    expect(app?.contentDigest).not.toBe(prevApp?.contentDigest);
    expect(second.graph.edges.some((edge) => edge.source === "src/app.ts" && edge.target === "src/keep.ts")).toBe(true);
    expect(second.state.files.find((file) => file.path === "src/keep.ts")?.contentDigest).toBe(
      first.state.files.find((file) => file.path === "src/keep.ts")?.contentDigest,
    );
    expect(second.state.filesReused).toBeGreaterThan(0);
  });

  it("does not treat a same-status dirty rewrite as current", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c01b.git");
    write(repo, "src/app.ts", "export const n = 1;\n");
    gitCommit(repo, "init");
    const paths = ensureWorkspace("bbbbbbbbbbbbbbbb", home);
    write(repo, "src/app.ts", "export const n = 2;\n");
    const first = currentOrRefreshIndex({ repoRoot: repo, projectId: "bbbbbbbbbbbbbbbb", paths });
    const digestX = first.state.files.find((file) => file.path === "src/app.ts")?.contentDigest;
    write(repo, "src/app.ts", "export const n = 3;\n");
    expect("export const n = 2;\n".length).toBe("export const n = 3;\n".length);
    const second = currentOrRefreshIndex({ repoRoot: repo, projectId: "bbbbbbbbbbbbbbbb", paths });
    const digestY = second.state.files.find((file) => file.path === "src/app.ts")?.contentDigest;
    expect(digestY).not.toBe(digestX);
    expect(second.state.indexDigest).not.toBe(first.state.indexDigest);
  });

  it("revalidates no-git indexes instead of returning them forever", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c01c.git");
    write(repo, "src/app.ts", "export const n = 1;\n");
    gitCommit(repo, "init");
    const paths = ensureWorkspace("cccccccccccccccc", home);
    setRepoIdentityProviderForTests(() => ({ gitAvailable: false, gitHead: null, dirtyDigest: "git-unavailable" }));
    const first = currentOrRefreshIndex({ repoRoot: repo, projectId: "cccccccccccccccc", paths });
    expect(first.state.confidence).toBe("reduced");
    write(repo, "src/app.ts", "export const n = 2;\n");
    const second = currentOrRefreshIndex({ repoRoot: repo, projectId: "cccccccccccccccc", paths });
    expect(second.state.files.find((file) => file.path === "src/app.ts")?.contentDigest).not.toBe(
      first.state.files.find((file) => file.path === "src/app.ts")?.contentDigest,
    );
  });

  it("preserves unresolved refs for unchanged sources", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c01d.git");
    write(repo, "src/a.ts", `import { missing } from "./missing";\nexport const a = missing;\n`);
    write(repo, "src/b.ts", "export const b = 1;\n");
    gitCommit(repo, "init");
    const paths = ensureWorkspace("dddddddddddddddd", home);
    const first = buildOrRefreshIndex({ repoRoot: repo, projectId: "dddddddddddddddd", paths });
    expect(first.graph.unresolved.some((item) => item.source === "src/a.ts" && item.specifier === "./missing")).toBe(true);
    write(repo, "src/b.ts", "export const b = 2;\n");
    const second = buildOrRefreshIndex({ repoRoot: repo, projectId: "dddddddddddddddd", paths });
    expect(second.graph.unresolved.some((item) => item.source === "src/a.ts" && item.specifier === "./missing")).toBe(true);
    write(repo, "src/a.ts", `import { b } from "./b";\nexport const a = b;\n`);
    const third = buildOrRefreshIndex({ repoRoot: repo, projectId: "dddddddddddddddd", paths });
    expect(third.graph.unresolved.some((item) => item.source === "src/a.ts" && item.specifier === "./missing")).toBe(false);
  });

  it("fails closed when discovery is truncated", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c01e.git");
    write(repo, "src/a.ts", "export const a = 1;\n");
    write(repo, "src/b.ts", "export const b = 1;\n");
    write(repo, "src/c.ts", "export const c = 1;\n");
    gitCommit(repo, "init");
    const paths = ensureWorkspace("eeeeeeeeeeeeeeee", home);
    setDiscoveryLimitsForTests({ maxFiles: 2 });
    const bundle = buildOrRefreshIndex({ repoRoot: repo, projectId: "eeeeeeeeeeeeeeee", paths });
    expect(bundle.state.complete).toBe(false);
    expect(bundle.state.truncated).toBe(true);
    expect(bundle.state.confidence).toBe("reduced");
    expect(bundle.state.stale).toBe(true);
    expect(() =>
      buildImpactAndPack({
        repoRoot: repo,
        projectId: "eeeeeeeeeeeeeeee",
        paths,
        radius: "C1",
        requestedPaths: ["src/a.ts"],
      }),
    ).toThrow(IndexIncompleteError);
    expect(lastIndexScan.filesConsidered).toBeLessThanOrEqual(2);
  });

  it("emits conservative relationship classes and export boundaries", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c01f.git");
    write(repo, "src/app.ts", `import type { Button } from "./contract";\nexport const app = 1;\n`);
    write(repo, "src/contract.d.ts", "export type Button = { label: string };\n");
    write(repo, "src/string-only.ts", `const word = "export";\nconst other = 1;\n`);
    write(
      repo,
      "package.json",
      `${JSON.stringify({ name: "rel", version: "1.0.0", main: "./src/app.ts", dependencies: { leftpad: "1.0.0" } }, null, 2)}\n`,
    );
    write(repo, "tsconfig.json", `${JSON.stringify({ files: ["src/app.ts"], include: ["src/**/*.ts"] }, null, 2)}\n`);
    write(repo, "docs/note.md", "[app](../src/app.ts)\n[remote](https://example.com/app.ts)\n[escape](../../secret.ts)\n");
    gitCommit(repo, "init");
    const paths = ensureWorkspace("ffffffffffffffff", home);
    const bundle = buildOrRefreshIndex({ repoRoot: repo, projectId: "ffffffffffffffff", paths });
    expect(bundle.graph.edges.some((edge) => edge.type === "interface-reference" && edge.target === "src/contract.d.ts")).toBe(true);
    expect(bundle.graph.edges.some((edge) => edge.type === "imports" && edge.target === "src/contract.d.ts")).toBe(true);
    expect(bundle.graph.edges.some((edge) => edge.type === "manifest-reference" && edge.target === "src/app.ts")).toBe(true);
    expect(bundle.graph.edges.some((edge) => edge.type === "manifest-reference" && edge.target.includes("leftpad"))).toBe(false);
    expect(bundle.graph.edges.some((edge) => edge.type === "configures" && edge.target === "src/app.ts")).toBe(true);
    expect(bundle.graph.edges.some((edge) => edge.type === "configures" && /src\/\*\*/.test(edge.target))).toBe(false);
    expect(bundle.graph.edges.some((edge) => edge.type === "documents" && edge.target === "src/app.ts")).toBe(true);
    expect(bundle.graph.edges.some((edge) => edge.type === "documents" && /example\.com/.test(edge.target))).toBe(false);
    expect(bundle.graph.nodes.some((node) => node.path.includes("secret.ts") || node.path.includes(".."))).toBe(false);
    expect(bundle.interfaces.contracts.some((item) => item.path === "src/app.ts" && item.kind === "export")).toBe(true);
    expect(bundle.interfaces.contracts.some((item) => item.path === "src/string-only.ts" && item.kind === "export")).toBe(false);
  });
});
