import { sha256Hex } from "../lib/hash.js";
import { findPackageRoot } from "../lib/version.js";
import type { UadsPaths } from "../lib/workspace.js";
import { inspectRepository } from "./inspector.js";
import { newPrefixedId, titleFromObjective } from "./ids.js";
import { intakeFromRequest, normalizeIntake } from "./intake.js";
import {
  classifyRisk,
  classifyScopeSize,
  selectCapabilityClass,
  selectContextRadius,
  selectDomains,
  TOKEN_BUDGETS,
} from "./policy.js";
import { classifyRequestedWork } from "./scope-control.js";
import { selectContextCandidates } from "./context-candidates.js";
import { gateEvidence } from "./gates.js";
import {
  assertIndependentReview,
  autonomyBoundary,
  selectGates,
  selectSpecialists,
} from "./routing.js";
import { inspectCurrentState, persistPlan, readContextPlan, readCurrentCheckpoint, readRoutingDecision, readWorkOrder } from "./persist.js";
import { readCacheStatusCompact } from "./cache-engine.js";
import { readCostStatusCompact } from "./cost-persist.js";
import { loadExecutionView } from "./execution.js";
import { readFailureStatusFields } from "./failure-persist.js";
import { buildImpactAndPack } from "./intelligence.js";
import { readCurrentContextPack } from "./intelligence-persist.js";
import { routeAndPersistModelExecutionPlan } from "./model-persist.js";
import { readCurrentModelExecutionPlan } from "./model-persist.js";
import { resolveProjectContext } from "./project-context.js";
import { loadSpecialistRegistry } from "./specialist-registry.js";
import {
  assertSpecialistSelectionBoundToWorkOrder,
  persistSpecialistSelectionPlan,
  readCurrentSpecialistSelectionPlan,
} from "./specialist-persist.js";
import {
  computeSpecialistGateContractDigest,
  selectSpecialistPlan,
} from "./specialist-router.js";
import type {
  SpecialistDependencySignals,
  SpecialistRoutingInput,
  SpecialistSelectionPlan,
} from "./specialist-types.js";
import type {
  Checkpoint,
  ContextPlan,
  NormalizedIntake,
  RepositoryMap,
  ResumePacket,
  RoutingDecision,
  WorkOrder,
} from "./types.js";
import type { ModelExecutionPlan } from "./model-types.js";
import { IMPLEMENTER_ROLE } from "./types.js";

function dependencySignalsFromImpact(report: {
  supportingContext: Array<{ relation: string }>;
  possibleImpact: Array<{ relation: string }>;
}): SpecialistDependencySignals | null {
  const crossCutting = [...report.supportingContext, ...report.possibleImpact].some(
    (item) => item.relation === "dependency" || item.relation === "dependent",
  );
  return crossCutting ? { crossCutting: true, source: "impact-report" } : null;
}

export function runInspect(input: { cwd?: string; uadsHome?: string; json?: boolean }): {
  map: RepositoryMap;
  reused: boolean;
  fullWalk: boolean;
  projectId: string;
} {
  const cwd = input.cwd ?? process.cwd();
  const ctx = resolveProjectContext(cwd, input.uadsHome);
  const inspected = inspectRepository({
    repoRoot: ctx.repoRoot,
    projectId: ctx.projectId,
    paths: ctx.paths,
    schemaRoot: findPackageRoot(),
  });
  return { ...inspected, projectId: ctx.projectId };
}

export type PlanResult = {
  workOrder: WorkOrder;
  decision: RoutingDecision;
  checkpoint: Checkpoint;
  contextPlan: ContextPlan;
  map: RepositoryMap;
  mapReused: boolean;
  modelPlan: ModelExecutionPlan;
  specialistPlan: SpecialistSelectionPlan;
};

