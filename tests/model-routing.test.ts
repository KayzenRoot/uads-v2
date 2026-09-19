import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureWorkspace } from "../src/lib/workspace.js";
import { validateAgainstSchema } from "../src/lib/json-schema.js";
import { createModelProfileRegistry, addModelProfiles, normalizeModelProfile } from "../src/kernel/model-registry.js";
import { computeWorkOrderRoutingDigest, routeModel } from "../src/kernel/model-router.js";
import { RUNTIME_CAPABILITY_KEYS, conservativeRuntimeCapabilitySnapshot, computeRuntimeIdentityDigest } from "../src/kernel/model-runtime.js";
import { isModelExecutionPlanCurrent } from "../src/kernel/model-persist.js";
import { type ModelProfile, type RuntimeCapabilitySnapshot } from "../src/kernel/model-types.js";
import type { ContextPack } from "../src/kernel/intelligence-types.js";
import type { WorkOrder } from "../src/kernel/types.js";
import { tempDirs } from "./helpers.js";

const DIGEST = "a".repeat(64);

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
    notes: "test fixture",
    source: "builtin-fixture",
    adapterId: "test-fixture",
    adapterVersion: "0.8.0",
    ...overrides,
  });
}

function runtime(overrides: Partial<RuntimeCapabilitySnapshot["capabilities"]> = {}, confidence: RuntimeCapabilitySnapshot["provenance"]["confidence"] = "proven"): RuntimeCapabilitySnapshot {
  const conservative = conservativeRuntimeCapabilitySnapshot({ runtimeId: "fixture-runtime", adapterId: "fixture-adapter", adapterVersion: "0.8.0" });
  const unsigned = {
    schema: conservative.schema,
    schemaVersion: conservative.schemaVersion,
    runtimeId: conservative.runtimeId,
    adapterId: conservative.adapterId,
    adapterVersion: conservative.adapterVersion,
    runtimeVersion: conservative.runtimeVersion,
    capabilities: { ...conservative.capabilities, ...overrides },
    provenance: { source: "test-fixture" as const, confidence },
  };
  return { ...unsigned, identityDigest: computeRuntimeIdentityDigest(unsigned) };
}

function capableRuntime(overrides: Partial<RuntimeCapabilitySnapshot["capabilities"]> = {}): RuntimeCapabilitySnapshot {
  return runtime({
    modelSelection: true,
    toolCalling: true,
    structuredOutput: true,
    promptCache: true,
    explicitCache: true,
    persistentContext: true,
    subagents: true,
    parallelAgents: true,
    usageTelemetry: true,
    visionInput: true,
    ...overrides,
  }, "proven");
}

function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    schema: "uads.work-order",
    schemaVersion: "0.2.0",
    workOrderId: "wo_fixture_001",
    projectId: "project_fixture",
    title: "Fixture work order",
    objective: "Change a local implementation detail.",
    status: "planned",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    intakeRef: "intake_fixture",
    routingDecisionId: "rd_fixture",
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
    autonomyBoundary: { safeAutonomous: ["edit in-scope files"], requiresApproval: ["release" ] },
    nextAction: "Implement the work order.",
    ...overrides,
  };
}

function contextPack(estimatedTokens = 256): ContextPack {
  return {
    schema: "uads.context-pack",
    schemaVersion: "0.4.0",
    contextPackId: "cp_fixture_001",
    projectId: "project_fixture",
    workOrderId: "wo_fixture_001",
    executionRunId: null,
    generatedAt: "2026-01-01T00:00:00.000Z",
    indexDigest: DIGEST,
    impactReportId: null,
    radius: "C0",
    estimatedTokens,
    staticLayerDigest: "b".repeat(64),
    semiStableLayerDigest: "c".repeat(64),
    dynamicLayerDigest: "d".repeat(64),
    sections: [],
  } as unknown as ContextPack;
}

function route(
  profiles: ModelProfile[],
  order: WorkOrder = workOrder(),
  runtimeSnapshot: RuntimeCapabilitySnapshot = capableRuntime(),
  options: Parameters<typeof routeModel>[0] = {} as Parameters<typeof routeModel>[0],
) {
  return routeModel({
    projectId: order.projectId,
    workOrder: order,
    registry: createModelProfileRegistry(profiles),
    runtime: runtimeSnapshot,
    contextPack: contextPack(),
    ...options,
  });
}

