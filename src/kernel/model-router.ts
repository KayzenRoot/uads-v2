import { sha256Hex } from "../lib/hash.js";
import { newPrefixedId } from "./ids.js";
import { readCurrentContextPack } from "./intelligence-persist.js";
import type { ContextPack } from "./intelligence-types.js";
import type { UadsPaths } from "../lib/workspace.js";
import { capabilityRank, deriveModelRequirements, maxCapability, minimumReasoningFor, reasoningRank } from "./model-requirements.js";
import { conservativeRuntimeCapabilitySnapshot, effectiveCapability, persistRuntimeCapabilitySnapshot, RUNTIME_CAPABILITY_KEYS } from "./model-runtime.js";
import { readHostCapabilityProjection } from "../adapters/host-capability-consumer.js";
import type { HostAdapterId } from "../adapters/host-adapter-types.js";
import { readModelRoutingState, type ModelRoutingStateRead } from "./model-lock.js";
import {
  MODEL_EXECUTION_PLAN_SCHEMA_VERSION,
  MODEL_ROUTING_POLICY_VERSION,
  MODEL_ROUTING_SCHEMA_VERSION,
  type CapabilityClass,
  type CapabilityTruth,
  type CapabilityTruthCapabilities,
  type CapabilityTruthState,
  type ModelLockPlanBlock,
  type ModelRoutingMode,
  type RoutingEnforcement,
  type ModelCapability,
  type ModelCandidateSummary,
  type ModelExecutionPlan,
  type ModelProfile,
  type ModelProfileRegistry,
  type ModelRejection,
  type ModelRole,
  type ModelRoleSelection,
  type ModelRoutingFailureSignals,
  type RuntimeCapabilitySnapshot,
} from "./model-types.js";
import { loadModelProfileRegistry } from "./model-registry.js";
import type { WorkOrder } from "./types.js";

export const MODEL_ROUTING_POLICY_DIGEST = sha256Hex(
  `uads-model-routing-policy:${MODEL_ROUTING_POLICY_VERSION}:capability-before-cost;quality-floor-before-scoring;no-silent-downgrade;deterministic-tiebreak`,
);

const COST_RANK: Record<ModelProfile["relativeCostClass"], number> = {
  "very-low": 0,
  low: 1,
  medium: 2,
  high: 3,
  "very-high": 4,
  unknown: 99,
};
const LATENCY_RANK: Record<ModelProfile["relativeLatencyClass"], number> = {
  "very-low": 0,
  low: 1,
  medium: 2,
  high: 3,
  "very-high": 4,
  unknown: 99,
};
const ROLES: ModelRole[] = ["implementation", "review", "testing", "assurance"];

export type ModelRoutingLockInput =
  | { status: "ABSENT" }
  | { status: "UNAVAILABLE"; reasonCodes?: string[] }
  | {
      status: "CURRENT";
      mode: ModelRoutingMode;
      locked: { profileId: string; providerId: string; modelId: string } | null;
      lockRevision: number;
    };

export type ModelRoutingInput = {
  workOrder: WorkOrder;
  projectId?: string;
  registry: ModelProfileRegistry;
  runtime: RuntimeCapabilitySnapshot;
  contextPack?: ContextPack | null;
  changeDigest?: string | null;
  failureSignals?: ModelRoutingFailureSignals;
  previousPlan?: ModelExecutionPlan | null;
  allowExperimental?: boolean;
  preferredCapabilityClass?: CapabilityClass;
  blockedProviderIds?: string[];
  estimatedInputTokens?: number;
  requiredOutputTokens?: number;
  /** Governed routing-mode/Model Lock state (M05-owned). Absent state means default autoroute. */
  lockState?: ModelRoutingLockInput;
  /** Model call targets per routing decision; anything other than exactly 1 is rejected. */
  requestedModelTargets?: number;
};

