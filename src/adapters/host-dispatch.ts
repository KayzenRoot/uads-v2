import fs from "node:fs";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { isPathInside, sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import { findPackageRoot } from "../lib/version.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  computeWorkOrderRoutingDigest,
  MODEL_ROUTING_POLICY_DIGEST,
  routeModel,
} from "../kernel/model-router.js";
import { classifyActiveApprovalGatedActions, isActiveApprovalIntentAmbiguous } from "../kernel/routing.js";
import {
  isModelExecutionPlanCurrent,
  readCurrentModelExecutionPlan,
} from "../kernel/model-persist.js";
import { loadModelProfileRegistry } from "../kernel/model-registry.js";
import {
  persistRuntimeCapabilitySnapshot,
  readRuntimeCapabilitySnapshot,
} from "../kernel/model-runtime.js";
import { currentOrRefreshIndex } from "../kernel/intelligence.js";
import { readCurrentContextPack, readImpactReport } from "../kernel/intelligence-persist.js";
import {
  readCurrentCheckpoint,
  readContextPlan,
  readRoutingDecision,
  readWorkOrder,
} from "../kernel/persist.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import {
  assertSpecialistSelectionBoundToWorkOrder,
  readCurrentSpecialistSelectionPlan,
} from "../kernel/specialist-persist.js";
import { loadSpecialistRegistry } from "../kernel/specialist-registry.js";
import type { ModelExecutionPlan } from "../kernel/model-types.js";
import { readCurrentExecutionRun } from "../kernel/execution-persist.js";
import type { ActiveApprovalGatedAction, Checkpoint, ContextPlan, RoutingDecision, WorkOrder } from "../kernel/types.js";
import {
  detectHostAdapter,
  resolveHostTarget,
} from "./host-adapter-detect.js";
import {
  getHostAdapterDefinition,
} from "./host-adapter-registry.js";
import {
  getHostAdapterStatusSummary,
  inspectHostAdapterOwnership,
} from "./host-adapter-install.js";
import { buildPassiveHostCapabilityBridge } from "./host-capability-passive.js";
import type {
  HostAdapterId,
  HostAdapterInstallInput,
  HostAdapterStatusSummary,
  HostDispatchAssignment,
  HostDispatchBundle,
} from "./host-adapter-types.js";
import { HOST_ADAPTER_CONTRACT_VERSION, HOST_ADAPTER_SCHEMA_VERSION } from "./host-adapter-types.js";

export class HostDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostDispatchError";
  }
}

