import type { RuntimeCapabilities } from "../kernel/model-types.js";
import type { ActiveApprovalGatedAction, CapabilityClass, ContextRadius, RiskLevel, ScopeClass } from "../kernel/types.js";
import type { HostAdapterRootBinding } from "./host-adapter-root.js";

export type { HostAdapterRootBinding, HostRootKind, HostRootSourceClass } from "./host-adapter-root.js";

export const HOST_ADAPTER_SCHEMA_VERSION = "0.10.0" as const;
export const HOST_ADAPTER_CONTRACT_VERSION = "0.10.0" as const;

export type HostAdapterId = "cursor" | "codex" | "generic-agent-skills";
export type HostAdapterStatus = "SUPPORTED" | "UNAVAILABLE" | "UNPROVEN" | "BLOCKED";
export type HostInstallStatus = "INSTALLED" | "NOT_INSTALLED";
export type HostOwnershipStatus = "CLEAN" | "CONFLICT" | "STALE" | "UNKNOWN";
export type HostResourceKind = "agents" | "agent-skill";
export type HostDispatchStatus = "PREPARED";

export const HOST_ADAPTER_IDS: readonly HostAdapterId[] = [
  "cursor",
  "codex",
  "generic-agent-skills",
];

export type HostAdapterDetection = {
  adapterId: HostAdapterId;
  status: HostAdapterStatus;
  version: string | null;
  detectionMethod: string;
  targetLabel: string;
  provenCapabilities: RuntimeCapabilities;
  reasonCodes: string[];
  detectedAt: string;
};

export type HostAdapterResource = {
  sourceRef: string;
  relativeTarget: string;
  sourceDigest: string;
  installedDigest: string;
};

export type HostAdapterState = {
  schema: "uads.host-adapter-state";
  schemaVersion: typeof HOST_ADAPTER_SCHEMA_VERSION;
  adapterId: HostAdapterId;
  contractVersion: typeof HOST_ADAPTER_CONTRACT_VERSION;
  targetLabel: string;
  detection: HostAdapterDetection;
  installStatus: HostInstallStatus;
  ownershipStatus: HostOwnershipStatus;
  rootBinding: HostAdapterRootBinding | null;
  resources: HostAdapterResource[];
  manifestRelativeTarget: string;
  manifestDigest: string | null;
  updatedAt: string;
  stateDigest: string;
};

export type HostAdapterDefinition = {
  adapterId: HostAdapterId;
  resourceKind: HostResourceKind;
  targetLabel: string;
  manifestRelativeTarget: string;
  sourceRoot: "agents" | "skills/uads-orchestrator";
  targetRelativeRoot: "agents" | "skills";
  capabilities: RuntimeCapabilities;
};

export type HostAdapterRegistry = {
  schema: "uads.host-adapter-registry";
  schemaVersion: typeof HOST_ADAPTER_SCHEMA_VERSION;
  contractVersion: typeof HOST_ADAPTER_CONTRACT_VERSION;
  adapters: HostAdapterDefinition[];
  registryDigest: string;
};

export type HostAdapterDetectionInput = {
  hostHome?: string;
  adapterRoot?: string;
  packageRoot?: string;
};

export type HostAdapterInstallInput = HostAdapterDetectionInput & {
  uadsHome?: string;
  force?: boolean;
  projectRoot?: string;
};

export type HostAdapterUninstallInput = HostAdapterInstallInput;

export type HostAdapterPrepareInput = {
  cwd?: string;
  uadsHome?: string;
  hostHome?: string;
  schemaRoot?: string;
};

export type HostExecutionReceiptState = "ACCEPTED" | "STARTED" | "COMPLETED" | "FAILED" | "BLOCKED";

export type HostExecutionHandoffInput = HostAdapterPrepareInput;

export type HostExecutionReceiptInput = HostAdapterPrepareInput & {
  state: HostExecutionReceiptState;
  reasonCodes?: string[];
};

export type HostAdapter = {
  definition: HostAdapterDefinition;
  detect: (input?: HostAdapterDetectionInput) => HostAdapterDetection;
  install: (input?: HostAdapterInstallInput) => HostAdapterState;
  uninstall: (input?: HostAdapterUninstallInput) => HostAdapterState | null;
  prepare: (input?: HostAdapterPrepareInput) => HostDispatchBundle;
  handoff: (input?: HostExecutionHandoffInput) => HostExecutionReceipt;
  receipt: (input: HostExecutionReceiptInput) => HostExecutionReceipt;
};

