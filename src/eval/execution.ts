import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ExecutionBlockedError, runAssuranceRecord, runAssuranceStart, runDispatch, runEvidenceRecord, runFinalize, runVerify } from "../kernel/execution.js";
import { createModelProfileRegistry, normalizeModelProfile, persistModelProfileRegistry } from "../kernel/model-registry.js";
import { computeRuntimeIdentityDigest, persistRuntimeCapabilitySnapshot } from "../kernel/model-runtime.js";
import { MODEL_ROUTING_SCHEMA_VERSION, type RuntimeCapabilitySnapshot } from "../kernel/model-types.js";
import { isReviewGate } from "../kernel/gates.js";
import { runPlan } from "../kernel/orchestrator.js";
import { findPackageRoot } from "../lib/version.js";
import { ensureGlobalLayout, getUadsPaths } from "../lib/workspace.js";

type EvalCase = {
  id: string;
  name: string;
  scenario: string;
};

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
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/uads-execution-eval.git"], { cwd: root, env: gitEnv });
}

function gitCommit(root: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: root, env: gitEnv });
  execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "user.email=uads@example.com", "-c", "user.name=UADS Eval", "commit", "-m", message],
    { cwd: root, env: gitEnv },
  );
}

function frontendIntake(objective = "Change the primary button color.") {
  return {
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective,
    domainSignals: ["frontend"],
    affectedAreas: ["src"],
    inScope: ["src"],
    outOfScope: ["backend", "unrelated"],
    acceptanceCriteria: ["Primary button uses the new color", "Selected gates have evidence"],
    classifier: "host-structured",
  };
}

function defiIntake() {
  return {
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective: "Implement a withdrawal path for a DeFi vault smart contract.",
    domainSignals: ["web3", "smart-contracts", "security", "finance-economics"],
    riskSignals: ["web3", "smart-contracts"],
    affectedAreas: ["contracts"],
    inScope: ["contracts"],
    acceptanceCriteria: ["Withdrawal path is specified", "No funds movement is executed"],
    classifier: "host-structured",
  };
}

function seedFrontend(repo: string): void {
  initRepo(repo);
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: blue; }\n");
  gitCommit(repo, "init");
}

function seedDefi(repo: string): void {
  initRepo(repo);
  fs.mkdirSync(path.join(repo, "contracts"), { recursive: true });
  fs.writeFileSync(path.join(repo, "contracts", "vault.ts"), "export function withdraw() { return 0; }\n");
  gitCommit(repo, "init");
}

function seedCriticalRouting(home: string): void {
  ensureGlobalLayout(home);
  const paths = getUadsPaths("execution-eval-routing", home);
  const profile = normalizeModelProfile({
    schema: "uads.model-profile",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    profileId: "eval-critical",
    providerId: "eval-provider",
    modelId: "eval-critical-model",
    status: "enabled",
    capabilityClass: "critical",
    reasoningClass: "deep",
    contextWindowTokens: 128000,
    maxOutputTokens: 16000,
    relativeCostClass: "unknown",
    relativeLatencyClass: "unknown",
    supports: {
      toolCalling: true,
      structuredOutput: true,
      vision: false,
      promptCache: true,
      explicitCache: true,
      persistentContext: true,
      usageTelemetry: true,
    },
    constraints: { maxConcurrency: 1 },
    notes: "deterministic local evaluation fixture",
    source: "builtin-fixture",
    adapterId: "execution-eval",
    adapterVersion: MODEL_ROUTING_SCHEMA_VERSION,
  });
  persistModelProfileRegistry(paths, createModelProfileRegistry([profile]));
  const base: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    schema: "uads.runtime-capability-snapshot",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    runtimeId: "generic-runtime",
    adapterId: "execution-eval",
    adapterVersion: MODEL_ROUTING_SCHEMA_VERSION,
    runtimeVersion: process.versions.node,
    capabilities: {
      modelSelection: true,
      toolCalling: true,
      structuredOutput: true,
      promptCache: true,
      explicitCache: true,
      persistentContext: true,
      subagents: false,
      parallelAgents: false,
      usageTelemetry: true,
      visionInput: false,
    },
    provenance: { source: "test-fixture", confidence: "proven" },
  };
  persistRuntimeCapabilitySnapshot(paths, { ...base, identityDigest: computeRuntimeIdentityDigest(base) });
}

