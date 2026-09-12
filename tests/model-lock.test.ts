import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgainstSchema } from "../src/lib/json-schema.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import {
  clearModelLock,
  computeModelRoutingStateRevisionDigest,
  countInvalidRevisionRecords,
  readModelRoutingState,
  readModelRoutingStateRevisions,
  recoverModelRoutingState,
  setModelLock,
  setModelRoutingMode,
} from "../src/kernel/model-lock.js";
import { addModelProfiles, normalizeModelProfile } from "../src/kernel/model-registry.js";
import { readCurrentModelExecutionPlanState } from "../src/kernel/model-persist.js";
import { routeWorkOrder } from "../src/kernel/model-router.js";
import {
  conservativeRuntimeCapabilitySnapshot,
  computeRuntimeIdentityDigest,
  persistRuntimeCapabilitySnapshot,
  readRuntimeCapabilitySnapshot,
} from "../src/kernel/model-runtime.js";
import type { ModelProfile, RuntimeCapabilitySnapshot } from "../src/kernel/model-types.js";
import type { WorkOrder } from "../src/kernel/types.js";
import { tempDirs } from "./helpers.js";

const PROJECT_ID = "lock-project";
const NOW = "2026-01-01T00:00:00.000Z";
const REGISTRY_DIGEST = "a".repeat(64);

function profile(id: string, capabilityClass: ModelProfile["capabilityClass"], overrides: Record<string, unknown> = {}): ModelProfile {
  return normalizeModelProfile({
    schema: "uads.model-profile",
    schemaVersion: "0.8.0",
    profileId: id,
    providerId: "fixture-provider",
    modelId: `fixture-model-${id}`,
    status: "enabled",
    capabilityClass,
    reasoningClass: capabilityClass === "economy" ? "basic" : capabilityClass === "balanced" ? "standard" : capabilityClass === "strong" ? "advanced" : "deep",
    contextWindowTokens: 16_384,
    maxOutputTokens: 4_096,
    relativeCostClass: "medium",
    relativeLatencyClass: "medium",
    supports: {
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      promptCache: true,
      explicitCache: true,
      persistentContext: true,
      usageTelemetry: true,
    },
    constraints: { maxConcurrency: null },
    notes: "lock test fixture",
    source: "builtin-fixture",
    adapterId: "test-fixture",
    adapterVersion: "0.8.0",
    ...overrides,
  });
}

function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    schema: "uads.work-order",
    schemaVersion: "0.2.0",
    workOrderId: "wo_lock_fixture",
    projectId: PROJECT_ID,
    title: "Lock fixture work order",
    objective: "Change a local implementation detail.",
    status: "planned",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    intakeRef: "intake_lock_fixture",
    routingDecisionId: "rd_lock_fixture",
    scopeClass: "trivial",
    includedScope: ["src/index.ts"],
    outOfScope: [],
    recommendations: [],
    riskLevel: "LOW",
    riskReasons: [],
    domains: ["frontend"],
    affectedAreas: [],
    specialists: ["implementation-agent"],
    assuranceReviewers: ["independent-reviewer"],
    qualityGates: ["lint"],
    contextRadius: "C0",
    tokenBudget: {
      softLimit: 3_000,
      hardLimit: 8_000,
      capabilityClass: "economy",
      cachePreference: "prefer-cache",
      expansionPolicy: "bounded",
    },
    dependencies: [],
    acceptanceCriteria: ["The change is verified."],
    requiredEvidence: ["test output"],
    stopConditions: ["scope violation"],
    autonomyBoundary: { safeAutonomous: ["edit in-scope files"], requiresApproval: ["release"] },
    nextAction: "Implement the work order.",
    ...overrides,
  };
}

