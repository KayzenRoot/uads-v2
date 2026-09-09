import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runAssuranceRecord, runAssuranceStart, runDispatch, runEvidenceRecord, runFinalize, runVerify } from "../kernel/execution.js";
import { diagnoseFailure, recordFailure } from "../kernel/fault-localization.js";
import { readCurrentModelExecutionPlan } from "../kernel/model-persist.js";
import { runPlan } from "../kernel/orchestrator.js";
import { getUadsPaths } from "../lib/workspace.js";
import { isReviewGate } from "../kernel/gates.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import { createModelProfileRegistry, normalizeModelProfile, persistModelProfileRegistry } from "../kernel/model-registry.js";
import { computeRuntimeIdentityDigest, persistRuntimeCapabilitySnapshot } from "../kernel/model-runtime.js";
import { MODEL_ROUTING_SCHEMA_VERSION, type RuntimeCapabilitySnapshot } from "../kernel/model-types.js";
import { readCurrentSpecialistSelectionPlan } from "../kernel/specialist-persist.js";
import {
  hostDispatchBundleStatus,
  isHostDispatchBundleCurrent,
  prepareHostDispatchBundle,
} from "../adapters/host-dispatch.js";
import { getHostAdapterDefinition } from "../adapters/host-adapter-registry.js";
import { resolveHostTarget } from "../adapters/host-adapter-detect.js";
import { installHostAdapter, inspectHostAdapterOwnership } from "../adapters/host-adapter-install.js";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";

type FaultCase = { id: string; name: string };
type Planned = ReturnType<typeof runPlan>;

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "UADS Normative FI",
  GIT_AUTHOR_EMAIL: "uads@example.com",
  GIT_COMMITTER_NAME: "UADS Normative FI",
  GIT_COMMITTER_EMAIL: "uads@example.com",
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function expectBlocked(action: () => unknown, label: string, requiredText?: string): void {
  try {
    action();
  } catch (error) {
    if (requiredText && !String(error instanceof Error ? error.message : error).includes(requiredText)) {
      throw new Error(`${label} blocked for the wrong reason`);
    }
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

function initRepo(repo: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: repo, env: gitEnv });
  execFileSync("git", ["-c", "user.email=uads@example.com", "-c", "user.name=UADS Normative FI", "config", "commit.gpgsign", "false"], {
    cwd: repo,
    env: gitEnv,
  });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/uads-fi.git"], { cwd: repo, env: gitEnv });
}

function gitCommit(repo: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: repo, env: gitEnv });
  execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "user.email=uads@example.com", "-c", "user.name=UADS Normative FI", "commit", "-m", message],
    { cwd: repo, env: gitEnv },
  );
}