function recordGates(repo: string, home: string, gates: string[], exitCode = 0): void {
  for (const gate of gates) {
    if (isReviewGate(gate)) {
      continue;
    }
    const outputPath = path.join(home, `gate-${gate}.txt`);
    fs.writeFileSync(outputPath, `${gate} captured output\n`);
    runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: gate,
      kind: "command",
      role: "test-engineer",
      command: `eval:${gate}`,
      exitCode,
      outputPath,
      summary: `${gate} ${exitCode === 0 ? "pass" : "fail"}`,
    });
  }
}

function approve(repo: string, home: string, reviewers: string[]): void {
  runAssuranceStart({ cwd: repo, uadsHome: home });
  for (const role of reviewers) {
    runAssuranceRecord({
      cwd: repo,
      uadsHome: home,
      role,
      session: `rev-${role}`,
      implementerSession: "imp-1",
      verdict: "APPROVED",
      summary: `${role} approved`,
    });
  }
}

function expectThrow(fn: () => unknown, label: string): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof ExecutionBlockedError || error instanceof Error) {
      return;
    }
    throw error;
  }
  throw new Error(`${label}: expected refusal`);
}

function runScenario(id: string, home: string, repo: string): void {
  if (id === "X1") {
    seedFrontend(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
    if (!["LOW"].includes(planned.workOrder.riskLevel)) {
      throw new Error(`X1 risk ${planned.workOrder.riskLevel}`);
    }
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    approve(repo, home, planned.workOrder.assuranceReviewers);
    const done = runFinalize({ cwd: repo, uadsHome: home });
    if (done.run.status !== "completed") {
      throw new Error("X1 did not complete");
    }
    return;
  }
  if (id === "X2") {
    seedFrontend(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates, 1);
    expectThrow(() => runFinalize({ cwd: repo, uadsHome: home }), "X2");
    return;
  }
  if (id === "X3") {
    seedFrontend(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    expectThrow(() => runFinalize({ cwd: repo, uadsHome: home }), "X3");
    return;
  }
  if (id === "X4") {
    seedFrontend(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    runAssuranceStart({ cwd: repo, uadsHome: home });
    expectThrow(
      () =>
        runAssuranceRecord({
          cwd: repo,
          uadsHome: home,
          role: "implementation-agent",
          session: "imp-1",
          implementerSession: "imp-1",
          verdict: "APPROVED",
          summary: "self",
        }),
      "X4",
    );
    expectThrow(() => runFinalize({ cwd: repo, uadsHome: home }), "X4 finalize");
    return;
  }
  if (id === "X5") {
    seedFrontend(repo);
    runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.mkdirSync(path.join(repo, "unrelated"), { recursive: true });
    fs.writeFileSync(path.join(repo, "unrelated", "other.ts"), "export const blocked = true;\n");
    expectThrow(() => runVerify({ cwd: repo, uadsHome: home }), "X5 verify");
    expectThrow(() => runFinalize({ cwd: repo, uadsHome: home }), "X5 finalize");
    return;
  }
  if (id === "X6") {
    seedFrontend(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    const first = runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    runAssuranceStart({ cwd: repo, uadsHome: home });
    const correction = runAssuranceRecord({
      cwd: repo,
      uadsHome: home,
      role: "independent-reviewer",
      session: "rev-1",
      implementerSession: "imp-1",
      verdict: "CORRECTION_NEEDED",
      summary: "needs a different color",
    });
    if (correction.run.attempt !== 2) {
      throw new Error(`X6 attempt ${correction.run.attempt}`);
    }
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: purple; }\n");
    const second = runVerify({ cwd: repo, uadsHome: home });
    if (second.changeSet.digest === first.changeSet.digest) {
      throw new Error("X6 digest did not change");
    }
    recordGates(repo, home, planned.workOrder.qualityGates);
    approve(repo, home, planned.workOrder.assuranceReviewers);
    if (runFinalize({ cwd: repo, uadsHome: home }).run.status !== "completed") {
      throw new Error("X6 did not complete");
    }
    return;
  }
  if (id === "X7") {
    seedDefi(repo);
    seedCriticalRouting(home);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: defiIntake() });
    if (!planned.workOrder.assuranceReviewers.includes("security-reviewer")) {
      throw new Error("X7 missing security reviewer");
    }
    if (planned.workOrder.autonomyBoundary.requiresApproval.every((item) => !item.includes("funds") && !item.includes("on-chain"))) {
      throw new Error("X7 missing funds/on-chain approval boundary");
    }
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "contracts", "vault.ts"), "export function withdraw() { return 1; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    expectThrow(() => runFinalize({ cwd: repo, uadsHome: home }), "X7 missing assurance");
    approve(repo, home, planned.workOrder.assuranceReviewers);
    if (runFinalize({ cwd: repo, uadsHome: home }).run.status !== "completed") {
      throw new Error("X7 did not complete with assurance");
    }
    return;
  }
  if (id === "X8") {
    seedFrontend(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    const gate = planned.workOrder.qualityGates.find((id) => id !== "security-review" && id !== "performance-check") ?? "unit-test";
    expectThrow(
      () =>
        runEvidenceRecord({
          cwd: repo,
          uadsHome: home,
          gateId: gate,
          kind: "invariant",
          role: "test-engineer",
          summary: "ok",
        }),
      "X8 invariant spoof",
    );
    expectThrow(
      () =>
        runEvidenceRecord({
          cwd: repo,
          uadsHome: home,
          gateId: gate,
          kind: "command",
          role: "test-engineer",
          command: `eval:${gate}`,
          exitCode: 0,
          summary: "summary-only",
        }),
      "X8 summary-only",
    );
    recordGates(repo, home, planned.workOrder.qualityGates);
    approve(repo, home, planned.workOrder.assuranceReviewers);
    if (runFinalize({ cwd: repo, uadsHome: home }).run.status !== "completed") {
      throw new Error("X8 valid command evidence should complete");
    }
    return;
  }
  if (id === "X9") {
    seedFrontend(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: frontendIntake() });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    expectThrow(() => runDispatch({ cwd: repo, uadsHome: home, session: "imp-forged" }), "X9 rebind");
    fs.writeFileSync(path.join(repo, "src", "icon.bin"), Buffer.alloc(16, 1));
    const first = runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    runAssuranceStart({ cwd: repo, uadsHome: home });
    expectThrow(
      () =>
        runAssuranceRecord({
          cwd: repo,
          uadsHome: home,
          role: "independent-reviewer",
          session: "rev-1",
          implementerSession: "imp-forged",
          verdict: "APPROVED",
          summary: "forged identity",
        }),
      "X9 forged session",
    );
    fs.writeFileSync(path.join(repo, "src", "icon.bin"), Buffer.alloc(16, 2));
    const second = runVerify({ cwd: repo, uadsHome: home });
    if (second.changeSet.digest === first.changeSet.digest) {
      throw new Error("X9 same-size binary digest did not change");
    }
    expectThrow(() => runFinalize({ cwd: repo, uadsHome: home }), "X9 stale digest");
    return;
  }
  throw new Error(`unknown scenario ${id}`);
}

