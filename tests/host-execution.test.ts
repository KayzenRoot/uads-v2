import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSchema } from "../src/lib/json-schema.js";
import { sha256Hex } from "../src/lib/hash.js";
import { computeHostExecutionReceiptDigest, handoffHostExecution, listHostExecutionReceipts, persistHostExecutionReceipt, readCurrentHostExecutionReceipt, transitionHostExecutionReceipt } from "../src/adapters/host-execution.js";
import { installHostAdapter, uninstallHostAdapter } from "../src/adapters/host-adapter-install.js";
import { prepareHostDispatchBundle } from "../src/adapters/host-dispatch.js";
import { runAdaptersHandoffCommand, runAdaptersReceiptCommand } from "../src/commands/adapters.js";
import { runFinalize, runDispatch } from "../src/kernel/execution.js";
import { persistExecutionRun, readCurrentExecutionRun } from "../src/kernel/execution-persist.js";
import { runPlan } from "../src/kernel/orchestrator.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { assertZpf, seedFrontend } from "./execution-helpers.js";
import { tempDirs } from "./helpers.js";

const ROOT = process.cwd();
type AdapterId = "cursor" | "codex" | "generic-agent-skills";

type FixtureOptions = {
  objective?: string;
  domainSignals?: string[];
  riskSignals?: string[];
  destructiveSignals?: string[];
  requestedArtifacts?: string[];
  constraints?: string[];
  acceptanceCriteria?: string[];
  inScope?: string[];
  approvedBoundaries?: string[];
  affectedAreas?: string[];
  callerFields?: Record<string, unknown>;
};

function hostHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-host-exec-test-"));
}

function fixture(adapterId: AdapterId = "generic-agent-skills", options: FixtureOptions = {}) {
  const dirs = tempDirs();
  seedFrontend(dirs.repo);
  const planned = runPlan({
    cwd: dirs.repo,
    uadsHome: dirs.home,
    intake: {
      ...(options.callerFields ?? {}),
      schema: "uads.intake",
      schemaVersion: "0.2.0",
      objective: options.objective ?? "Change the primary button color.",
      domainSignals: options.domainSignals ?? ["frontend"],
      riskSignals: options.riskSignals ?? [],
      destructiveSignals: options.destructiveSignals ?? [],
      requestedArtifacts: options.requestedArtifacts ?? [],
      constraints: options.constraints ?? [],
      affectedAreas: options.affectedAreas ?? ["src"],
      inScope: options.inScope ?? ["src"],
      approvedBoundaries: options.approvedBoundaries ?? [],
      acceptanceCriteria: options.acceptanceCriteria ?? ["the change is verified"],
      classifier: "host-structured",
    },
  });
  const target = hostHome();
  installHostAdapter(adapterId, { hostHome: target, uadsHome: dirs.home, packageRoot: ROOT }, ROOT);
  const dispatched = runDispatch({ cwd: dirs.repo, uadsHome: dirs.home, session: "implementation-session" });
  const context = resolveProjectContext(dirs.repo, dirs.home);
  return { ...dirs, target, planned, dispatched, context, adapterId };
}

function preparedFixture(adapterId: AdapterId = "generic-agent-skills", options: FixtureOptions = {}) {
  const value = fixture(adapterId, options);
  const bundle = prepareHostDispatchBundle({
    adapterId,
    cwd: value.repo,
    uadsHome: value.home,
    hostHome: value.target,
    schemaRoot: ROOT,
  });
  return { ...value, bundle };
}

function rewrite(file: string, patch: (value: Record<string, unknown>) => Record<string, unknown>): void {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(file, `${JSON.stringify(patch(value), null, 2)}\n`);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stableValue(nested)]));
}

function handoff(value: ReturnType<typeof preparedFixture>) {
  return handoffHostExecution({
    adapterId: value.adapterId,
    cwd: value.repo,
    uadsHome: value.home,
    hostHome: value.target,
    schemaRoot: ROOT,
  });
}

function expectHostExecutionReason(action: () => unknown, reasonCode: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ reasonCode });
}