export function modelRoutingLockInput(read: ModelRoutingStateRead): ModelRoutingLockInput {
  if (read.status === "CURRENT") {
    return { status: "CURRENT", mode: read.state.mode, locked: read.state.locked, lockRevision: read.state.lockRevision };
  }
  if (read.status === "UNAVAILABLE") return { status: "UNAVAILABLE", reasonCodes: read.reasonCodes };
  return { status: "ABSENT" };
}

export type PersistedModelRoutingInput = {
  paths: UadsPaths;
  workOrder: WorkOrder;
  projectId?: string;
  contextPack?: ContextPack | null;
  changeDigest?: string | null;
  failureSignals?: ModelRoutingFailureSignals;
  previousPlan?: ModelExecutionPlan | null;
  allowExperimental?: boolean;
  preferredCapabilityClass?: CapabilityClass;
  blockedProviderIds?: string[];
  estimatedInputTokens?: number;
  requiredOutputTokens?: number;
  schemaRoot?: string;
  /** Explicit host adapter identity for capability acquisition; absent means conservative UNKNOWN. */
  hostAdapterId?: HostAdapterId | null;
  hostHome?: string;
  /** Persist the evaluated capability runtime so dispatch currency checks stay coherent. */
  persistRuntime?: boolean;
};

export function computeWorkOrderRoutingDigest(workOrder: WorkOrder): string {
  return sha256Hex(JSON.stringify({
    schema: workOrder.schema,
    schemaVersion: workOrder.schemaVersion,
    workOrderId: workOrder.workOrderId,
    projectId: workOrder.projectId,
    objective: workOrder.objective,
    status: workOrder.status,
    scopeClass: workOrder.scopeClass,
    includedScope: workOrder.includedScope,
    outOfScope: workOrder.outOfScope,
    riskLevel: workOrder.riskLevel,
    riskReasons: workOrder.riskReasons,
    constraints: workOrder.constraints ?? [],
    requestedArtifacts: workOrder.requestedArtifacts ?? [],
    destructiveSignals: workOrder.destructiveSignals ?? [],
    domains: workOrder.domains,
    affectedAreas: workOrder.affectedAreas,
    specialists: workOrder.specialists,
    assuranceReviewers: workOrder.assuranceReviewers,
    qualityGates: workOrder.qualityGates,
    contextRadius: workOrder.contextRadius,
    tokenBudget: workOrder.tokenBudget,
    dependencies: workOrder.dependencies,
    acceptanceCriteria: workOrder.acceptanceCriteria,
    requiredEvidence: workOrder.requiredEvidence,
    stopConditions: workOrder.stopConditions,
    autonomyBoundary: workOrder.autonomyBoundary,
  }));
}

function compareCandidate(a: ModelProfile, b: ModelProfile, requiredClass: CapabilityClass, requiredReasoning: ModelProfile["reasoningClass"], estimatedInputTokens: number): number {
  const overshoot = capabilityRank(a.capabilityClass) - capabilityRank(requiredClass);
  const otherOvershoot = capabilityRank(b.capabilityClass) - capabilityRank(requiredClass);
  if (overshoot !== otherOvershoot) return overshoot - otherOvershoot;
  const reasoningOvershoot = reasoningRank(a.reasoningClass) - reasoningRank(requiredReasoning);
  const otherReasoningOvershoot = reasoningRank(b.reasoningClass) - reasoningRank(requiredReasoning);
  if (reasoningOvershoot !== otherReasoningOvershoot) return reasoningOvershoot - otherReasoningOvershoot;
  const headroom = a.contextWindowTokens === null ? -1 : a.contextWindowTokens - estimatedInputTokens;
  const otherHeadroom = b.contextWindowTokens === null ? -1 : b.contextWindowTokens - estimatedInputTokens;
  if (headroom !== otherHeadroom) return otherHeadroom - headroom;
  const cost = COST_RANK[a.relativeCostClass] - COST_RANK[b.relativeCostClass];
  if (cost !== 0) return cost;
  const latency = LATENCY_RANK[a.relativeLatencyClass] - LATENCY_RANK[b.relativeLatencyClass];
  if (latency !== 0) return latency;
  return a.profileId.localeCompare(b.profileId);
}

