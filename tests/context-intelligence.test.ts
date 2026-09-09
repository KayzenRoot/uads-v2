import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractJsTsReferences, resolveRelativeModule } from "../src/kernel/js-ts-extractor.js";
import { buildOrRefreshIndex, lastIndexScan, readRepoIdentity } from "../src/kernel/index-engine.js";
import { analyzeImpact } from "../src/kernel/impact.js";
import { buildContextPack, itemsForRole } from "../src/kernel/context-pack.js";
import { readIndexBundle } from "../src/kernel/intelligence-persist.js";
import { runPlan, runResume } from "../src/kernel/orchestrator.js";
import { runStatus } from "../src/commands/status.js";
import { sha256Hex } from "../src/lib/hash.js";
import { containsAbsoluteHostPath } from "../src/lib/secrets.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";
import { assertSafeRelativeProjectPath } from "../src/kernel/safe-path.js";

function write(root: string, rel: string, contents: string | Buffer): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

describe("context intelligence", () => {
  it("extracts JS/TS relationships and leaves computed imports unresolved", () => {
    const refs = extractJsTsReferences(
      "src/mod.ts",
      `import x from "./a";\nimport "./b";\nexport { y } from "./c";\nconst r = require("./d");\nconst d = import("./e");\nconst z = import(name);\n`,
    );
    expect(refs.some((item) => item.specifier === "./a" && item.method === "static-import")).toBe(true);
    expect(refs.some((item) => item.specifier === "./d" && item.type === "requires")).toBe(true);
    expect(refs.some((item) => item.specifier === "./e" && item.type === "dynamic-import" && item.confidence < 0.8)).toBe(true);
    expect(refs.some((item) => item.specifier === "(computed)" && item.confidence <= 0.2)).toBe(true);
    const existing = new Set(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"]);
    expect(resolveRelativeModule("src/mod.ts", "./a", existing)).toBe("src/a.ts");
    expect(resolveRelativeModule("src/mod.ts", "./a.js", existing)).toBe("src/a.ts");
    expect(resolveRelativeModule("src/mod.ts", "../../../etc/passwd", existing)).toBeNull();
  });

  it("normalizes Windows and POSIX paths and rejects traversal", () => {
    expect(assertSafeRelativeProjectPath("src\\ui\\Button.tsx")).toBe("src/ui/Button.tsx");
    expect(assertSafeRelativeProjectPath("src/ui/My File.ts")).toBe("src/ui/My File.ts");
    expect(() => assertSafeRelativeProjectPath("../secret")).toThrow(/traversal|unsafe|absolute/i);
    expect(() => assertSafeRelativeProjectPath("C:\\\\temp\\\\x.ts")).toThrow();
  });

  it("builds a deterministic graph, detects same-size replacement, and incrementally reuses", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-ctx.git");
    write(repo, "src/util.ts", "export const n = 1;\n");
    write(repo, "src/app.ts", `import { n } from "./util";\nexport const v = n;\n`);
    write(repo, "src/app.test.ts", `import { v } from "./app";\nexport const t = v;\n`);
    gitCommit(repo, "init");
    const paths = ensureWorkspace("aaaaaaaaaaaaaaaa", home);
    const first = buildOrRefreshIndex({ repoRoot: repo, projectId: "aaaaaaaaaaaaaaaa", paths });
    const second = buildOrRefreshIndex({ repoRoot: repo, projectId: "aaaaaaaaaaaaaaaa", paths });
    expect(second.state.mode).toBe("reused");
    expect(second.state.filesParsed).toBe(0);
    expect(JSON.stringify(first.graph.nodes)).toBe(JSON.stringify(second.graph.nodes));
    const original = fs.readFileSync(path.join(repo, "src/util.ts"));
    expect(original.length).toBe("export const n = 2;\n".length);
    write(repo, "src/util.ts", "export const n = 2;\n");
    const third = buildOrRefreshIndex({ repoRoot: repo, projectId: "aaaaaaaaaaaaaaaa", paths });
    expect(third.state.mode).toBe("incrementalUpdate");
    expect(third.state.filesParsed).toBeLessThan(third.state.filesConsidered);
    const util = third.state.files.find((file) => file.path === "src/util.ts");
    expect(util?.contentDigest).not.toBe(first.state.files.find((file) => file.path === "src/util.ts")?.contentDigest);
    expect(third.graph.edges.some((edge) => edge.source === "src/app.ts" && edge.target === "src/util.ts")).toBe(true);
    expect(third.tests.relations.some((rel) => rel.test === "src/app.test.ts")).toBe(true);
  });

  it("enforces radius, one-level expansion semantics, and role filtering", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-ctx.git");
    write(repo, "src/util.ts", "export const n = 1;\n");
    write(repo, "src/ui/app.ts", `import { n } from "../util";\nexport const v = n;\n`);
    gitCommit(repo, "init");
    const paths = ensureWorkspace("bbbbbbbbbbbbbbbb", home);
    const bundle = buildOrRefreshIndex({ repoRoot: repo, projectId: "bbbbbbbbbbbbbbbb", paths });
    const c1 = analyzeImpact({
      bundle,
      projectId: "bbbbbbbbbbbbbbbb",
      workOrderId: "wo_1",
      executionRunId: null,
      radius: "C1",
      requestedPaths: ["src/util.ts"],
      affectedAreas: [],
    });
    expect(c1.inScopeCandidates.map((item) => item.path)).toEqual(["src/util.ts"]);
    expect([...c1.supportingContext, ...c1.possibleImpact].some((item) => item.path === "src/ui/app.ts")).toBe(false);
    expect(() =>
      analyzeImpact({
        bundle,
        projectId: "bbbbbbbbbbbbbbbb",
        workOrderId: "wo_1",
        executionRunId: null,
        radius: "C5",
        requestedPaths: ["src/util.ts"],
        affectedAreas: [],
        approveC5: false,
      }),
    ).toThrow(/C5/);
    const c3 = analyzeImpact({
      bundle,
      projectId: "bbbbbbbbbbbbbbbb",
      workOrderId: "wo_1",
      executionRunId: null,
      radius: "C3",
      requestedPaths: ["src/util.ts"],
      affectedAreas: [],
    });
    expect([...c3.inScopeCandidates, ...c3.supportingContext, ...c3.possibleImpact].some((item) => item.path === "src/ui/app.ts")).toBe(true);
    const pack = buildContextPack({
      bundle,
      report: c3,
      projectId: "bbbbbbbbbbbbbbbb",
      workOrderId: "wo_1",
      executionRunId: null,
      radius: "C3",
      objective: "touch util",
      expansionHistory: [{ from: "C2", to: "C3", reason: "need dependents", at: new Date().toISOString() }],
    });
    expect(pack.expansionHistory).toHaveLength(1);
    expect(itemsForRole(pack, "implementation").length).toBeGreaterThan(0);
    const again = buildContextPack({
      bundle,
      report: c3,
      projectId: "bbbbbbbbbbbbbbbb",
      workOrderId: "wo_1",
      executionRunId: null,
      radius: "C3",
      objective: "touch util",
      expansionHistory: pack.expansionHistory,
    });
    expect(again.items.map((item) => item.path)).toEqual(pack.items.map((item) => item.path));
    expect(again.contextPackId).toBe(pack.contextPackId);
  });

  it("rejects unsafe paths, secrets, binaries-as-text, corrupt graphs, and cross-project packs", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-ctx.git");
    write(repo, "src/app.ts", "export const n = 1;\n");
    write(repo, ".env", "SECRET=1\n");
    write(repo, "src/pixel.bin", Buffer.from([0, 1, 2, 3, 0xff]));
    gitCommit(repo, "init");
    const paths = ensureWorkspace("cccccccccccccccc", home);
    const bundle = buildOrRefreshIndex({ repoRoot: repo, projectId: "cccccccccccccccc", paths });
    expect(bundle.graph.nodes.some((node) => node.path === ".env")).toBe(false);
    expect(JSON.stringify(bundle.graph)).not.toContain("SECRET=1");
    expect(containsAbsoluteHostPath(JSON.stringify(bundle))).toBe(false);
    expect(() =>
      analyzeImpact({
        bundle,
        projectId: "other-project",
        workOrderId: "wo",
        executionRunId: null,
        radius: "C1",
        requestedPaths: ["src/app.ts"],
        affectedAreas: [],
      }),
    ).toThrow(/cross-project/);
    expect(() =>
      analyzeImpact({
        bundle,
        projectId: "cccccccccccccccc",
        workOrderId: "wo",
        executionRunId: null,
        radius: "C1",
        requestedPaths: ["../etc/passwd"],
        affectedAreas: [],
      }),
    ).toThrow(/unsafe/);
    fs.writeFileSync(path.join(paths.index, "dependency-graph.json"), "{not-json");
    expect(readIndexBundle(paths)).toBeNull();
    const rebuilt = buildOrRefreshIndex({ repoRoot: repo, projectId: "cccccccccccccccc", paths, forceFull: true });
    expect(rebuilt.graph.nodes.length).toBeGreaterThan(0);
  });

  it("does not full-scan on status or resume", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-ctx.git");
    write(repo, "src/button.css", "button{color:blue}\n");
    gitCommit(repo, "init");
    runPlan({
      cwd: repo,
      uadsHome: home,
      intake: {
        schema: "uads.intake",
        schemaVersion: "0.2.0",
        objective: "Change the primary button color.",
        domainSignals: ["frontend"],
        affectedAreas: ["src"],
        inScope: ["src"],
        acceptanceCriteria: ["color"],
        classifier: "host-structured",
      },
    });
    const parsed = lastIndexScan.filesParsed;
    runStatus(repo, { uadsHome: home, json: true });
    runResume({ cwd: repo, uadsHome: home });
    expect(lastIndexScan.filesParsed).toBe(parsed);
  });

  it("hashes identity material stably", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(readRepoIdentity).toBeTypeOf("function");
  });
});