describe("governed Model Lock state and routing-state audit", () => {
  it("WO-025 T2: set/clear persist immutable revision records with monotonic revisions", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    expect(readModelRoutingState(paths, PROJECT_ID)).toEqual({ status: "ABSENT" });
    const first = setModelLock({
      paths,
      projectId: PROJECT_ID,
      profile: { profileId: "locked", providerId: "fixture-provider", modelId: "fixture-model-locked" },
      registryDigest: REGISTRY_DIGEST,
      now: NOW,
    });
    expect(first.lockRevision).toBe(1);
    expect(first.mode).toBe("MODEL_LOCK");
    expect(first.locked?.profileId).toBe("locked");
    const firstRevisionBytes = fs.readFileSync(path.join(paths.modelLockRevisions, "rev-000001.json"), "utf8");
    const cleared = clearModelLock({ paths, projectId: PROJECT_ID, registryDigest: REGISTRY_DIGEST, now: NOW });
    expect(cleared.lockRevision).toBe(2);
    expect(cleared.mode).toBe("QUALITY_FLOOR_AUTOROUTE");
    expect(cleared.locked).toBeNull();
    const mode = setModelRoutingMode({ paths, projectId: PROJECT_ID, mode: "CHEAPEST_QUALIFIED", registryDigest: REGISTRY_DIGEST, now: NOW });
    expect(mode.lockRevision).toBe(3);
    expect(fs.readFileSync(path.join(paths.modelLockRevisions, "rev-000001.json"), "utf8")).toBe(firstRevisionBytes);
    const records = readModelRoutingStateRevisions(paths);
    expect(records.map((record) => record.action)).toEqual(["SET_LOCK", "CLEAR_LOCK", "SET_MODE"]);
    expect(records.map((record) => record.lockRevision)).toEqual([1, 2, 3]);
    expect(records[1].previousRevision).toBe(1);
    expect(records[1].previousStateDigest).toBe(first.stateDigest);
    expect(records[2].previousMode).toBe("QUALITY_FLOOR_AUTOROUTE");
    for (const record of records) {
      const { recordDigest, ...rest } = record;
      expect(recordDigest).toBe(computeModelRoutingStateRevisionDigest(rest));
      expect(validateAgainstSchema("model-routing-state-revision.schema.json", record)).toEqual([]);
    }
    const state = readModelRoutingState(paths, PROJECT_ID);
    expect(state.status).toBe("CURRENT");
    expect(validateAgainstSchema("model-routing-state.schema.json", JSON.parse(fs.readFileSync(paths.modelLock, "utf8")))).toEqual([]);
  });

  it("WO-025 T3: corrupt lock state fails closed with explicit operator recovery and archived raw bytes", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    setModelLock({
      paths,
      projectId: PROJECT_ID,
      profile: { profileId: "locked", providerId: "fixture-provider", modelId: "fixture-model-locked" },
      now: NOW,
    });
    fs.writeFileSync(paths.modelLock, "{ corrupt", "utf8");
    const read = readModelRoutingState(paths, PROJECT_ID);
    expect(read.status).toBe("UNAVAILABLE");
    if (read.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(read.reasonCodes).toContain("ROUTING_STATE_UNAVAILABLE");
    expect(read.reasonCodes).toContain("ROUTING_STATE_CORRUPT");
    expect(() =>
      setModelLock({ paths, projectId: PROJECT_ID, profile: { profileId: "other", providerId: "fixture-provider", modelId: "fixture-model-other" } }),
    ).toThrow(/models lock recover/);
    const recovered = recoverModelRoutingState({ paths, projectId: PROJECT_ID, now: NOW });
    expect(recovered.lockRevision).toBe(2);
    expect(recovered.mode).toBe("QUALITY_FLOOR_AUTOROUTE");
    expect(recovered.locked).toBeNull();
    const rawArchives = fs.readdirSync(paths.modelLockRevisions).filter((entry) => entry.endsWith(".raw"));
    expect(rawArchives.length).toBe(1);
    expect(fs.readFileSync(path.join(paths.modelLockRevisions, rawArchives[0]), "utf8")).toBe("{ corrupt");
    const records = readModelRoutingStateRevisions(paths);
    expect(records[records.length - 1].action).toBe("OPERATOR_RECOVERY");
    expect(records[records.length - 1].lockRevision).toBe(2);
  });

  it("WO-025 T3: digest tampering, schema drift and project mismatch are rejected without throwing", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    setModelLock({
      paths,
      projectId: PROJECT_ID,
      profile: { profileId: "locked", providerId: "fixture-provider", modelId: "fixture-model-locked" },
      now: NOW,
    });
    const state = JSON.parse(fs.readFileSync(paths.modelLock, "utf8")) as Record<string, unknown>;
    state.locked = { profileId: "swapped", providerId: "fixture-provider", modelId: "fixture-model-swapped" };
    fs.writeFileSync(paths.modelLock, JSON.stringify(state), "utf8");
    const tampered = readModelRoutingState(paths, PROJECT_ID);
    expect(tampered.status).toBe("UNAVAILABLE");
    if (tampered.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(tampered.reasonCodes).toContain("ROUTING_STATE_DIGEST_INVALID");
    fs.writeFileSync(paths.modelLock, JSON.stringify({ schema: "uads.model-routing-state", schemaVersion: "9.9.9" }), "utf8");
    const drifted = readModelRoutingState(paths, PROJECT_ID);
    expect(drifted.status).toBe("UNAVAILABLE");
    if (drifted.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(drifted.reasonCodes).toContain("ROUTING_STATE_SCHEMA_MISMATCH");
    recoverModelRoutingState({ paths, projectId: PROJECT_ID, now: NOW });
    const otherProject = readModelRoutingState(paths, "another-project");
    expect(otherProject.status).toBe("UNAVAILABLE");
    if (otherProject.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(otherProject.reasonCodes).toContain("ROUTING_STATE_PROJECT_MISMATCH");
  });

  it("WO-025 T10: routing state rejects secret-like or host-path content at write time", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    expect(() =>
      setModelLock({
        paths,
        projectId: PROJECT_ID,
        profile: { profileId: `ghp_${"b".repeat(36)}`, providerId: "fixture-provider", modelId: "fixture-model-locked" },
      }),
    ).toThrow(/secret-like or host-path/);
    const backslash = String.fromCharCode(92);
    expect(() =>
      setModelLock({
        paths,
        projectId: PROJECT_ID,
        profile: { profileId: "locked", providerId: "fixture-provider", modelId: "C:" + backslash + "Users" + backslash + "operator" },
      }),
    ).toThrow(/secret-like or host-path/);
    expect(fs.existsSync(paths.modelLock)).toBe(false);
  });

  it("WO-025 T1/T3: production routing without a proven adapter identity stays conservative and a lock never weakens", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    addModelProfiles(paths, [profile("locked", "economy"), profile("economy", "economy")]);
    const state = setModelLock({
      paths,
      projectId: PROJECT_ID,
      profile: { profileId: "locked", providerId: "fixture-provider", modelId: "fixture-model-locked" },
      now: NOW,
    });
    const plan = routeWorkOrder({ paths, workOrder: workOrder() });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReason).toBe("MODEL_LOCK_UNAVAILABLE");
    expect(plan.modelLock.active).toBe(true);
    expect(plan.modelLock.revision).toBe(state.lockRevision);
    expect(plan.selectedProfileId).toBeNull();
    expect(plan.fallbackProfileIds).toEqual([]);
    expect(plan.capabilityTruth.adapterId).toBeNull();
    expect(plan.capabilityTruth.reasonCodes).toContain("CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED");
    expect(Object.values(plan.capabilityTruth.capabilities).every((value) => value === "UNKNOWN")).toBe(true);
    const after = readModelRoutingState(paths, PROJECT_ID);
    expect(after.status).toBe("CURRENT");
    if (after.status !== "CURRENT") throw new Error("unreachable");
    expect(after.state.mode).toBe("MODEL_LOCK");
    expect(after.state.lockRevision).toBe(state.lockRevision);
  });

  it("WO-025 T1: a legacy all-true runtime snapshot does not enable routing", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    addModelProfiles(paths, profile("economy", "economy"));
    const conservative = conservativeRuntimeCapabilitySnapshot();
    const allTrue = Object.fromEntries(Object.keys(conservative.capabilities).map((key) => [key, true])) as RuntimeCapabilitySnapshot["capabilities"];
    const unsigned: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
      schema: conservative.schema,
      schemaVersion: conservative.schemaVersion,
      runtimeId: conservative.runtimeId,
      adapterId: conservative.adapterId,
      adapterVersion: conservative.adapterVersion,
      runtimeVersion: conservative.runtimeVersion,
      capabilities: allTrue,
      provenance: { source: "explicit-config", confidence: "declared" },
    };
    persistRuntimeCapabilitySnapshot(paths, { ...unsigned, identityDigest: computeRuntimeIdentityDigest(unsigned) });
    const plan = routeWorkOrder({ paths, workOrder: workOrder() });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.capabilityTruth.adapterId).toBeNull();
    expect(Object.values(plan.capabilityTruth.capabilities).every((value) => value === "UNKNOWN")).toBe(true);
    const persisted = readRuntimeCapabilitySnapshot(paths);
    expect(persisted.capabilities.modelSelection).toBe("unknown");
  });

  it("WO-025 T10: current plan reads degrade truthfully and never throw", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    fs.writeFileSync(paths.currentModelRouting, JSON.stringify({ schema: "uads.model-execution-plan", schemaVersion: "0.8.0" }), "utf8");
    expect(readCurrentModelExecutionPlanState(paths)).toEqual({ status: "LEGACY", observedSchemaVersion: "0.8.0", reasonCode: "PLAN_SCHEMA_LEGACY" });
    fs.writeFileSync(paths.currentModelRouting, "{ not-json", "utf8");
    const corrupt = readCurrentModelExecutionPlanState(paths);
    expect(corrupt.status).toBe("UNAVAILABLE");
    if (corrupt.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(corrupt.reasonCodes).toContain("PLAN_UNAVAILABLE");
    fs.writeFileSync(
      paths.currentModelRouting,
      JSON.stringify({ schema: "uads.model-execution-plan", schemaVersion: "0.9.0", note: "C:" + String.fromCharCode(92) + "Users" + String.fromCharCode(92) + "operator" }),
      "utf8",
    );
    const unsafe = readCurrentModelExecutionPlanState(paths);
    expect(unsafe.status).toBe("UNAVAILABLE");
    if (unsafe.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(unsafe.reasonCodes).toContain("PLAN_UNSAFE_CONTENT");
    fs.unlinkSync(paths.currentModelRouting);
    const absent = readCurrentModelExecutionPlanState(paths);
    expect(absent.status).toBe("UNAVAILABLE");
  });

  it("CR-02: valid revision 1/2 records read with recomputed digests and zero invalid evidence", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    setModelLock({
      paths,
      projectId: PROJECT_ID,
      profile: { profileId: "locked", providerId: "fixture-provider", modelId: "fixture-model-locked" },
      registryDigest: REGISTRY_DIGEST,
      now: NOW,
    });
    clearModelLock({ paths, projectId: PROJECT_ID, registryDigest: REGISTRY_DIGEST, now: NOW });
    const records = readModelRoutingStateRevisions(paths);
    expect(records.map((record) => record.lockRevision)).toEqual([1, 2]);
    for (const record of records) {
      const { recordDigest, ...rest } = record;
      expect(recordDigest).toBe(computeModelRoutingStateRevisionDigest(rest));
    }
    expect(countInvalidRevisionRecords(paths)).toBe(0);
  });

  it("CR-02: a digest-tampered revision is not surfaced and cannot inflate the next lockRevision", () => {
    const { home } = tempDirs();
    const paths = ensureWorkspace(PROJECT_ID, home);
    setModelLock({
      paths,
      projectId: PROJECT_ID,
      profile: { profileId: "locked", providerId: "fixture-provider", modelId: "fixture-model-locked" },
      registryDigest: REGISTRY_DIGEST,
      now: NOW,
    });
    clearModelLock({ paths, projectId: PROJECT_ID, registryDigest: REGISTRY_DIGEST, now: NOW });
    const tamperedPath = path.join(paths.modelLockRevisions, "rev-000002.json");
    const tampered = JSON.parse(fs.readFileSync(tamperedPath, "utf8")) as Record<string, unknown>;
    // Schema-valid mutation (integer >= 1) without recomputing recordDigest: isolates digest validation.
    tampered.lockRevision = 99;
    fs.writeFileSync(tamperedPath, JSON.stringify(tampered), "utf8");
    const tamperedBytes = fs.readFileSync(tamperedPath, "utf8");
    expect(validateAgainstSchema("model-routing-state-revision.schema.json", JSON.parse(tamperedBytes))).toEqual([]);
    const records = readModelRoutingStateRevisions(paths);
    expect(records.map((record) => record.lockRevision)).toEqual([1]);
    expect(countInvalidRevisionRecords(paths)).toBe(1);
    const next = setModelRoutingMode({ paths, projectId: PROJECT_ID, mode: "CHEAPEST_QUALIFIED", registryDigest: REGISTRY_DIGEST, now: NOW });
    expect(next.lockRevision).toBe(3);
    // The tampered file is neither trusted, repaired, nor overwritten by ordinary writes.
    expect(fs.readFileSync(tamperedPath, "utf8")).toBe(tamperedBytes);
    expect(fs.existsSync(path.join(paths.modelLockRevisions, "rev-000003.json"))).toBe(true);
    expect(countInvalidRevisionRecords(paths)).toBe(1);
    expect(readModelRoutingStateRevisions(paths).map((record) => record.lockRevision)).toEqual([1, 3]);
  });
});