function write(repo: string, relative: string, contents: string): void {
  const target = path.join(repo, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function seedRepo(repo: string): void {
  initRepo(repo);
  write(repo, "src/ui/Button.tsx", "export const Button = () => 'baseline';\n");
  write(repo, "src/ui/Button.test.tsx", "import { Button } from './Button';\nexport const testSubject = Button;\n");
  write(repo, "src/auth/login.ts", "export const login = () => 'baseline';\n");
  write(repo, "src/backend/api.ts", "export const api = () => 'baseline';\n");
  write(repo, "src/db/migration.sql", "select 1;\n");
  write(repo, "src/architecture.ts", "export const architecture = 'baseline';\n");
  write(repo, "outside.txt", "tracked outside scope\n");
  write(
    repo,
    "package.json",
    `${JSON.stringify(
      {
        name: "uads-normative-fi",
        version: "1.0.0",
        scripts: { test: "vitest run", "unit-test": "vitest run", lint: "echo lint ok", build: "echo build ok" },
        devDependencies: { vitest: "^1.6.0" },
      },
      null,
      2,
    )}\n`,
  );
  write(repo, "node_modules/vitest/package.json", `${JSON.stringify({ name: "vitest", version: "1.6.0" })}\n`);
  gitCommit(repo, "baseline");
}

function configureProvenModelRuntime(paths: ReturnType<typeof getUadsPaths>): void {
  const profile = normalizeModelProfile({
    schema: "uads.model-profile",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    profileId: "normative-fi-critical",
    providerId: "normative-fi-provider",
    modelId: "normative-fi-model",
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
    notes: "deterministic normative fault-injection fixture",
    source: "builtin-fixture",
    adapterId: "normative-fixture",
    adapterVersion: MODEL_ROUTING_SCHEMA_VERSION,
  });
  persistModelProfileRegistry(paths, createModelProfileRegistry([profile]));
  const base: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    schema: "uads.runtime-capability-snapshot",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    runtimeId: "generic-runtime",
    adapterId: "normative-fixture",
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

function intake(options: {
  objective?: string;
  domainSignals?: string[];
  riskSignals?: string[];
  destructiveSignals?: string[];
  affectedAreas?: string[];
  inScope?: string[];
  outOfScope?: string[];
} = {}) {
  return {
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective: options.objective ?? "Change the primary button color.",
    domainSignals: options.domainSignals ?? ["frontend"],
    riskSignals: options.riskSignals ?? [],
    destructiveSignals: options.destructiveSignals ?? [],
    affectedAreas: options.affectedAreas ?? ["src/ui"],
    inScope: options.inScope ?? ["src/ui"],
    outOfScope: options.outOfScope ?? ["src/auth", "src/backend", "src/db", "outside.txt"],
    acceptanceCriteria: ["the requested change is verified"],
    classifier: "host-structured",
  };
}

function fixture(input = {}): { repo: string; home: string; root: string; planned: Planned } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-fi-norm-")).replace(/\\/g, "/");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-fi-norm-home-")).replace(/\\/g, "/");
  const root = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  seedRepo(repo);
  const context = resolveProjectContext(repo, home);
  const requested = input as NonNullable<Parameters<typeof intake>[0]>;
  if (requested.domainSignals?.includes("architecture") || requested.destructiveSignals?.length || requested.riskSignals?.length) {
    configureProvenModelRuntime(context.paths);
  }
  const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake(requested) });
  return { repo, home, root, planned };
}

function dispatchAndVerify(fixtureValue: ReturnType<typeof fixture>, relative = "src/ui/Button.tsx"): ReturnType<typeof runVerify> {
  runDispatch({ cwd: fixtureValue.repo, uadsHome: fixtureValue.home, session: "implementer-fi" });
  write(fixtureValue.repo, relative, "export const Button = () => 'changed';\n");
  return runVerify({ cwd: fixtureValue.repo, uadsHome: fixtureValue.home });
}

function nonReviewGates(planned: Planned): string[] {
  return planned.workOrder.qualityGates.filter((gateId) => !isReviewGate(gateId));
}

function recordGate(fixtureValue: ReturnType<typeof fixture>, gateId: string, exitCode = 0): ReturnType<typeof runEvidenceRecord> {
  const outputPath = path.join(fixtureValue.home, `output-${gateId}-${Date.now()}.txt`);
  writeFileSync(outputPath, `${gateId} output\n`);
  const command = gateId === "unit-test" ? "npm test :: vitest run" : gateId === "static" ? "npm run lint :: echo lint ok" : gateId === "build" ? "npm run build :: echo build ok" : `npm run ${gateId}`;
  return runEvidenceRecord({
    cwd: fixtureValue.repo,
    uadsHome: fixtureValue.home,
    gateId,
    kind: "command",
    role: "test-engineer",
    command,
    exitCode,
    outputPath,
    summary: `${gateId} normative fixture`,
  });
}

function recordPassingNonReviewGates(fixtureValue: ReturnType<typeof fixture>, omit: string[] = []): void {
  for (const gateId of nonReviewGates(fixtureValue.planned)) {
    if (!omit.includes(gateId)) recordGate(fixtureValue, gateId);
  }
}

function firstNonReviewGate(fixtureValue: ReturnType<typeof fixture>): string {
  const gateId = nonReviewGates(fixtureValue.planned)[0];
  if (!gateId) throw new Error("normative fixture has no non-review gate");
  return gateId;
}

function currentPaths(fixtureValue: ReturnType<typeof fixture>) {
  return getUadsPaths(fixtureValue.planned.workOrder.projectId, fixtureValue.home);
}