function loadCases(dir: string): EvalCase[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as EvalCase);
}

export function runExecutionEvals(): number {
  const packageRoot = findPackageRoot();
  const casesDir = path.join(packageRoot, "evals", "execution");
  const cases = loadCases(casesDir);
  if (cases.length === 0) {
    process.stderr.write("no execution eval cases found\n");
    return 1;
  }
  const failures: string[] = [];
  for (const evalCase of cases) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), `uads-xeval-${evalCase.id}-`));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), `uads-xrepo-${evalCase.id}-`));
    try {
      runScenario(evalCase.id, home, repo);
      process.stdout.write(`PASS ${evalCase.id} ${evalCase.name}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${evalCase.id} ${evalCase.name}\n  ${message}`);
      process.stdout.write(`FAIL ${evalCase.id} ${evalCase.name}\n`);
    }
  }
  process.stdout.write(`\n${cases.length - failures.length} passed, ${failures.length} failed, ${cases.length} total\n`);
  if (failures.length > 0) {
    process.stderr.write(`\n${failures.join("\n\n")}\n`);
    return 1;
  }
  return 0;
}

function invokedAsCli(): boolean {
  const argvPath = process.argv[1];
  if (typeof argvPath !== "string" || argvPath.length === 0) {
    return false;
  }
  return path.normalize(path.resolve(argvPath)) === path.normalize(fileURLToPath(import.meta.url));
}

if (invokedAsCli()) {
  process.exit(runExecutionEvals());
}