export type HostDispatchCurrentArtifacts = {
  checkpoint: Checkpoint;
  workOrder: WorkOrder;
  routing: RoutingDecision;
  contextPlan: ContextPlan;
  specialistPlan: ReturnType<typeof assertSpecialistSelectionBoundToWorkOrder>;
  modelPlan: ModelExecutionPlan;
  modelRuntimeIdentityDigest: string;
  modelRegistryDigest: string;
  modelPolicyDigest: string;
  hostRuntime: ReturnType<typeof buildPassiveHostCapabilityBridge>["projectedRuntime"];
  adapterDetection: ReturnType<typeof detectHostAdapter>;
  hostTargetRootDigest: string;
  currentIndexDigest: string;
  executionRunId: string | null;
  currentChangeDigest: string | null;
  activeApprovalGatedActions: ActiveApprovalGatedAction[];
  activeApprovalIntentAmbiguous: boolean;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function digest(value: unknown): string {
  return sha256Hex(JSON.stringify(stableValue(value)));
}

function bundleDigest(bundle: Omit<HostDispatchBundle, "bundleDigest">): string {
  return digest(bundle);
}

function validateBundle(bundle: HostDispatchBundle, schemaRoot?: string): HostDispatchBundle {
  try {
    assertSchema("host-dispatch-bundle.schema.json", bundle, schemaRoot);
    const { bundleDigest: stored, ...withoutDigest } = bundle;
    if (stored !== bundleDigest(withoutDigest)) throw new Error("host dispatch bundle digest mismatch");
    const text = JSON.stringify(bundle);
    if (containsUnredactedSecret(text) || containsAbsoluteHostPath(text)) {
      throw new Error("host dispatch bundle contains secret-like or host-path data");
    }
    return bundle;
  } catch (error) {
    throw new HostDispatchError(
      `host dispatch bundle is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function readCurrentHostDispatchBundle(
  paths: UadsPaths,
  schemaRoot?: string,
): HostDispatchBundle | null {
  if (!fs.existsSync(paths.currentHostDispatch)) return null;
  const parsed = readJsonIfValid<HostDispatchBundle>(paths.currentHostDispatch);
  if (!parsed.ok) throw new HostDispatchError("current host dispatch bundle is missing or corrupt");
  return validateBundle(parsed.value, schemaRoot);
}

export function isHostDispatchBundleCurrent(
  bundle: HostDispatchBundle,
  expected: Partial<Pick<
    HostDispatchBundle,
    | "adapterId"
    | "projectId"
    | "workOrderId"
    | "routingDecisionId"
    | "specialistSelectionPlanId"
    | "specialistSelectionDigest"
    | "modelPlanId"
    | "modelPlanDigest"
    | "runtimeIdentityDigest"
    | "hostTargetRootDigest"
    | "contextPackId"
    | "impactReportId"
    | "indexDigest"
    | "currentChangeDigest"
  >> = {},
): boolean {
  try {
    validateBundle(bundle);
    return Object.entries(expected).every(([key, value]) => bundle[key as keyof HostDispatchBundle] === value);
  } catch {
    return false;
  }
}

function contextReferences(contextPlan: ContextPlan): string[] {
  return [
    "sidecar://context/plan.json",
    ...(contextPlan.contextPackId ? [`sidecar://context/packs/${contextPlan.contextPackId}.json`] : []),
    ...(contextPlan.impactReportId ? [`sidecar://context/impact-reports/${contextPlan.impactReportId}.json`] : []),
    ...(contextPlan.indexDigest ? ["sidecar://index/index-state.json"] : []),
  ];
}

function predecessorRoles(
  dependencyGroups: string[][],
  specialistId: string,
): string[] {
  const groupIndex = dependencyGroups.findIndex((group) => group.includes(specialistId));
  if (groupIndex <= 0) return [];
  return dependencyGroups.slice(0, groupIndex).flat().sort((a, b) => a.localeCompare(b));
}

function buildAssignments(
  workOrder: WorkOrder,
  specialistPlan: HostDispatchCurrentArtifacts["specialistPlan"],
  contextPlan: ContextPlan,
  parallel: boolean,
): HostDispatchAssignment[] {
  const references = contextReferences(contextPlan);
  return specialistPlan.assignments.map((assignment) => ({
    specialistId: assignment.specialistId,
    role: assignment.role,
    objective: assignment.objective,
    necessaryScope: [...workOrder.includedScope],
    forbiddenScope: [...assignment.forbiddenScope],
    relevantFiles: [...assignment.relevantFiles],
    affectedAreas: [...assignment.relevantAffectedAreas],
    gates: [...assignment.relevantGates],
    evidenceObligations: [...assignment.evidenceObligations],
    riskLevel: assignment.riskLevel,
    dependencyGroup: assignment.dependencyGroup,
    parallelEligible: parallel && assignment.parallelEligible,
    requiredPredecessorRoles: predecessorRoles(specialistPlan.dispatch.dependencyGroups, assignment.specialistId),
    contextReferences: references,
  }));
}

type PersistedApprovalWorkOrder = WorkOrder & {
  constraints: string[];
  requestedArtifacts: string[];
  destructiveSignals: string[];
};

function assertPersistedApprovalSignals(workOrder: WorkOrder): asserts workOrder is PersistedApprovalWorkOrder {
  if (!Array.isArray(workOrder.constraints) || !Array.isArray(workOrder.requestedArtifacts) || !Array.isArray(workOrder.destructiveSignals)) {
    throw new HostDispatchError("current Work Order lacks persisted canonical approval signals; legacy sidecar requires explicit migration");
  }
}

function activeApprovalClassificationFromWorkOrder(workOrder: PersistedApprovalWorkOrder): ActiveApprovalGatedAction[] {
  return classifyActiveApprovalGatedActions({
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective: workOrder.objective,
    constraints: workOrder.constraints,
    requestedArtifacts: workOrder.requestedArtifacts,
    inScope: workOrder.includedScope,
    outOfScope: workOrder.outOfScope,
    acceptanceCriteria: workOrder.acceptanceCriteria,
    domainSignals: workOrder.domains,
    riskSignals: workOrder.specialistRiskSignals ?? [],
    destructiveSignals: workOrder.destructiveSignals,
    affectedAreas: workOrder.affectedAreas,
    uncertainties: [],
    approvedBoundaries: [],
    classifier: "host-structured",
  });
}

function activeApprovalAmbiguityFromWorkOrder(workOrder: PersistedApprovalWorkOrder): boolean {
  return isActiveApprovalIntentAmbiguous({
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective: workOrder.objective,
    constraints: workOrder.constraints,
    requestedArtifacts: workOrder.requestedArtifacts,
    inScope: workOrder.includedScope,
    outOfScope: workOrder.outOfScope,
    acceptanceCriteria: workOrder.acceptanceCriteria,
    domainSignals: workOrder.domains,
    riskSignals: workOrder.specialistRiskSignals ?? [],
    destructiveSignals: workOrder.destructiveSignals,
    affectedAreas: workOrder.affectedAreas,
    uncertainties: [],
    approvedBoundaries: [],
    classifier: "host-structured",
  });
}

export function readCurrentHostDispatchArtifacts(
  input: {
    adapterId: HostAdapterId;
    cwd?: string;
    uadsHome?: string;
    hostHome?: string;
    schemaRoot: string;
  },
): HostDispatchCurrentArtifacts {
  const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
  const checkpoint = readCurrentCheckpoint(ctx.paths, input.schemaRoot);
  if (!checkpoint?.workOrderId || !checkpoint.routingDecisionId) {
    throw new HostDispatchError("host dispatch requires a current planned Work Order and Routing Decision");
  }
  const workOrder = readWorkOrder(ctx.paths, checkpoint.workOrderId, input.schemaRoot);
  const routing = readRoutingDecision(ctx.paths, checkpoint.routingDecisionId, input.schemaRoot);
  const contextPlan = readContextPlan(ctx.paths);
  if (!workOrder || !routing || !contextPlan) {
    throw new HostDispatchError("host dispatch requires current Work Order, Routing Decision, and Context Plan");
  }
  assertPersistedApprovalSignals(workOrder);
  if (
    checkpoint.projectId !== ctx.projectId ||
    workOrder.projectId !== ctx.projectId ||
    routing.projectId !== ctx.projectId ||
    workOrder.routingDecisionId !== routing.routingDecisionId
  ) {
    throw new HostDispatchError("host dispatch cross-project orchestration state rejected");
  }

  const detection = detectHostAdapter(input.adapterId, { hostHome: input.hostHome });
  if (detection.status !== "SUPPORTED") {
    throw new HostDispatchError(`host adapter is not supported for preparation: ${detection.status}`);
  }
  if (isPathInside(ctx.repoRoot, resolveHostTarget(getHostAdapterDefinition(input.adapterId), { hostHome: input.hostHome }).targetRoot)) {
    throw new HostDispatchError("project-local host adapter target is forbidden");
  }
  const ownership = inspectHostAdapterOwnership(
    input.adapterId,
    { uadsHome: input.uadsHome, hostHome: input.hostHome },
    input.schemaRoot,
  );
  if (ownership.status === "CONFLICT" || ownership.status === "STALE") {
    throw new HostDispatchError(`host adapter ownership is not clean: ${ownership.reasonCodes.join(", ") || ownership.status}`);
  }
  const hostTarget = resolveHostTarget(getHostAdapterDefinition(input.adapterId), { hostHome: input.hostHome });

  const currentIndex = currentOrRefreshIndex({
    repoRoot: ctx.repoRoot,
    projectId: ctx.projectId,
    paths: ctx.paths,
    schemaRoot: input.schemaRoot,
  });
  const currentIndexDigest = currentIndex.state.indexDigest;
  const specialistPlan = assertSpecialistSelectionBoundToWorkOrder(
    ctx.paths,
    workOrder,
    input.schemaRoot,
    {
      routing,
      contextPlan,
      currentImpactDigest: currentIndexDigest,
    },
  );

  const modelRegistry = loadModelProfileRegistry(ctx.paths, input.schemaRoot);
  const modelRuntime = readRuntimeCapabilitySnapshot(ctx.paths, "generic-runtime", input.schemaRoot);
  const modelPlan = readCurrentModelExecutionPlan(ctx.paths, input.schemaRoot);
  if (!modelPlan) throw new HostDispatchError("current Model Execution Plan is missing");
  if (modelPlan.status === "BLOCKED") {
    throw new HostDispatchError(`model execution plan is blocked: ${modelPlan.blockedReason ?? "NO_ELIGIBLE_MODEL"}`);
  }
  if (
    !isModelExecutionPlanCurrent({
      plan: modelPlan,
      projectId: ctx.projectId,
      workOrderId: workOrder.workOrderId,
      workOrderDigest: computeWorkOrderRoutingDigest(workOrder),
      registryDigest: modelRegistry.registryDigest,
      runtimeIdentityDigest: modelRuntime.identityDigest,
      policyDigest: MODEL_ROUTING_POLICY_DIGEST,
      changeDigest: modelPlan.changeDigest,
    })
  ) {
    throw new HostDispatchError("current Model Execution Plan is stale or semantically mismatched");
  }
  const currentContextPack = readCurrentContextPack(ctx.paths, input.schemaRoot);
  const expectedModelPlan = routeModel({
    projectId: ctx.projectId,
    workOrder,
    registry: modelRegistry,
    runtime: modelRuntime,
    contextPack: currentContextPack,
    changeDigest: modelPlan.changeDigest,
    previousPlan: modelPlan,
  });
  if (JSON.stringify(stableValue(modelPlan)) !== JSON.stringify(stableValue(expectedModelPlan))) {
    throw new HostDispatchError("current Model Execution Plan content is tampered or semantically divergent");
  }

  const hostCapabilityBridge = buildPassiveHostCapabilityBridge({
    adapterId: input.adapterId,
    detectionInput: { hostHome: input.hostHome },
    persist: false,
    schemaRoot: input.schemaRoot,
  });
  const hostRuntime = persistRuntimeCapabilitySnapshot(
    ctx.paths,
    hostCapabilityBridge.projectedRuntime,
    input.schemaRoot,
  );
  const currentExecution = readCurrentExecutionRun(ctx.paths, input.schemaRoot);
  if (
    currentExecution &&
    (currentExecution.projectId !== ctx.projectId ||
      currentExecution.workOrderId !== workOrder.workOrderId ||
      currentExecution.routingDecisionId !== workOrder.routingDecisionId)
  ) {
    throw new HostDispatchError("current execution run identity is mismatched");
  }
  const activeApprovalGatedActions = activeApprovalClassificationFromWorkOrder(workOrder);
  const activeApprovalIntentAmbiguous = activeApprovalAmbiguityFromWorkOrder(workOrder);
  return {
    checkpoint,
    workOrder,
    routing,
    contextPlan,
    specialistPlan,
    modelPlan,
    modelRuntimeIdentityDigest: modelRuntime.identityDigest,
    modelRegistryDigest: modelRegistry.registryDigest,
    modelPolicyDigest: MODEL_ROUTING_POLICY_DIGEST,
    hostRuntime,
    adapterDetection: detection,
    hostTargetRootDigest: hostTarget.targetRootDigest,
    currentIndexDigest,
    executionRunId: currentExecution?.executionRunId ?? null,
    currentChangeDigest: currentExecution?.currentChangeDigest ?? null,
    activeApprovalGatedActions,
    activeApprovalIntentAmbiguous,
  };
}

function executionProjection(artifacts: HostDispatchCurrentArtifacts): HostDispatchBundle["execution"] {
  const hostParallel = artifacts.hostRuntime.capabilities.parallelAgents === true;
  const hostSubagents = artifacts.hostRuntime.capabilities.subagents === true;
  const parallel =
    artifacts.modelPlan.execution.parallel &&
    hostParallel &&
    artifacts.specialistPlan.dispatch.parallelEligibleGroups.length > 0;
  const roleDispatch =
    artifacts.modelPlan.execution.roleDispatch === "subagents" && hostSubagents
      ? "subagents"
      : "role-cycling";
  return {
    parallel,
    roleDispatch,
    reasonCodes: [
      ...(parallel ? ["HOST_PARALLEL_PROVEN"] : ["SEQUENTIAL_FALLBACK"]),
      ...(roleDispatch === "subagents" ? ["HOST_SUBAGENTS_PROVEN"] : ["ROLE_CYCLING_FALLBACK"]),
    ].sort(),
  };
}

export function assertHostDispatchBundleMatchesCurrent(
  bundle: HostDispatchBundle,
  artifacts: HostDispatchCurrentArtifacts,
  adapterId: HostAdapterId,
): void {
  const modelPlanDigest = digest(artifacts.modelPlan);
  const routingDecisionDigest = digest(artifacts.routing);
  const execution = executionProjection(artifacts);
  const identity = {
    adapterId,
    adapterContractVersion: HOST_ADAPTER_CONTRACT_VERSION,
    projectId: artifacts.workOrder.projectId,
    workOrderId: artifacts.workOrder.workOrderId,
    routingDecisionId: artifacts.routing.routingDecisionId,
    workOrderDigest: computeWorkOrderRoutingDigest(artifacts.workOrder),
    routingDecisionDigest,
    specialistSelectionPlanId: artifacts.specialistPlan.selectionPlanId,
    specialistSelectionDigest: artifacts.specialistPlan.selectionDigest,
    modelPlanId: artifacts.modelPlan.planId,
    modelPlanDigest,
    runtimeIdentityDigest: artifacts.hostRuntime.identityDigest,
    modelRuntimeIdentityDigest: artifacts.modelRuntimeIdentityDigest,
    hostTargetRootDigest: artifacts.hostTargetRootDigest,
    currentChangeDigest: artifacts.currentChangeDigest,
    indexDigest: artifacts.currentIndexDigest,
    activeApprovalGatedActions: artifacts.activeApprovalGatedActions,
    activeApprovalIntentAmbiguous: artifacts.activeApprovalIntentAmbiguous,
  };
  const expectedBundleId = `hdb_${sha256Hex(JSON.stringify(stableValue(identity))).slice(0, 16)}`;
  if (bundle.bundleId !== expectedBundleId) {
    throw new HostDispatchError("host dispatch bundle identity is stale or tampered");
  }

  const expected: Partial<HostDispatchBundle> = {
    adapterId,
    adapterContractVersion: HOST_ADAPTER_CONTRACT_VERSION,
    adapterDetectionStatus: artifacts.adapterDetection.status,
    adapterVersion: artifacts.adapterDetection.version,
    projectId: artifacts.workOrder.projectId,
    workOrderId: artifacts.workOrder.workOrderId,
    routingDecisionId: artifacts.routing.routingDecisionId,
    executionRunId: artifacts.executionRunId,
    workOrderDigest: identity.workOrderDigest,
    routingDecisionDigest,
    specialistSelectionPlanId: artifacts.specialistPlan.selectionPlanId,
    specialistSelectionDigest: artifacts.specialistPlan.selectionDigest,
    specialistRegistryDigest: artifacts.specialistPlan.registryDigest,
    specialistPolicyDigest: artifacts.specialistPlan.policyDigest,
    specialistGateContractDigest: artifacts.specialistPlan.gateContractDigest,
    specialistChangeDigest: artifacts.specialistPlan.changeDigest,
    specialistImpactDigest: artifacts.specialistPlan.impactDigest,
    modelPlanId: artifacts.modelPlan.planId,
    modelPlanDigest,
    modelRuntimeIdentityDigest: artifacts.modelRuntimeIdentityDigest,
    modelRegistryDigest: artifacts.modelRegistryDigest,
    modelPolicyDigest: artifacts.modelPolicyDigest,
    runtimeId: artifacts.hostRuntime.runtimeId,
    runtimeIdentityDigest: artifacts.hostRuntime.identityDigest,
    hostTargetRootDigest: artifacts.hostTargetRootDigest,
    hostCapabilities: artifacts.hostRuntime.capabilities,
    contextPackId: artifacts.contextPlan.contextPackId ?? null,
    impactReportId: artifacts.contextPlan.impactReportId ?? null,
    indexDigest: artifacts.currentIndexDigest,
    currentChangeDigest: artifacts.currentChangeDigest,
    activeApprovalGatedActions: artifacts.activeApprovalGatedActions,
    activeApprovalIntentAmbiguous: artifacts.activeApprovalIntentAmbiguous,
    riskLevel: artifacts.workOrder.riskLevel,
    scopeClass: artifacts.workOrder.scopeClass,
    capabilityClass: artifacts.workOrder.tokenBudget.capabilityClass,
    contextRadius: artifacts.workOrder.contextRadius,
    includedScope: [...artifacts.workOrder.includedScope],
    outOfScope: [...artifacts.workOrder.outOfScope],
    selectedGates: [...artifacts.workOrder.qualityGates],
    requiredEvidence: [...artifacts.workOrder.requiredEvidence],
    requiredAssuranceRoles: [...artifacts.workOrder.assuranceReviewers],
    dependencyGroups: artifacts.specialistPlan.dispatch.dependencyGroups.map((group) => [...group]),
    parallelEligibleGroups:
      execution.parallel
        ? artifacts.specialistPlan.dispatch.parallelEligibleGroups.map((group) => [...group])
        : [],
    execution,
    limits: {
      tokenSoftLimit: artifacts.workOrder.tokenBudget.softLimit,
      tokenHardLimit: artifacts.workOrder.tokenBudget.hardLimit,
      contextRadius: artifacts.workOrder.contextRadius,
    },
    assignments: buildAssignments(artifacts.workOrder, artifacts.specialistPlan, artifacts.contextPlan, execution.parallel),
    status: "PREPARED",
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = bundle[key as keyof HostDispatchBundle];
    if (JSON.stringify(stableValue(actual)) !== JSON.stringify(stableValue(value))) {
      throw new HostDispatchError(`host dispatch bundle current identity mismatch: ${key}`);
    }
  }
  if (artifacts.executionRunId === null || bundle.executionRunId === null) {
    throw new HostDispatchError("host execution requires a current execution run");
  }
}

export function prepareHostDispatchBundle(input: {
  adapterId: HostAdapterId;
  cwd?: string;
  uadsHome?: string;
  hostHome?: string;
  schemaRoot?: string;
}): HostDispatchBundle {
  const schemaRoot = input.schemaRoot ?? findPackageRoot();
  const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
  const artifacts = readCurrentHostDispatchArtifacts({ ...input, schemaRoot });
  const modelPlanDigest = digest(artifacts.modelPlan);
  const routingDecisionDigest = digest(artifacts.routing);
  const hostParallel = artifacts.hostRuntime.capabilities.parallelAgents === true;
  const hostSubagents = artifacts.hostRuntime.capabilities.subagents === true;
  const parallel = artifacts.modelPlan.execution.parallel && hostParallel && artifacts.specialistPlan.dispatch.parallelEligibleGroups.length > 0;
  const roleDispatch =
    artifacts.modelPlan.execution.roleDispatch === "subagents" && hostSubagents
      ? "subagents"
      : "role-cycling";
  const executionReasonCodes = [
    ...(parallel ? ["HOST_PARALLEL_PROVEN"] : ["SEQUENTIAL_FALLBACK"]),
    ...(roleDispatch === "subagents" ? ["HOST_SUBAGENTS_PROVEN"] : ["ROLE_CYCLING_FALLBACK"]),
  ];
  const identity = {
    adapterId: input.adapterId,
    adapterContractVersion: HOST_ADAPTER_CONTRACT_VERSION,
    projectId: artifacts.workOrder.projectId,
    workOrderId: artifacts.workOrder.workOrderId,
    routingDecisionId: artifacts.routing.routingDecisionId,
    workOrderDigest: computeWorkOrderRoutingDigest(artifacts.workOrder),
    routingDecisionDigest,
    specialistSelectionPlanId: artifacts.specialistPlan.selectionPlanId,
    specialistSelectionDigest: artifacts.specialistPlan.selectionDigest,
    modelPlanId: artifacts.modelPlan.planId,
    modelPlanDigest,
    runtimeIdentityDigest: artifacts.hostRuntime.identityDigest,
    modelRuntimeIdentityDigest: artifacts.modelRuntimeIdentityDigest,
    hostTargetRootDigest: artifacts.hostTargetRootDigest,
    currentChangeDigest: artifacts.currentChangeDigest,
    indexDigest: artifacts.currentIndexDigest,
    activeApprovalGatedActions: artifacts.activeApprovalGatedActions,
    activeApprovalIntentAmbiguous: artifacts.activeApprovalIntentAmbiguous,
  };
  const bundleId = `hdb_${sha256Hex(JSON.stringify(stableValue(identity))).slice(0, 16)}`;
  const planParallelGroups = artifacts.specialistPlan.dispatch.parallelEligibleGroups;
  const base: Omit<HostDispatchBundle, "bundleDigest"> = {
    schema: "uads.host-dispatch-bundle",
    schemaVersion: HOST_ADAPTER_SCHEMA_VERSION,
    bundleId,
    adapterId: input.adapterId,
    adapterContractVersion: HOST_ADAPTER_CONTRACT_VERSION,
    adapterDetectionStatus: artifacts.adapterDetection.status,
    adapterVersion: artifacts.adapterDetection.version,
    projectId: artifacts.workOrder.projectId,
    workOrderId: artifacts.workOrder.workOrderId,
    routingDecisionId: artifacts.routing.routingDecisionId,
    executionRunId: artifacts.executionRunId,
    workOrderDigest: identity.workOrderDigest,
    routingDecisionDigest,
    specialistSelectionPlanId: artifacts.specialistPlan.selectionPlanId,
    specialistSelectionDigest: artifacts.specialistPlan.selectionDigest,
    specialistRegistryDigest: artifacts.specialistPlan.registryDigest,
    specialistPolicyDigest: artifacts.specialistPlan.policyDigest,
    specialistGateContractDigest: artifacts.specialistPlan.gateContractDigest,
    specialistChangeDigest: artifacts.specialistPlan.changeDigest,
    specialistImpactDigest: artifacts.specialistPlan.impactDigest,
    modelPlanId: artifacts.modelPlan.planId,
    modelPlanDigest,
    modelRuntimeIdentityDigest: artifacts.modelRuntimeIdentityDigest,
    modelRegistryDigest: artifacts.modelRegistryDigest,
    modelPolicyDigest: artifacts.modelPolicyDigest,
    runtimeId: artifacts.hostRuntime.runtimeId,
    runtimeIdentityDigest: artifacts.hostRuntime.identityDigest,
    hostTargetRootDigest: artifacts.hostTargetRootDigest,
    hostCapabilities: artifacts.hostRuntime.capabilities,
    contextPackId: artifacts.contextPlan.contextPackId ?? null,
    impactReportId: artifacts.contextPlan.impactReportId ?? null,
    indexDigest: artifacts.currentIndexDigest,
    currentChangeDigest: artifacts.currentChangeDigest,
    activeApprovalGatedActions: artifacts.activeApprovalGatedActions,
    activeApprovalIntentAmbiguous: artifacts.activeApprovalIntentAmbiguous,
    riskLevel: artifacts.workOrder.riskLevel,
    scopeClass: artifacts.workOrder.scopeClass,
    capabilityClass: artifacts.workOrder.tokenBudget.capabilityClass,
    contextRadius: artifacts.workOrder.contextRadius,
    includedScope: [...artifacts.workOrder.includedScope],
    outOfScope: [...artifacts.workOrder.outOfScope],
    selectedGates: [...artifacts.workOrder.qualityGates],
    requiredEvidence: [...artifacts.workOrder.requiredEvidence],
    requiredAssuranceRoles: [...artifacts.workOrder.assuranceReviewers],
    dependencyGroups: artifacts.specialistPlan.dispatch.dependencyGroups.map((group) => [...group]),
    parallelEligibleGroups: parallel ? planParallelGroups.map((group) => [...group]) : [],
    execution: {
      parallel,
      roleDispatch,
      reasonCodes: [...new Set(executionReasonCodes)].sort(),
    },
    limits: {
      tokenSoftLimit: artifacts.workOrder.tokenBudget.softLimit,
      tokenHardLimit: artifacts.workOrder.tokenBudget.hardLimit,
      contextRadius: artifacts.workOrder.contextRadius,
    },
    assignments: buildAssignments(artifacts.workOrder, artifacts.specialistPlan, artifacts.contextPlan, parallel),
    status: "PREPARED",
  };
  const bundle = {
    ...base,
    bundleDigest: bundleDigest(base),
  };
  const validated = validateBundle(bundle, schemaRoot);
  atomicWriteJson(sidecarJsonPath(ctx.paths.hostDispatchHistory, validated.bundleId), sanitizeOperationalValue(validated));
  atomicWriteJson(ctx.paths.currentHostDispatch, sanitizeOperationalValue(validated));
  return validated;
}

export function hostDispatchBundleStatus(
  paths: UadsPaths,
  projectId: string,
  schemaRoot?: string,
  adapterId?: HostAdapterId,
  hostHome?: string,
): HostAdapterStatusSummary["preparedBundle"] {
  try {
    const bundle = readCurrentHostDispatchBundle(paths, schemaRoot);
    if (!bundle) return "none";
    const definition = adapterId ? getHostAdapterDefinition(adapterId) : null;
    if (definition && adapterId) {
      const ownership = inspectHostAdapterOwnership(
        adapterId,
        { hostHome, uadsHome: paths.home },
        schemaRoot,
      );
      if (ownership.status !== "CLEAN") return "stale";
    }
    const hostTargetRootDigest =
      definition && adapterId
        ? resolveHostTarget(definition, { hostHome }).targetRootDigest
        : null;
    const checkpoint = readCurrentCheckpoint(paths, schemaRoot);
    const workOrder = checkpoint?.workOrderId ? readWorkOrder(paths, checkpoint.workOrderId, schemaRoot) : null;
    const contextPlan = readContextPlan(paths);
    const specialistPlan = readCurrentSpecialistSelectionPlan(paths, schemaRoot);
    const modelPlan = readCurrentModelExecutionPlan(paths, schemaRoot);
    const current =
      bundle.projectId === projectId &&
      (!adapterId || bundle.adapterId === adapterId) &&
      Boolean(checkpoint && workOrder && contextPlan && specialistPlan && modelPlan) &&
      bundle.workOrderId === workOrder?.workOrderId &&
      bundle.routingDecisionId === checkpoint?.routingDecisionId &&
      bundle.specialistSelectionDigest === workOrder?.specialistSelectionDigest &&
      bundle.specialistSelectionDigest === specialistPlan?.selectionDigest &&
      bundle.modelPlanId === modelPlan?.planId &&
      bundle.indexDigest === (contextPlan?.indexDigest ?? null) &&
      (!hostTargetRootDigest || bundle.hostTargetRootDigest === hostTargetRootDigest);
    return current ? "current" : "stale";
  } catch {
    return "stale";
  }
}

export function hostAdapterStatus(
  adapterId: HostAdapterId,
  input: HostAdapterInstallInput & { projectId?: string; paths?: UadsPaths } = {},
  schemaRoot?: string,
): HostAdapterStatusSummary {
  const summary = getHostAdapterStatusSummary(adapterId, input, schemaRoot);
  return {
    ...summary,
    preparedBundle:
      input.paths && input.projectId
        ? hostDispatchBundleStatus(input.paths, input.projectId, schemaRoot, adapterId, input.hostHome)
        : "none",
  };
}