describe("provider-neutral model router and runtime negotiation", () => {
  it("MR1 selects the minimum sufficient economy profile", () => {
    const plan = route([profile("economy", "economy"), profile("balanced", "balanced")]);
    expect(plan.status).toBe("SELECTED");
    expect(plan.selectedProfileId).toBe("economy");
    expect(plan.requiredCapabilityClass).toBe("economy");
  });

  it("MR2 retains a balanced quality floor", () => {
    const plan = route([profile("economy", "economy"), profile("balanced", "balanced")], workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } }));
    expect(plan.selectedProfileId).toBe("balanced");
    expect(plan.rejections.find((item) => item.profileId === "economy")?.reasonCodes).toContain("CAPABILITY_CLASS_TOO_LOW");
  });

  it("MR3 retains a strong floor for high-risk work", () => {
    const plan = route([profile("balanced", "balanced"), profile("strong", "strong")], workOrder({ riskLevel: "HIGH" }));
    expect(plan.selectedProfileId).toBe("strong");
    expect(plan.requiredCapabilityClass).toBe("strong");
  });

  it("MR4 blocks critical work instead of silently downgrading", () => {
    const order = workOrder({ riskLevel: "CRITICAL", scopeClass: "architectural", tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "critical" } });
    expect(route([profile("strong", "strong"), profile("critical", "critical")], order).selectedProfileId).toBe("critical");
    const blocked = route([profile("strong", "strong")], order);
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.selectedProfileId).toBeNull();
    expect(blocked.rejections[0]?.reasonCodes).toContain("CAPABILITY_CLASS_TOO_LOW");
  });

  it("MR5 negotiates tool calling through profile and runtime intersection", () => {
    const order = workOrder({ objective: "Execute a shell command and report the result." });
    const noTools = profile("no-tools", "balanced", { supports: { ...profile("tmp", "balanced").supports, toolCalling: false } });
    const tools = profile("tools", "balanced");
    const plan = route([noTools, tools], order);
    expect(plan.selectedProfileId).toBe("tools");
    expect(plan.rejections.find((item) => item.profileId === "no-tools")?.reasonCodes).toContain("TOOL_CALLING_UNAVAILABLE");
  });

  it("MR6 negotiates structured output", () => {
    const order = workOrder({ objective: "Return structured JSON output matching the schema." });
    const noStructured = profile("no-structured", "balanced", { supports: { ...profile("tmp", "balanced").supports, structuredOutput: false } });
    const structured = profile("structured", "balanced");
    const plan = route([noStructured, structured], order);
    expect(plan.selectedProfileId).toBe("structured");
    expect(plan.rejections.find((item) => item.profileId === "no-structured")?.reasonCodes).toContain("STRUCTURED_OUTPUT_UNAVAILABLE");
  });

  it("MR7 blocks when runtime capability intersection is false", () => {
    const order = workOrder({ objective: "Execute a tool to inspect the repository." });
    const plan = route([profile("tools", "balanced")], order, capableRuntime({ toolCalling: false }));
    expect(plan.status).toBe("BLOCKED");
    expect(plan.rejections[0]?.reasonCodes).toContain("RUNTIME_CAPABILITY_UNAVAILABLE");
  });

  it("MR8 treats unknown runtime capability as unavailable", () => {
    const plan = route([profile("economy", "economy")], workOrder(), runtime({ modelSelection: "unknown" }, "unknown"));
    expect(plan.status).toBe("BLOCKED");
    expect(plan.rejections[0]?.reasonCodes).toContain("RUNTIME_CAPABILITY_UNAVAILABLE");
    expect(plan.rejections[0]?.reasonCodes).toContain("NO_PROVEN_CAPABILITY");
  });

  it("MR9 rejects a profile whose known context window is too small", () => {
    const plan = route([profile("small", "economy", { contextWindowTokens: 1_000 }), profile("large", "economy")], workOrder(), capableRuntime());
    const rerouted = route([profile("small", "economy", { contextWindowTokens: 1_000 })], workOrder(), capableRuntime(), { estimatedInputTokens: 600, requiredOutputTokens: 600 } as Parameters<typeof routeModel>[0]);
    expect(plan.selectedProfileId).toBe("large");
    expect(rerouted.status).toBe("BLOCKED");
    expect(rerouted.rejections[0]?.reasonCodes).toContain("CONTEXT_WINDOW_TOO_SMALL");
  });

  it("MR10 blocks a hard token budget incompatibility", () => {
    const plan = route([profile("economy", "economy")], workOrder({ tokenBudget: { ...workOrder().tokenBudget, hardLimit: 1_000 } }), capableRuntime(), { estimatedInputTokens: 600, requiredOutputTokens: 600 } as Parameters<typeof routeModel>[0]);
    expect(plan.status).toBe("BLOCKED");
    expect(plan.rejections[0]?.reasonCodes).toContain("HARD_TOKEN_BUDGET_INCOMPATIBLE");
  });

  it("MR11 uses relative cost only after capability filtering", () => {
    const cheap = profile("cheap", "balanced", { relativeCostClass: "low" });
    const expensive = profile("expensive", "balanced", { relativeCostClass: "high" });
    expect(route([expensive, cheap], workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } })).selectedProfileId).toBe("cheap");
  });

  it("MR12 does not treat unknown cost as free", () => {
    const unknown = profile("unknown-cost", "balanced", { relativeCostClass: "unknown" });
    const known = profile("known-cost", "balanced", { relativeCostClass: "low" });
    expect(route([unknown, known], workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } })).selectedProfileId).toBe("known-cost");
  });

  it("MR13 is deterministic across registry ordering", () => {
    const profiles = [profile("b", "balanced"), profile("a", "balanced")];
    const first = route(profiles, workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } }));
    const second = route([...profiles].reverse(), workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } }));
    expect(second.planId).toBe(first.planId);
    expect(second.selectedProfileId).toBe(first.selectedProfileId);
    expect(second.eligibleCandidates).toEqual(first.eligibleCandidates);
  });

  it("MR14 exposes only floor-preserving fallbacks", () => {
    const plan = route([profile("economy", "economy"), profile("balanced", "balanced"), profile("strong", "strong")], workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } }));
    expect(plan.selectedProfileId).toBe("balanced");
    expect(plan.fallbackProfileIds).toEqual(["strong"]);
    expect(plan.fallbackProfileIds).not.toContain("economy");
  });

  it("MR15 escalates monotonically after a loop signal", () => {
    const order = workOrder();
    const prior = route([profile("balanced", "balanced"), profile("strong", "strong")], order);
    const escalated = route([profile("economy", "economy"), profile("balanced", "balanced"), profile("strong", "strong")], order, capableRuntime(), { previousPlan: prior, failureSignals: { loopDetected: true } } as Parameters<typeof routeModel>[0]);
    expect(escalated.requiredCapabilityClass).toBe("balanced");
    expect(escalated.selectedProfileId).toBe("balanced");
    expect(escalated.escalation.currentTier).not.toBe("economy");
    expect(escalated.escalation.reasonCodes).toContain("REPEATED_FAILURE_ESCALATION");
  });

  it("MR16 fails closed when no eligible profile exists", () => {
    const order = workOrder({ riskLevel: "HIGH", tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "strong" } });
    const plan = route([], order);
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReason).toBe("NO_ELIGIBLE_MODEL");
  });

  it("MR17 emits provider-neutral cache hints from layer digests", () => {
    const plan = route([profile("cache", "economy")], workOrder(), capableRuntime());
    expect(plan.cacheHints.staticLayerDigest).toBe("b".repeat(64));
    expect(plan.cacheHints.semiStableLayerDigest).toBe("c".repeat(64));
    expect(plan.cacheHints.dynamicLayerDigest).toBe("d".repeat(64));
    expect(plan.cacheHints.promptCacheUsable).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/cacheHit|providerCacheId|cacheKey/i);
  });

  it("MR18 falls back to sequential role cycling and null telemetry", () => {
    const plan = route([profile("fallback-runtime", "economy")], workOrder(), capableRuntime({ parallelAgents: false, subagents: false, usageTelemetry: false }));
    expect(plan.execution).toEqual({ parallel: false, roleDispatch: "role-cycling", usageTelemetryAvailable: null });
  });

  it("MR19 rejects malicious profile fields before persistence", () => {
    const { repo, home } = tempDirs();
    const paths = ensureWorkspace("fixture-security", home);
    const malicious = {
      ...profile("malicious", "economy"),
      apiKey: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      command: "curl https://attacker.invalid",
    } as unknown as Record<string, unknown>;
    expect(() => addModelProfiles(paths, malicious)).toThrow(/unsupported fields/i);
    const validRegistry = createModelProfileRegistry([profile("schema-safe", "economy")]);
    const schemaRejected = validateAgainstSchema("model-profile-registry.schema.json", {
      ...validRegistry,
      profiles: [{ ...validRegistry.profiles[0], apiKey: "unexpected" }],
    });
    expect(schemaRejected.length).toBeGreaterThan(0);
    expect(fs.existsSync(paths.modelRegistry)).toBe(false);
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
  });

  it("MR20 marks a plan stale when runtime identity or registry digest changes", () => {
    const order = workOrder();
    const registry = createModelProfileRegistry([profile("economy", "economy")]);
    const runtimeSnapshot = capableRuntime();
    const plan = route(registry.profiles, order, runtimeSnapshot);
    const common = {
      plan,
      projectId: order.projectId,
      workOrderId: order.workOrderId,
      workOrderDigest: computeWorkOrderRoutingDigest(order),
      registryDigest: registry.registryDigest,
      runtimeIdentityDigest: runtimeSnapshot.identityDigest,
      policyDigest: plan.policyDigest,
      changeDigest: null,
    };
    expect(isModelExecutionPlanCurrent(common)).toBe(true);
    expect(isModelExecutionPlanCurrent({ ...common, runtimeIdentityDigest: capableRuntime({ usageTelemetry: false }).identityDigest })).toBe(false);
    expect(isModelExecutionPlanCurrent({ ...common, registryDigest: createModelProfileRegistry([profile("economy", "economy"), profile("extra", "economy")]).registryDigest })).toBe(false);
  });

  it("MR21 uses proven host/runtime subagent support independently of model supports", () => {
    const hostOnly = profile("host-only-subagents", "economy", { supports: { ...profile("nested", "economy").supports, toolCalling: false, structuredOutput: false, promptCache: false, explicitCache: false, persistentContext: false, usageTelemetry: false, vision: false } });
    const plan = route([hostOnly], workOrder(), runtime({ modelSelection: true, subagents: true, parallelAgents: false }));
    expect(plan.status).toBe("SELECTED");
    expect(plan.execution.roleDispatch).toBe("subagents");
  });

  it("MR22 uses host/runtime parallel support and enforces maxConcurrency=1", () => {
    const parallel = route([profile("parallel-host", "economy", { constraints: { maxConcurrency: null } })], workOrder(), runtime({ modelSelection: true, subagents: false, parallelAgents: true }));
    expect(parallel.execution.parallel).toBe(true);
    const serial = route([profile("serial-host", "economy", { constraints: { maxConcurrency: 1 } })], workOrder(), runtime({ modelSelection: true, subagents: false, parallelAgents: true }));
    expect(serial.execution.parallel).toBe(false);
  });

  it("keeps explicit preference from lowering the quality floor", () => {
    const order = workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } });
    const plan = route([profile("economy", "economy"), profile("strong", "strong")], order, capableRuntime(), { preferredCapabilityClass: "economy" } as Parameters<typeof routeModel>[0]);
    expect(plan.requiredCapabilityClass).toBe("balanced");
    expect(plan.selectedProfileId).toBe("strong");
  });

  it("does not allow experimental profiles to satisfy critical work", () => {
    const order = workOrder({ riskLevel: "CRITICAL", tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "critical" } });
    const experimental = profile("experimental", "critical", { status: "experimental" });
    const plan = route([experimental], order);
    expect(plan.status).toBe("BLOCKED");
    expect(plan.rejections[0]?.reasonCodes).toContain("PROFILE_EXPERIMENTAL_NOT_ALLOWED");
  });

  it("WO-025 keeps explicit-runtime callers on the legacy selection path with default routing metadata", () => {
    const plan = route([profile("economy", "economy"), profile("balanced", "balanced")]);
    expect(plan.selectedProfileId).toBe("economy");
    expect(plan.routingMode).toBe("QUALITY_FLOOR_AUTOROUTE");
    expect(plan.modelLock).toEqual({
      active: false,
      mode: "QUALITY_FLOOR_AUTOROUTE",
      revision: 0,
      profileId: null,
      providerId: null,
      modelId: null,
      reasonCodes: [],
    });
    expect(plan.routingEnforcement).toEqual({ state: "UNKNOWN", reasonCodes: ["NO_ACTIVE_LOCK", "NO_HOST_EXECUTION_EVIDENCE"] });
  });

  it("WO-025 T2: an active Model Lock is a hard constraint that suppresses fallback substitution", () => {
    const profiles = [profile("economy", "economy"), profile("balanced", "balanced", { relativeCostClass: "high" }), profile("strong", "strong")];
    expect(route(profiles).selectedProfileId).toBe("economy");
    const locked = route(profiles, workOrder(), capableRuntime(), {
      lockState: {
        status: "CURRENT",
        mode: "MODEL_LOCK",
        locked: { profileId: "balanced", providerId: "fixture-provider", modelId: "fixture-model-balanced" },
        lockRevision: 3,
      },
    } as Parameters<typeof routeModel>[0]);
    expect(locked.status).toBe("SELECTED");
    expect(locked.selectedProfileId).toBe("balanced");
    expect(locked.modelLock.active).toBe(true);
    expect(locked.modelLock.revision).toBe(3);
    expect(locked.modelLock.reasonCodes).toContain("MODEL_LOCK_FALLBACK_FORBIDDEN");
    expect(locked.routingEnforcement.state).toBe("ENFORCED");
    expect(locked.selectionReasonCodes).toContain("MODEL_LOCK_ENFORCED");
    expect(locked.fallbackProfileIds).toEqual([]);
  });

  it("WO-025 T3: an unresolvable or inadmissible lock fails closed without substitution", () => {
    const missing = route([profile("economy", "economy"), profile("balanced", "balanced")], workOrder(), capableRuntime(), {
      lockState: {
        status: "CURRENT",
        mode: "MODEL_LOCK",
        locked: { profileId: "absent", providerId: "fixture-provider", modelId: "fixture-model-absent" },
        lockRevision: 5,
      },
    } as Parameters<typeof routeModel>[0]);
    expect(missing.status).toBe("BLOCKED");
    expect(missing.blockedReason).toBe("MODEL_LOCK_UNAVAILABLE");
    expect(missing.selectedProfileId).toBeNull();
    expect(missing.fallbackProfileIds).toEqual([]);
    expect(missing.eligibleCandidates).toEqual([]);
    expect(missing.modelLock.reasonCodes).toContain("MODEL_LOCK_ALIAS_UNSUPPORTED");
    const inadmissible = route([profile("tiny", "economy", { contextWindowTokens: 1_000 }), profile("ok", "economy")], workOrder(), capableRuntime(), {
      estimatedInputTokens: 600,
      requiredOutputTokens: 600,
      lockState: {
        status: "CURRENT",
        mode: "MODEL_LOCK",
        locked: { profileId: "tiny", providerId: "fixture-provider", modelId: "fixture-model-tiny" },
        lockRevision: 6,
      },
    } as Parameters<typeof routeModel>[0]);
    expect(inadmissible.status).toBe("BLOCKED");
    expect(inadmissible.blockedReason).toBe("MODEL_LOCK_UNAVAILABLE");
    const lockRejection = inadmissible.rejections.find((item) => item.profileId === "tiny" && item.reasonCodes.includes("MODEL_LOCK_UNAVAILABLE"));
    expect(lockRejection?.reasonCodes).toContain("CONTEXT_WINDOW_TOO_SMALL");
    expect(inadmissible.modelLock.reasonCodes).toContain("MODEL_LOCK_UNAVAILABLE");
    expect(inadmissible.modelLock.reasonCodes).toContain("CONTEXT_WINDOW_TOO_SMALL");
    expect(inadmissible.routingEnforcement.state).toBe("UNKNOWN");
    expect(inadmissible.routingEnforcement.reasonCodes).toContain("NO_HOST_EXECUTION_EVIDENCE");
  });

  it("WO-025 T7: enforcement projection only claims router-side provable states", () => {
    const registries: ModelProfile[][] = [
      [profile("economy", "economy")],
      [profile("balanced", "balanced"), profile("strong", "strong")],
      [],
    ];
    const lockStates = [
      undefined,
      { status: "CURRENT", mode: "QUALITY_FLOOR_AUTOROUTE", locked: null, lockRevision: 1 },
      { status: "CURRENT", mode: "MODEL_LOCK", locked: { profileId: "economy", providerId: "fixture-provider", modelId: "fixture-model-economy" }, lockRevision: 2 },
      { status: "CURRENT", mode: "MODEL_LOCK", locked: { profileId: "absent", providerId: "fixture-provider", modelId: "fixture-model-absent" }, lockRevision: 2 },
      { status: "UNAVAILABLE", reasonCodes: ["ROUTING_STATE_CORRUPT"] },
    ];
    for (const profiles of registries) {
      for (const lockState of lockStates) {
        const plan = route(profiles, workOrder(), capableRuntime(), { lockState } as Parameters<typeof routeModel>[0]);
        expect(["ENFORCED", "MISMATCH", "UNKNOWN"]).toContain(plan.routingEnforcement.state);
        expect(plan.routingEnforcement.state).not.toBe("VERIFIED_MATCH");
        expect(plan.routingEnforcement.state).not.toBe("HOST_FIXED");
        if (!plan.modelLock.active && lockState?.status !== "UNAVAILABLE") {
          expect(plan.routingEnforcement.state).toBe("UNKNOWN");
          expect(plan.routingEnforcement.reasonCodes).toContain("NO_ACTIVE_LOCK");
        }
        if (plan.modelLock.active && plan.status === "SELECTED") {
          expect(plan.selectedProfileId).toBe(plan.modelLock.profileId);
          expect(plan.routingEnforcement.state).toBe("ENFORCED");
        }
        if (lockState?.status === "UNAVAILABLE") {
          expect(plan.status).toBe("BLOCKED");
          expect(plan.routingEnforcement.reasonCodes).toContain("ROUTING_STATE_UNAVAILABLE");
        }
      }
    }
  });

  it("WO-025 T9: routing rejects ensemble/broadcast intents and emits one model target", () => {
    const profiles = [profile("economy", "economy"), profile("balanced", "balanced")];
    const broadcast = route(profiles, workOrder(), capableRuntime(), { requestedModelTargets: 2 } as Parameters<typeof routeModel>[0]);
    expect(broadcast.status).toBe("BLOCKED");
    expect(broadcast.blockedReason).toBe("ENSEMBLE_NOT_AUTHORIZED");
    expect(broadcast.selectedProfileId).toBeNull();
    expect(broadcast.eligibleCandidates).toEqual([]);
    const zero = route(profiles, workOrder(), capableRuntime(), { requestedModelTargets: 0 } as Parameters<typeof routeModel>[0]);
    expect(zero.status).toBe("BLOCKED");
    expect(zero.blockedReason).toBe("ENSEMBLE_NOT_AUTHORIZED");
    const single = route(profiles);
    expect(single.status).toBe("SELECTED");
    const modelTargets = new Set(single.roleSelections.map((item) => item.modelId).filter((value): value is string => Boolean(value)));
    expect(modelTargets.size).toBe(1);
  });

  it("WO-025 T4: cheapest-qualified claims require objective price evidence", () => {
    const order = workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } });
    const priced = route(
      [profile("cheap", "balanced", { relativeCostClass: "low" }), profile("mid", "balanced", { relativeCostClass: "medium" }), profile("high", "balanced", { relativeCostClass: "high" })],
      order,
      capableRuntime(),
      { lockState: { status: "CURRENT", mode: "CHEAPEST_QUALIFIED", locked: null, lockRevision: 2 } } as Parameters<typeof routeModel>[0],
    );
    expect(priced.routingMode).toBe("CHEAPEST_QUALIFIED");
    expect(priced.selectedProfileId).toBe("cheap");
    expect(priced.selectionReasonCodes).toContain("CHEAPEST_QUALIFIED_SELECTED");
    const unpriced = route(
      [profile("opaque-a", "balanced", { relativeCostClass: "unknown" }), profile("opaque-b", "balanced", { relativeCostClass: "unknown" })],
      order,
      capableRuntime(),
      { lockState: { status: "CURRENT", mode: "CHEAPEST_QUALIFIED", locked: null, lockRevision: 2 } } as Parameters<typeof routeModel>[0],
    );
    expect(unpriced.status).toBe("SELECTED");
    expect(unpriced.selectionReasonCodes).not.toContain("CHEAPEST_QUALIFIED_SELECTED");
    expect(unpriced.selectionReasonCodes).toContain("CHEAPEST_QUALIFIED_COST_EVIDENCE_UNKNOWN");
  });

  it("WO-025 T5: the quality floor survives cheapest mode", () => {
    const order = workOrder({ riskLevel: "HIGH", tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "strong" } });
    const plan = route(
      [profile("cheap-economy", "economy", { relativeCostClass: "low" }), profile("strong", "strong", { relativeCostClass: "high" })],
      order,
      capableRuntime(),
      { lockState: { status: "CURRENT", mode: "CHEAPEST_QUALIFIED", locked: null, lockRevision: 4 } } as Parameters<typeof routeModel>[0],
    );
    expect(plan.requiredCapabilityClass).toBe("strong");
    expect(plan.selectedProfileId).toBe("strong");
  });

  it("WO-025 T6: an unproven successor model is rejected like any other candidate", () => {
    const order = workOrder({ objective: "Execute a shell command and report the result." });
    const plan = route([profile("model-v1", "balanced"), profile("model-v2", "balanced", { supports: { ...profile("nested", "balanced").supports, toolCalling: false } })], order);
    expect(plan.selectedProfileId).toBe("model-v1");
    expect(plan.rejections.find((item) => item.profileId === "model-v2")?.reasonCodes).toContain("RUNTIME_CAPABILITY_UNAVAILABLE");
  });

  it("WO-025 T1: capability truth comes from the evaluated runtime and adapter-unspecified truth never enables", () => {
    const explicit = route([profile("economy", "economy")]);
    expect(explicit.capabilityTruth.adapterId).toBe("fixture-adapter");
    expect(explicit.capabilityTruth.provenanceConfidence).toBe("unknown");
    expect(explicit.capabilityTruth.capabilities.modelSelection).toBe("SUPPORTED");
    expect(explicit.capabilityTruth.reasonCodes).not.toContain("CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED");
    const unspecified = route([profile("economy", "economy")], workOrder(), conservativeRuntimeCapabilitySnapshot());
    expect(unspecified.status).toBe("BLOCKED");
    expect(unspecified.capabilityTruth.adapterId).toBeNull();
    expect(unspecified.capabilityTruth.reasonCodes).toContain("CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED");
    expect(Object.values(unspecified.capabilityTruth.capabilities).every((value) => value === "UNKNOWN")).toBe(true);
  });

  it("WO-025 T10: the plan schema is closed at 0.9.0 with deterministic digests", () => {
    const plan = route([profile("economy", "economy")]);
    const repeat = route([profile("economy", "economy")]);
    expect(plan.schemaVersion).toBe("0.9.0");
    expect(capableRuntime().schemaVersion).toBe("0.8.0");
    expect(validateAgainstSchema("model-execution-plan.schema.json", plan)).toEqual([]);
    expect(Object.keys(plan.capabilityTruth.capabilities).sort()).toEqual([...RUNTIME_CAPABILITY_KEYS].sort());
    expect(plan.planId).toBe(repeat.planId);
    const text = JSON.stringify(plan);
    expect(text.includes("ghp_")).toBe(false);
    const backslash = String.fromCharCode(92);
    expect(text.includes("C:" + backslash)).toBe(false);
  });
});
