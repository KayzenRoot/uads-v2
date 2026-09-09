import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runCacheExplainCommand, runCacheStatusCommand } from "../commands/cache.js";
import { runCostExplainCommand, runCostStatusCommand } from "../commands/cost.js";
import { evaluateCache } from "../kernel/cache-engine.js";
import { evaluateTokenBudget } from "../kernel/cost-governor.js";
import { readCostLedger, readQptSnapshot } from "../kernel/cost-persist.js";
import {
  ExecutionBlockedError,
  deriveGateStates,
  runContextExpand,
  runDispatch,
  runEvidenceRecord,
  runVerify,
} from "../kernel/execution.js";
import { validateCacheReuseEvidence } from "../kernel/cache-integrity.js";
import { diagnoseFailure, recordFailure } from "../kernel/fault-localization.js";
import { buildImpactAndPack, currentOrRefreshIndex } from "../kernel/intelligence.js";
import { readCurrentContextPack } from "../kernel/intelligence-persist.js";
import { persistEvidenceCacheRecord, readEvidenceCacheRecord, markCacheRecordStatus, listCacheRecordIdsForGate } from "../kernel/cache-persist.js";
import { listEvidenceRecords } from "../kernel/execution-persist.js";
import { persistPlan } from "../kernel/persist.js";
import { runPlan } from "../kernel/orchestrator.js";
import { findPackageRoot } from "../lib/version.js";
import { getUadsPaths } from "../lib/workspace.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";

type EvalCase = { id: string; name: string };

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "UADS Eval",
  GIT_AUTHOR_EMAIL: "uads@example.com",
  GIT_COMMITTER_NAME: "UADS Eval",
  GIT_COMMITTER_EMAIL: "uads@example.com",
};

const TOKEN = `ghp_${"b".repeat(36)}`;

function initRepo(root: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: root, env: gitEnv });
  execFileSync("git", ["-c", "user.email=uads@example.com", "-c", "user.name=UADS Eval", "config", "commit.gpgsign", "false"], {
    cwd: root,
    env: gitEnv,
  });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/uads-cost-eval.git"], { cwd: root, env: gitEnv });
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

function writeResolvedPackage(repo: string, packageName: string, version: string): void {
  const pkgDir = path.join(repo, "node_modules", packageName);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, "package.json"), `${JSON.stringify({ name: packageName, version }, null, 2)}\n`);
}

function seedRepo(repo: string): void {
  initRepo(repo);
  write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("ok");\n`);
  write(repo, "src/ui/Button.test.tsx", `import { Button } from "./Button";\nexport const t = Button;\n`);
  write(repo, "src/util/format.ts", `export const format = (v: string) => v;\n`);
  write(repo, "docs/README.md", "# fixture\n");
  write(repo, "package.json", `${JSON.stringify(
    {
      name: "cost-eval",
      version: "1.0.0",
      scripts: {
        test: "vitest run",
        "unit-test": "vitest run",
        lint: "echo lint ok",
        build: "echo build ok",
      },
      devDependencies: { vitest: "^1.6.0" },
    },
    null,
    2,
  )}\n`);
  writeResolvedPackage(repo, "vitest", "1.6.0");
  gitCommit(repo, "init");
}

function intake() {
  return {
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective: "Change the primary button color.",
    domainSignals: ["frontend"],
    affectedAreas: ["src/ui"],
    inScope: ["src/ui"],
    outOfScope: ["src/backend"],
    acceptanceCriteria: ["Button uses the new color"],
    classifier: "host-structured",
  };
}

function gateCommand(gate: string): string {
  if (gate === "unit-test") return "npm test :: vitest run";
  return `npm run ${gate}`;
}

function recordGate(repo: string, home: string, gate: string, extra = ""): void {
  const outputPath = path.join(home, `gate-${gate}.txt`);
  fs.writeFileSync(outputPath, `${gate} captured output${extra}\n`);
  runEvidenceRecord({
    cwd: repo,
    uadsHome: home,
    gateId: gate,
    kind: "command",
    role: "test-engineer",
    command: gateCommand(gate),
    exitCode: 0,
    outputPath,
    summary: `${gate} recorded`,
  });
}

function prepared(repo: string, home: string) {
  seedRepo(repo);
  const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
  runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
  write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("red");\n`);
  runVerify({ cwd: repo, uadsHome: home });
  recordGate(repo, home, "unit-test");
  return { planned, paths: getUadsPaths(planned.workOrder.projectId, home), root: findPackageRoot() };
}