describe("Prompt 012 Host Execution Boundary", { timeout: 180_000 }, () => {
  it("HEB01 accepts a valid current handoff", () => {
    const value = preparedFixture();
    const receipt = handoff(value);
    expect(receipt.state).toBe("ACCEPTED");
    expect(receipt.executionRunId).toBe(value.dispatched.run.executionRunId);
    expect(() => assertSchema("host-execution-receipt.schema.json", receipt, ROOT)).not.toThrow();
  });

  it("HEB02 fails closed for a missing or corrupt bundle", () => {
    const missing = fixture();
    expect(() => handoffHostExecution({ adapterId: missing.adapterId, cwd: missing.repo, uadsHome: missing.home, hostHome: missing.target, schemaRoot: ROOT })).toThrow(/bundle.*missing/i);
    const corrupt = fixture();
    fs.writeFileSync(corrupt.context.paths.currentHostDispatch, "not-json\n");
    expect(() => handoffHostExecution({ adapterId: corrupt.adapterId, cwd: corrupt.repo, uadsHome: corrupt.home, hostHome: corrupt.target, schemaRoot: ROOT })).toThrow(/bundle.*corrupt|invalid/i);
  });

  it("HEB03 rejects a tampered bundle digest", () => {
    const value = preparedFixture();
    rewrite(value.context.paths.currentHostDispatch, (bundle) => ({ ...bundle, workOrderId: "tampered" }));
    expect(() => handoff(value)).toThrow(/digest|invalid|tamper/i);
  });

  it("HEB04 rejects stale current orchestration artifacts", () => {
    const value = preparedFixture();
    const workOrderPath = path.join(value.context.paths.workOrders, `${value.planned.workOrder.workOrderId}.json`);
    rewrite(workOrderPath, (workOrder) => ({ ...workOrder, objective: "stale objective" }));
    expect(() => handoff(value)).toThrow(/stale|mismatch|model|specialist/i);
  });

  it("HEB05 rejects a cross-project bundle replay", () => {
    const value = preparedFixture();
    rewrite(value.context.paths.currentHostDispatch, (bundle) => {
      const changed = { ...bundle, projectId: "a".repeat(16) };
      const { bundleDigest: _ignored, ...withoutDigest } = changed;
      return { ...changed, bundleDigest: sha256Hex(JSON.stringify(stableValue(withoutDigest))) };
    });
    expect(() => handoff(value)).toThrow(/project/i);
  });

  it("HEB06 rejects wrong-adapter and cross-root replay", () => {
    const value = preparedFixture();
    expect(() => handoffHostExecution({ adapterId: "codex", cwd: value.repo, uadsHome: value.home, hostHome: value.target, schemaRoot: ROOT })).toThrow(/adapter/i);
    expect(() => handoffHostExecution({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: hostHome(), schemaRoot: ROOT })).toThrow(/ownership|root|supported/i);
  });

  it("HEB07 requires the non-null current execution run identity", () => {
    const value = fixture();
    const bundle = prepareHostDispatchBundle({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, schemaRoot: ROOT });
    expect(bundle.executionRunId).toBe(value.dispatched.run.executionRunId);
    fs.unlinkSync(path.join(value.context.paths.executionRuns, value.dispatched.run.executionRunId, "run.json"));
    expect(() => handoffHostExecution({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, schemaRoot: ROOT })).toThrow(/execution run|current/i);
  });

  it("HEB08 preserves conservative capability fallback and blocks unsupported ownership", () => {
    const value = preparedFixture();
    expect(value.bundle.execution.parallel).toBe(false);
    expect(value.bundle.execution.roleDispatch).toBe("role-cycling");
    expect(() => handoffHostExecution({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: hostHome(), schemaRoot: ROOT })).toThrow(/ownership|root|supported/i);
  });

  it("HEB09 makes an authoritative handoff replay read-only", () => {
    const value = preparedFixture();
    const first = handoff(value);
    const second = handoff(value);
    expect(second).toEqual(first);
    expect(listHostExecutionReceipts(value.context.paths, ROOT)).toHaveLength(1);
  });

  it("HEB10 records only allowed deterministic receipt transitions", () => {
    const value = preparedFixture();
    handoff(value);
    const started = transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT });
    const completed = transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "COMPLETED", schemaRoot: ROOT });
    expect(started.state).toBe("STARTED");
    expect(completed.state).toBe("COMPLETED");
    expect(completed.handoffId).toBe(started.handoffId);
    expect(completed.startedAt).not.toBeNull();
    expect(completed.completedAt).not.toBeNull();
  });

  it("HEB11 rejects impossible transitions and terminal rewrites", () => {
    const value = preparedFixture();
    handoff(value);
    expect(() => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "COMPLETED", schemaRoot: ROOT })).not.toThrow();
    const terminal = readCurrentHostExecutionReceipt(value.context.paths, ROOT)!;
    expect(() => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT })).toThrow(/immutable|terminal/i);
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)?.receiptDigest).toBe(terminal.receiptDigest);
  });

  it("HEB12 rejects corrupt or tampered receipts", () => {
    const value = preparedFixture();
    handoff(value);
    rewrite(value.context.paths.currentHostExecutionReceipt, (receipt) => ({ ...receipt, state: "COMPLETED" }));
    expect(() => readCurrentHostExecutionReceipt(value.context.paths, ROOT)).toThrow(/digest|corrupt|invalid/i);
    expect(() => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT })).toThrow(/digest|corrupt|invalid/i);
  });

  it("HEB13 persists only in the global sidecar and preserves ZPF", () => {
    const value = preparedFixture();
    const receipt = handoff(value);
    assertZpf(value.repo);
    expect(receipt).toBeDefined();
    expect(value.context.paths.currentHostExecutionReceipt.startsWith(value.home)).toBe(true);
    expect(value.context.paths.currentHostExecutionReceipt.startsWith(value.repo)).toBe(false);
  });

  it("HEB14 rejects extra sensitive or raw operational fields", () => {
    const value = preparedFixture();
    const receipt = handoff(value);
    const invalid = { ...receipt, prompt: "raw prompt", command: "shell command", hostPath: value.target };
    expect(() => assertSchema("host-execution-receipt.schema.json", invalid, ROOT)).toThrow(/additional|must NOT|schema/i);
    expect(JSON.stringify(receipt)).not.toContain(value.target);
    expect(JSON.stringify(receipt)).not.toMatch(/prompt|command|token|credential|private.?key/i);
  });

  it("HEB15 applies one contract to Cursor, Codex, and Generic Agent Skills", () => {
    const value = fixture();
    uninstallHostAdapter("generic-agent-skills", { hostHome: value.target, uadsHome: value.home }, ROOT);
    const receipts = (['cursor', 'codex', 'generic-agent-skills'] as const).map((adapterId) => {
      const target = hostHome();
      installHostAdapter(adapterId, { hostHome: target, uadsHome: value.home, packageRoot: ROOT }, ROOT);
      prepareHostDispatchBundle({ adapterId, cwd: value.repo, uadsHome: value.home, hostHome: target, schemaRoot: ROOT });
      return handoffHostExecution({ adapterId, cwd: value.repo, uadsHome: value.home, hostHome: target, schemaRoot: ROOT });
    });
    expect(receipts.map((receipt) => receipt.schema)).toEqual(["uads.host-execution-receipt", "uads.host-execution-receipt", "uads.host-execution-receipt"]);
    expect(receipts.every((receipt) => receipt.adapterContractVersion === "0.10.0" && receipt.state === "ACCEPTED")).toBe(true);
  });

  it("HEB16 keeps host-managed model provenance conservative", () => {
    const value = preparedFixture();
    const receipt = handoff(value);
    expect(receipt.modelPlanId).toBe(value.bundle.modelPlanId);
    expect(receipt.modelRuntimeIdentityDigest).toBe(value.bundle.modelRuntimeIdentityDigest);
    expect(JSON.stringify(receipt)).not.toMatch(/selectedProviderId|providerId|provider/i);
  });

  it("HEB17 completed receipt cannot satisfy execution gates or finalize", () => {
    const value = preparedFixture();
    handoff(value);
    transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT });
    transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "COMPLETED", schemaRoot: ROOT });
    const runBefore = readCurrentExecutionRun(value.context.paths, ROOT)!;
    expect(runBefore.status).not.toBe("completed");
    expect(runBefore.evidenceRefs).toEqual([]);
    expect(() => runFinalize({ cwd: value.repo, uadsHome: value.home })).toThrow();
    expect(readCurrentExecutionRun(value.context.paths, ROOT)?.evidenceRefs).toEqual([]);
  });

  it("HEB18 keeps bounded receipt history", () => {
    const value = preparedFixture();
    const base = handoff(value);
    const { receiptDigest: _ignoredBaseDigest, ...baseWithoutDigest } = base;
    for (let index = 0; index < 40; index += 1) {
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      const candidateBase = {
        ...baseWithoutDigest,
        receiptId: `her_${sha256Hex(`history-${index}`).slice(0, 16)}`,
        createdAt,
        updatedAt: createdAt,
        acceptedAt: createdAt,
      };
      const candidate = { ...candidateBase, receiptDigest: computeHostExecutionReceiptDigest(candidateBase) };
      persistHostExecutionReceipt(value.context.paths, candidate, ROOT);
    }
    expect(listHostExecutionReceipts(value.context.paths, ROOT).length).toBe(32);
  });

  it("HEB19 keeps CLI JSON and human output compact and privacy-safe", () => {
    const value = preparedFixture();
    const json = runAdaptersHandoffCommand({ adapter: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, json: true });
    const parsed = JSON.parse(json) as { state: string; receiptId: string };
    expect(parsed.state).toBe("ACCEPTED");
    expect(json).not.toContain(value.home);
    expect(json).not.toContain(value.target);
    const human = runAdaptersReceiptCommand({ adapter: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED" });
    expect(human).toContain("state: STARTED");
    expect(human).not.toContain(value.home);
    expect(human).not.toContain(value.target);
  });

  it("HEB20 preserves install, prepare, and uninstall compatibility", () => {
    for (const adapterId of ["cursor", "codex", "generic-agent-skills"] as const) {
      const value = fixture(adapterId);
      const prepared = prepareHostDispatchBundle({ adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, schemaRoot: ROOT });
      expect(prepared.status).toBe("PREPARED");
      const removed = uninstallHostAdapter(adapterId, { hostHome: value.target, uadsHome: value.home }, ROOT);
      expect(removed?.installStatus).toBe("NOT_INSTALLED");
    }
  });

  it("HEB21 rejects a transition after the current execution run changes", () => {
    const value = preparedFixture();
    const accepted = handoff(value);
    const changedRun = {
      ...value.dispatched.run,
      executionRunId: "er_current_identity_drift",
      updatedAt: new Date(Date.now() + 1_000).toISOString(),
    };
    persistExecutionRun({ paths: value.context.paths, run: changedRun, schemaRoot: ROOT });
    expectHostExecutionReason(
      () => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "COMPLETED", schemaRoot: ROOT }),
      "EXECUTION_RUN_MISMATCH",
    );
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)).toEqual(accepted);
  });

  it("HEB22 rejects current Work Order, routing, specialist, model, and change drift", () => {
    const mutations: Array<{ label: string; mutate: (value: ReturnType<typeof preparedFixture>) => void }> = [
      {
        label: "work-order",
        mutate: (value) => {
          const workOrderPath = path.join(value.context.paths.workOrders, `${value.planned.workOrder.workOrderId}.json`);
          rewrite(workOrderPath, (workOrder) => ({ ...workOrder, objective: "drifted current objective" }));
        },
      },
      {
        label: "routing",
        mutate: (value) => {
          const routingPath = path.join(value.context.paths.decisions, `${value.planned.workOrder.routingDecisionId}.json`);
          rewrite(routingPath, (routing) => ({ ...routing, warnings: [...((routing.warnings as string[]) ?? []), "drifted" ] }));
        },
      },
      {
        label: "specialist",
        mutate: (value) => rewrite(value.context.paths.currentSpecialistSelection, (selection) => ({ ...selection, selectionDigest: "a".repeat(64) })),
      },
      {
        label: "model",
        mutate: (value) => rewrite(value.context.paths.currentModelRouting, (model) => ({ ...model, planId: "model_plan_drift" })),
      },
      {
        label: "current-change",
        mutate: (value) => {
          const runPath = path.join(value.context.paths.executionRuns, value.dispatched.run.executionRunId, "run.json");
          rewrite(runPath, (run) => ({ ...run, currentChangeDigest: "b".repeat(64) }));
        },
      },
    ];
    for (const mutation of mutations) {
      const value = preparedFixture();
      handoff(value);
      mutation.mutate(value);
      let thrown: unknown;
      try {
        transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT });
      } catch (error) {
        thrown = error;
      }
      expect(thrown, mutation.label).toBeDefined();
      expect((thrown as { reasonCode?: string }).reasonCode, mutation.label).toMatch(/BUNDLE_STALE|SPECIALIST_SELECTION_INVALID|MODEL_PLAN_BLOCKED|CHANGE_IDENTITY_MISMATCH/);
    }
  }, 300_000);

  it("HEB23 rejects a transition after host ownership becomes stale", () => {
    const value = preparedFixture();
    handoff(value);
    const staleTarget = hostHome();
    expectHostExecutionReason(
      () => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: staleTarget, state: "STARTED", schemaRoot: ROOT }),
      "OWNERSHIP_NOT_TRUSTED",
    );
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)?.state).toBe("ACCEPTED");
  });

  it("HEB24 rejects a semantically replaced current bundle without rewriting the old receipt", () => {
    const value = preparedFixture();
    const accepted = handoff(value);
    rewrite(value.context.paths.currentHostDispatch, (bundle) => {
      const changed = { ...bundle, includedScope: [...((bundle.includedScope as string[]) ?? []), "tests"] };
      const { bundleDigest: _ignored, ...withoutDigest } = changed;
      return { ...changed, bundleDigest: sha256Hex(JSON.stringify(stableValue(withoutDigest))) };
    });
    expectHostExecutionReason(
      () => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT }),
      "BUNDLE_STALE",
    );
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)).toEqual(accepted);
  });

  it("HEB25 continues an unchanged current handoff normally", () => {
    const value = preparedFixture();
    handoff(value);
    expect(() => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT })).not.toThrow();
    expect(() => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "COMPLETED", schemaRoot: ROOT })).not.toThrow();
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)?.state).toBe("COMPLETED");
  });

  it("HEB26 blocks an approval-gated handoff without an existing authorization proof", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Deploy the application to production",
      domainSignals: ["cloud-devops"],
      riskSignals: ["infrastructure"],
      inScope: ["deployment"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toContain("production deployment");
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)).toBeNull();
  });

  it("HEB27 proves a completed receipt cannot substitute for approval authority", () => {
    const value = preparedFixture();
    handoff(value);
    transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT });
    const completed = transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "COMPLETED", schemaRoot: ROOT });
    const workOrderPath = path.join(value.context.paths.workOrders, `${value.planned.workOrder.workOrderId}.json`);
    rewrite(workOrderPath, (workOrder) => ({
      ...workOrder,
      autonomyBoundary: {
        ...(workOrder.autonomyBoundary as Record<string, unknown>),
        activeApprovalGatedActions: ["production deployment"],
      },
    }));
    expectHostExecutionReason(
      () => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT }),
      "TERMINAL_IMMUTABLE",
    );
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)).toEqual(completed);
  });

  it("HEB28 keeps the global approval catalog without blocking a safe planner handoff", () => {
    const value = preparedFixture();
    expect(value.planned.workOrder.autonomyBoundary.requiresApproval.length).toBeGreaterThan(0);
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([]);
    expect(handoff(value).state).toBe("ACCEPTED");
  });

  it("HEB29 blocks an active production deployment intent", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Deploy the application to production",
      domainSignals: ["cloud-devops"],
      riskSignals: ["infrastructure"],
      inScope: ["deployment"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual(["production deployment"]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB30 blocks an active destructive production database intent", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Drop the production users table",
      domainSignals: ["frontend"],
      affectedAreas: ["src"],
      inScope: ["production database"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual(["destructive production database operation"]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB31 blocks active Web3 asset transfer and on-chain execution", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Transfer assets and execute a transaction",
      domainSignals: ["frontend"],
      affectedAreas: ["src"],
      requestedArtifacts: ["web3 on-chain context"],
      inScope: ["asset transfer"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "transferring assets/funds",
      "on-chain transaction execution",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB32 blocks explicit material-cost external infrastructure intent", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Provision paid cloud infrastructure with material cost impact",
      domainSignals: ["cloud-devops"],
      riskSignals: ["infrastructure"],
      inScope: ["external infrastructure"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "spending money / material-cost external infrastructure action",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB33 blocks real credential rotation intent", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Rotate real production API credentials",
      domainSignals: ["frontend"],
      affectedAreas: ["src"],
      inScope: ["credential rotation"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual(["rotating real credentials"]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB34 blocks destructive Git history rewrite intent", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Rewrite Git history and force push the branch",
      inScope: ["Git history"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual(["destructive Git history rewrite"]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB35 blocks package publication without the canonical authorization boundary", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Publish the package release to npm",
      domainSignals: ["release"],
      inScope: ["package release"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "publishing package/release when not already authorized",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB36 rejects active approval classification tamper after prepare", () => {
    const value = preparedFixture();
    const accepted = handoff(value);
    rewrite(value.context.paths.currentHostDispatch, (bundle) => {
      const changed = { ...bundle, activeApprovalGatedActions: ["production deployment"] };
      const { bundleDigest: _ignored, ...withoutDigest } = changed;
      return { ...changed, bundleDigest: sha256Hex(JSON.stringify(stableValue(withoutDigest))) };
    });
    expectHostExecutionReason(
      () => transitionHostExecutionReceipt({ adapterId: value.adapterId, cwd: value.repo, uadsHome: value.home, hostHome: value.target, state: "STARTED", schemaRoot: ROOT }),
      "BUNDLE_STALE",
    );
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)).toEqual(accepted);
  });

  it("HEB37 ignores caller approval booleans and still fails closed for active intent", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Deploy the application to production",
      domainSignals: ["cloud-devops"],
      riskSignals: ["infrastructure"],
      inScope: ["deployment"],
      callerFields: {
        approvalAuthorized: true,
        authorized: true,
        bypassApproval: true,
      },
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual(["production deployment"]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB38 keeps package publication gated unless the exact canonical boundary is present", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Publish the package release to npm",
      domainSignals: ["release"],
      approvedBoundaries: ["authorized by release manager"],
      inScope: ["package release"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "publishing package/release when not already authorized",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB39 preserves normal prepare and dispatch compatibility", () => {
    const value = fixture();
    const bundle = prepareHostDispatchBundle({
      adapterId: value.adapterId,
      cwd: value.repo,
      uadsHome: value.home,
      hostHome: value.target,
      schemaRoot: ROOT,
    });
    expect(bundle.status).toBe("PREPARED");
    expect(bundle.activeApprovalGatedActions).toEqual([]);
    expect(handoff(value).state).toBe("ACCEPTED");
  });

  it("HEB40 does not treat caller-supplied package authorization prose as proof", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Publish the package release to npm",
      domainSignals: ["release"],
      approvedBoundaries: ["package/release publication authorized"],
      inScope: ["package release"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "publishing package/release when not already authorized",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB41 fails closed for an ambiguous sensitive approval intent", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Modify the production environment",
      domainSignals: ["cloud-devops"],
      riskSignals: ["infrastructure"],
      inScope: ["production environment"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([]);
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalIntentAmbiguous).toBe(true);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB42 classifies promotion to production as a gated deployment", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Promote the release to production",
      domainSignals: ["cloud-devops"],
      riskSignals: ["infrastructure"],
      inScope: ["production release"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual(["production deployment"]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB43 binds requested-artifact approval intent through the Work Order", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Prepare the package",
      domainSignals: ["release"],
      requestedArtifacts: ["Publish the package release to npm"],
      inScope: ["package release"],
    });
    expect(value.planned.workOrder.requestedArtifacts).toEqual(["Publish the package release to npm"]);
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "publishing package/release when not already authorized",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB44 fails closed for legacy Work Orders without canonical approval signals", () => {
    const value = preparedFixture();
    const workOrderPath = path.join(value.context.paths.workOrders, `${value.planned.workOrder.workOrderId}.json`);
    rewrite(workOrderPath, (workOrder) => {
      const { requestedArtifacts: _requestedArtifacts, destructiveSignals: _destructiveSignals, ...legacy } = workOrder;
      return legacy;
    });
    expect(() => prepareHostDispatchBundle({
      adapterId: value.adapterId,
      cwd: value.repo,
      uadsHome: value.home,
      hostHome: value.target,
      schemaRoot: ROOT,
    })).toThrow("current Work Order lacks persisted canonical approval signals; legacy sidecar requires explicit migration");
  });

  it("HEB45 classifies package publication stated only in constraints", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Prepare the release package",
      domainSignals: ["release"],
      inScope: ["package release"],
      constraints: ["Publish the package release to npm"],
    });
    expect(value.planned.workOrder.constraints).toEqual(["Publish the package release to npm"]);
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "publishing package/release when not already authorized",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB46 classifies package publication stated only in acceptance criteria", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Prepare the release package",
      domainSignals: ["release"],
      inScope: ["package release"],
      acceptanceCriteria: ["Publish the package release to npm"],
    });
    expect(value.planned.workOrder.acceptanceCriteria).toEqual(["Publish the package release to npm"]);
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "publishing package/release when not already authorized",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB47 classifies production deployment stated only in constraints", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Prepare the deployment plan",
      domainSignals: ["cloud-devops"],
      riskSignals: ["infrastructure"],
      inScope: ["production environment"],
      constraints: ["Deploy the application to production"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual(["production deployment"]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB48 rejects the old handoff after a constraint changes approval classification", () => {
    const value = preparedFixture();
    const accepted = handoff(value);
    const workOrderPath = path.join(value.context.paths.workOrders, `${value.planned.workOrder.workOrderId}.json`);
    rewrite(workOrderPath, (workOrder) => ({
      ...workOrder,
      constraints: ["Deploy the application to production"],
    }));
    expect(() => transitionHostExecutionReceipt({
      adapterId: value.adapterId,
      cwd: value.repo,
      uadsHome: value.home,
      hostHome: value.target,
      state: "STARTED",
      schemaRoot: ROOT,
    })).toThrow(/stale|mismatch|approval/i);
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)).toEqual(accepted);
  });

  it("HEB49 fails closed for legacy Work Orders without persisted constraints", () => {
    const value = preparedFixture();
    const workOrderPath = path.join(value.context.paths.workOrders, `${value.planned.workOrder.workOrderId}.json`);
    rewrite(workOrderPath, (workOrder) => {
      const { constraints: _constraints, ...legacy } = workOrder;
      return legacy;
    });
    expect(() => prepareHostDispatchBundle({
      adapterId: value.adapterId,
      cwd: value.repo,
      uadsHome: value.home,
      hostHome: value.target,
      schemaRoot: ROOT,
    })).toThrow("current Work Order lacks persisted canonical approval signals; legacy sidecar requires explicit migration");
  });

  it("HEB50 accepts benign constraints without blanket blocking normal work", () => {
    const value = preparedFixture("generic-agent-skills", {
      constraints: ["Keep the change local to the repository", "Run the verification tests"],
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([]);
    expect(handoff(value).state).toBe("ACCEPTED");
  });

  it("HEB51 cannot bypass constraint-derived approval with caller flags or boundaries", () => {
    const value = preparedFixture("generic-agent-skills", {
      objective: "Prepare the release package",
      domainSignals: ["release"],
      inScope: ["package release"],
      constraints: ["Publish the package release to npm"],
      approvedBoundaries: ["package/release publication authorized"],
      callerFields: {
        approvalAuthorized: true,
        authorized: true,
        bypassApproval: true,
      },
    });
    expect(value.planned.workOrder.autonomyBoundary.activeApprovalGatedActions).toEqual([
      "publishing package/release when not already authorized",
    ]);
    expectHostExecutionReason(() => handoff(value), "APPROVAL_AUTHORIZATION_MISSING");
  });

  it("HEB52 cannot use a completed receipt as approval after constraint-derived intent changes", () => {
    const value = preparedFixture();
    const accepted = handoff(value);
    transitionHostExecutionReceipt({
      adapterId: value.adapterId,
      cwd: value.repo,
      uadsHome: value.home,
      hostHome: value.target,
      state: "STARTED",
      schemaRoot: ROOT,
    });
    const completed = transitionHostExecutionReceipt({
      adapterId: value.adapterId,
      cwd: value.repo,
      uadsHome: value.home,
      hostHome: value.target,
      state: "COMPLETED",
      schemaRoot: ROOT,
    });
    const workOrderPath = path.join(value.context.paths.workOrders, `${value.planned.workOrder.workOrderId}.json`);
    rewrite(workOrderPath, (workOrder) => ({
      ...workOrder,
      constraints: ["Publish the package release to npm"],
    }));
    expect(() => transitionHostExecutionReceipt({
      adapterId: value.adapterId,
      cwd: value.repo,
      uadsHome: value.home,
      hostHome: value.target,
      state: "STARTED",
      schemaRoot: ROOT,
    })).toThrow(/terminal|stale|mismatch|approval/i);
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)).toEqual(completed);
    expect(readCurrentHostExecutionReceipt(value.context.paths, ROOT)).not.toEqual(accepted);
  });
});