function candidateSummary(profile: ModelProfile): ModelCandidateSummary {
  return {
    profileId: profile.profileId,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilityClass: profile.capabilityClass,
    reasoningClass: profile.reasoningClass,
    relativeCostClass: profile.relativeCostClass,
    relativeLatencyClass: profile.relativeLatencyClass,
  };
}

function rejection(profileId: string, reasonCodes: string[], reasons: string[]): ModelRejection {
  return { profileId, reasonCodes: [...new Set(reasonCodes)], reasons };
}

function roleSelections(selected: ModelProfile | null, status: ModelExecutionPlan["status"], selectionMode: ModelExecutionPlan["selectionMode"]): ModelRoleSelection[] {
  return ROLES.map((role) => ({
    role,
    profileId: selected?.profileId ?? null,
    providerId: selected?.providerId ?? null,
    modelId: selected?.modelId ?? null,
    status: status === "BLOCKED" ? "blocked" : selectionMode === "host-managed" ? "host-managed" : "selected",
    reasonCodes: status === "BLOCKED" ? ["NO_ELIGIBLE_MODEL"] : selectionMode === "host-managed" ? ["HOST_MANAGED_COMPATIBILITY"] : ["ROLE_USES_MINIMUM_SUFFICIENT_PROFILE"],
  }));
}

function addReasonCode(codes: string[], code: string): void {
  if (!codes.includes(code)) codes.push(code);
}

function profileRejection(profile: ModelProfile, input: ModelRoutingInput, requirements: ReturnType<typeof deriveModelRequirements>): ModelRejection | null {
  const codes: string[] = [];
  const reasons: string[] = [];
  if (profile.status === "disabled") { codes.push("PROFILE_DISABLED"); reasons.push("profile is disabled"); }
  if (profile.status === "experimental" && !requirements.allowExperimental) { codes.push("PROFILE_EXPERIMENTAL_NOT_ALLOWED"); reasons.push("experimental profiles require explicit policy eligibility"); }
  if (profile.status === "experimental" && input.workOrder.riskLevel === "CRITICAL") { codes.push("PROFILE_EXPERIMENTAL_NOT_ALLOWED"); reasons.push("experimental profile cannot satisfy CRITICAL work"); }
  if (requirements.blockedProviderIds.includes(profile.providerId)) { codes.push("POLICY_BLOCKED"); reasons.push("provider is blocked by routing policy"); }
  if (capabilityRank(profile.capabilityClass) < capabilityRank(requirements.requiredCapabilityClass)) { codes.push("CAPABILITY_CLASS_TOO_LOW"); reasons.push(`profile class ${profile.capabilityClass} is below ${requirements.requiredCapabilityClass}`); }
  if (reasoningRank(profile.reasoningClass) < reasoningRank(requirements.minimumReasoningClass)) { codes.push("REASONING_CLASS_TOO_LOW"); reasons.push(`reasoning class ${profile.reasoningClass} is below ${requirements.minimumReasoningClass}`); }
  for (const capability of requirements.requiredCapabilities) {
    if (capability !== "modelSelection" && !profileSupports(profile, capability)) {
      codes.push(capabilityReasonCode(capability));
      reasons.push(`profile does not support ${capability}`);
    }
    if (!effectiveCapability(profile, input.runtime, capability)) {
      codes.push(capability === "modelSelection" ? "RUNTIME_CAPABILITY_UNAVAILABLE" : "RUNTIME_CAPABILITY_UNAVAILABLE");
      reasons.push(`runtime cannot prove effective ${capability}`);
    }
  }
  if (requirements.requireProvenRuntime && input.runtime.provenance.confidence !== "proven") {
    codes.push("NO_PROVEN_CAPABILITY");
    reasons.push("required runtime capabilities are not proven");
  }
  const requiredTokens = requirements.estimatedInputTokens + requirements.requiredOutputTokens;
  if (profile.contextWindowTokens !== null && profile.contextWindowTokens < requiredTokens) {
    codes.push("CONTEXT_WINDOW_TOO_SMALL");
    reasons.push(`context window ${profile.contextWindowTokens} is below required ${requiredTokens}`);
  }
  if (profile.contextWindowTokens === null && requiredTokens > 0) {
    codes.push("CONTEXT_WINDOW_TOO_SMALL");
    reasons.push("unknown context window is not sufficient for conservative high-volume routing");
  }
  if (profile.maxOutputTokens !== null && profile.maxOutputTokens < requirements.requiredOutputTokens) {
    codes.push("OUTPUT_RESERVE_TOO_SMALL");
    reasons.push(`max output ${profile.maxOutputTokens} is below required ${requirements.requiredOutputTokens}`);
  }
  if (requiredTokens > input.workOrder.tokenBudget.hardLimit) {
    codes.push("HARD_TOKEN_BUDGET_INCOMPATIBLE");
    reasons.push(`required input plus output ${requiredTokens} exceeds hard budget ${input.workOrder.tokenBudget.hardLimit}`);
  }
  if (codes.length === 0) return null;
  return rejection(profile.profileId, codes, reasons);
}