function bundleOf(repo: string, home: string, projectId: string) {
  const paths = getUadsPaths(projectId, home);
  return currentOrRefreshIndex({ repoRoot: repo, projectId, paths, schemaRoot: findPackageRoot() });
}

function evalCache(
  repo: string,
  home: string,
  projectId: string,
  gateId: string,
  extra?: Partial<Parameters<typeof evaluateCache>[0]>,
) {
  return evaluateCache({
    paths: getUadsPaths(projectId, home),
    projectId,
    gateId,
    repoRoot: repo,
    bundle: bundleOf(repo, home, projectId),
    ...extra,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCase(item: EvalCase, fn: () => void): { id: string; ok: boolean; error?: string } {
  try {
    fn();
    return { id: item.id, ok: true };
  } catch (error) {
    return { id: item.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function main(): number {
  const cases: EvalCase[] = [
    { id: "CC1", name: "exact eligible reuse" },
    { id: "CC2", name: "relevant source invalidation" },
    { id: "CC3", name: "unrelated change remains reusable" },
    { id: "CC4", name: "dependency invalidation" },
    { id: "CC5", name: "manifest invalidation" },
    { id: "CC6", name: "tool version invalidation" },
    { id: "CC7", name: "non-reusable security/review" },
    { id: "CC8", name: "corrupt cache fail closed" },
    { id: "CC9", name: "cross-project rejection" },
    { id: "CC10", name: "hard token budget" },
    { id: "CC11", name: "soft token budget" },
    { id: "CC12", name: "duplicate work avoidance" },
    { id: "CC13", name: "secret-safe cache" },
    { id: "CC14", name: "truthful QPT" },
    { id: "CC15", name: "command contract mismatch" },
    { id: "CC16", name: "toolchain mismatch" },
    { id: "CC17", name: "integration not reusable" },
    { id: "CC18", name: "config-only invalidation" },
    { id: "CC19", name: "cache-reuse provenance digest" },
    { id: "CC20", name: "validity-first candidate selection" },
    { id: "CC21", name: "transactional hard-budget preflight" },
    { id: "CC22", name: "QPT diagnostic and diagnosis reuse" },
    { id: "CC23", name: "unprovable toolchain fresh-required" },
    { id: "CC24", name: "resolved producer version invalidation" },
    { id: "CC25", name: "cache-reuse provenance cross-check" },
    { id: "CC26", name: "tampered provenance cannot satisfy gate" },
    { id: "CC27", name: "wrong evidence kind cannot HIT" },
  ];

  const results = cases.map((item) =>
    runCase(item, () => {
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-cc-repo-"));
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-cc-home-"));
      if (item.id === "CC1") {
        const { planned } = prepared(repo, home);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test", {
          workOrderId: planned.workOrder.workOrderId,
          liveChangeDigest: runVerify({ cwd: repo, uadsHome: home }).run.currentChangeDigest,
        });
        assert(decision.decision === "HIT", `CC1 expected HIT, got ${decision.decision}`);
        assert(decision.maySatisfyGate, "CC1 HIT must be allowed to satisfy the gate");
      } else if (item.id === "CC2") {
        const { planned } = prepared(repo, home);
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("stale");\n`);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "STALE", `CC2 expected STALE, got ${decision.decision}`);
        assert(decision.executionRequired, "CC2 must require rerun");
      } else if (item.id === "CC3") {
        const { planned } = prepared(repo, home);
        write(repo, "docs/README.md", "# unrelated docs edit\n");
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "HIT", `CC3 expected HIT after unrelated docs change, got ${decision.decision}`);
        assert(!decision.changedValidityInputs.some((entry) => entry.includes("README")), "CC3 must treat docs as unrelated");
      } else if (item.id === "CC4") {
        const { planned } = prepared(repo, home);
        write(repo, "src/util/format.ts", `export const format = (v: string) => v + "!";\n`);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "STALE", `CC4 expected STALE, got ${decision.decision}`);
      } else if (item.id === "CC5") {
        const { planned } = prepared(repo, home);
        write(repo, "package.json", `${JSON.stringify({ name: "cost-eval", version: "1.0.1" }, null, 2)}\n`);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "STALE", `CC5 expected STALE, got ${decision.decision}`);
      } else if (item.id === "CC6") {
        const { planned } = prepared(repo, home);
        writeResolvedPackage(repo, "vitest", "9.9.9");
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "STALE", `CC6 expected STALE, got ${decision.decision}`);
        assert(decision.changedValidityInputs.includes("toolIdentity"), "CC6 must name toolIdentity");
      } else if (item.id === "CC7") {
        const { planned } = prepared(repo, home);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "security-review");
        assert(decision.decision === "NOT_REUSABLE", `CC7 expected NOT_REUSABLE, got ${decision.decision}`);
        assert(decision.executionRequired, "CC7 security review remains required");
      } else if (item.id === "CC8") {
        const { planned } = prepared(repo, home);
        const paths = getUadsPaths(planned.workOrder.projectId, home);
        fs.mkdirSync(path.join(paths.workspace, "cache"), { recursive: true });
        fs.writeFileSync(path.join(paths.workspace, "cache", "evidence-index.json"), "{not-json");
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "BLOCKED" || decision.decision === "MISS", `CC8 fail-closed, got ${decision.decision}`);
        assert(decision.maySatisfyGate === false, "CC8 must not satisfy the gate");
      } else if (item.id === "CC9") {
        const { planned } = prepared(repo, home);
        const paths = getUadsPaths(planned.workOrder.projectId, home);
        const evidenceDir = path.join(paths.workspace, "cache", "evidence");
        const first = fs.readdirSync(evidenceDir)[0];
        assert(first, "CC9 missing local cache record");
        const foreign = JSON.parse(fs.readFileSync(path.join(evidenceDir, first), "utf8")) as {
          cacheRecordId: string;
          projectId: string;
        };
        foreign.projectId = "ffffffffffff0000";
        foreign.cacheRecordId = "ecr_injectedforeign1";
        fs.writeFileSync(path.join(evidenceDir, "ecr_injectedforeign1.json"), `${JSON.stringify(foreign, null, 2)}\n`);
        const indexPath = path.join(paths.workspace, "cache", "evidence-index.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
          projectId: string;
          records: Array<{ cacheRecordId: string; gateId: string; reusable: boolean; status: string }>;
        };
        index.records.push({
          cacheRecordId: "ecr_injectedforeign1",
          gateId: "unit-test",
          reusable: true,
          status: "reusable",
        });
        fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.candidateCacheRecordId !== "ecr_injectedforeign1" || decision.decision !== "HIT", "CC9 reused foreign project cache");
        assert(decision.decision === "BLOCKED" || decision.reasonCodes.includes("CROSS_PROJECT") || decision.decision === "HIT", "CC9 unexpected decision");
        if (decision.decision === "HIT") {
          assert(decision.candidateCacheRecordId !== "ecr_injectedforeign1", "CC9 HIT used the injected foreign record");
        }
      } else if (item.id === "CC10") {
        seedRepo(repo);
        const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
        persistPlan({
          paths: getUadsPaths(planned.workOrder.projectId, home),
          workOrder: {
            ...planned.workOrder,
            tokenBudget: { ...planned.workOrder.tokenBudget, hardLimit: 1 },
          },
          decision: planned.decision,
          checkpoint: planned.checkpoint,
          contextPlan: planned.contextPlan,
        });
        let blocked = false;
        try {
          runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
        } catch (error) {
          blocked = error instanceof ExecutionBlockedError || /hard token budget/i.test(String(error));
        }
        assert(blocked, "CC10 dispatch must block on hard budget");
        assert(evaluateTokenBudget(100, 50, 1) === "hard-blocked", "CC10 formula");
      } else if (item.id === "CC11") {
        seedRepo(repo);
        const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
        persistPlan({
          paths: getUadsPaths(planned.workOrder.projectId, home),
          workOrder: {
            ...planned.workOrder,
            tokenBudget: { ...planned.workOrder.tokenBudget, softLimit: 1, hardLimit: 1_000_000 },
          },
          decision: planned.decision,
          checkpoint: planned.checkpoint,
          contextPlan: planned.contextPlan,
        });
        runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
        const ledger = readCostLedger(getUadsPaths(planned.workOrder.projectId, home), planned.workOrder.projectId);
        assert(ledger?.budgetStatus === "soft-warning", `CC11 expected soft-warning, got ${ledger?.budgetStatus}`);
        const explain = JSON.parse(runCostExplainCommand({ cwd: repo, uadsHome: home, json: true })) as { outcome: string };
        assert(explain.outcome === "warn", "CC11 explain must warn, not block");
      } else if (item.id === "CC12") {
        const { planned } = prepared(repo, home);
        write(repo, "src/ui/orphan.css", "/* unrelated to the cached unit basis */\n");
        const verified = runVerify({ cwd: repo, uadsHome: home });
        assert(!verified.pendingGates.includes("unit-test"), "CC12 HIT should satisfy eligible unit-test");
        assert(verified.pendingGates.length >= 0, "CC12 pending list remains defined");
        const explain = JSON.parse(
          runCacheExplainCommand({ cwd: repo, uadsHome: home, gateId: "security-review", json: true }),
        ) as { decision: string };
        assert(explain.decision === "NOT_REUSABLE", "CC12 non-reusable gate stays pending/required");
      } else if (item.id === "CC13") {
        seedRepo(repo);
        const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
        runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
        write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("red");\n`);
        runVerify({ cwd: repo, uadsHome: home });
        recordGate(repo, home, "unit-test", ` token=${TOKEN} `);
        const cacheDir = path.join(getUadsPaths(planned.workOrder.projectId, home).workspace, "cache");
        const raw = fs.readdirSync(path.join(cacheDir, "evidence")).map((name) =>
          fs.readFileSync(path.join(cacheDir, "evidence", name), "utf8"),
        );
        assert(raw.every((text) => !containsUnredactedSecret(text)), "CC13 cache persisted a secret");
        assert(raw.every((text) => !containsAbsoluteHostPath(text)), "CC13 cache persisted a host path");
      } else if (item.id === "CC14") {
        const { planned } = prepared(repo, home);
        runVerify({ cwd: repo, uadsHome: home });
        const qpt = readQptSnapshot(getUadsPaths(planned.workOrder.projectId, home));
        const status = JSON.parse(runCostStatusCommand({ cwd: repo, uadsHome: home, json: true })) as {
          tokenEstimateMethod: string;
          agentCallsReported: number | null;
          limitations: string[];
        };
        assert(status.tokenEstimateMethod === "byte-heuristic", "CC14 must label byte-heuristic");
        assert(status.agentCallsReported === null, "CC14 invented agent calls");
        assert(status.limitations.some((line) => /not a financial/i.test(line) || /byte-heuristic/i.test(line)), "CC14 missing limitations");
        assert(!JSON.stringify(status).includes("$"), "CC14 invented currency");
        assert(qpt?.qptFormula.includes("estimatedContextTokens"), "CC14 missing documented formula");
        const cacheStatus = runCacheStatusCommand({ cwd: repo, uadsHome: home, json: true });
        assert(cacheStatus.includes("reusableRecords"), "CC14 cache status missing");
      } else if (item.id === "CC15") {
        const { planned } = prepared(repo, home);
        const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as {
          scripts: Record<string, string>;
        };
        pkg.scripts.test = "vitest run withdrawal.test.ts";
        fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision !== "HIT", `CC15 command mismatch must not HIT, got ${decision.decision}`);
        assert(
          decision.changedValidityInputs.includes("gateReuseContractIdentity") || decision.decision === "STALE",
          "CC15 must report contract mismatch",
        );
      } else if (item.id === "CC16") {
        const { planned } = prepared(repo, home);
        writeResolvedPackage(repo, "vitest", "3.0.0");
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "STALE", `CC16 expected STALE, got ${decision.decision}`);
        assert(decision.changedValidityInputs.includes("toolIdentity"), "CC16 toolchain mismatch");
      } else if (item.id === "CC17") {
        const { planned } = prepared(repo, home);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "integration-test");
        assert(decision.decision === "NOT_REUSABLE", `CC17 expected NOT_REUSABLE, got ${decision.decision}`);
      } else if (item.id === "CC18") {
        const { planned } = prepared(repo, home);
        write(repo, "vitest.config.ts", "export default { test: { include: ['**/*.test.ts'] } };\n");
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "STALE", `CC18 expected STALE after config change, got ${decision.decision}`);
      } else if (item.id === "CC19") {
        const { planned } = prepared(repo, home);
        write(repo, "src/ui/orphan.css", "/* unrelated */\n");
        const verified = runVerify({ cwd: repo, uadsHome: home });
        const reused = listEvidenceRecords(
          getUadsPaths(planned.workOrder.projectId, home),
          verified.run.executionRunId,
          findPackageRoot(),
        ).filter((row) => row.source === "cache-reuse");
        assert(reused.length > 0, "CC19 missing cache-reuse evidence");
        assert(Boolean(reused[0]?.reuseProofDigest), "CC19 missing reuseProofDigest");
        assert(Boolean(reused[0]?.gateReuseContractIdentity), "CC19 missing gateReuseContractIdentity");
      } else if (item.id === "CC20") {
        const { planned, paths } = prepared(repo, home);
        const evidenceDir = path.join(paths.workspace, "cache", "evidence");
        const firstName = fs.readdirSync(evidenceDir)[0];
        assert(firstName, "CC20 missing cache record");
        const base = JSON.parse(fs.readFileSync(path.join(evidenceDir, firstName), "utf8"));
        const stale = structuredClone(base);
        stale.cacheRecordId = "ecr_stalecandidate01";
        stale.createdAt = new Date(Date.now() - 120_000).toISOString();
        stale.gateReuseContractIdentity = "deadbeef";
        stale.reuseProofDigest = "deadbeef";
        const valid = structuredClone(base);
        valid.cacheRecordId = "ecr_validcandidate01";
        valid.createdAt = new Date(Date.now() + 60_000).toISOString();
        persistEvidenceCacheRecord(paths, stale);
        persistEvidenceCacheRecord(paths, valid);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "HIT", `CC20 expected HIT on valid candidate, got ${decision.decision}`);
        assert(decision.candidateCacheRecordId === "ecr_validcandidate01", "CC20 picked newest valid candidate");
      } else if (item.id === "CC21") {
        const { planned } = prepared(repo, home);
        const paths = getUadsPaths(planned.workOrder.projectId, home);
        const beforePack = readCurrentContextPack(paths);
        const beforeRadius = runVerify({ cwd: repo, uadsHome: home }).run.contextRadius;
        persistPlan({
          paths,
          workOrder: { ...planned.workOrder, tokenBudget: { ...planned.workOrder.tokenBudget, hardLimit: 1 } },
          decision: planned.decision,
          checkpoint: planned.checkpoint,
          contextPlan: planned.contextPlan,
        });
        let blocked = false;
        try {
          runContextExpand({ cwd: repo, uadsHome: home, reason: "eval expand" });
        } catch (error) {
          blocked = error instanceof ExecutionBlockedError || /hard token budget/i.test(String(error));
        }
        const afterPack = readCurrentContextPack(paths);
        assert(blocked, "CC21 expansion must hard-block");
        assert(afterPack?.contextPackId === beforePack?.contextPackId, "CC21 current pack must not change");
        const run = runVerify({ cwd: repo, uadsHome: home }).run;
        assert(run.contextRadius === beforeRadius, "CC21 radius unchanged");
      } else if (item.id === "CC22") {
        const { planned, paths } = prepared(repo, home);
        const run = runVerify({ cwd: repo, uadsHome: home }).run;
        const failure = recordFailure({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          cwd: repo,
          uadsHome: home,
          source: "test",
          text: "FAIL src/ui/Button.test.tsx > button color mismatch",
          workOrderId: planned.workOrder.workOrderId,
          executionRunId: run.executionRunId,
          changeDigest: run.currentChangeDigest,
        });
        const first = diagnoseFailure({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          failureRecordId: failure.failureRecordId,
        });
        const ledgerAfterFirst = readCostLedger(paths, planned.workOrder.projectId);
        const second = diagnoseFailure({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          failureRecordId: failure.failureRecordId,
        });
        assert(first.diagnosisId === second.diagnosisId, "CC22 diagnosis must be reused");
        assert((ledgerAfterFirst?.estimatedDiagnosticTokens ?? 0) > 0, "CC22 diagnostic tokens recorded");
        const qpt = readQptSnapshot(paths);
        assert(typeof qpt?.estimatedDiagnosticTokens === "number", "CC22 QPT exposes diagnostic tokens");
        assert(
          qpt?.limitations.some((line) => /diagnostic/i.test(line)),
          "CC22 QPT documents diagnostic token separation",
        );
      } else if (item.id === "CC23") {
        const { planned } = prepared(repo, home);
        const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as {
          scripts: Record<string, string>;
        };
        pkg.scripts.build = "mystery-bundler --production";
        fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "build");
        assert(decision.decision === "NOT_REUSABLE", `CC23 expected NOT_REUSABLE, got ${decision.decision}`);
        assert(
          decision.reasonCodes.some((code) => code.includes("TOOLCHAIN_UNPROVABLE")),
          "CC23 must report toolchain unprovable",
        );
      } else if (item.id === "CC24") {
        const { planned } = prepared(repo, home);
        writeResolvedPackage(repo, "vitest", "2.5.5");
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision === "STALE", `CC24 expected STALE, got ${decision.decision}`);
        assert(decision.changedValidityInputs.includes("toolIdentity"), "CC24 toolchain identity change");
      } else if (item.id === "CC25") {
        const { planned } = prepared(repo, home);
        write(repo, "src/ui/orphan.css", "/* unrelated */\n");
        const verified = runVerify({ cwd: repo, uadsHome: home });
        const paths = getUadsPaths(planned.workOrder.projectId, home);
        const reused = listEvidenceRecords(paths, verified.run.executionRunId, findPackageRoot()).filter(
          (row) => row.source === "cache-reuse",
        );
        assert(reused.length > 0, "CC25 missing cache-reuse evidence");
        const validation = validateCacheReuseEvidence({
          paths,
          projectId: planned.workOrder.projectId,
          gateId: "unit-test",
          changeDigest: verified.run.currentChangeDigest,
          record: reused[0]!,
          schemaRoot: findPackageRoot(),
        });
        assert(validation.valid, `CC25 provenance invalid: ${validation.reasonCodes.join(",")}`);
      } else if (item.id === "CC26") {
        const { planned } = prepared(repo, home);
        write(repo, "src/ui/orphan.css", "/* unrelated */\n");
        const verified = runVerify({ cwd: repo, uadsHome: home });
        const paths = getUadsPaths(planned.workOrder.projectId, home);
        const reused = listEvidenceRecords(paths, verified.run.executionRunId, findPackageRoot()).find(
          (row) => row.source === "cache-reuse",
        );
        assert(reused, "CC26 missing cache-reuse evidence");
        const tampered = { ...reused, evidenceId: "ev_cc26tampered1", reuseProofDigest: "deadbeefproof" };
        const evidence = listEvidenceRecords(paths, verified.run.executionRunId, findPackageRoot()).filter(
          (item) => item.gateId !== "unit-test" || item.evidenceId === tampered.evidenceId,
        );
        const gates = deriveGateStates({
          selectedGates: verified.run.selectedGates,
          digest: verified.run.currentChangeDigest,
          evidence: [...evidence, tampered],
          reviews: [],
          validation: { paths, projectId: planned.workOrder.projectId, schemaRoot: findPackageRoot() },
        });
        assert(gates.find((gate) => gate.gateId === "unit-test")?.status !== "PASS", "CC26 tampered proof must not PASS");
      } else if (item.id === "CC27") {
        const { planned, paths } = prepared(repo, home);
        for (const cacheRecordId of listCacheRecordIdsForGate(paths, planned.workOrder.projectId, "unit-test")) {
          markCacheRecordStatus(paths, cacheRecordId, "stale", "cc27-setup", findPackageRoot());
        }
        const evidenceDir = path.join(paths.workspace, "cache", "evidence");
        const template = fs
          .readdirSync(evidenceDir)
          .map((name) => readEvidenceCacheRecord(paths, name.replace(/\.json$/, ""), findPackageRoot()))
          .find((record) => record?.gateId === "unit-test");
        assert(template, "CC27 missing unit-test cache template");
        const wrongKind = structuredClone(template);
        wrongKind.cacheRecordId = "ecr_cc27wrongkind1";
        wrongKind.evidenceKind = "file";
        wrongKind.command = null;
        wrongKind.outputDigest = null;
        wrongKind.fileDigest = "filedigestcc27";
        wrongKind.status = "reusable";
        wrongKind.reusable = true;
        wrongKind.invalidationReason = null;
        persistEvidenceCacheRecord(paths, wrongKind, findPackageRoot());
        const indexPath = path.join(paths.workspace, "cache", "evidence-index.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
          records: Array<{ cacheRecordId: string; gateId: string; reusable: boolean; status: string }>;
        };
        index.records = index.records.filter((row) => row.gateId !== "unit-test" || row.status === "stale");
        index.records.push({
          cacheRecordId: wrongKind.cacheRecordId,
          gateId: "unit-test",
          reusable: true,
          status: "reusable",
        });
        fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
        const decision = evalCache(repo, home, planned.workOrder.projectId, "unit-test");
        assert(decision.decision !== "HIT", `CC27 wrong kind must not HIT, got ${decision.decision}`);
        assert(decision.maySatisfyGate !== true, "CC27 maySatisfyGate must be false");
      }
    }),
  );

  const failed = results.filter((item) => !item.ok);
  for (const item of results) {
    process.stdout.write(`${item.id} ${item.ok ? "PASS" : "FAIL"}${item.error ? ` ${item.error}` : ""}\n`);
  }
  process.stdout.write(`cost eval ${results.length - failed.length}/${results.length}\n`);
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = main();
