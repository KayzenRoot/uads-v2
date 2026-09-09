import type { CapabilityClass, RiskLevel, ScopeClass } from "./types.js";

export type { CapabilityClass, RiskLevel, ScopeClass } from "./types.js";

export const MODEL_ROUTING_SCHEMA_VERSION = "0.8.0" as const;
export const MODEL_ROUTING_POLICY_VERSION = "0.8.0" as const;

export type ModelStatus = "enabled" | "disabled" | "experimental";
export type ReasoningClass = "basic" | "standard" | "advanced" | "deep";
export type RelativeCostClass = "very-low" | "low" | "medium" | "high" | "very-high" | "unknown";
export type RelativeLatencyClass = "very-low" | "low" | "medium" | "high" | "very-high" | "unknown";
export type ModelProfileSource = "builtin-fixture" | "user-config" | "adapter" | "imported";
export type CapabilityValue = boolean | "unknown";
export type ModelCapability =
  | "modelSelection"
  | "toolCalling"
  | "structuredOutput"
  | "promptCache"
  | "explicitCache"
  | "persistentContext"
  | "subagents"
  | "parallelAgents"
  | "usageTelemetry"
  | "visionInput";
export type ModelRole = "implementation" | "review" | "testing" | "assurance";
export type ModelRoutingStatus = "SELECTED" | "BLOCKED";
export type ModelSelectionMode = "router" | "host-managed";

export type ModelSupports = {
  toolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  promptCache: boolean;
  explicitCache: boolean;
  persistentContext: boolean;
  usageTelemetry: boolean;
};

export type ModelProfileConstraints = {
  maxConcurrency?: number | null;
};

export type ModelProfile = {
  schema: "uads.model-profile";
  schemaVersion: typeof MODEL_ROUTING_SCHEMA_VERSION;
  profileId: string;
  providerId: string;
  modelId: string;
  status: ModelStatus;
  capabilityClass: CapabilityClass;
  reasoningClass: ReasoningClass;
  contextWindowTokens: number | null;
  maxOutputTokens: number | null;
  relativeCostClass: RelativeCostClass;
  relativeLatencyClass: RelativeLatencyClass;
  supports: ModelSupports;
  constraints: ModelProfileConstraints;
  notes: string | null;
  source: ModelProfileSource;
  adapterId: string | null;
  adapterVersion: string | null;
  profileDigest: string;
};

export type ModelProfileRegistry = {
  schema: "uads.model-profile-registry";
  schemaVersion: typeof MODEL_ROUTING_SCHEMA_VERSION;
  profiles: ModelProfile[];
  registryDigest: string;
};

export type RuntimeCapabilities = {
  modelSelection: CapabilityValue;
  toolCalling: CapabilityValue;
  structuredOutput: CapabilityValue;
  promptCache: CapabilityValue;
  explicitCache: CapabilityValue;
  persistentContext: CapabilityValue;
  subagents: CapabilityValue;
  parallelAgents: CapabilityValue;
  usageTelemetry: CapabilityValue;
  visionInput: CapabilityValue;
};

export type RuntimeCapabilitySnapshot = {
  schema: "uads.runtime-capability-snapshot";
  schemaVersion: typeof MODEL_ROUTING_SCHEMA_VERSION;
  runtimeId: string;
  adapterId: string;
  adapterVersion: string;
  runtimeVersion: string | null;
  capabilities: RuntimeCapabilities;
  provenance: {
    source: "adapter" | "explicit-config" | "test-fixture";
    confidence: "proven" | "declared" | "unknown";
  };
  identityDigest: string;
};

export type ModelRoutingRequirements = {
  requiredCapabilityClass: CapabilityClass;
  requiredCapabilities: ModelCapability[];
  minimumReasoningClass: ReasoningClass;
  estimatedInputTokens: number;
  requiredOutputTokens: number;
  requireProvenRuntime: boolean;
  allowExperimental: boolean;
  explicitPreferenceFloor?: CapabilityClass;
  blockedProviderIds: string[];
  complexity: "trivial" | "moderate" | "complex" | "critical";
  uncertainty: number;
  reasons: string[];
};

export type ModelCandidateSummary = {
  profileId: string;
  providerId: string;
  modelId: string;
  capabilityClass: CapabilityClass;
  reasoningClass: ReasoningClass;
  relativeCostClass: RelativeCostClass;
  relativeLatencyClass: RelativeLatencyClass;
};

export type ModelRejection = {
  profileId: string;
  reasonCodes: string[];
  reasons: string[];
};

export type ModelRoleSelection = {
  role: ModelRole;
  profileId: string | null;
  providerId: string | null;
  modelId: string | null;
  status: "selected" | "host-managed" | "blocked";
  reasonCodes: string[];
};

export type ModelExecutionStrategy = {
  parallel: boolean;
  roleDispatch: "subagents" | "role-cycling";
  usageTelemetryAvailable: boolean | null;
};

export type ModelExecutionPlan = {
  schema: "uads.model-execution-plan";
  schemaVersion: typeof MODEL_ROUTING_SCHEMA_VERSION;
  planId: string;
  projectId: string;
  workOrderId: string;
  workOrderDigest: string;
  changeDigest: string | null;
  risk: RiskLevel;
  scopeClass: ScopeClass;
  complexity: ModelRoutingRequirements["complexity"];
  uncertainty: number;
  requiredCapabilityClass: CapabilityClass;
  requiredCapabilities: ModelCapability[];
  runtimeIdentityDigest: string;
  registryDigest: string;
  policyDigest: string;
  candidates: ModelCandidateSummary[];
  eligibleCandidates: string[];
  rejections: ModelRejection[];
  selectedProfileId: string | null;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  roleSelections: ModelRoleSelection[];
  selectionReasonCodes: string[];
  fallbackProfileIds: string[];
  escalation: {
    floor: CapabilityClass;
    currentTier: CapabilityClass;
    reasonCodes: string[];
  };
  cacheHints: {
    staticLayerDigest: string | null;
    semiStableLayerDigest: string | null;
    dynamicLayerDigest: string | null;
    promptCacheUsable: boolean;
    explicitCacheUsable: boolean;
    persistentContextUsable: boolean;
  };
  execution: ModelExecutionStrategy;
  budget: {
    hardLimit: number;
    softLimit: number;
    estimatedInputTokens: number;
    requiredOutputTokens: number;
    selectedContextWindowTokens: number | null;
  };
  selectionMode: ModelSelectionMode;
  status: ModelRoutingStatus;
  blockedReason: string | null;
};

export type ModelRoutingFailureSignals = {
  repeatedDistinctFailures?: number;
  loopDetected?: boolean;
  unresolvedAmbiguity?: boolean;
  failedArchitectureReview?: boolean;
  explicitReasons?: string[];
};