function profileSupports(profile: ModelProfile, capability: ModelCapability): boolean {
  if (capability === "modelSelection") return true;
  if (capability === "visionInput") return profile.supports.vision;
  return profile.supports[capability as keyof ModelProfile["supports"]] === true;
}

function capabilityReasonCode(capability: ModelCapability): string {
  return {
    toolCalling: "TOOL_CALLING_UNAVAILABLE",
    structuredOutput: "STRUCTURED_OUTPUT_UNAVAILABLE",
    visionInput: "VISION_UNAVAILABLE",
    promptCache: "PROMPT_CACHE_UNAVAILABLE",
    explicitCache: "EXPLICIT_CACHE_UNAVAILABLE",
    persistentContext: "PERSISTENT_CONTEXT_UNAVAILABLE",
    subagents: "SUBAGENTS_UNAVAILABLE",
    parallelAgents: "PARALLEL_AGENTS_UNAVAILABLE",
    usageTelemetry: "USAGE_TELEMETRY_UNAVAILABLE",
    modelSelection: "RUNTIME_CAPABILITY_UNAVAILABLE",
  }[capability];
}

function effectiveCacheHints(selected: ModelProfile | null, runtime: RuntimeCapabilitySnapshot, contextPack: ContextPack | null | undefined): ModelExecutionPlan["cacheHints"] {
  const promptCacheUsable = selected ? effectiveCapability(selected, runtime, "promptCache") : false;
  const explicitCacheUsable = selected ? effectiveCapability(selected, runtime, "explicitCache") : false;
  const persistentContextUsable = selected ? effectiveCapability(selected, runtime, "persistentContext") : false;
  return {
    staticLayerDigest: contextPack?.staticLayerDigest ?? null,
    semiStableLayerDigest: contextPack?.semiStableLayerDigest ?? null,
    dynamicLayerDigest: contextPack?.dynamicLayerDigest ?? null,
    promptCacheUsable,
    explicitCacheUsable,
    persistentContextUsable,
  };
}

function executionStrategy(selected: ModelProfile | null, runtime: RuntimeCapabilitySnapshot): ModelExecutionPlan["execution"] {
  const modelAllowsParallel = selected?.constraints.maxConcurrency == null || selected.constraints.maxConcurrency > 1;
  const parallel = selected ? effectiveCapability(selected, runtime, "parallelAgents") && modelAllowsParallel : false;
  const subagents = selected ? effectiveCapability(selected, runtime, "subagents") : false;
  const telemetry = selected && effectiveCapability(selected, runtime, "usageTelemetry") ? true : null;
  return {
    parallel,
    roleDispatch: subagents ? "subagents" : "role-cycling",
    usageTelemetryAvailable: telemetry,
  };
}