function mutateJson(file: string, mutate: (value: Record<string, unknown>) => void): void {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  mutate(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function copyManagedTree(sourceRoot: string, destinationRoot: string): void {
  const visit = (relative: string): void => {
    const source = path.join(sourceRoot, relative);
    const destination = path.join(destinationRoot, relative);
    if (!fs.existsSync(source)) return;
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
      mkdirSync(destination, { recursive: true });
      for (const entry of fs.readdirSync(source)) visit(path.join(relative, entry));
      return;
    }
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  };
  visit(".");
}

function runNormativeFI1(): void {
  const f = fixture();
  dispatchAndVerify(f);
  const gateId = firstNonReviewGate(f);
  expectBlocked(() => runEvidenceRecord({ cwd: f.repo, uadsHome: f.home, gateId, kind: "command", role: "test-engineer", command: "npm run test", exitCode: 0, summary: "false PASS without output" }), "FI1", "output digest");
}

function runNormativeFI2(): void {
  const f = fixture();
  dispatchAndVerify(f);
  const gateId = firstNonReviewGate(f);
  expectBlocked(() => runEvidenceRecord({ cwd: f.repo, uadsHome: f.home, gateId, kind: "command", role: "test-engineer", command: "npm run test", exitCode: 1, status: "PASS", summary: "hidden failing command" }), "FI2", "non-zero");
  recordGate(f, gateId, 1);
  expectBlocked(() => runAssuranceStart({ cwd: f.repo, uadsHome: f.home }), "FI2 assurance start");
}

function runNormativeFI3(): void {
  const f = fixture();
  dispatchAndVerify(f);
  recordPassingNonReviewGates(f);
  runAssuranceStart({ cwd: f.repo, uadsHome: f.home });
  expectBlocked(() => runAssuranceRecord({ cwd: f.repo, uadsHome: f.home, role: "implementation-agent", session: "implementer-fi", implementerSession: "implementer-fi", verdict: "APPROVED", summary: "self approval" }), "FI3", "self-review");
}

function runNormativeFI4(): void {
  const f = fixture({ objective: "Change authenticated login API behavior.", domainSignals: ["api", "security", "backend"], riskSignals: ["authentication"], affectedAreas: ["src/auth"], inScope: ["src/auth"], outOfScope: ["src/ui", "src/backend", "src/db", "outside.txt"] });
  dispatchAndVerify(f, "src/auth/login.ts");
  recordPassingNonReviewGates(f);
  runAssuranceStart({ cwd: f.repo, uadsHome: f.home });
  const required = f.planned.workOrder.assuranceReviewers;
  assert(required.includes("security-reviewer"), "FI4 fixture did not route security assurance");
  runAssuranceRecord({ cwd: f.repo, uadsHome: f.home, role: "independent-reviewer", session: "independent-fi4", implementerSession: "implementer-fi", verdict: "APPROVED", summary: "independent approval" });
  expectBlocked(() => runFinalize({ cwd: f.repo, uadsHome: f.home }), "FI4 finalize");
}

function runNormativeFI5(): void {
  const f = fixture({ objective: "Change the authenticated API boundary.", domainSignals: ["api", "security", "backend"], riskSignals: ["authentication"], affectedAreas: ["src/ui"], inScope: ["src/ui"], outOfScope: ["src/auth", "src/backend", "src/db", "outside.txt"] });
  runDispatch({ cwd: f.repo, uadsHome: f.home, session: "implementer-fi" });
  write(f.repo, "src/auth/foreign.ts", "export const foreign = true;\n");
  expectBlocked(() => runVerify({ cwd: f.repo, uadsHome: f.home }), "FI5 verify", "scope");
}

function runNormativeFI6(): void {
  const f = fixture();
  runDispatch({ cwd: f.repo, uadsHome: f.home, session: "implementer-fi" });
  fs.unlinkSync(path.join(f.repo, "outside.txt"));
  expectBlocked(() => runVerify({ cwd: f.repo, uadsHome: f.home }), "FI6 verify", "scope");
}

function runNormativeFI7(): void {
  const f = fixture();
  dispatchAndVerify(f);
  const paths = currentPaths(f);
  mutateJson(paths.currentState, (value) => { value.workOrderId = "wo-foreign-checkpoint"; });
  expectBlocked(() => runVerify({ cwd: f.repo, uadsHome: f.home }), "FI7 checkpoint identity");
}

function runNormativeFI8(): void {
  const f = fixture({ objective: "Change the architecture boundary for the UI service.", domainSignals: ["architecture", "frontend"], affectedAreas: ["src/ui", "src/architecture"], inScope: ["src/ui", "src/architecture"] });
  assert(f.planned.workOrder.qualityGates.includes("architecture-conformance"), "FI8 fixture did not select architecture conformance");
  dispatchAndVerify(f);
  recordPassingNonReviewGates(f, ["architecture-conformance"]);
  expectBlocked(() => runAssuranceStart({ cwd: f.repo, uadsHome: f.home }), "FI8 assurance start");
}

function runNormativeFI9(): void {
  const f = fixture({ objective: "Apply a destructive database migration with rollback.", domainSignals: ["database", "reliability"], riskSignals: ["database-migration", "destructive"], destructiveSignals: ["destructive-data"], affectedAreas: ["src/db"], inScope: ["src/db"], outOfScope: ["src/ui", "src/auth", "src/backend", "outside.txt"] });
  assert(f.planned.workOrder.qualityGates.includes("database-migration") && f.planned.workOrder.qualityGates.includes("rollback-validation"), "FI9 fixture did not select migration and rollback gates");
  dispatchAndVerify(f, "src/db/migration.sql");
  recordPassingNonReviewGates(f, ["rollback-validation"]);
  expectBlocked(() => runAssuranceStart({ cwd: f.repo, uadsHome: f.home }), "FI9 assurance start");
}

function runNormativeFI10(): void {
  const f = fixture({ objective: "Upgrade a dependency and verify supply-chain integrity.", riskSignals: ["dependency", "supply-chain"], affectedAreas: ["src"], inScope: ["src"], outOfScope: ["outside.txt"] });
  assert(f.planned.workOrder.qualityGates.includes("dependency-audit"), "FI10 fixture did not select dependency audit");
  dispatchAndVerify(f, "src/ui/Button.tsx");
  recordPassingNonReviewGates(f, ["dependency-audit"]);
  recordGate(f, "dependency-audit", 1);
  expectBlocked(() => runAssuranceStart({ cwd: f.repo, uadsHome: f.home }), "FI10 assurance start");
}

function runNormativeFI11(): void {
  const f = fixture();
  dispatchAndVerify(f);
  const gateId = firstNonReviewGate(f);
  recordPassingNonReviewGates(f);
  write(f.repo, "src/ui/Button.tsx", "export const Button = () => 'changed again';\n");
  runVerify({ cwd: f.repo, uadsHome: f.home });
  recordGate(f, gateId, 1);
  expectBlocked(() => runAssuranceStart({ cwd: f.repo, uadsHome: f.home }), "FI11 cached PASS masking current FAIL");
}

function runNormativeFI12(): void {
  const f = fixture();
  dispatchAndVerify(f);
  const gateId = firstNonReviewGate(f);
  const passing = recordGate(f, gateId).record;
  const paths = currentPaths(f);
  const recordPath = path.join(paths.executionRuns, passing.executionRunId, "evidence", `${passing.evidenceId}.json`);
  mutateJson(recordPath, (value) => {
    value.source = "cache-reuse";
    delete value.sourceCacheRecordId;
  });
  expectBlocked(() => runAssuranceStart({ cwd: f.repo, uadsHome: f.home }), "FI12 forged cache provenance");
}

function runNormativeFI13(): void {
  const f = fixture();
  dispatchAndVerify(f);
  recordPassingNonReviewGates(f);
  const paths = currentPaths(f);
  mutateJson(paths.currentSpecialistSelection, (value) => {
    const selected = value.selected as Array<Record<string, unknown>>;
    value.selected = selected.filter((item) => item.specialistId !== "test-engineer");
  });
  expectBlocked(() => runAssuranceStart({ cwd: f.repo, uadsHome: f.home }), "FI13 tampered Specialist Selection Plan");
}

function runNormativeFI14(): void {
  const f = fixture({ affectedAreas: ["src"], inScope: ["src"], outOfScope: ["outside.txt"] });
  const host = fs.mkdtempSync(path.join(os.tmpdir(), "uads-fi-host-")).replace(/\\/g, "/");
  installHostAdapter("generic-agent-skills", { hostHome: host, uadsHome: f.home, packageRoot: f.root }, f.root);
  const paths = currentPaths(f);
  mutateJson(paths.currentModelRouting, (value) => { value.selectedModelId = "forged-stale-model"; });
  expectBlocked(() => prepareHostDispatchBundle({ adapterId: "generic-agent-skills", cwd: f.repo, uadsHome: f.home, hostHome: host, schemaRoot: f.root }), "FI14 stale Model Execution Plan");
  assert(readCurrentModelExecutionPlan(paths, f.root)?.selectedModelId === "forged-stale-model", "FI14 mutation did not reach the authoritative current plan");
}

function runNormativeFI15(): void {
  const f = fixture({ affectedAreas: ["src"], inScope: ["src"], outOfScope: ["outside.txt"] });
  const hostA = fs.mkdtempSync(path.join(os.tmpdir(), "uads-fi-host-a-")).replace(/\\/g, "/");
  const hostB = fs.mkdtempSync(path.join(os.tmpdir(), "uads-fi-host-b-")).replace(/\\/g, "/");
  installHostAdapter("generic-agent-skills", { hostHome: hostA, uadsHome: f.home, packageRoot: f.root }, f.root);
  let bundle;
  try {
    bundle = prepareHostDispatchBundle({ adapterId: "generic-agent-skills", cwd: f.repo, uadsHome: f.home, hostHome: hostA, schemaRoot: f.root });
  } catch (error) {
    throw new Error(`FI15 baseline host dispatch preparation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const targetA = resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: hostA });
  const targetB = resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: hostB });
  mkdirSync(targetB.targetRoot, { recursive: true });
  copyManagedTree(targetA.targetRoot, targetB.targetRoot);
  const paths = currentPaths(f);
  const ownership = inspectHostAdapterOwnership("generic-agent-skills", { hostHome: hostB, uadsHome: f.home }, f.root);
  assert(ownership.status === "CONFLICT", `FI15 expected cross-root conflict, got ${ownership.status}`);
  assert(hostDispatchBundleStatus(paths, f.planned.workOrder.projectId, f.root, "generic-agent-skills", hostB) === "stale", "FI15 replayed root was accepted as current");
  assert(!isHostDispatchBundleCurrent(bundle, { hostTargetRootDigest: targetB.targetRootDigest }), "FI15 bundle accepted foreign root digest");
}

function runNormativeFI16(): void {
  const f = fixture();
  const paths = currentPaths(f);
  write(f.repo, "src/ui/Button.tsx", "export const Button = () => 'failing';\n");
  let last: ReturnType<typeof diagnoseFailure> | null = null;
  for (let index = 0; index < 3; index += 1) {
    const failure = recordFailure({
      repoRoot: f.repo,
      projectId: f.planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `Error: repeated failure\\n    at run (${path.join(f.repo, "src/ui/Button.tsx")}:1:1)`,
      schemaRoot: f.root,
    });
    last = diagnoseFailure({ repoRoot: f.repo, projectId: f.planned.workOrder.projectId, paths, failureRecordId: failure.failureRecordId, schemaRoot: f.root });
  }
  assert(Boolean(last?.loopState.detected), "FI16 repeated failure loop was not detected");
  assert(last?.loopState.recommendedAction.includes("LOOP_DETECTED") === true, "FI16 did not produce deterministic stop/escalation");
}

const CASES: Record<string, () => void> = {
  FI1: runNormativeFI1,
  FI2: runNormativeFI2,
  FI3: runNormativeFI3,
  FI4: runNormativeFI4,
  FI5: runNormativeFI5,
  FI6: runNormativeFI6,
  FI7: runNormativeFI7,
  FI8: runNormativeFI8,
  FI9: runNormativeFI9,
  FI10: runNormativeFI10,
  FI11: runNormativeFI11,
  FI12: runNormativeFI12,
  FI13: runNormativeFI13,
  FI14: runNormativeFI14,
  FI15: runNormativeFI15,
  FI16: runNormativeFI16,
};

export function runNormativeFaultInjectionCase(id: string): void {
  const run = CASES[id];
  if (!run) throw new Error(`unknown normative fault-injection case ${id}`);
  run();
}

export function normativeFaultInjectionCases(): FaultCase[] {
  return Object.keys(CASES).map((id) => ({ id, name: `normative ${id}` }));
}