export function runPlan(input: {
  cwd?: string;
  uadsHome?: string;
  request?: string;
  intake?: unknown;
  intakePath?: string;
}): PlanResult {
  const cwd = input.cwd ?? process.cwd();
  const schemaRoot = findPackageRoot();
  const intake: NormalizedIntake = input.intake
    ? normalizeIntake(input.intake, schemaRoot)
    : intakeFromRequest(input.request ?? "");
  const ctx = resolveProjectContext(cwd, input.uadsHome);
  const inspected = inspectRepository({
    repoRoot: ctx.repoRoot,
    projectId: ctx.projectId,
    paths: ctx.paths,
    schemaRoot,
  });
  return planFromIntake({
    intake,
    map: inspected.map,
    mapReused: inspected.reused,
    projectId: ctx.projectId,
    paths: ctx.paths,
    schemaRoot,
    repoRoot: ctx.repoRoot,
  });
}

export function planFromIntake(input: {
  intake: NormalizedIntake;
  map: RepositoryMap;
  mapReused: boolean;
  projectId: string;
  paths: UadsPaths;
  schemaRoot?: string;
  repoRoot?: string;
}): PlanResult {
  const now = new Date().toISOString();
  const scope = classifyScopeSize(input.intake);
  const risk = classifyRisk(input.intake, input.map);
  const domains = selectDomains(input.intake);
  const domainIds = domains.map((item) => item.id);
  const specialists = selectSpecialists({
    intake: input.intake,
    domains: domainIds,
    scopeClass: scope.scopeClass,
    risk: risk.level,
  });
  assertIndependentReview(specialists.specialists, specialists.assurance);
  const gates = selectGates({
    domains: domainIds,
    risk: risk.level,
    scopeClass: scope.scopeClass,
    intake: input.intake,
  });
  const context = selectContextRadius(scope.scopeClass, risk.level);
  const capabilityClass = selectCapabilityClass(risk.level, scope.scopeClass);
  const budget = TOKEN_BUDGETS[capabilityClass];
  const boundary = autonomyBoundary(input.intake);
  const material = `${input.projectId}:${input.intake.objective}:${now}`;
  const routingDecisionId = newPrefixedId("rd", material);
  const workOrderId = newPrefixedId("wo", material);
  const checkpointId = newPrefixedId("cp", material);

  const scoped = classifyRequestedWork({
    objective: input.intake.objective,
    inScope: scope.included,
    outOfScope: scope.outOfScope,
    recommendations: scope.recommendations,
  });
  const specialistRegistry = loadSpecialistRegistry(input.paths, input.schemaRoot);
  const specialistDependencies = [
    "inspect before edit",
    "implement only NECESSARY scope",
    `${IMPLEMENTER_ROLE} is not the sole final reviewer`,
  ];
  const acceptanceCriteria =
    input.intake.acceptanceCriteria.length > 0
      ? input.intake.acceptanceCriteria
      : ["Requested objective is met", "Selected gates have evidence", "Independent review completed if implementation occurred"];
  const specialistRoutingInput: SpecialistRoutingInput = {
    projectId: input.projectId,
    workOrderId,
    objective: input.intake.objective,
    constraints: input.intake.constraints,
    inScope: scoped.necessary,
    outOfScope: scope.outOfScope,
    acceptanceCriteria,
    domains: domainIds,
    scopeClass: scope.scopeClass,
    riskLevel: risk.level,
    riskSignals: input.intake.riskSignals,
    riskReasons: risk.reasons,
    affectedAreas: input.intake.affectedAreas,
    gates: gates.map((gate) => gate.id),
    requiredEvidence: gates.map((gate) => gateEvidence(gate.id)),
    dependencyInfo: specialistDependencies,
    dependencySignals: null,
    gateContractDigest: computeSpecialistGateContractDigest(gates),
    registry: specialistRegistry,
  };
  let specialistPlan = selectSpecialistPlan(specialistRoutingInput);
  const warnings: string[] = [];
  if (input.intake.classifier === "fallback-text") {
    warnings.push("intake used conservative fallback-text classifier, not host semantic interpretation");
  }
  if (context.radius === "C5") {
    warnings.push("C5 is exceptional and was not expected as default");
  }

  const decision: RoutingDecision = {
    schema: "uads.routing-decision",
    schemaVersion: "0.2.0",
    routingDecisionId,
    projectId: input.projectId,
    createdAt: now,
    scopeClass: scope.scopeClass,
    scopeReasons: scope.reasons,
    riskLevel: risk.level,
    riskReasons: risk.reasons,
    domains,
    specialists: specialistPlan.selected.map((item) => item.specialistId),
    assuranceSpecialists: specialistPlan.assurance.map((item) => item.specialistId),
    specialistSelectionPlanId: specialistPlan.selectionPlanId,
    specialistSelectionDigest: specialistPlan.selectionDigest,
    specialistRegistryDigest: specialistPlan.registryDigest,
    specialistPolicyDigest: specialistPlan.policyDigest,
    specialistChangeDigest: specialistPlan.changeDigest,
    specialistImpactDigest: specialistPlan.impactDigest,
    specialistGateContractDigest: specialistPlan.gateContractDigest,
    specialistRiskSignals: input.intake.riskSignals,
    specialistDependencySignals: specialistRoutingInput.dependencySignals ?? null,
    gates,
    contextRadius: context.radius,
    contextReason: context.reason,
    capabilityClass,
    orderConstraints: [
      ...specialistDependencies,
    ],
    stopConditions: [
      "missing required evidence",
      "approval-gated action requested",
      "hard token budget exceeded",
    ],
    warnings,
  };

  const nextAction = specialistPlan.status === "BLOCKED"
    ? `Routing blocked: ${specialistPlan.blockedReasonCodes.join(", ") || "unmet specialist coverage"}. Resolve the selection plan before dispatch.`
    : "Execute only NECESSARY scope with selected specialists, collect required evidence, then independent review.";

  const workOrder: WorkOrder = {
    schema: "uads.work-order",
    schemaVersion: "0.2.0",
    workOrderId,
    projectId: input.projectId,
    title: titleFromObjective(input.intake.objective),
    objective: input.intake.objective,
    status: specialistPlan.status === "BLOCKED" ? "blocked" : "planned",
    createdAt: now,
    updatedAt: now,
    intakeRef: `intake:${sha256Hex(input.intake.objective).slice(0, 12)}`,
    routingDecisionId,
    scopeClass: scope.scopeClass,
    includedScope: scoped.necessary,
    outOfScope: scope.outOfScope,
    recommendations: scope.recommendations,
    riskLevel: risk.level,
    riskReasons: risk.reasons,
    constraints: input.intake.constraints,
    requestedArtifacts: input.intake.requestedArtifacts,
    destructiveSignals: input.intake.destructiveSignals,
    domains: domainIds,
    affectedAreas: input.intake.affectedAreas,
    specialists: specialistPlan.selected.map((item) => item.specialistId),
    assuranceReviewers: specialistPlan.assurance.map((item) => item.specialistId),
    specialistSelectionPlanId: specialistPlan.selectionPlanId,
    specialistSelectionDigest: specialistPlan.selectionDigest,
    specialistRegistryDigest: specialistPlan.registryDigest,
    specialistPolicyDigest: specialistPlan.policyDigest,
    specialistChangeDigest: specialistPlan.changeDigest,
    specialistImpactDigest: specialistPlan.impactDigest,
    specialistGateContractDigest: specialistPlan.gateContractDigest,
    specialistRiskSignals: input.intake.riskSignals,
    specialistDependencySignals: specialistRoutingInput.dependencySignals ?? null,
    specialistAssignments: specialistPlan.assignments,
    qualityGates: gates.map((gate) => gate.id),
    contextRadius: context.radius,
    tokenBudget: {
      ...budget,
      capabilityClass,
      cachePreference: input.mapReused ? "prefer-cache" : "refresh",
      expansionPolicy: "expand one radius level only when evidence shows missing context",
    },
    dependencies: decision.orderConstraints,
    acceptanceCriteria,
    requiredEvidence: gates.map((gate) => gateEvidence(gate.id)),
    stopConditions: decision.stopConditions,
    autonomyBoundary: boundary,
    nextAction,
  };

  const contextPlan: ContextPlan = {
    radius: context.radius,
    reason: context.reason,
    candidateAreas: selectContextCandidates({
      radius: context.radius,
      intake: input.intake,
      map: input.map,
    }),
    reusableArtifacts: [
      "sidecar://index/repository-map.json",
      "sidecar://state/current.json",
      `sidecar://decisions/${routingDecisionId}.json`,
    ],
    contextPackId: null,
    impactReportId: null,
    indexDigest: null,
  };

  const checkpoint: Checkpoint = {
    schema: "uads.checkpoint",
    schemaVersion: "0.2.0",
    checkpointId,
    projectId: input.projectId,
    workOrderId,
    routingDecisionId,
    createdAt: now,
    updatedAt: now,
    phase: "plan",
    status: specialistPlan.status === "BLOCKED" ? "blocked" : "in_progress",
    completedSteps: ["intake", "classify", "plan"],
    nextAction,
    blockers: [...specialistPlan.unmetCoverage, ...specialistPlan.conflicts],
    evidenceRefs: [],
    repositoryMapDigest: input.map.digest,
    contextPlanRef: "sidecar://context/plan.json",
    resumeCursor: "plan-complete:await-implementation",
  };

  let persisted = persistPlan({
    paths: input.paths,
    workOrder,
    decision,
    checkpoint,
    contextPlan,
    schemaRoot: input.schemaRoot,
  });

  if (input.repoRoot) {
    try {
      const intel = buildImpactAndPack({
        repoRoot: input.repoRoot,
        projectId: input.projectId,
        paths: input.paths,
        radius: context.radius,
        workOrder: persisted.workOrder,
        schemaRoot: input.schemaRoot,
      });
      persisted = persistPlan({
        paths: input.paths,
        workOrder: persisted.workOrder,
        decision: persisted.decision,
        checkpoint: persisted.checkpoint,
        contextPlan: {
          ...persisted.contextPlan,
          contextPackId: intel.pack.contextPackId,
          impactReportId: intel.report.impactReportId,
          indexDigest: intel.pack.indexDigest,
          reusableArtifacts: [
            ...persisted.contextPlan.reusableArtifacts,
            `sidecar://context/packs/${intel.pack.contextPackId}.json`,
          ],
        },
        schemaRoot: input.schemaRoot,
      });
      const specialistDependencySignals = dependencySignalsFromImpact(intel.report);
      specialistPlan = selectSpecialistPlan({
        ...specialistRoutingInput,
        impactDigest: intel.pack.indexDigest,
        dependencySignals: specialistDependencySignals,
      });
      persisted = persistPlan({
        paths: input.paths,
        workOrder: {
          ...persisted.workOrder,
          status: specialistPlan.status === "BLOCKED" ? "blocked" : persisted.workOrder.status,
          specialists: specialistPlan.selected.map((item) => item.specialistId),
          assuranceReviewers: specialistPlan.assurance.map((item) => item.specialistId),
          specialistSelectionPlanId: specialistPlan.selectionPlanId,
          specialistSelectionDigest: specialistPlan.selectionDigest,
          specialistRegistryDigest: specialistPlan.registryDigest,
          specialistPolicyDigest: specialistPlan.policyDigest,
          specialistChangeDigest: specialistPlan.changeDigest,
          specialistImpactDigest: specialistPlan.impactDigest,
          specialistGateContractDigest: specialistPlan.gateContractDigest,
          specialistRiskSignals: specialistRoutingInput.riskSignals,
          specialistDependencySignals: specialistDependencySignals,
          specialistAssignments: specialistPlan.assignments,
          nextAction: specialistPlan.status === "BLOCKED"
            ? `Routing blocked: ${specialistPlan.blockedReasonCodes.join(", ") || "unmet specialist coverage"}. Resolve the selection plan before dispatch.`
            : persisted.workOrder.nextAction,
        },
        decision: {
          ...persisted.decision,
          specialists: specialistPlan.selected.map((item) => item.specialistId),
          assuranceSpecialists: specialistPlan.assurance.map((item) => item.specialistId),
          specialistSelectionPlanId: specialistPlan.selectionPlanId,
          specialistSelectionDigest: specialistPlan.selectionDigest,
          specialistRegistryDigest: specialistPlan.registryDigest,
          specialistPolicyDigest: specialistPlan.policyDigest,
          specialistChangeDigest: specialistPlan.changeDigest,
          specialistImpactDigest: specialistPlan.impactDigest,
          specialistGateContractDigest: specialistPlan.gateContractDigest,
          specialistRiskSignals: specialistRoutingInput.riskSignals,
          specialistDependencySignals: specialistDependencySignals,
        },
        checkpoint: {
          ...persisted.checkpoint,
          status: specialistPlan.status === "BLOCKED" ? "blocked" : persisted.checkpoint.status,
          blockers: [...specialistPlan.unmetCoverage, ...specialistPlan.conflicts],
        },
        contextPlan: persisted.contextPlan,
        schemaRoot: input.schemaRoot,
      });
      persistSpecialistSelectionPlan(input.paths, specialistPlan, input.schemaRoot);
    } catch {
      // Planning remains valid if intelligence cannot yet be built.
    }
  }

  const failure = readFailureStatusFields(input.paths, input.schemaRoot);
  const modelPlan = routeAndPersistModelExecutionPlan({
    paths: input.paths,
    projectId: input.projectId,
    workOrder: persisted.workOrder,
    contextPack: readCurrentContextPack(input.paths, input.schemaRoot),
    failureSignals: { loopDetected: failure.loopDetected },
    schemaRoot: input.schemaRoot,
  });
  persistSpecialistSelectionPlan(input.paths, specialistPlan, input.schemaRoot);

  return {
    workOrder: persisted.workOrder,
    decision: persisted.decision,
    checkpoint: persisted.checkpoint,
    contextPlan: persisted.contextPlan,
    map: input.map,
    mapReused: input.mapReused,
    modelPlan,
    specialistPlan,
  };
}

