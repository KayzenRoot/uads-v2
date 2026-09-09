import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runDispatch, runContextExpand, ExecutionBlockedError } from "../kernel/execution.js";
import { runPlan, runResume } from "../kernel/orchestrator.js";
import { buildImpactAndPack, currentOrRefreshIndex, refreshIndex } from "../kernel/intelligence.js";
import { lastIndexScan, setDiscoveryLimitsForTests, setRepoIdentityProviderForTests } from "../kernel/index-engine.js";
import { analyzeImpact } from "../kernel/impact.js";
import { readIndexBundle } from "../kernel/intelligence-persist.js";
import { IndexIncompleteError } from "../kernel/intelligence-types.js";
import { runStatus } from "../commands/status.js";
import { findPackageRoot } from "../lib/version.js";
import { getUadsPaths } from "../lib/workspace.js";
import { containsAbsoluteHostPath } from "../lib/secrets.js";

type EvalCase = { id: string; name: string };

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "UADS Eval",
  GIT_AUTHOR_EMAIL: "uads@example.com",
  GIT_COMMITTER_NAME: "UADS Eval",
  GIT_COMMITTER_EMAIL: "uads@example.com",
};

function initRepo(root: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: root, env: gitEnv });
  execFileSync("git", ["-c", "user.email=uads@example.com", "-c", "user.name=UADS Eval", "config", "commit.gpgsign", "false"], {
    cwd: root,
    env: gitEnv,
  });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/uads-context-eval.git"], { cwd: root, env: gitEnv });
}

function gitCommit(root: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: root, env: gitEnv });
  execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "user.email=uads@example.com", "-c", "user.name=UADS Eval", "commit", "-m", message],
    { cwd: root, env: gitEnv },
  );
}