export const CAPABILITY_TRUTH_REASON_CODES = {
  ADAPTER_UNSPECIFIED: "CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED",
} as const;

function capabilityTruthState(value: boolean | "unknown"): CapabilityTruthState {
  if (value === true) return "SUPPORTED";
  if (value === false) return "UNSUPPORTED";
  return "UNKNOWN";
}

/**
 * Pure derivation of the bounded capability truth recorded on a routing decision.
 *
 * Truth is derived from the runtime projection actually evaluated, never from adapter
 * declarations or persisted legacy snapshots. The `host-managed` runtime identity means
 * no adapter identity was specified for the routing surface (conservative UNKNOWN).
 * BLOCKED host detection is not derivable from the frozen runtime snapshot contract and
 * is therefore not emitted here; it stays non-enabling as UNKNOWN.
 */
export function deriveCapabilityTruth(runtime: RuntimeCapabilitySnapshot): CapabilityTruth {
  const adapterId = runtime.adapterId === "host-managed" ? null : runtime.adapterId;
  const capabilities = Object.fromEntries(
    RUNTIME_CAPABILITY_KEYS.map((key) => [key, capabilityTruthState(runtime.capabilities[key])]),
  ) as CapabilityTruthCapabilities;
  const reasonCodes = adapterId === null ? [CAPABILITY_TRUTH_REASON_CODES.ADAPTER_UNSPECIFIED] : [];
  return {
    adapterId,
    runtimeIdentityDigest: runtime.identityDigest,
    subjectDigest: null,
    adapterContractDigest: null,
    provenanceConfidence: "unknown",
    capabilities,
    reasonCodes,
  };
}

/**
 * M05 capability acquisition boundary. Routing surfaces obtain capability truth only
 * through the M03 host-capability consumer projection (explicit adapter identity). With
 * a workspace paths input the reconciled WO-026 facade resolves stored/active PCCR
 * evidence against the current basis; without an adapter identity the result is a
 * conservative all-UNKNOWN snapshot. Legacy runtime snapshots and persisted capability
 * files are never used as enabling truth and no placeholder state is created here.
 */
export function resolveRoutingCapabilityTruth(input: {
  adapterId?: HostAdapterId | null;
  hostHome?: string;
  schemaRoot?: string;
  paths?: UadsPaths;
}): RuntimeCapabilitySnapshot {
  if (!input.adapterId) {
    return conservativeRuntimeCapabilitySnapshot();
  }
  const projection = readHostCapabilityProjection({
    adapterId: input.adapterId,
    detectionInput: input.hostHome ? { hostHome: input.hostHome } : {},
    ...(input.paths ? { paths: input.paths } : {}),
    schemaRoot: input.schemaRoot,
  });
  return projection.runtime;
}