export type HostExecutionReceipt = {
  schema: "uads.host-execution-receipt";
  schemaVersion: "0.1.0";
  contractVersion: "0.1.0";
  receiptId: string;
  handoffId: string;
  adapterId: HostAdapterId;
  adapterContractVersion: typeof HOST_ADAPTER_CONTRACT_VERSION;
  projectId: string;
  bundleId: string;
  bundleDigest: string;
  workOrderId: string;
  workOrderDigest: string;
  routingDecisionId: string;
  routingDecisionDigest: string;
  specialistSelectionPlanId: string;
  specialistSelectionDigest: string;
  modelPlanId: string | null;
  modelPlanDigest: string | null;
  modelRuntimeIdentityDigest: string | null;
  runtimeId: string | null;
  runtimeIdentityDigest: string;
  executionRunId: string;
  hostTargetRootDigest: string;
  currentChangeDigest: string | null;
  state: HostExecutionReceiptState;
  reasonCodes: string[];
  createdAt: string;
  updatedAt: string;
  acceptedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  receiptDigest: string;
};

export type HostDispatchAssignment = {
  specialistId: string;
  role: string;
  objective: string;
  necessaryScope: string[];
  forbiddenScope: string[];
  relevantFiles: string[];
  affectedAreas: string[];
  gates: string[];
  evidenceObligations: string[];
  riskLevel: RiskLevel;
  dependencyGroup: number;
  parallelEligible: boolean;
  requiredPredecessorRoles: string[];
  contextReferences: string[];
};

export type HostDispatchBundle = {
  schema: "uads.host-dispatch-bundle";
  schemaVersion: typeof HOST_ADAPTER_SCHEMA_VERSION;
  bundleId: string;
  adapterId: HostAdapterId;
  adapterContractVersion: typeof HOST_ADAPTER_CONTRACT_VERSION;
  adapterDetectionStatus: HostAdapterStatus;
  adapterVersion: string | null;
  projectId: string;
  workOrderId: string;
  routingDecisionId: string;
  executionRunId: string | null;
  workOrderDigest: string;
  routingDecisionDigest: string;
  specialistSelectionPlanId: string;
  specialistSelectionDigest: string;
  specialistRegistryDigest: string;
  specialistPolicyDigest: string;
  specialistGateContractDigest: string | null;
  specialistChangeDigest: string | null;
  specialistImpactDigest: string | null;
  modelPlanId: string | null;
  modelPlanDigest: string | null;
  modelRuntimeIdentityDigest: string | null;
  modelRegistryDigest: string | null;
  modelPolicyDigest: string | null;
  runtimeId: string | null;
  runtimeIdentityDigest: string;
  hostTargetRootDigest: string;
  hostCapabilities: RuntimeCapabilities;
  contextPackId: string | null;
  impactReportId: string | null;
  indexDigest: string | null;
  currentChangeDigest: string | null;
  activeApprovalGatedActions?: ActiveApprovalGatedAction[];
  activeApprovalIntentAmbiguous?: boolean;
  riskLevel: RiskLevel;
  scopeClass: ScopeClass;
  capabilityClass: CapabilityClass;
  contextRadius: ContextRadius;
  includedScope: string[];
  outOfScope: string[];
  selectedGates: string[];
  requiredEvidence: string[];
  requiredAssuranceRoles: string[];
  dependencyGroups: string[][];
  parallelEligibleGroups: string[][];
  execution: {
    parallel: boolean;
    roleDispatch: "subagents" | "role-cycling";
    reasonCodes: string[];
  };
  limits: {
    tokenSoftLimit: number;
    tokenHardLimit: number;
    contextRadius: ContextRadius;
  };
  assignments: HostDispatchAssignment[];
  status: HostDispatchStatus;
  bundleDigest: string;
};

export type HostAdapterStatusSummary = {
  adapterId: HostAdapterId;
  support: HostAdapterStatus;
  install: HostInstallStatus;
  ownership: HostOwnershipStatus;
  version: string | null;
  targetLabel: string;
  capabilityProof: "current" | "unknown";
  preparedBundle: "current" | "stale" | "none";
  reasonCodes: string[];
};