function write(root: string, rel: string, contents: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function seedGraphRepo(repo: string): void {
  initRepo(repo);
  write(repo, "src/ui/Button.tsx", `import "./button.css";\nexport const Button = () => "ok";\n`);
  write(repo, "src/ui/button.css", "button { color: blue; }\n");
  write(repo, "src/ui/Button.test.tsx", `import { Button } from "./Button";\nexport const t = Button;\n`);
  write(repo, "src/util/format.ts", `export const format = (v: string) => v;\n`);
  write(repo, "src/ui/Card.tsx", `import { format } from "../util/format";\nexport const Card = format("card");\n`);
  write(repo, "src/backend/api.ts", `export const handler = () => "api";\n`);
  write(repo, "src/web3/vault.ts", `export const withdraw = () => "no";\n`);
  write(repo, "tests/format.test.ts", `import { format } from "../src/util/format";\nexport const t = format("x");\n`);
  write(repo, "schemas/button.schema.json", `{ "type": "object" }\n`);
  write(repo, "package.json", `${JSON.stringify({ name: "ctx-eval", version: "1.0.0" }, null, 2)}\n`);
  gitCommit(repo, "init");
}

function frontendIntake() {
  return {
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective: "Change the primary button color.",
    domainSignals: ["frontend"],
    affectedAreas: ["src/ui"],
    inScope: ["src/ui"],
    outOfScope: ["src/backend", "src/web3"],
    acceptanceCriteria: ["Button uses the new color"],
    classifier: "host-structured",
  };
}

function packPaths(pack: { items: Array<{ path: string }> }): string[] {
  return pack.items.map((item) => item.path);
}

function impactPaths(report: {
  inScopeCandidates: Array<{ path: string }>;
  supportingContext: Array<{ path: string }>;
  possibleImpact: Array<{ path: string }>;
}): string[] {
  return [...report.inScopeCandidates, ...report.supportingContext, ...report.possibleImpact].map((item) => item.path);
}

function runCase(id: string, fn: () => void): { id: string; ok: boolean; error?: string } {
  try {
    fn();
    return { id, ok: true };
  } catch (error) {
    return { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function main(): number {
  const root = findPackageRoot();
  const cases: EvalCase[] = fs
    .readdirSync(path.join(root, "evals/context"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(root, "evals/context", name), "utf8")) as EvalCase)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const results = cases.map((item) =>
    runCase(item.id, () => {
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-cci-"));
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-cci-home-"));
      seedGraphRepo(repo);
      const planned = runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
      const paths = getUadsPaths(planned.workOrder.projectId, home);
      const indexedCount = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }).state.files.length;

      if (item.id === "CCI1") {
        const result = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C2",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        const selected = packPaths(result.pack);
        if (!selected.includes("src/ui/Button.tsx")) throw new Error("missing button seed");
        if (selected.some((rel) => rel.startsWith("src/backend") || rel.startsWith("src/web3"))) {
          throw new Error("C2 pack leaked unrelated backend/web3");
        }
        if (selected.length >= indexedCount) throw new Error("C2 pack is not smaller than the repository");
        return;
      }

      if (item.id === "CCI2") {
        const result = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C3",
          requestedPaths: ["src/util/format.ts"],
          workOrder: planned.workOrder,
        });
        const selected = impactPaths(result.report);
        if (!selected.includes("src/ui/Card.tsx")) throw new Error("shared utility did not identify dependent Card");
        if (result.pack.contextRadius === "C5") throw new Error("shared utility required C5");
        return;
      }

      if (item.id === "CCI3") {
        refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        const reused = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        if (reused.state.mode !== "reused") throw new Error(`expected reused, got ${reused.state.mode}`);
        if (reused.state.filesParsed !== 0) throw new Error("unchanged index reparsed source");
        write(repo, "src/ui/Button.tsx", `import "./button.css";\nexport const Button = () => "changed";\n`);
        const incremental = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        if (incremental.state.mode !== "incrementalUpdate") throw new Error(`expected incrementalUpdate, got ${incremental.state.mode}`);
        if (incremental.state.filesParsed > 3) throw new Error(`single-file change parsed ${incremental.state.filesParsed} files`);
        return;
      }

      if (item.id === "CCI4") {
        fs.unlinkSync(path.join(repo, "src/ui/Card.tsx"));
        gitCommit(repo, "delete card");
        const bundle = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        if (bundle.graph.nodes.some((node) => node.path === "src/ui/Card.tsx")) throw new Error("deleted node remained");
        if (bundle.graph.edges.some((edge) => edge.source === "src/ui/Card.tsx" || edge.target === "src/ui/Card.tsx")) {
          throw new Error("stale edges remained after delete");
        }
        return;
      }

      if (item.id === "CCI5") {
        write(repo, "src/cycle/a.ts", `import { b } from "./b";\nexport const a = b;\n`);
        write(repo, "src/cycle/b.ts", `import { a } from "./a";\nexport const b = a;\n`);
        gitCommit(repo, "cycle");
        const result = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C3",
          requestedPaths: ["src/cycle/a.ts"],
          workOrder: planned.workOrder,
        });
        if (result.pack.items.length > 20) throw new Error("cycle traversal exploded");
        return;
      }

      if (item.id === "CCI6") {
        const c1 = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C1",
          requestedPaths: ["src/util/format.ts"],
          workOrder: planned.workOrder,
        });
        if (packPaths(c1.pack).includes("src/ui/Card.tsx")) throw new Error("C1 included a wider-radius dependent");
        const c3 = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C3",
          requestedPaths: ["src/util/format.ts"],
          workOrder: planned.workOrder,
        });
        if (!impactPaths(c3.report).includes("src/ui/Card.tsx")) throw new Error("C3 missing dependent Card");
        return;
      }

      if (item.id === "CCI7") {
        runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
        let blocked = false;
        try {
          analyzeImpact({
            bundle: readIndexBundle(paths, findPackageRoot())!,
            projectId: planned.workOrder.projectId,
            workOrderId: planned.workOrder.workOrderId,
            executionRunId: null,
            radius: "C5",
            requestedPaths: ["src/ui/Button.tsx"],
            affectedAreas: [],
            approveC5: false,
          });
        } catch (error) {
          blocked = /C5/.test(error instanceof Error ? error.message : String(error));
        }
        try {
          runContextExpand({ cwd: repo, uadsHome: home, reason: "need C5 without approval", approveC5: false });
        } catch (error) {
          if (error instanceof ExecutionBlockedError && /C5/.test(error.message)) blocked = true;
        }
        if (!blocked) throw new Error("C5 was not protected");
        return;
      }

      if (item.id === "CCI8") {
        let rejected = false;
        try {
          buildImpactAndPack({
            repoRoot: repo,
            projectId: planned.workOrder.projectId,
            paths,
            radius: "C1",
            requestedPaths: ["../secret.txt"],
            workOrder: planned.workOrder,
          });
        } catch {
          rejected = true;
        }
        if (!rejected) throw new Error("traversal path was accepted");
        write(repo, "src/ui/escape.ts", `import secret from "../../../etc/passwd";\nexport const x = secret;\n`);
        gitCommit(repo, "unsafe import");
        const bundle = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        if (bundle.graph.nodes.some((node) => node.path.includes("etc/passwd") || node.path.includes(".."))) {
          throw new Error("escaped path entered the graph");
        }
        return;
      }

      if (item.id === "CCI9") {
        const result = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C2",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        const serialized = JSON.stringify(result.pack);
        if (serialized.includes("button { color")) throw new Error("Context Pack persisted source");
        if (containsAbsoluteHostPath(serialized)) throw new Error("Context Pack leaked host paths");
        if (!result.pack.items[0]?.contentDigest) throw new Error("missing content digest");
        return;
      }

      if (item.id === "CCI10") {
        const first = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C1",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        write(repo, "src/ui/Button.tsx", `import "./button.css";\nexport const Button = () => "stale";\n`);
        const second = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C1",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        if (first.pack.indexDigest === second.pack.indexDigest) throw new Error("stale pack treated as current");
        const parsed = lastIndexScan.filesParsed;
        runStatus(repo, { uadsHome: home, json: true });
        runResume({ cwd: repo, uadsHome: home });
        if (lastIndexScan.filesParsed !== parsed) throw new Error("status/resume triggered an index scan");
        return;
      }

      if (item.id === "CCI11") {
        const first = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        const headA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
        write(repo, "src/ui/Button.tsx", `import "./button.css";\nexport const Button = () => "commit-b";\n`);
        gitCommit(repo, "commit-b");
        const pack = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C1",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        const headB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
        if (headA === headB) throw new Error("expected a new commit");
        if (pack.bundle.state.gitHead !== headB) throw new Error("clean HEAD B was not the current index identity");
        const before = first.state.files.find((file) => file.path === "src/ui/Button.tsx")?.contentDigest;
        const after = pack.bundle.state.files.find((file) => file.path === "src/ui/Button.tsx")?.contentDigest;
        if (!after || after === before) throw new Error("commit B reused stale Button digest");
        if (pack.bundle.state.filesReused < 1) throw new Error("unrelated files were not reused");
        return;
      }

      if (item.id === "CCI12") {
        write(repo, "src/ui/Button.tsx", `import "./button.css";\nexport const Button = () => "dirty-x";\n`);
        const first = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C1",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        write(repo, "src/ui/Button.tsx", `import "./button.css";\nexport const Button = () => "dirty-y";\n`);
        if (`import "./button.css";\nexport const Button = () => "dirty-x";\n`.length !== `import "./button.css";\nexport const Button = () => "dirty-y";\n`.length) {
          throw new Error("fixture lengths diverged");
        }
        const second = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C1",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        if (first.pack.indexDigest === second.pack.indexDigest) throw new Error("same-status dirty rewrite reused X as Y");
        return;
      }

      if (item.id === "CCI13") {
        setRepoIdentityProviderForTests(() => ({ gitAvailable: false, gitHead: null, dirtyDigest: "git-unavailable" }));
        try {
          const first = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
          write(repo, "src/ui/Button.tsx", `import "./button.css";\nexport const Button = () => "nogit";\n`);
          const second = currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
          const before = first.state.files.find((file) => file.path === "src/ui/Button.tsx")?.contentDigest;
          const after = second.state.files.find((file) => file.path === "src/ui/Button.tsx")?.contentDigest;
          if (!after || after === before) throw new Error("no-git path reused a stale digest");
        } finally {
          setRepoIdentityProviderForTests(null);
        }
        return;
      }

      if (item.id === "CCI14") {
        write(repo, "src/ui/orphan.ts", `import { missing } from "./missing-mod";\nexport const o = missing;\n`);
        gitCommit(repo, "unresolved");
        const first = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths, forceFull: true });
        if (!first.graph.unresolved.some((item) => item.source === "src/ui/orphan.ts" && item.specifier === "./missing-mod")) {
          throw new Error("expected unresolved ref on orphan.ts");
        }
        write(repo, "src/util/format.ts", `export const format = (v: string) => v + "y";\n`);
        const second = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        if (!second.graph.unresolved.some((item) => item.source === "src/ui/orphan.ts" && item.specifier === "./missing-mod")) {
          throw new Error("unrelated incremental update dropped unresolved refs");
        }
        write(repo, "src/ui/orphan.ts", `export const o = 1;\n`);
        const third = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        if (third.graph.unresolved.some((item) => item.source === "src/ui/orphan.ts" && item.specifier === "./missing-mod")) {
          throw new Error("obsolete unresolved ref survived source change");
        }
        return;
      }

      if (item.id === "CCI15") {
        setDiscoveryLimitsForTests({ maxFiles: 2 });
        try {
          refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths, forceFull: true });
          let blocked = false;
          try {
            buildImpactAndPack({
              repoRoot: repo,
              projectId: planned.workOrder.projectId,
              paths,
              radius: "C1",
              requestedPaths: ["src/ui/Button.tsx"],
              workOrder: planned.workOrder,
            });
          } catch (error) {
            blocked = error instanceof IndexIncompleteError || /incomplete|truncated/i.test(error instanceof Error ? error.message : String(error));
          }
          if (!blocked) throw new Error("truncated index was accepted as current");
        } finally {
          setDiscoveryLimitsForTests(null);
        }
        return;
      }

      if (item.id === "CCI16") {
        write(repo, "src/ui/contract.d.ts", "export type Label = string;\n");
        write(repo, "src/ui/uses-contract.ts", `import type { Label } from "./contract";\nexport const label: Label = "x";\n`);
        write(repo, "src/ui/string-only.ts", `const word = "export";\nconst other = 1;\n`);
        write(repo, "package.json", `${JSON.stringify({ name: "ctx-eval", version: "1.0.0", main: "./src/ui/Button.tsx", dependencies: { leftpad: "1.0.0" } }, null, 2)}\n`);
        write(repo, "tsconfig.json", `${JSON.stringify({ files: ["src/ui/Button.tsx"], include: ["src/**/*.ts"] }, null, 2)}\n`);
        write(repo, "docs/button.md", "[button](../src/ui/Button.tsx)\n[remote](https://example.com/Button.tsx)\n");
        gitCommit(repo, "relations");
        const bundle = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths, forceFull: true });
        if (!bundle.graph.edges.some((edge) => edge.type === "interface-reference" && edge.target === "src/ui/contract.d.ts")) {
          throw new Error("missing interface-reference");
        }
        if (!bundle.graph.edges.some((edge) => edge.type === "manifest-reference" && edge.target === "src/ui/Button.tsx")) {
          throw new Error("missing manifest-reference");
        }
        if (bundle.graph.edges.some((edge) => edge.type === "manifest-reference" && edge.target.includes("leftpad"))) {
          throw new Error("npm package name entered the graph");
        }
        if (!bundle.graph.edges.some((edge) => edge.type === "configures" && edge.target === "src/ui/Button.tsx")) {
          throw new Error("missing configures");
        }
        if (bundle.graph.edges.some((edge) => edge.type === "configures" && edge.target.includes("*"))) {
          throw new Error("glob configures entered the graph");
        }
        if (!bundle.graph.edges.some((edge) => edge.type === "documents" && edge.target === "src/ui/Button.tsx")) {
          throw new Error("missing documents");
        }
        if (bundle.graph.edges.some((edge) => edge.type === "documents" && /example\.com/.test(edge.target))) {
          throw new Error("http document link entered the graph");
        }
        if (!bundle.interfaces.contracts.some((item) => item.path === "src/ui/Button.tsx" && item.kind === "export")) {
          throw new Error("missing export boundary");
        }
        if (bundle.interfaces.contracts.some((item) => item.path === "src/ui/string-only.ts" && item.kind === "export")) {
          throw new Error("string mention treated as export boundary");
        }
        return;
      }

      if (item.id === "CCI17") {
        write(
          repo,
          "src/ui/examples.ts",
          [
            `const example = 'import "./Button"';`,
            `const snippet = 'require("./Button")';`,
            "const template = `import \"./Button\"`;",
            "// import \"./Button\"",
            "const other = 1;",
            "",
          ].join("\n"),
        );
        gitCommit(repo, "lexical-false");
        const bundle = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths, forceFull: true });
        if (bundle.graph.edges.some((edge) => edge.source === "src/ui/examples.ts")) {
          throw new Error("string/template/comment syntax created a graph edge");
        }
        if (bundle.interfaces.contracts.some((item) => item.path === "src/ui/examples.ts" && item.kind === "export")) {
          throw new Error("string-only file treated as export boundary");
        }
        if (!bundle.graph.edges.some((edge) => edge.source === "src/ui/Button.tsx" && edge.target === "src/ui/button.css")) {
          throw new Error("real executable import was lost");
        }
        return;
      }

      if (item.id === "CCI18") {
        write(repo, "src/dyn-a.ts", `export const loadA = (name: string) => import(name);\n`);
        write(repo, "src/dyn-b.ts", `export const loadB = (mod: string) => import(mod);\n`);
        gitCommit(repo, "computed");
        const bundle = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths, forceFull: true });
        const unresolved = bundle.graph.unresolved.filter((item) => item.specifier === "(computed)");
        if (!unresolved.some((item) => item.source === "src/dyn-a.ts")) throw new Error("missing computed unresolved for dyn-a");
        if (!unresolved.some((item) => item.source === "src/dyn-b.ts")) throw new Error("missing computed unresolved for dyn-b");
        if (unresolved.filter((item) => item.source === "src/dyn-a.ts").length !== 1) throw new Error("duplicate computed record for dyn-a");
        const again = refreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
        const left = JSON.stringify(bundle.graph.unresolved.map((item) => `${item.source}:${item.specifier}`).sort());
        const right = JSON.stringify(again.graph.unresolved.map((item) => `${item.source}:${item.specifier}`).sort());
        if (left !== right) throw new Error("computed unresolved result is not deterministic");
        return;
      }

      if (item.id === "CCI19") {
        write(repo, "docs/button.md", "[button](../src/ui/Button.tsx)\n");
        write(repo, "docs/unrelated.md", "no link to the button\n");
        write(repo, "package.json", `${JSON.stringify({ name: "ctx-eval", version: "1.0.0", main: "./src/ui/Button.tsx" }, null, 2)}\n`);
        write(repo, "tsconfig.json", `${JSON.stringify({ files: ["src/ui/Button.tsx"] }, null, 2)}\n`);
        gitCommit(repo, "reverse-docs");
        const c2 = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C2",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        const selected = impactPaths(c2.report);
        if (!selected.includes("docs/button.md")) throw new Error("related doc missing at C2");
        if (selected.includes("docs/unrelated.md")) throw new Error("unrelated doc selected");
        if (!selected.includes("tsconfig.json")) throw new Error("related config missing at C2");
        if (!c2.pack.docs.includes("docs/button.md")) throw new Error("Context Pack docs missing related markdown");
        if (!c2.pack.items.some((item) => item.path === "package.json" && item.role === "config" && /manifest-reference/.test(item.reason))) {
          throw new Error("manifest reverse relation not classified as config");
        }
        const c1 = buildImpactAndPack({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          radius: "C1",
          requestedPaths: ["src/ui/Button.tsx"],
          workOrder: planned.workOrder,
        });
        if (packPaths(c1.pack).some((rel) => rel.startsWith("docs/") || rel === "tsconfig.json" || rel === "package.json")) {
          throw new Error("C1 widened because reverse docs/config edges exist");
        }
        return;
      }

      throw new Error(`unhandled eval ${item.id}`);
    }),
  );

  for (const result of results) {
    process.stdout.write(`${result.ok ? "PASS" : "FAIL"} ${result.id}${result.error ? ` ${result.error}` : ""}\n`);
  }
  const failed = results.filter((result) => !result.ok).length;
  process.stdout.write(`\n${results.length - failed} passed, ${failed} failed, ${results.length} total\n`);
  return failed === 0 ? 0 : 1;
}

process.exit(main());