export function routeModel(input: ModelRoutingInput): ModelExecutionPlan {
  if (input.workOrder.projectId !== (input.projectId ?? input.workOrder.projectId)) throw new Error("cross-project model routing rejected");
  if (input.registry.schemaVersion !== MODEL_ROUTING_SCHEMA_VERSION || input.runtime.schemaVersion !== MODEL_ROUTING_SCHEMA_VERSION) throw new Error("model routing schema/version mismatch");
  const requirements = deriveModelRequirements(input);
  const priorTier = input.previousPlan?.workOrderId === input.workOrder.workOrderId ? input.previousPlan.escalation.currentTier : null;
  const currentTier = priorTier ? maxCapability(requirements.requiredCapabilityClass, priorTier) : requirements.requiredCapabilityClass;
  const currentRequirements = { ...requirements, requiredCapabilityClass: currentTier, minimumReasoningClass: minimumReasoningFor(currentTier) };
  const candidates = input.registry.profiles.slice().sort((a, b) => a.profileId.localeCompare(b.profileId));
  const summaries = candidates.map(candidateSummary);
  const rejections = candidates.map((profile) => profileRejection(profile, input, currentRequirements)).filter((item): item is ModelRejection => Boolean(item));
  const rejectedIds = new Set(rejections.map((item) => item.profileId));
  let eligible = candidates.filter((profile) => !rejectedIds.has(profile.profileId));
  eligible.sort((a, b) => compareCandidate(a, b, currentTier, currentRequirements.minimumReasoningClass, currentRequirements.estimatedInputTokens));
  const autoEligibleProfileIds = eligible.map((profile) => profile.profileId);

  const escalationReasons = [...new Set([
    ...requirements.reasons.filter((reason) => reason.includes("ESCALATION")),
    ...(input.failureSignals?.explicitReasons ?? []),
    ...(priorTier && capabilityRank(priorTier) > capabilityRank(requirements.requiredCapabilityClass) ? ["MONOTONIC_PRIOR_FLOOR"] : []),
  ])];
  const lockInput: ModelRoutingLockInput = input.lockState ?? { status: "ABSENT" };
  const routingMode: ModelRoutingMode = lockInput.status === "CURRENT" ? lockInput.mode : "QUALITY_FLOOR_AUTOROUTE";
  const lockRevision = lockInput.status === "CURRENT" ? lockInput.lockRevision : 0;
  const lockedIdentity = lockInput.status === "CURRENT" && lockInput.mode === "MODEL_LOCK" ? lockInput.locked : null;
  const lockActive = lockInput.status === "CURRENT" && lockInput.mode === "MODEL_LOCK";
  const routingStateUnavailable = lockInput.status === "UNAVAILABLE";
  const requestedTargets = input.requestedModelTargets ?? 1;
  const ensembleRejected = !Number.isInteger(requestedTargets) || requestedTargets !== 1;
  const lockReasonCodes: string[] = [];
  const lockedProfile = lockedIdentity
    ? candidates.find((profile) => profile.profileId === lockedIdentity.profileId) ?? null
    : null;
  const lockRejection = lockedProfile ? profileRejection(lockedProfile, input, currentRequirements) : null;
  if (lockActive && !lockedIdentity) lockReasonCodes.push("MODEL_LOCK_UNAVAILABLE", "MODEL_LOCK_IDENTITY_MISSING");
  if (lockActive && lockedIdentity && !lockedProfile) {
    lockReasonCodes.push("MODEL_LOCK_UNAVAILABLE", "MODEL_LOCK_ALIAS_UNSUPPORTED");
    rejections.push(rejection(lockedIdentity.profileId, ["MODEL_LOCK_UNAVAILABLE", "MODEL_LOCK_ALIAS_UNSUPPORTED"], ["locked profile id does not resolve to an exact registry profile"]));
  }
  if (lockActive && lockedProfile && lockRejection) {
    lockReasonCodes.push("MODEL_LOCK_UNAVAILABLE", ...lockRejection.reasonCodes);
    rejections.push(rejection(lockedProfile.profileId, [...lockRejection.reasonCodes, "MODEL_LOCK_UNAVAILABLE"], [...lockRejection.reasons, "locked profile is not admissible for this routing decision"]));
  }
  if (lockActive) {
    const suppressedFallbacks = autoEligibleProfileIds.filter((profileId) => profileId !== lockedIdentity?.profileId);
    if (suppressedFallbacks.length > 0) lockReasonCodes.push("MODEL_LOCK_FALLBACK_FORBIDDEN");
  }
  let selected: ModelProfile | null;
  let selectionMode: ModelExecutionPlan["selectionMode"] = "router";
  let blockedReason: string | null = null;
  let noConcreteProfileCompatibility = false;
  if (ensembleRejected) {
    selected = null;
    eligible = [];
    blockedReason = "ENSEMBLE_NOT_AUTHORIZED";
  } else if (routingStateUnavailable) {
    selected = null;
    eligible = [];
    blockedReason = "ROUTING_STATE_UNAVAILABLE";
  } else if (lockActive) {
    if (!lockedProfile || lockRejection) {
      selected = null;
      eligible = [];
      blockedReason = "MODEL_LOCK_UNAVAILABLE";
    } else {
      selected = lockedProfile;
      eligible = [lockedProfile];
    }
  } else {
    noConcreteProfileCompatibility = eligible.length === 0 && input.registry.profiles.length === 0 && capabilityRank(currentTier) <= capabilityRank("balanced") && input.workOrder.riskLevel !== "CRITICAL";
    selected = noConcreteProfileCompatibility ? null : (eligible[0] ?? null);
    selectionMode = noConcreteProfileCompatibility ? "host-managed" : "router";
    blockedReason = selected || noConcreteProfileCompatibility ? null : "NO_ELIGIBLE_MODEL";
  }
  const status: ModelExecutionPlan["status"] = selected || noConcreteProfileCompatibility ? "SELECTED" : "BLOCKED";
  const selectionReasonCodes: string[] = [];
  if (noConcreteProfileCompatibility) selectionReasonCodes.push("HOST_MANAGED_COMPATIBILITY", "NO_CONCRETE_PROFILE", "QUALITY_FLOOR_RETAINED");
  if (selected) selectionReasonCodes.push("MINIMUM_CAPABILITY_FLOOR", "REASONING_ADEQUATE", "CONTEXT_HEADROOM", "RELATIVE_COST_PREFERENCE", "RELATIVE_LATENCY_PREFERENCE", "LEXICOGRAPHIC_PROFILE_ID_TIE_BREAK");
  if (selected && lockActive) selectionReasonCodes.push("MODEL_LOCK_ENFORCED");
  if (routingMode === "CHEAPEST_QUALIFIED" && selected) {
    const cheapestRank = Math.min(...eligible.map((profile) => COST_RANK[profile.relativeCostClass]));
    if (COST_RANK[selected.relativeCostClass] === cheapestRank && selected.relativeCostClass !== "unknown") {
      selectionReasonCodes.push("CHEAPEST_QUALIFIED_SELECTED");
    } else {
      selectionReasonCodes.push("CHEAPEST_QUALIFIED_COST_EVIDENCE_UNKNOWN");
    }
  }
  if (status === "BLOCKED") selectionReasonCodes.push(blockedReason ?? "NO_ELIGIBLE_MODEL", "FAIL_CLOSED");
  const fallbackProfileIds = selected && !lockActive ? eligible.slice(1).map((profile) => profile.profileId) : [];
  const routingEnforcement: RoutingEnforcement = routingStateUnavailable
    ? { state: "UNKNOWN", reasonCodes: ["ROUTING_STATE_UNAVAILABLE"] }
    : lockActive
      ? status === "SELECTED" && selected?.profileId === lockedIdentity?.profileId
        ? { state: "ENFORCED", reasonCodes: ["MODEL_LOCK_ENFORCED"] }
        : status === "SELECTED"
          ? { state: "MISMATCH", reasonCodes: ["MODEL_LOCK_MISMATCH", "FAIL_CLOSED_INVESTIGATION"] }
          : { state: "UNKNOWN", reasonCodes: ["NO_HOST_EXECUTION_EVIDENCE"] }
      : { state: "UNKNOWN", reasonCodes: ["NO_ACTIVE_LOCK", "NO_HOST_EXECUTION_EVIDENCE"] };
  const modelLock: ModelLockPlanBlock = {
    active: lockActive,
    mode: routingMode,
    revision: lockRevision,
    profileId: lockedIdentity?.profileId ?? null,
    providerId: lockedIdentity?.providerId ?? null,
    modelId: lockedIdentity?.modelId ?? null,
    reasonCodes: [...new Set(lockReasonCodes)],
  };
  const capabilityTruth = deriveCapabilityTruth(input.runtime);
  const workOrderDigest = computeWorkOrderRoutingDigest(input.workOrder);
  const planId = newPrefixedId("mrp", `${input.workOrder.projectId}:${input.workOrder.workOrderId}:${workOrderDigest}:${input.runtime.identityDigest}:${input.registry.registryDigest}:${MODEL_ROUTING_POLICY_DIGEST}:${currentTier}:${input.changeDigest ?? "none"}:${routingMode}:${lockRevision}`);
  const plan: ModelExecutionPlan = {
    schema: "uads.model-execution-plan",
    schemaVersion: MODEL_EXECUTION_PLAN_SCHEMA_VERSION,
    planId,
    projectId: input.projectId ?? input.workOrder.projectId,
    workOrderId: input.workOrder.workOrderId,
    workOrderDigest,
    changeDigest: input.changeDigest ?? null,
    risk: input.workOrder.riskLevel,
    scopeClass: input.workOrder.scopeClass,
    complexity: requirements.complexity,
    uncertainty: requirements.uncertainty,
    requiredCapabilityClass: currentTier,
    requiredCapabilities: requirements.requiredCapabilities,
    runtimeIdentityDigest: input.runtime.identityDigest,
    registryDigest: input.registry.registryDigest,
    policyDigest: MODEL_ROUTING_POLICY_DIGEST,
    candidates: summaries,
    eligibleCandidates: eligible.map((profile) => profile.profileId),
    rejections,
    selectedProfileId: selected?.profileId ?? null,
    selectedProviderId: selected?.providerId ?? null,
    selectedModelId: selected?.modelId ?? null,
    roleSelections: roleSelections(selected, status, selectionMode),
    selectionReasonCodes,
    fallbackProfileIds,
    escalation: { floor: requirements.requiredCapabilityClass, currentTier, reasonCodes: escalationReasons },
    cacheHints: effectiveCacheHints(selected, input.runtime, input.contextPack),
    execution: executionStrategy(selected, input.runtime),
    budget: {
      hardLimit: input.workOrder.tokenBudget.hardLimit,
      softLimit: input.workOrder.tokenBudget.softLimit,
      estimatedInputTokens: requirements.estimatedInputTokens,
      requiredOutputTokens: requirements.requiredOutputTokens,
      selectedContextWindowTokens: selected?.contextWindowTokens ?? null,
    },
    selectionMode,
    status,
    blockedReason,
    routingMode,
    modelLock,
    capabilityTruth,
    routingEnforcement,
  };
  return plan;
}