export function runResume(input: { cwd?: string; uadsHome?: string }): ResumePacket {
  const cwd = input.cwd ?? process.cwd();
  const schemaRoot = findPackageRoot();
  const ctx = resolveProjectContext(cwd, input.uadsHome);
  const state = inspectCurrentState(ctx.paths);
  if (!state.valid) {
    const recovered = readCurrentCheckpoint(ctx.paths);
    return {
      projectId: ctx.projectId,
      workOrderId: recovered?.workOrderId ?? null,
      phase: recovered?.phase ?? null,
      status: "invalid-state",
      objective: null,
      completedSteps: recovered?.completedSteps ?? [],
      scopeClass: null,
      riskLevel: null,
      specialists: [],
      gates: [],
      repositoryMapDigest: recovered?.repositoryMapDigest ?? null,
      contextPlanRef: recovered?.contextPlanRef ?? null,
      evidenceRefs: recovered?.evidenceRefs ?? [],
      blockers: [`invalid current checkpoint: ${state.error}`],
      nextAction: "Do not guess. Restore or recreate a valid plan from structured intake.",
      invalidState: state.error,
    };
  }

  const checkpoint = readCurrentCheckpoint(ctx.paths);
  if (!checkpoint || !checkpoint.workOrderId) {
    return {
      projectId: ctx.projectId,
      workOrderId: null,
      phase: checkpoint?.phase ?? null,
      status: checkpoint?.status ?? "none",
      objective: null,
      completedSteps: checkpoint?.completedSteps ?? [],
      scopeClass: null,
      riskLevel: null,
      specialists: [],
      gates: [],
      repositoryMapDigest: checkpoint?.repositoryMapDigest ?? null,
      contextPlanRef: checkpoint?.contextPlanRef ?? null,
      evidenceRefs: checkpoint?.evidenceRefs ?? [],
      blockers: [],
      nextAction: "No Work Order exists. Run uads plan --intake <file> or uads plan --request \"...\".",
    };
  }

  const workOrder = readWorkOrder(ctx.paths, checkpoint.workOrderId);
  const decision = checkpoint.routingDecisionId
    ? readRoutingDecision(ctx.paths, checkpoint.routingDecisionId)
    : null;
  const execution = loadExecutionView({ cwd, uadsHome: input.uadsHome });
  const contextPlan = readContextPlan(ctx.paths);
  let specialistSelectionStatus: string | null = null;
  let specialistSelectionBlocker: string | null = null;
  if (workOrder) {
    try {
      if (!decision || !contextPlan) {
        throw new Error("routing decision or context plan missing for specialist revalidation");
      }
      const specialistPlan = assertSpecialistSelectionBoundToWorkOrder(
        ctx.paths,
        workOrder,
        schemaRoot,
        { routing: decision, contextPlan },
      );
      specialistSelectionStatus = specialistPlan.status;
    } catch (error) {
      specialistSelectionStatus = "blocked-stale-or-mismatch";
      specialistSelectionBlocker = `specialist selection revalidation failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const failure = readFailureStatusFields(ctx.paths);
  const cache = readCacheStatusCompact(ctx.paths, ctx.projectId);
  const cost = readCostStatusCompact(ctx.paths, ctx.projectId);
  const modelPlan = (() => {
    try {
      return readCurrentModelExecutionPlan(ctx.paths, schemaRoot);
    } catch {
      return null;
    }
  })();
  const blockers = [
    ...(execution.blockers.length > 0 ? execution.blockers : checkpoint.blockers),
    ...(specialistSelectionBlocker ? [specialistSelectionBlocker] : []),
  ];
  return {
    projectId: ctx.projectId,
    workOrderId: checkpoint.workOrderId,
    phase: checkpoint.phase,
    status: specialistSelectionBlocker ? "blocked" : execution.executionRunId ? String(execution.status) : checkpoint.status,
    objective: workOrder?.objective ?? null,
    completedSteps: checkpoint.completedSteps,
    scopeClass: workOrder?.scopeClass ?? decision?.scopeClass ?? null,
    riskLevel: workOrder?.riskLevel ?? decision?.riskLevel ?? null,
    specialists: workOrder?.specialists ?? decision?.specialists ?? [],
    gates: workOrder?.qualityGates ?? decision?.gates.map((gate) => gate.id) ?? [],
    repositoryMapDigest: checkpoint.repositoryMapDigest,
    contextPlanRef: checkpoint.contextPlanRef,
    evidenceRefs: checkpoint.evidenceRefs,
    blockers,
    nextAction: specialistSelectionBlocker
      ? "Specialist selection is stale or mismatched. Re-route the current Work Order before dispatch."
      : execution.executionRunId
        ? execution.nextAction
        : checkpoint.nextAction,
    executionRunId: execution.executionRunId,
    attempt: execution.attempt,
    changeDigest: execution.changeDigest,
    pendingGates: execution.pendingGates,
    failedGates: execution.failedGates,
    requiredReviewers: execution.requiredReviewers,
    completedReviewers: execution.completedReviewers,
    contextPackId: contextPlan?.contextPackId ?? null,
    impactReportId: contextPlan?.impactReportId ?? null,
    indexDigest: contextPlan?.indexDigest ?? null,
    activeFailureId: failure.activeFailureId,
    failureSignaturePrefix: failure.failureSignaturePrefix,
    diagnosisStatus: failure.diagnosisStatus,
    loopDetected: failure.loopDetected,
    recommendedDiagnosticRadius: failure.recommendedDiagnosticRadius,
    cacheReusableRecords: cache.reusableRecords,
    costBudgetStatus: cost.budgetStatus,
    qptRatio: cost.qptRatio,
    modelPlanId: modelPlan?.planId ?? null,
    modelRoutingStatus: modelPlan?.status ?? null,
    selectedProfileId: modelPlan?.selectedProfileId ?? null,
    modelSelectionMode: modelPlan?.selectionMode ?? null,
    specialistSelectionPlanId: workOrder?.specialistSelectionPlanId ?? null,
    specialistSelectionStatus: specialistSelectionStatus ?? (() => {
      try { return readCurrentSpecialistSelectionPlan(ctx.paths, schemaRoot)?.status ?? null; } catch { return "blocked-corrupt-or-unavailable"; }
    })(),
  };
}