/**
 * Persisted routing entry point used by production surfaces: acquires capability truth
 * through the M05 boundary (projection when an adapter identity is explicit, conservative
 * all-UNKNOWN otherwise), reads governed routing state fail-closed, and persists the
 * evaluated runtime so dispatch-time currency checks stay coherent.
 */
export function routeWorkOrder(input: PersistedModelRoutingInput): ModelExecutionPlan {
  const registry = loadModelProfileRegistry(input.paths, input.schemaRoot);
  const projectId = input.projectId ?? input.workOrder.projectId;
  const evaluatedRuntime = resolveRoutingCapabilityTruth({
    adapterId: input.hostAdapterId ?? null,
    hostHome: input.hostHome,
    paths: input.paths,
    schemaRoot: input.schemaRoot,
  });
  const runtime = input.persistRuntime === false
    ? evaluatedRuntime
    : persistRuntimeCapabilitySnapshot(input.paths, evaluatedRuntime, input.schemaRoot);
  const contextPack = input.contextPack ?? readCurrentContextPack(input.paths, input.schemaRoot);
  return routeModel({
    ...input,
    projectId,
    registry,
    runtime,
    contextPack,
    lockState: modelRoutingLockInput(readModelRoutingState(input.paths, projectId, input.schemaRoot)),
  });
}
