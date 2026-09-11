import fs from "node:fs";
import path from "node:path";
import { atomicWriteFile, readJsonIfValid } from "../lib/atomic-write.js";
import { isSensitiveDataFile } from "../lib/exclusions.js";
import { readGitSummary } from "../lib/git.js";
import { isPathInside, sha256Hex } from "../lib/hash.js";
import { sanitizeOperationalText, sanitizeOperationalValue } from "../lib/safe-persist.js";
import { sanitizeReviewText } from "../lib/secrets.js";
import { findPackageRoot } from "../lib/version.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  computeLiveChangeDigest,
  describeSymlinkChange,
  isWorktreeDirty,
  listChangedEntries,
} from "./change-digest.js";
import { selectContextCandidates } from "./context-candidates.js";
import {
  listEvidenceRecords,
  listReviewRecords,
  persistEvidenceRecord,
  persistExecutionPacket,
  persistExecutionRun,
  persistReviewPacket,
  persistReviewRecord,
  readCurrentExecutionRun,
  readExecutionPacket,
  readRequiredExecutionPacket,
} from "./execution-persist.js";
import { assertActiveExecutionConsistency } from "./execution-integrity.js";
import { collectFailureSnapshot, readFailureCursor } from "./failure-persist.js";
import { applyEligibleCacheHits, populateCacheFromEvidence } from "./cache-engine.js";
import { validateCacheReuseEvidence } from "./cache-integrity.js";
import { collectCacheCostSnapshot } from "./cache-cost-snapshot.js";
import { CostBudgetError, enforceTokenBudget, noteGovernorEvent, refreshQptSnapshot } from "./cost-governor.js";
import { markVerifiedResolution } from "./failure-memory.js";
import { buildImpactAndPack, currentOrRefreshIndex, publishImpactAndPack } from "./intelligence.js";
import { readCurrentContextPack } from "./intelligence-persist.js";
import type {
  ChangeSet,
  EvidenceKind,
  EvidenceRecord,
  EvidenceRuntimeStatus,
  ExecutionPacket,
  ExecutionResumeView,
  ExecutionRun,
  GateRuntimeStatus,
  GateStateSnapshot,
  ReviewFinding,
  ReviewPacket,
  ReviewRecord,
  ReviewVerdict,
  ScopeViolation,
} from "./execution-types.js";
import { gateDef, isKnownGateId, isReviewGate, REVIEW_GATE_ROLES, type GateDef } from "./gates.js";
import { newPrefixedId } from "./ids.js";
import {
  InvalidOrchestrationStateError,
  persistPlan,
  readContextPlan,
  readCurrentCheckpoint,
  readRoutingDecision,
  readWorkOrder,
} from "./persist.js";
import { resolveProjectContext } from "./project-context.js";
import { assertSpecialistSelectionBoundToWorkOrder, SpecialistSelectionPersistenceError } from "./specialist-persist.js";
import { assertSafeRelativeProjectPath } from "./safe-path.js";
import { classifyChangedPath } from "./scope-guard.js";
import { loadModelProfileRegistry } from "./model-registry.js";
import { computeWorkOrderRoutingDigest, routeModel } from "./model-router.js";
import { isModelExecutionPlanCurrent, persistModelExecutionPlan, readCurrentModelExecutionPlan } from "./model-persist.js";
import { MODEL_ROUTING_POLICY_DIGEST } from "./model-router.js";
import {
  computeRuntimeIdentityDigest,
  conservativeRuntimeCapabilitySnapshot,
  persistRuntimeCapabilitySnapshot,
} from "./model-runtime.js";
import type { ModelExecutionPlan, RuntimeCapabilitySnapshot } from "./model-types.js";
import type { Checkpoint, ContextPlan, ContextRadius, RepositoryMap, WorkOrder } from "./types.js";
import { IMPLEMENTER_ROLE, INDEPENDENT_REVIEWER_ROLE } from "./types.js";
import { HOST_ADAPTER_IDS, type HostAdapterId } from "../adapters/host-adapter-types.js";
import { readHostCapabilityProjection } from "../adapters/host-capability-consumer.js";
import { getHostAdapterStatePath } from "../adapters/host-adapter-install.js";
import {
  ASSURANCE_REASON_CODES,
  assuranceRoleGateMapping,
  evaluateAssurancePolicy,
  isRecognizedAssuranceRole,
} from "./assurance-policy.js";

export class ExecutionBlockedError extends Error {
  readonly code = "BLOCKED";

  constructor(
    message: string,
    readonly blockers: string[] = [],
  ) {
    super(message);
    this.name = "ExecutionBlockedError";
  }
}

const RADIUS_ORDER: ContextRadius[] = ["C0", "C1", "C2", "C3", "C4", "C5"];

function nowIso(): string {
  return new Date().toISOString();
}

function schemaRootOf(): string {
  return findPackageRoot();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function touchRun(run: ExecutionRun, patch: Partial<ExecutionRun>): ExecutionRun {
  return { ...run, ...patch, updatedAt: nowIso() };
}

function requiresImplementation(workOrder: WorkOrder): boolean {
  return workOrder.specialists.includes(IMPLEMENTER_ROLE);
}

function resolveImplementerSession(
  workOrder: WorkOrder,
  existing: ExecutionRun | null,
  providedRaw?: string,
): string | null {
  const provided = providedRaw ? sanitizeOperationalText(providedRaw) : "";
  const bound = existing && existing.workOrderId === workOrder.workOrderId ? existing.implementerSessionId : null;
  if (requiresImplementation(workOrder)) {
    if (bound) {
      if (!provided) {
        throw new ExecutionBlockedError("dispatch requires the bound implementer session", [
          "missing implementer session",
        ]);
      }
      if (provided !== bound) {
        throw new ExecutionBlockedError("cannot rebind implementer session on an active run", [
          "implementer session mismatch",
        ]);
      }
      return bound;
    }
    if (!provided) {
      throw new ExecutionBlockedError("dispatch requires a non-empty implementer session", [
        "missing implementer session",
      ]);
    }
    return provided;
  }
  if (bound) {
    if (provided && provided !== bound) {
      throw new ExecutionBlockedError("cannot rebind implementer session on an active run", [
        "implementer session mismatch",
      ]);
    }
    return bound;
  }
  return provided || null;
}

export function buildChangeSet(
  repoRoot: string,
  workOrder: WorkOrder,
  contextPlan: ContextPlan | null,
): ChangeSet {
  const entries = listChangedEntries(repoRoot);
  const relativePaths = [...new Set(entries.flatMap((entry) => [entry.path, entry.origPath].filter((value): value is string => Boolean(value))))].sort(
    (a, b) => a.localeCompare(b),
  );
  const files = relativePaths.map((relative) => {
    const abs = path.resolve(repoRoot, relative);
    if (fs.existsSync(abs) && fs.lstatSync(abs).isSymbolicLink()) {
      const symlink = describeSymlinkChange(repoRoot, relative);
      if (symlink.blocked) {
        return {
          path: relative,
          classification: "sensitive" as const,
          reason: symlink.reason ?? "unsupported symlink",
        };
      }
    }
    const classified = classifyChangedPath(relative, workOrder, contextPlan);
    return { path: relative, classification: classified.classification, reason: classified.reason };
  });
  const violations: ScopeViolation[] = files.flatMap((file) =>
    file.classification === "out-of-scope" || file.classification === "sensitive"
      ? [{ path: file.path, classification: file.classification, reason: file.reason }]
      : [],
  );
  return {
    digest: computeLiveChangeDigest(repoRoot, entries),
    files,
    violations,
  };
}

function evidenceSatisfiesGate(record: EvidenceRecord, def: GateDef): boolean {
  if (record.status !== "PASS") {
    return false;
  }
  if (!def.allowedEvidenceKinds.includes(record.kind)) {
    return false;
  }
  if (record.source === "cache-reuse") {
    if (
      !record.sourceCacheRecordId ||
      !record.sourceEvidenceId ||
      !record.cacheDecisionId ||
      !record.reuseProofDigest ||
      !record.gateReuseContractIdentity
    ) {
      return false;
    }
  }
  if (def.contractKind === "command" || record.kind === "command") {
    return (
      record.kind === "command" &&
      Boolean(record.command) &&
      record.exitCode === 0 &&
      Boolean(record.outputRef) &&
      Boolean(record.outputDigest)
    );
  }
  if (record.kind === "file") {
    return Boolean(record.fileRef) && Boolean(record.fileDigest);
  }
  if (record.kind === "invariant") {
    return Boolean((record.outputRef && record.outputDigest) || (record.fileRef && record.fileDigest));
  }
  return false;
}

function reviewGateState(
  gateId: string,
  digest: string | null,
  reviews: ReviewRecord[],
  identity?: { projectId: string; workOrderId?: string | null; executionRunId?: string | null },
): GateStateSnapshot {
  const role = REVIEW_GATE_ROLES[gateId];
  if (!digest || !role) {
    return { gateId, status: "PENDING", evidenceId: null };
  }
  const current = reviews.filter(
    (review) =>
      review.changeDigest === digest &&
      review.reviewerRole === role &&
      (!identity ||
        (review.projectId === identity.projectId &&
          (identity.workOrderId === undefined || review.workOrderId === identity.workOrderId) &&
          (identity.executionRunId === undefined || review.executionRunId === identity.executionRunId))),
  );
  if (current.some((review) => review.verdict === "APPROVED" && review.findings.some((finding) => finding.severity === "CRITICAL" || finding.severity === "HIGH"))) {
    return { gateId, status: "FAIL", evidenceId: null };
  }
  if (current.some((review) => review.verdict === "BLOCKED")) {
    return { gateId, status: "BLOCKED", evidenceId: null };
  }
  if (current.some((review) => review.verdict === "CORRECTION_NEEDED")) {
    return { gateId, status: "FAIL", evidenceId: null };
  }
  if (current.some((review) => review.verdict === "APPROVED")) {
    return { gateId, status: "PASS", evidenceId: null };
  }
  return { gateId, status: "PENDING", evidenceId: null };
}

export type GateStateValidationContext = {
  paths: UadsPaths;
  projectId: string;
  workOrderId?: string | null;
  executionRunId?: string | null;
  schemaRoot?: string;
};

export function deriveGateStates(input: {
  selectedGates: string[];
  digest: string | null;
  evidence: EvidenceRecord[];
  reviews: ReviewRecord[];
  validation?: GateStateValidationContext;
}): GateStateSnapshot[] {
  return input.selectedGates.map((gateId) => {
    if (isReviewGate(gateId)) {
      return reviewGateState(gateId, input.digest, input.reviews, input.validation);
    }
    const def = gateDef(gateId);
    const current = input.evidence.filter(
      (item) =>
        item.gateId === gateId &&
        item.changeDigest === input.digest &&
        (!input.validation ||
          (item.projectId === input.validation.projectId &&
            (input.validation.workOrderId === undefined || item.workOrderId === input.validation.workOrderId) &&
            (input.validation.executionRunId === undefined || item.executionRunId === input.validation.executionRunId))),
    );
    if (current.some((item) => item.status === "BLOCKED")) {
      const blocked = current.find((item) => item.status === "BLOCKED");
      return { gateId, status: "BLOCKED", evidenceId: blocked?.evidenceId ?? null };
    }
    if (current.some((item) => item.status === "FAIL")) {
      const failed = current.find((item) => item.status === "FAIL");
      return { gateId, status: "FAIL", evidenceId: failed?.evidenceId ?? null };
    }
    if (!def) {
      return { gateId, status: "PENDING" as GateRuntimeStatus, evidenceId: null };
    }
    const passing = [...current].reverse().find((item) => {
      if (!evidenceSatisfiesGate(item, def)) {
        return false;
      }
      if (item.source === "cache-reuse") {
        if (!input.validation) {
          return false;
        }
        const provenance = validateCacheReuseEvidence({
          paths: input.validation.paths,
          projectId: input.validation.projectId,
          gateId,
          changeDigest: input.digest,
          workOrderId: input.validation.workOrderId,
          executionRunId: input.validation.executionRunId,
          record: item,
          schemaRoot: input.validation.schemaRoot,
        });
        return provenance.valid;
      }
      return true;
    });
    if (passing) {
      return { gateId, status: "PASS", evidenceId: passing.evidenceId };
    }
    return { gateId, status: "PENDING" as GateRuntimeStatus, evidenceId: null };
  });
}

export function buildExecutionResumeView(
  run: ExecutionRun | null,
  evidence: EvidenceRecord[] = [],
  reviews: ReviewRecord[] = [],
  paths?: UadsPaths,
): ExecutionResumeView {
  if (!run) {
    return {
      executionRunId: null,
      attempt: null,
      phase: null,
      status: "none",
      changeDigest: null,
      pendingGates: [],
      failedGates: [],
      requiredReviewers: [],
      completedReviewers: [],
      blockers: [],
      nextAction: "No execution run. Run uads dispatch after a valid plan.",
    };
  }
  const gates = deriveGateStates({
    selectedGates: run.selectedGates,
    digest: run.currentChangeDigest,
    evidence,
    reviews,
    validation: paths
      ? {
          paths,
          projectId: run.projectId,
          workOrderId: run.workOrderId,
          executionRunId: run.executionRunId,
        }
      : undefined,
  });
  const completedReviewers = unique(
    reviews
      .filter((review) => review.changeDigest === run.currentChangeDigest && review.verdict === "APPROVED")
      .map((review) => review.reviewerRole),
  );
  return {
    executionRunId: run.executionRunId,
    attempt: run.attempt,
    phase: run.phase,
    status: run.status,
    changeDigest: run.currentChangeDigest,
    pendingGates: gates.filter((gate) => gate.status === "PENDING").map((gate) => gate.gateId),
    failedGates: gates.filter((gate) => gate.status === "FAIL" || gate.status === "BLOCKED").map((gate) => gate.gateId),
    requiredReviewers: run.requiredReviewers,
    completedReviewers,
    blockers: run.blockers,
    nextAction: run.nextAction,
  };
}

function buildPacket(run: ExecutionRun, workOrder: WorkOrder): ExecutionPacket {
  return {
    schema: "uads.execution-packet",
    schemaVersion: "0.3.0",
    executionRunId: run.executionRunId,
    workOrderId: workOrder.workOrderId,
    objective: workOrder.objective,
    includedScope: workOrder.includedScope,
    outOfScope: workOrder.outOfScope,
    riskLevel: workOrder.riskLevel,
    domains: workOrder.domains,
    contextRadius: run.contextRadius,
    contextCandidates: run.contextCandidates,
    specialists: workOrder.specialists,
    assuranceReviewers: workOrder.assuranceReviewers,
    specialistSelectionPlanId: workOrder.specialistSelectionPlanId ?? null,
    specialistSelectionDigest: workOrder.specialistSelectionDigest ?? null,
    specialistAssignments: workOrder.specialistAssignments,
    selectedGates: run.selectedGates,
    acceptanceCriteria: workOrder.acceptanceCriteria,
    requiredEvidence: workOrder.requiredEvidence,
    safeAutonomousActions: workOrder.autonomyBoundary.safeAutonomous,
    approvalGatedActions: workOrder.autonomyBoundary.requiresApproval,
    stopConditions: [
      ...workOrder.stopConditions,
      "Begin from Work Order, checkpoint, compact repository map, Context Pack, and context candidates before source files.",
    ],
    baselineGitHead: run.baseline.gitHead,
    nextAction: run.nextAction,
    contextPackId: run.contextPackId ?? null,
    impactReportId: run.impactReportId ?? null,
    indexDigest: run.indexDigest ?? null,
    modelPlanId: run.modelPlanId ?? null,
    selectedProfileId: run.selectedProfileId ?? null,
    selectedProviderId: run.selectedProviderId ?? null,
    selectedModelId: run.selectedModelId ?? null,
    selectionMode: run.selectionMode ?? "host-managed",
    modelExecutionStrategy: run.modelExecutionStrategy,
  };
}

function assertCurrentSpecialistSelectionForAssurance(
  paths: UadsPaths,
  workOrder: WorkOrder,
  routing: ReturnType<typeof readRoutingDecision>,
  contextPlan: ContextPlan,
  schemaRoot: string,
): ReturnType<typeof assertSpecialistSelectionBoundToWorkOrder> {
  try {
    return assertSpecialistSelectionBoundToWorkOrder(paths, workOrder, schemaRoot, { routing, contextPlan });
  } catch (error) {
    throw new ExecutionBlockedError(
      `assurance requires current specialist selection: ${error instanceof Error ? error.message : String(error)}`,
      [ASSURANCE_REASON_CODES.SPECIALIST_SELECTION_INVALID],
    );
  }
}

function ensureCurrentModelPlan(input: {
  ctx: ReturnType<typeof resolveProjectContext>;
  workOrder: WorkOrder;
  contextPlan: ContextPlan;
  schemaRoot: string;
  changeDigest: string | null;
  runtime: RuntimeCapabilitySnapshot;
}): ModelExecutionPlan {
  const registry = loadModelProfileRegistry(input.ctx.paths, input.schemaRoot);
  const runtime = input.runtime;
  const current = readCurrentModelExecutionPlan(input.ctx.paths, input.schemaRoot);
  const contextPack = input.contextPlan.contextPackId
    ? readCurrentContextPack(input.ctx.paths, input.schemaRoot)
    : null;
  const contextHintsCurrent =
    current &&
    current.cacheHints.staticLayerDigest === (contextPack?.staticLayerDigest ?? null) &&
    current.cacheHints.semiStableLayerDigest === (contextPack?.semiStableLayerDigest ?? null) &&
    current.cacheHints.dynamicLayerDigest === (contextPack?.dynamicLayerDigest ?? null);
  if (
    current &&
    contextHintsCurrent &&
    isModelExecutionPlanCurrent({
      plan: current,
      projectId: input.ctx.projectId,
      workOrderId: input.workOrder.workOrderId,
      workOrderDigest: computeWorkOrderRoutingDigest(input.workOrder),
      registryDigest: registry.registryDigest,
      runtimeIdentityDigest: runtime.identityDigest,
      policyDigest: MODEL_ROUTING_POLICY_DIGEST,
       changeDigest: input.changeDigest,
    })
  ) {
    return current;
  }
  const next = routeModel({
    projectId: input.ctx.projectId,
    workOrder: input.workOrder,
    registry,
    runtime,
    contextPack,
    previousPlan: current,
    changeDigest: input.changeDigest,
  });
  return persistModelExecutionPlan(input.ctx.paths, next, input.schemaRoot);
}

function writeCheckpoint(paths: UadsPaths, checkpoint: Checkpoint, workOrder: WorkOrder, contextPlan: ContextPlan, schemaRoot?: string): Checkpoint {
  const routing = workOrder.routingDecisionId
    ? readRoutingDecision(paths, workOrder.routingDecisionId, schemaRoot)
    : null;
  if (!routing) {
    throw new InvalidOrchestrationStateError("routing decision missing for checkpoint update");
  }
  return persistPlan({
    paths,
    workOrder,
    decision: routing,
    checkpoint,
    contextPlan,
    schemaRoot,
  }).checkpoint;
}

function resolveDispatchRuntimeCapability(input: {
  paths: UadsPaths;
  adapterId?: string;
  hostHome?: string;
  schemaRoot: string;
}): RuntimeCapabilitySnapshot {
  const requestedAdapter = typeof input.adapterId === "string" ? input.adapterId.trim() : "";
  if (requestedAdapter.length === 0) {
    // CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED: absent governed adapter identity keeps
    // conservative all-UNKNOWN host truth and capability-gated routing fail-closed.
    return conservativeRuntimeCapabilitySnapshot();
  }
  if (!(HOST_ADAPTER_IDS as readonly string[]).includes(requestedAdapter)) {
    throw new ExecutionBlockedError("dispatch requires a governed host adapter identity", [
      `CAPABILITY_TRUTH_ADAPTER_UNKNOWN:${requestedAdapter}`,
    ]);
  }
  const projection = readHostCapabilityProjection({
    adapterId: requestedAdapter as HostAdapterId,
    ...(input.hostHome ? { detectionInput: { hostHome: input.hostHome } } : {}),
    paths: input.paths,
    schemaRoot: input.schemaRoot,
  });
  if (projection.detection.status === "BLOCKED") {
    throw new ExecutionBlockedError("dispatch adapter identity fails host detection validation", [
      "CAPABILITY_TRUTH_ADAPTER_BLOCKED",
      ...projection.detection.reasonCodes,
    ]);
  }
  const unsigned: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    ...projection.runtime,
    runtimeId: "generic-runtime",
  };
  return { ...unsigned, identityDigest: computeRuntimeIdentityDigest(unsigned) };
}

export function runDispatch(input: {
  cwd?: string;
  uadsHome?: string;
  session?: string;
  adapterId?: string;
  hostHome?: string;
}): { run: ExecutionRun; packet: ExecutionPacket; workOrder: WorkOrder } {
  const cwd = input.cwd ?? process.cwd();
  const schemaRoot = schemaRootOf();
  const ctx = resolveProjectContext(cwd, input.uadsHome);
  const checkpoint = readCurrentCheckpoint(ctx.paths, schemaRoot);
  if (!checkpoint?.workOrderId || !checkpoint.routingDecisionId) {
    throw new ExecutionBlockedError("cannot dispatch without a valid planned Work Order", [
      "missing planned Work Order",
    ]);
  }
  if (checkpoint.phase !== "plan" && checkpoint.phase !== "implement") {
    const existing = readCurrentExecutionRun(ctx.paths, schemaRoot);
    if (!existing || existing.workOrderId !== checkpoint.workOrderId) {
      throw new ExecutionBlockedError("cannot dispatch without a valid planned Work Order", [
        `checkpoint phase is ${checkpoint.phase}`,
      ]);
    }
  }

  const workOrder = readWorkOrder(ctx.paths, checkpoint.workOrderId, schemaRoot);
  const routing = readRoutingDecision(ctx.paths, checkpoint.routingDecisionId, schemaRoot);
  const contextPlan = readContextPlan(ctx.paths);
  if (!workOrder || workOrder.status === "draft") {
    throw new ExecutionBlockedError("cannot dispatch without a valid planned Work Order", [
      "Work Order missing or still draft",
    ]);
  }
  if (!routing || !contextPlan) {
    throw new InvalidOrchestrationStateError("routing decision or context plan missing");
  }
  const dirty = isWorktreeDirty(ctx.repoRoot);
  let currentSpecialistImpactDigest: string | null | undefined;
  if (!dirty && (contextPlan.indexDigest !== null && contextPlan.indexDigest !== undefined || workOrder.specialistImpactDigest)) {
    try {
      currentSpecialistImpactDigest = currentOrRefreshIndex({
        repoRoot: ctx.repoRoot,
        projectId: ctx.projectId,
        paths: ctx.paths,
        schemaRoot,
      }).state.indexDigest;
    } catch (error) {
      throw new ExecutionBlockedError(
        `specialist Context/Impact state is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        ["current specialist impact identity is unavailable"],
      );
    }
  }
  try {
    assertSpecialistSelectionBoundToWorkOrder(ctx.paths, workOrder, schemaRoot, {
      routing,
      contextPlan,
      ...(currentSpecialistImpactDigest !== undefined ? { currentImpactDigest: currentSpecialistImpactDigest } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SpecialistSelectionPersistenceError) {
      throw new ExecutionBlockedError(`specialist routing state is unavailable: ${message}`, [
        "specialist selection missing, blocked, stale, or cross-artifact mismatch",
      ]);
    }
    throw error;
  }

  const existing = readCurrentExecutionRun(ctx.paths, schemaRoot);
  if (dirty) {
    const blocked = existing && existing.workOrderId === workOrder.workOrderId
      ? touchRun(existing, {
          status: "blocked",
          phase: "stopped",
          blockers: unique([...existing.blockers, "pre-existing dirty worktree at dispatch"]),
          nextAction: "Clean or commit unrelated local changes, then re-run uads dispatch. UADS will not reset, stash, or delete user files.",
        })
      : null;
    if (blocked) {
      persistExecutionRun({ paths: ctx.paths, run: blocked, schemaRoot });
    }
    const nextCheckpoint: Checkpoint = {
      ...checkpoint,
      updatedAt: nowIso(),
      status: "blocked",
      blockers: unique([...checkpoint.blockers, "pre-existing dirty worktree at dispatch"]),
      nextAction: "Refuse dispatch: dirty worktree. Do not reset/stash/clean. Resolve ownership, then dispatch.",
    };
    writeCheckpoint(ctx.paths, nextCheckpoint, workOrder, contextPlan, schemaRoot);
    throw new ExecutionBlockedError("dirty worktree blocks dispatch", ["pre-existing dirty worktree at dispatch"]);
  }

  const modelRuntime = resolveDispatchRuntimeCapability({
    paths: ctx.paths,
    adapterId: input.adapterId,
    hostHome: input.hostHome,
    schemaRoot,
  });
  persistRuntimeCapabilitySnapshot(ctx.paths, modelRuntime, schemaRoot);

  let modelPlan: ModelExecutionPlan;
  try {
    modelPlan = ensureCurrentModelPlan({
      ctx,
      workOrder,
      contextPlan,
      schemaRoot,
      changeDigest: computeLiveChangeDigest(ctx.repoRoot),
      runtime: modelRuntime,
    });
  } catch (error) {
    throw new ExecutionBlockedError(
      `model routing state is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      ["model routing state missing or corrupt"],
    );
  }
  if (modelPlan.status === "BLOCKED") {
    const blocker = modelPlan.blockedReason ?? "NO_ELIGIBLE_MODEL";
    const nextCheckpoint: Checkpoint = {
      ...checkpoint,
      updatedAt: nowIso(),
      status: "blocked",
      blockers: unique([...checkpoint.blockers, blocker]),
      nextAction: "Register a compatible model profile or configure a runtime that proves the required capabilities, then re-route.",
    };
    writeCheckpoint(ctx.paths, nextCheckpoint, workOrder, contextPlan, schemaRoot);
    throw new ExecutionBlockedError("model routing blocked dispatch", [blocker]);
  }

  if (existing && existing.workOrderId === workOrder.workOrderId && existing.status === "completed") {
    throw new ExecutionBlockedError("execution run already completed", ["run already completed"]);
  }

  const implementerSessionId = resolveImplementerSession(workOrder, existing, input.session);

  if (
    existing &&
    existing.workOrderId === workOrder.workOrderId &&
    existing.status !== "failed" &&
    existing.status !== "blocked"
  ) {
    const packet = readExecutionPacket(ctx.paths, existing.executionRunId, schemaRoot) ?? buildPacket(existing, workOrder);
    return { run: existing, packet, workOrder };
  }

  const createdAt = nowIso();
  const executionRunId =
    existing && existing.workOrderId === workOrder.workOrderId
      ? existing.executionRunId
      : newPrefixedId("er", `${workOrder.workOrderId}:${createdAt}`);
  const gitHead = readGitSummary(ctx.repoRoot).head;
  let intel: ReturnType<typeof buildImpactAndPack>;
  try {
    intel = buildImpactAndPack({
      repoRoot: ctx.repoRoot,
      projectId: ctx.projectId,
      paths: ctx.paths,
      radius: workOrder.contextRadius,
      workOrder,
      executionRunId,
      expansionHistory: existing?.expansionHistory ?? [],
      schemaRoot,
      persist: false,
    });
    enforceTokenBudget({
      paths: ctx.paths,
      workOrder,
      estimatedTokens: intel.pack.estimatedTokens,
      subject: "dispatch",
      executionRunId,
      schemaRoot,
    });
    publishImpactAndPack({ paths: ctx.paths, report: intel.report, pack: intel.pack, schemaRoot });
  } catch (error) {
    if (error instanceof CostBudgetError) {
      throw new ExecutionBlockedError(error.message, ["hard token budget exceeded"]);
    }
    throw error;
  }

  // Dispatch changes the durable Work Order status from planned to active.
  // Rebind the model plan to that exact current identity before publishing the
  // execution run, so a later host handoff never relies on a pre-dispatch plan.
  modelPlan = ensureCurrentModelPlan({
    ctx,
    workOrder: { ...workOrder, status: "active", updatedAt: createdAt },
    contextPlan,
    schemaRoot,
    changeDigest: computeLiveChangeDigest(ctx.repoRoot),
    runtime: modelRuntime,
  });

  const run: ExecutionRun = {
    schema: "uads.execution-run",
    schemaVersion: "0.3.0",
    executionRunId,
    projectId: ctx.projectId,
    workOrderId: workOrder.workOrderId,
    routingDecisionId: workOrder.routingDecisionId,
    createdAt: existing?.createdAt ?? createdAt,
    updatedAt: createdAt,
    attempt: existing && existing.workOrderId === workOrder.workOrderId ? existing.attempt : 1,
    phase: "implement",
    status: "ready",
    baseline: {
      gitHead,
      dirty: false,
      capturedAt: createdAt,
    },
    contextRadius: workOrder.contextRadius,
    contextCandidates: contextPlan.candidateAreas,
    implementerRole: IMPLEMENTER_ROLE,
    implementerSessionId,
    requiredReviewers: unique(workOrder.assuranceReviewers),
    selectedGates: workOrder.qualityGates,
    currentChangeDigest: null,
    reviewedChangeDigest: null,
    changedFiles: [],
    scopeViolations: [],
    evidenceRefs: existing?.evidenceRefs ?? [],
    reviewRefs: existing?.reviewRefs ?? [],
    blockers: [],
    nextAction:
      "Invoke selected implementation specialist(s). Edit only NECESSARY in-scope files. Then run uads verify.",
    expansionHistory: existing?.expansionHistory ?? [],
    contextPackId: intel.pack.contextPackId,
    impactReportId: intel.report.impactReportId,
    indexDigest: intel.pack.indexDigest,
    modelPlanId: modelPlan.planId,
    selectedProfileId: modelPlan.selectedProfileId,
    selectedProviderId: modelPlan.selectedProviderId,
    selectedModelId: modelPlan.selectedModelId,
    selectionMode: modelPlan.selectionMode,
    modelExecutionStrategy: modelPlan.execution,
  };

  const packet = buildPacket(run, workOrder);
  persistExecutionRun({ paths: ctx.paths, run, packet, schemaRoot });

  const activeWorkOrder: WorkOrder = {
    ...workOrder,
    status: "active",
    updatedAt: createdAt,
    nextAction: packet.nextAction,
  };
  const nextCheckpoint: Checkpoint = {
    ...checkpoint,
    updatedAt: createdAt,
    phase: "implement",
    status: "in_progress",
    completedSteps: unique([...checkpoint.completedSteps, "dispatch"]),
    blockers: [],
    nextAction: packet.nextAction,
    resumeCursor: "implement:await-edits",
  };
  writeCheckpoint(
    ctx.paths,
    nextCheckpoint,
    activeWorkOrder,
    {
      ...contextPlan,
      contextPackId: intel.pack.contextPackId,
      impactReportId: intel.report.impactReportId,
      indexDigest: intel.pack.indexDigest,
      reusableArtifacts: unique([
        ...contextPlan.reusableArtifacts,
        `sidecar://context/packs/${intel.pack.contextPackId}.json`,
      ]),
    },
    schemaRoot,
  );
  return { run, packet, workOrder: activeWorkOrder };
}

function loadActive(input: { cwd?: string; uadsHome?: string }): {
  ctx: ReturnType<typeof resolveProjectContext>;
  schemaRoot: string;
  checkpoint: Checkpoint;
  workOrder: WorkOrder;
  contextPlan: ContextPlan;
  run: ExecutionRun;
} {
  const cwd = input.cwd ?? process.cwd();
  const schemaRoot = schemaRootOf();
  const ctx = resolveProjectContext(cwd, input.uadsHome);
  const checkpoint = readCurrentCheckpoint(ctx.paths, schemaRoot);
  const run = readCurrentExecutionRun(ctx.paths, schemaRoot);
  if (!checkpoint?.workOrderId || !run) {
    throw new ExecutionBlockedError("no active execution run", ["dispatch has not succeeded"]);
  }
  const workOrder = readWorkOrder(ctx.paths, checkpoint.workOrderId, schemaRoot);
  const contextPlan = readContextPlan(ctx.paths);
  const routing =
    checkpoint.routingDecisionId ? readRoutingDecision(ctx.paths, checkpoint.routingDecisionId, schemaRoot) : null;
  if (!workOrder || !contextPlan || !routing) {
    throw new InvalidOrchestrationStateError("Work Order, routing decision, or context plan missing");
  }
  const packet = readRequiredExecutionPacket(ctx.paths, run.executionRunId, schemaRoot);
  assertActiveExecutionConsistency({
    projectId: ctx.projectId,
    checkpoint,
    workOrder,
    routing,
    run,
    packet,
  });
  return { ctx, schemaRoot, checkpoint, workOrder, contextPlan, run };
}

export function runVerify(input: { cwd?: string; uadsHome?: string }): {
  run: ExecutionRun;
  changeSet: ChangeSet;
  pendingGates: string[];
} {
  const { ctx, schemaRoot, checkpoint, workOrder, contextPlan, run } = loadActive(input);
  if (run.status === "completed" || run.status === "failed") {
    throw new ExecutionBlockedError("execution run is not active", [`status is ${run.status}`]);
  }
  const canVerify =
    run.phase === "implement" ||
    run.phase === "verify" ||
    run.phase === "review" ||
    run.status === "correction_needed";
  if (!canVerify) {
    throw new ExecutionBlockedError("cannot verify before dispatch or after the run has stopped", [
      `phase is ${run.phase}`,
    ]);
  }

  const changeSet = buildChangeSet(ctx.repoRoot, workOrder, contextPlan);
  if (requiresImplementation(workOrder) && changeSet.files.length === 0) {
    const blocked = touchRun(run, {
      status: "blocked",
      blockers: unique([...run.blockers, "no implementation change to verify"]),
      nextAction: "Implement in-scope edits, then re-run uads verify.",
    });
    persistExecutionRun({ paths: ctx.paths, run: blocked, schemaRoot });
    throw new ExecutionBlockedError("no implementation change to verify", ["no implementation change to verify"]);
  }

  if (changeSet.violations.length > 0) {
    const blocked = touchRun(run, {
      status: "blocked",
      phase: "stopped",
      currentChangeDigest: changeSet.digest,
      changedFiles: changeSet.files.map((file) => file.path),
      scopeViolations: changeSet.violations,
      blockers: unique([
        ...run.blockers,
        ...changeSet.violations.map((item) => `${item.classification}: ${item.path}`),
      ]),
      nextAction: "Out-of-scope or sensitive changes block verification. Create a new plan or revert the extra files.",
    });
    persistExecutionRun({ paths: ctx.paths, run: blocked, schemaRoot });
    const nextCheckpoint: Checkpoint = {
      ...checkpoint,
      updatedAt: nowIso(),
      status: "blocked",
      phase: "stopped",
      blockers: blocked.blockers,
      nextAction: blocked.nextAction,
    };
    writeCheckpoint(ctx.paths, nextCheckpoint, workOrder, contextPlan, schemaRoot);
    throw new ExecutionBlockedError(
      `scope or sensitive path violations: ${changeSet.violations.map((item) => `${item.classification}:${item.path}`).join(", ")}`,
      blocked.blockers,
    );
  }

  const updated = touchRun(run, {
    phase: "verify",
    status: run.status === "correction_needed" ? "in_progress" : "in_progress",
    currentChangeDigest: changeSet.digest,
    changedFiles: changeSet.files.map((file) => file.path),
    scopeViolations: [],
    blockers: [],
    reviewedChangeDigest: run.phase === "review" ? null : run.reviewedChangeDigest,
    nextAction: "Record PASS evidence for selected non-review gates, then uads assurance start.",
  });
  persistExecutionRun({ paths: ctx.paths, run: updated, packet: buildPacket(updated, workOrder), schemaRoot });
  const evidence = listEvidenceRecords(ctx.paths, updated.executionRunId, schemaRoot);
  const reviews = listReviewRecords(ctx.paths, updated.executionRunId, schemaRoot);
  let gates = deriveGateStates({
    selectedGates: updated.selectedGates,
    digest: updated.currentChangeDigest,
    evidence,
    reviews,
    validation: {
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: updated.workOrderId,
      executionRunId: updated.executionRunId,
      schemaRoot,
    },
  });
  let bundle = null;
  try {
    bundle = currentOrRefreshIndex({
      repoRoot: ctx.repoRoot,
      projectId: ctx.projectId,
      paths: ctx.paths,
      schemaRoot,
    });
  } catch {
    bundle = null;
  }
  const reused = applyEligibleCacheHits({
    paths: ctx.paths,
    repoRoot: ctx.repoRoot,
    run: updated,
    bundle,
    gateStates: gates,
    schemaRoot,
  });
  if (reused.applied.length > 0) {
    const nextRefs = unique([
      ...updated.evidenceRefs,
      ...reused.applied.map((item) => `sidecar://execution-runs/${updated.executionRunId}/evidence/${item.evidenceId}.json`),
    ]);
    const withReuse = touchRun(updated, { evidenceRefs: nextRefs });
    persistExecutionRun({ paths: ctx.paths, run: withReuse, schemaRoot });
    Object.assign(updated, withReuse);
    noteGovernorEvent({
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: updated.workOrderId,
      executionRunId: updated.executionRunId,
      outcome: "reuse",
      reasonCodes: ["CACHE_HIT", "AVOIDED_ELIGIBLE_GATE_RERUN"],
      subject: "verify-cache-hit",
      patch: {
        gateCacheHits: reused.applied.length,
        evidenceReuseCount: reused.applied.length,
        avoidedToolExecutions: reused.applied.length,
      },
      schemaRoot,
    });
  }
  const misses = reused.decisions.filter((item) => item.decision !== "HIT" && item.executionRequired).length;
  if (misses > 0) {
    noteGovernorEvent({
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: updated.workOrderId,
      executionRunId: updated.executionRunId,
      outcome: "allow",
      reasonCodes: ["CACHE_MISS_OR_STALE"],
      subject: "verify-cache-miss",
      patch: { gateCacheMisses: misses },
      schemaRoot,
    });
  }
  const evidenceAfter = listEvidenceRecords(ctx.paths, updated.executionRunId, schemaRoot);
  gates = deriveGateStates({
    selectedGates: updated.selectedGates,
    digest: updated.currentChangeDigest,
    evidence: evidenceAfter,
    reviews,
    validation: {
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: updated.workOrderId,
      executionRunId: updated.executionRunId,
      schemaRoot,
    },
  });
  refreshQptSnapshot({
    paths: ctx.paths,
    projectId: ctx.projectId,
    requiredGatesTotal: updated.selectedGates.length,
    requiredGatesSatisfiedCurrent: gates.filter((gate) => gate.status === "PASS").length,
    requiredIndependentReview: updated.requiredReviewers.length > 0 ? "pending" : "not-required",
    contextRadius: updated.contextRadius,
    schemaRoot,
  });
  const nextCheckpoint: Checkpoint = {
    ...checkpoint,
    updatedAt: nowIso(),
    phase: "verify",
    status: "in_progress",
    completedSteps: unique([...checkpoint.completedSteps, "verify"]),
    blockers: [],
    nextAction: updated.nextAction,
    resumeCursor: "verify:await-evidence",
  };
  writeCheckpoint(ctx.paths, nextCheckpoint, workOrder, contextPlan, schemaRoot);
  return {
    run: updated,
    changeSet,
    pendingGates: gates.filter((gate) => gate.status === "PENDING").map((gate) => gate.gateId),
  };
}

function hashProjectFileEvidence(repoRoot: string, relativePath: string): { fileRef: string; fileDigest: string } {
  const relative = assertSafeRelativeProjectPath(relativePath);
  if (isSensitiveDataFile(relative)) {
    throw new ExecutionBlockedError("sensitive file evidence rejected", [`sensitive:${relative}`]);
  }
  const abs = path.resolve(repoRoot, relative);
  if (!isPathInside(repoRoot, abs)) {
    throw new ExecutionBlockedError("path traversal rejected", ["file path traversal"]);
  }
  if (!fs.existsSync(abs)) {
    throw new ExecutionBlockedError("evidence file not found", ["missing file"]);
  }
  const stat = fs.lstatSync(abs);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ExecutionBlockedError("file evidence must be a regular file inside the repository", ["invalid file evidence"]);
  }
  return { fileRef: relative, fileDigest: sha256Hex(fs.readFileSync(abs)) };
}

function assertRecordableGate(run: ExecutionRun, gateId: string): GateDef {
  if (!isKnownGateId(gateId)) {
    throw new ExecutionBlockedError("unknown gate cannot be recorded", [`unknown gate ${gateId}`]);
  }
  if (!run.selectedGates.includes(gateId)) {
    throw new ExecutionBlockedError("unselected gate cannot be recorded", [`unselected gate ${gateId}`]);
  }
  const def = gateDef(gateId);
  if (!def) {
    throw new ExecutionBlockedError("unknown gate cannot be recorded", [`unknown gate ${gateId}`]);
  }
  if (isReviewGate(gateId)) {
    throw new ExecutionBlockedError("review gates require assurance records, not generic evidence", [
      `review-gate:${gateId}`,
    ]);
  }
  return def;
}

function assertPassContract(
  def: GateDef,
  input: {
    kind: EvidenceKind;
    command?: string;
    exitCode?: number;
    outputRef: string | null;
    outputDigest: string | null;
    fileRef: string | null;
    fileDigest: string | null;
  },
): void {
  if (!def.allowedEvidenceKinds.includes(input.kind)) {
    throw new ExecutionBlockedError("evidence kind cannot satisfy the selected gate", [
      `kind ${input.kind} not allowed for ${def.id}`,
    ]);
  }
  if (def.contractKind === "command" || input.kind === "command") {
    if (input.kind !== "command" || !input.command || input.exitCode !== 0 || !input.outputRef || !input.outputDigest) {
      throw new ExecutionBlockedError("command PASS requires command, exit 0, output ref, and output digest", [
        `insufficient command evidence for ${def.id}`,
      ]);
    }
  }
  if (input.kind === "file" && (!input.fileRef || !input.fileDigest)) {
    throw new ExecutionBlockedError("file evidence requires a relative fileRef and file digest", ["missing file digest"]);
  }
  if (input.kind === "invariant" && !((input.outputRef && input.outputDigest) || (input.fileRef && input.fileDigest))) {
    throw new ExecutionBlockedError("invariant PASS requires a concrete output or file digest", [
      "summary-only invariant rejected",
    ]);
  }
}

function copySanitizedOutput(input: {
  paths: UadsPaths;
  repoRoot: string;
  executionRunId: string;
  evidenceId: string;
  outputPath?: string;
}): { outputRef: string | null; outputDigest: string | null } {
  if (!input.outputPath) {
    return { outputRef: null, outputDigest: null };
  }
  if (input.outputPath.split(/[\\/]/).includes("..")) {
    throw new ExecutionBlockedError("path traversal rejected", ["output path traversal"]);
  }
  const abs = path.resolve(input.outputPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new ExecutionBlockedError("evidence output file not found", ["missing output file"]);
  }
  const raw = fs.readFileSync(abs, "utf8");
  const sanitized = sanitizeReviewText(raw, [input.repoRoot, input.paths.home, input.paths.workspace]);
  const text = sanitized.omit ? "[REDACTED:unsanitizable-output]\n" : sanitized.text;
  const destName = `${input.evidenceId}.output.txt`;
  const dest = path.join(input.paths.executionRuns, input.executionRunId, "evidence", destName);
  atomicWriteFile(dest, text);
  return {
    outputRef: `sidecar://execution-runs/${input.executionRunId}/evidence/${destName}`,
    outputDigest: sha256Hex(text),
  };
}

export function runEvidenceRecord(input: {
  cwd?: string;
  uadsHome?: string;
  gateId: string;
  kind: EvidenceKind;
  role: string;
  command?: string;
  exitCode?: number;
  outputPath?: string;
  file?: string;
  summary: string;
  status?: EvidenceRuntimeStatus;
}): { record: EvidenceRecord; run: ExecutionRun; gateStates: GateStateSnapshot[] } {
  const { ctx, schemaRoot, workOrder, contextPlan, checkpoint, run } = loadActive(input);
  if (!run.currentChangeDigest) {
    throw new ExecutionBlockedError("cannot record evidence before verify", ["missing change digest"]);
  }
  if (run.phase !== "verify" && run.phase !== "review" && run.status !== "correction_needed") {
    throw new ExecutionBlockedError("evidence recording requires an active verified run", [`phase is ${run.phase}`]);
  }
  const def = assertRecordableGate(run, sanitizeOperationalText(input.gateId));
  if (input.kind === "command" && input.exitCode === undefined) {
    throw new ExecutionBlockedError("command evidence requires --exit-code", ["missing exit code"]);
  }
  let status: EvidenceRuntimeStatus = input.status ?? "PASS";
  if (input.kind === "command") {
    const exitCode = input.exitCode ?? 1;
    status = exitCode === 0 ? "PASS" : "FAIL";
    if (input.status === "PASS" && exitCode !== 0) {
      throw new ExecutionBlockedError("PASS command evidence is incompatible with a non-zero exit code", [
        "status/exit-code mismatch",
      ]);
    }
  }
  if (input.status === "BLOCKED") {
    status = "BLOCKED";
  }

  const createdAt = nowIso();
  const evidenceId = newPrefixedId("ev", `${run.executionRunId}:${input.gateId}:${run.currentChangeDigest}:${createdAt}`);
  const copied = copySanitizedOutput({
    paths: ctx.paths,
    repoRoot: ctx.repoRoot,
    executionRunId: run.executionRunId,
    evidenceId,
    outputPath: input.outputPath,
  });
  const fileProof = input.file ? hashProjectFileEvidence(ctx.repoRoot, input.file) : { fileRef: null, fileDigest: null };
  if (status === "PASS") {
    assertPassContract(def, {
      kind: input.kind,
      command: input.command,
      exitCode: input.exitCode,
      outputRef: copied.outputRef,
      outputDigest: copied.outputDigest,
      fileRef: fileProof.fileRef,
      fileDigest: fileProof.fileDigest,
    });
  }

  const record: EvidenceRecord = {
    schema: "uads.evidence-record",
    schemaVersion: "0.3.0",
    evidenceId,
    projectId: run.projectId,
    workOrderId: run.workOrderId,
    executionRunId: run.executionRunId,
    changeDigest: run.currentChangeDigest,
    gateId: sanitizeOperationalText(input.gateId),
    sourceRole: sanitizeOperationalText(input.role),
    kind: input.kind,
    createdAt,
    status,
    summary: sanitizeOperationalText(input.summary),
    command: input.command ? sanitizeOperationalText(input.command) : undefined,
    exitCode: input.kind === "command" ? (input.exitCode ?? null) : undefined,
    outputRef: copied.outputRef,
    outputDigest: copied.outputDigest,
    fileRef: fileProof.fileRef,
    fileDigest: fileProof.fileDigest,
    source: "executed",
  };
  persistEvidenceRecord({ paths: ctx.paths, record, schemaRoot });
  if (status === "PASS") {
    try {
      const bundle = currentOrRefreshIndex({
        repoRoot: ctx.repoRoot,
        projectId: ctx.projectId,
        paths: ctx.paths,
        schemaRoot,
      });
      populateCacheFromEvidence({
        paths: ctx.paths,
        repoRoot: ctx.repoRoot,
        run,
        record,
        bundle,
        schemaRoot,
      });
    } catch {
      // Cache population is best-effort and must not reject accepted evidence.
    }
  }
  noteGovernorEvent({
    paths: ctx.paths,
    projectId: ctx.projectId,
    workOrderId: run.workOrderId,
    executionRunId: run.executionRunId,
    outcome: "allow",
    reasonCodes: status === "PASS" ? ["GATE_EXECUTED"] : ["GATE_EXECUTED_NON_PASS"],
    subject: `evidence-record:${sanitizeOperationalText(input.gateId)}`,
    patch: { gateExecutions: 1, toolExecutions: 1 },
    schemaRoot,
  });

  const evidence = listEvidenceRecords(ctx.paths, run.executionRunId, schemaRoot);
  const reviews = listReviewRecords(ctx.paths, run.executionRunId, schemaRoot);
  const gateStates = deriveGateStates({
    selectedGates: run.selectedGates,
    digest: run.currentChangeDigest,
    evidence,
    reviews,
    validation: {
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: run.workOrderId,
      executionRunId: run.executionRunId,
      schemaRoot,
    },
  });
  const failed = gateStates.filter((gate) => gate.status === "FAIL" || gate.status === "BLOCKED").map((gate) => gate.gateId);
  const updated = touchRun(run, {
    evidenceRefs: unique([...run.evidenceRefs, `sidecar://execution-runs/${run.executionRunId}/evidence/${record.evidenceId}.json`]),
    blockers: failed.length > 0 ? unique([...run.blockers.filter((item) => !item.startsWith("gate-fail:")), ...failed.map((id) => `gate-fail: ${id}`)]) : run.blockers.filter((item) => !item.startsWith("gate-fail:")),
    nextAction:
      failed.length > 0
        ? "Selected gate evidence FAIL/BLOCKED. Fix implementation, re-verify, and record new evidence."
        : run.nextAction,
  });
  persistExecutionRun({ paths: ctx.paths, run: updated, schemaRoot });
  writeCheckpoint(
    ctx.paths,
    {
      ...checkpoint,
      updatedAt: createdAt,
      evidenceRefs: unique([...checkpoint.evidenceRefs, ...updated.evidenceRefs]),
      nextAction: updated.nextAction,
    },
    workOrder,
    contextPlan,
    schemaRoot,
  );
  return { record, run: updated, gateStates };
}

export function runAssuranceStart(input: { cwd?: string; uadsHome?: string }): {
  run: ExecutionRun;
  packet: ReviewPacket;
} {
  const { ctx, schemaRoot, checkpoint, workOrder, contextPlan, run } = loadActive(input);
  if (run.phase !== "verify" && run.phase !== "review") {
    throw new ExecutionBlockedError("assurance start requires verify phase", [`phase is ${run.phase}`]);
  }
  if (!run.currentChangeDigest) {
    throw new ExecutionBlockedError("assurance start requires a current change digest", ["missing change digest"]);
  }
  const evidence = listEvidenceRecords(ctx.paths, run.executionRunId, schemaRoot);
  const reviews = listReviewRecords(ctx.paths, run.executionRunId, schemaRoot);
  const gateStates = deriveGateStates({
    selectedGates: run.selectedGates,
    digest: run.currentChangeDigest,
    evidence,
    reviews,
    validation: {
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: run.workOrderId,
      executionRunId: run.executionRunId,
      schemaRoot,
    },
  });
  const blocking = gateStates.filter((gate) => !isReviewGate(gate.gateId) && gate.status !== "PASS");
  if (blocking.length > 0) {
    throw new ExecutionBlockedError("selected non-review gates are not PASS", blocking.map((gate) => `${gate.gateId}:${gate.status}`));
  }
  const specialistSelectionPlan = assertCurrentSpecialistSelectionForAssurance(
    ctx.paths,
    workOrder,
    readRoutingDecision(ctx.paths, workOrder.routingDecisionId, schemaRoot),
    contextPlan,
    schemaRoot,
  );
  const assuranceStatus = evaluateAssurancePolicy({
    mode: "status",
    projectId: ctx.projectId,
    workOrder,
    run,
    gateStates,
    evidence,
    reviews,
    specialistSelectionPlan,
  });
  if (!assuranceStatus.allowed) {
    throw new ExecutionBlockedError("assurance prerequisites are not valid", assuranceStatus.blockers);
  }

  const packet: ReviewPacket = {
    schema: "uads.review-packet",
    schemaVersion: "0.3.0",
    executionRunId: run.executionRunId,
    workOrderId: run.workOrderId,
    objective: workOrder.objective,
    acceptanceCriteria: workOrder.acceptanceCriteria,
    includedScope: workOrder.includedScope,
    outOfScope: workOrder.outOfScope,
    changedFiles: run.changedFiles,
    changeDigest: run.currentChangeDigest,
    gateStates: gateStates.map((gate) => ({ gateId: gate.gateId, status: gate.status })),
    evidenceRefs: assuranceStatus.currentEvidenceRefs,
    requiredReviewers: run.requiredReviewers,
    riskLevel: workOrder.riskLevel,
    roleToGateMapping: assuranceRoleGateMapping(run.selectedGates),
    requiredEvidenceObligations: [...workOrder.requiredEvidence],
    unresolvedBlockers: [
      ...assuranceStatus.blockers,
      ...assuranceStatus.pendingRoles.map((role) => `${ASSURANCE_REASON_CODES.MISSING_REQUIRED_REVIEWER}:${role}`),
    ],
    doNotImplement: [
      "provider API calls or arbitrary external commands",
      "out-of-scope files or project-local UADS operational state",
      "approval-gated release, deployment, custody, or financial actions",
    ],
    independentReviewInvariant: "Every required assurance role uses an exact recognized role and a distinct non-implementer session bound to this change digest.",
    nextAction: "Invoke distinct reviewer session(s). Do not self-approve. Record verdicts with uads assurance record.",
  };
  persistReviewPacket(ctx.paths, packet, schemaRoot);
  const updated = touchRun(run, {
    phase: "review",
    status: "in_progress",
    nextAction: packet.nextAction,
  });
  persistExecutionRun({ paths: ctx.paths, run: updated, schemaRoot });
  writeCheckpoint(
    ctx.paths,
    {
      ...checkpoint,
      updatedAt: nowIso(),
      phase: "review",
      status: "in_progress",
      completedSteps: unique([...checkpoint.completedSteps, "assurance-start"]),
      nextAction: packet.nextAction,
      resumeCursor: "review:await-verdicts",
    },
    workOrder,
    contextPlan,
    schemaRoot,
  );
  return { run: updated, packet };
}

const MAX_FINDINGS_FILE_BYTES = 1_048_576;
const MAX_FINDINGS = 1_000;

function safeFindingsFile(file: string, roots: string[]): string {
  const absolute = path.resolve(file);
  if (roots.every((root) => !isPathInside(path.resolve(root), absolute))) {
    throw new ExecutionBlockedError("findings file must be inside the repository or sidecar", ["findings path outside managed roots"]);
  }
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    throw new ExecutionBlockedError("findings file is unavailable", ["findings file unavailable"]);
  }
  if (stat.isSymbolicLink()) {
    throw new ExecutionBlockedError("findings file symlinks are rejected", ["findings symlink rejected"]);
  }
  if (stat.isDirectory() || stat.isFIFO() || stat.isSocket() || stat.isCharacterDevice() || stat.isBlockDevice() || !stat.isFile()) {
    throw new ExecutionBlockedError("findings file must be an ordinary file", ["unsupported findings file type"]);
  }
  if (stat.size > MAX_FINDINGS_FILE_BYTES) {
    throw new ExecutionBlockedError("findings file exceeds the bounded input size", ["findings file too large"]);
  }
  let real: string;
  try {
    real = fs.realpathSync(absolute);
  } catch {
    throw new ExecutionBlockedError("findings file is unavailable", ["findings file unavailable"]);
  }
  if (roots.every((root) => !isPathInside(path.resolve(root), real))) {
    throw new ExecutionBlockedError("findings file resolves outside managed roots", ["findings symlink escape rejected"]);
  }
  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    if (!isPathInside(resolvedRoot, absolute)) continue;
    let current = resolvedRoot;
    for (const segment of path.relative(resolvedRoot, absolute).split(path.sep)) {
      if (!segment) continue;
      current = path.join(current, segment);
      try {
        if (fs.lstatSync(current).isSymbolicLink()) {
          throw new ExecutionBlockedError("findings file symlinks are rejected", ["findings symlink rejected"]);
        }
      } catch (error) {
        if (error instanceof ExecutionBlockedError) throw error;
        throw new ExecutionBlockedError("findings file is unavailable", ["findings file unavailable"]);
      }
    }
    break;
  }
  return absolute;
}

export function assertSafeAssuranceFindingsFile(file: string, roots: string[]): string {
  return safeFindingsFile(file, roots);
}

function parseFindings(raw: string | undefined, file: string | undefined, roots: string[]): ReviewFinding[] {
  let text: string;
  if (file) {
    const safePath = safeFindingsFile(file, roots);
    try {
      text = fs.readFileSync(safePath, "utf8");
    } catch {
      throw new ExecutionBlockedError("findings file is unavailable", ["findings file unavailable"]);
    }
  } else {
    text = raw ?? "[]";
    if (Buffer.byteLength(text, "utf8") > MAX_FINDINGS_FILE_BYTES) {
      throw new ExecutionBlockedError("inline findings exceed the bounded input size", ["findings input too large"]);
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ExecutionBlockedError("findings must be valid JSON", ["invalid findings JSON"]);
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_FINDINGS) {
    throw new ExecutionBlockedError("findings must be a bounded JSON array", ["invalid findings array"]);
  }
  return sanitizeOperationalValue(
    parsed.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new ExecutionBlockedError("each finding must be an object", ["invalid finding"]);
      }
      const row = item as Partial<ReviewFinding>;
      if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(row.severity ?? "")) {
        throw new ExecutionBlockedError("finding severity is not recognized", ["invalid finding severity"]);
      }
      return {
        severity: row.severity as ReviewFinding["severity"],
        category: String(row.category ?? "general"),
        message: String(row.message ?? ""),
      };
    }),
  );
}

export function runAssuranceRecord(input: {
  cwd?: string;
  uadsHome?: string;
  role: string;
  session: string;
  implementerSession?: string;
  verdict: ReviewVerdict;
  summary: string;
  findingsJson?: string;
  findingsFile?: string;
}): { record: ReviewRecord; run: ExecutionRun } {
  const { ctx, schemaRoot, checkpoint, workOrder, contextPlan, run } = loadActive(input);
  if (!["APPROVED", "CORRECTION_NEEDED", "BLOCKED"].includes(input.verdict)) {
    throw new ExecutionBlockedError("assurance verdict is not recognized", ["invalid assurance verdict"]);
  }
  if (run.phase !== "review") {
    throw new ExecutionBlockedError("assurance record requires review phase after uads assurance start", [
      `phase is ${run.phase}`,
    ]);
  }
  if (run.status === "completed" || run.status === "blocked" || run.status === "failed") {
    throw new ExecutionBlockedError("assurance record requires an active review run", [`status is ${run.status}`]);
  }
  if (!run.currentChangeDigest) {
    throw new ExecutionBlockedError("assurance record requires a current change digest", ["missing change digest"]);
  }
  if (requiresImplementation(workOrder) && !run.implementerSessionId) {
    throw new ExecutionBlockedError("missing authoritative implementer session; re-dispatch a new run", [
      "missing implementer session",
    ]);
  }
  const reviewerRole = sanitizeOperationalText(input.role);
  const reviewSessionId = sanitizeOperationalText(input.session);
  const providedImplementer = input.implementerSession ? sanitizeOperationalText(input.implementerSession) : "";
  const implementerSessionId = run.implementerSessionId;
  if (!implementerSessionId) {
    throw new ExecutionBlockedError("missing authoritative implementer session; reviewer cannot invent it", [
      "missing implementer session",
    ]);
  }
  if (providedImplementer && providedImplementer !== implementerSessionId) {
    throw new ExecutionBlockedError("caller implementer session does not match the bound run session", [
      "implementer session mismatch",
    ]);
  }
  if (reviewerRole === run.implementerRole || reviewerRole === IMPLEMENTER_ROLE) {
    throw new ExecutionBlockedError("implementer cannot self-review", ["reviewer role equals implementer role"]);
  }
  if (reviewSessionId === implementerSessionId) {
    throw new ExecutionBlockedError("same implementer/reviewer session", [
      "same implementer/reviewer session",
    ]);
  }

  if (!isRecognizedAssuranceRole(reviewerRole)) {
    throw new ExecutionBlockedError("reviewer role is not recognized by the assurance policy", [
      `${ASSURANCE_REASON_CODES.UNKNOWN_REVIEWER_ROLE}:${reviewerRole}`,
    ]);
  }
  if (!run.requiredReviewers.includes(reviewerRole)) {
    throw new ExecutionBlockedError("reviewer role is not required for this Work Order", [
      `${ASSURANCE_REASON_CODES.REVIEWER_ROLE_NOT_REQUIRED}:${reviewerRole}`,
    ]);
  }

  const evidence = listEvidenceRecords(ctx.paths, run.executionRunId, schemaRoot);
  const reviews = listReviewRecords(ctx.paths, run.executionRunId, schemaRoot);
  const specialistSelectionPlan = assertCurrentSpecialistSelectionForAssurance(
    ctx.paths,
    workOrder,
    readRoutingDecision(ctx.paths, workOrder.routingDecisionId, schemaRoot),
    contextPlan,
    schemaRoot,
  );
  const gateStates = deriveGateStates({
    selectedGates: run.selectedGates,
    digest: run.currentChangeDigest,
    evidence,
    reviews,
    validation: {
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: run.workOrderId,
      executionRunId: run.executionRunId,
      schemaRoot,
    },
  });
  const findings = parseFindings(input.findingsJson, input.findingsFile, [ctx.repoRoot, ctx.paths.workspace]);
  const reasonCodes = findings.length === 0 && input.verdict === "BLOCKED"
    ? [ASSURANCE_REASON_CODES.REVIEW_BLOCKED]
    : findings.length === 0 && input.verdict === "CORRECTION_NEEDED"
      ? [ASSURANCE_REASON_CODES.REVIEW_CORRECTION_REQUIRED]
      : [];
  const currentEvidenceRefs = evidence
    .filter((item) => item.projectId === ctx.projectId && item.workOrderId === run.workOrderId && item.executionRunId === run.executionRunId && item.changeDigest === run.currentChangeDigest)
    .map((item) => `sidecar://execution-runs/${run.executionRunId}/evidence/${item.evidenceId}.json`)
    .sort((a, b) => a.localeCompare(b));

  const createdAt = nowIso();
  const record: ReviewRecord = {
    schema: "uads.review-record",
    schemaVersion: "0.3.0",
    reviewId: newPrefixedId("rv", `${run.executionRunId}:${reviewerRole}:${run.currentChangeDigest}:${createdAt}`),
    projectId: run.projectId,
    workOrderId: run.workOrderId,
    executionRunId: run.executionRunId,
    changeDigest: run.currentChangeDigest,
    reviewerRole,
    reviewSessionId,
    implementerRole: run.implementerRole,
    implementerSessionId,
    verdict: input.verdict,
    summary: sanitizeOperationalText(input.summary),
    findings,
    reasonCodes,
    evidenceRefs: currentEvidenceRefs,
    createdAt,
  };
  const assuranceSubmission = evaluateAssurancePolicy({
    mode: "submission",
    projectId: ctx.projectId,
    workOrder,
    run,
    gateStates,
    evidence,
    reviews,
    candidate: record,
    specialistSelectionPlan,
  });
  if (!assuranceSubmission.allowed) {
    throw new ExecutionBlockedError("assurance record rejected by deterministic policy", assuranceSubmission.blockers);
  }
  persistReviewRecord({ paths: ctx.paths, record, schemaRoot });

  let updated = touchRun(run, {
    reviewRefs: unique([
      ...run.reviewRefs,
      `sidecar://execution-runs/${run.executionRunId}/reviews/${record.reviewId}.json`,
    ]),
  });

  if (input.verdict === "CORRECTION_NEEDED") {
    updated = touchRun(updated, {
      phase: "implement",
      status: "correction_needed",
      attempt: run.attempt + 1,
      reviewedChangeDigest: null,
      nextAction: "Address review findings, edit in-scope files, then uads verify (new digest required).",
    });
  } else if (input.verdict === "BLOCKED") {
    updated = touchRun(updated, {
      status: "blocked",
      phase: "stopped",
      blockers: unique([...updated.blockers, `review-blocked:${reviewerRole}`]),
      nextAction: "Independent review BLOCKED. Do not continue automatically.",
    });
  } else {
    updated = touchRun(updated, {
      reviewedChangeDigest: run.currentChangeDigest,
      nextAction: "If all required reviewers approved this digest, run uads finalize.",
    });
  }

  persistExecutionRun({ paths: ctx.paths, run: updated, packet: buildPacket(updated, workOrder), schemaRoot });
  const evidenceAfterReview = listEvidenceRecords(ctx.paths, updated.executionRunId, schemaRoot);
  const reviewsAfterReview = listReviewRecords(ctx.paths, updated.executionRunId, schemaRoot);
  const gatesAfterReview = deriveGateStates({
    selectedGates: updated.selectedGates,
    digest: updated.currentChangeDigest,
    evidence: evidenceAfterReview,
    reviews: reviewsAfterReview,
    validation: {
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: updated.workOrderId,
      executionRunId: updated.executionRunId,
      schemaRoot,
    },
  });
  const independentReview = reviewsAfterReview.find(
    (item) => item.reviewerRole === INDEPENDENT_REVIEWER_ROLE && item.changeDigest === run.currentChangeDigest,
  );
  let independentStatus: "pending" | "satisfied" | "not-required" = "pending";
  if (updated.requiredReviewers.length === 0) {
    independentStatus = "not-required";
  } else if (independentReview?.verdict === "APPROVED") {
    independentStatus = "satisfied";
  }
  refreshQptSnapshot({
    paths: ctx.paths,
    projectId: ctx.projectId,
    requiredGatesTotal: updated.selectedGates.length,
    requiredGatesSatisfiedCurrent: gatesAfterReview.filter((gate) => gate.status === "PASS").length,
    requiredIndependentReview: independentStatus,
    contextRadius: updated.contextRadius,
    schemaRoot,
  });
  writeCheckpoint(
    ctx.paths,
    {
      ...checkpoint,
      updatedAt: createdAt,
      phase: updated.phase === "implement" ? "implement" : updated.phase === "stopped" ? "stopped" : "review",
      status: updated.status === "blocked" ? "blocked" : "in_progress",
      blockers: updated.blockers,
      nextAction: updated.nextAction,
      resumeCursor: updated.status === "correction_needed" ? "implement:correction" : "review:recorded",
    },
    workOrder,
    contextPlan,
    schemaRoot,
  );
  return { record, run: updated };
}

function currentGitDigest(repoRoot: string, workOrder: WorkOrder, contextPlan: ContextPlan): string {
  return buildChangeSet(repoRoot, workOrder, contextPlan).digest;
}

export function runFinalize(input: { cwd?: string; uadsHome?: string }): { run: ExecutionRun } {
  const { ctx, schemaRoot, checkpoint, workOrder, contextPlan, run } = loadActive(input);
  const blockers: string[] = [];
  if (run.status === "completed") {
    return { run };
  }
  if (!run.currentChangeDigest) {
    blockers.push("missing change digest");
  }
  if (run.phase === "implement" || run.phase === "verify" || run.status === "correction_needed") {
    blockers.push("cannot finalize before independent review");
  }
  if (requiresImplementation(workOrder) && !run.implementerSessionId) {
    blockers.push("missing authoritative implementer session");
  }
  const live = currentGitDigest(ctx.repoRoot, workOrder, contextPlan);
  if (run.currentChangeDigest && live !== run.currentChangeDigest) {
    blockers.push("current git digest differs from verified digest");
  }
  if (run.scopeViolations.length > 0) {
    blockers.push("unresolved out-of-scope or sensitive changes");
  }
  const evidence = listEvidenceRecords(ctx.paths, run.executionRunId, schemaRoot);
  const reviews = listReviewRecords(ctx.paths, run.executionRunId, schemaRoot);
  let specialistSelectionPlan: ReturnType<typeof assertSpecialistSelectionBoundToWorkOrder> | undefined;
  try {
    specialistSelectionPlan = assertCurrentSpecialistSelectionForAssurance(
      ctx.paths,
      workOrder,
      readRoutingDecision(ctx.paths, workOrder.routingDecisionId, schemaRoot),
      contextPlan,
      schemaRoot,
    );
  } catch (error) {
    specialistSelectionPlan = undefined;
    blockers.push(
      error instanceof ExecutionBlockedError
        ? error.blockers[0] ?? ASSURANCE_REASON_CODES.SPECIALIST_SELECTION_INVALID
        : ASSURANCE_REASON_CODES.SPECIALIST_SELECTION_INVALID,
    );
  }
  const gateStates = deriveGateStates({
    selectedGates: run.selectedGates,
    digest: run.currentChangeDigest,
    evidence,
    reviews,
    validation: {
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: run.workOrderId,
      executionRunId: run.executionRunId,
      schemaRoot,
    },
  });
  const assuranceFinal = evaluateAssurancePolicy({
    mode: "finalize",
    projectId: ctx.projectId,
    workOrder,
    run,
    gateStates,
    evidence,
    reviews,
    specialistSelectionPlan,
  });
  blockers.push(...assuranceFinal.blockers);
  for (const gate of gateStates) {
    if (!isKnownGateId(gate.gateId) && run.selectedGates.includes(gate.gateId)) {
      blockers.push(`unknown selected gate ${gate.gateId}`);
    }
    if (gate.status === "PENDING") {
      blockers.push(`pending gate ${gate.gateId}`);
    }
    if (gate.status === "FAIL" || gate.status === "BLOCKED") {
      blockers.push(`${gate.status.toLowerCase()} gate ${gate.gateId}`);
    }
  }
  const currentReviews = reviews.filter((item) => item.changeDigest === run.currentChangeDigest);
  const independent = currentReviews.find((item) => item.reviewerRole === INDEPENDENT_REVIEWER_ROLE);
  if (!independent) {
    blockers.push("missing independent review");
  } else if (independent.verdict === "CORRECTION_NEEDED") {
    blockers.push("CORRECTION_NEEDED review is not an approval");
  } else if (independent.verdict !== "APPROVED") {
    blockers.push("independent reviewer has not APPROVED");
  } else {
    if (independent.reviewerRole === independent.implementerRole) {
      blockers.push("implementer self-review");
    }
    if (independent.reviewSessionId === independent.implementerSessionId) {
      blockers.push("same implementer/reviewer session");
    }
    if (run.implementerSessionId && independent.implementerSessionId !== run.implementerSessionId) {
      blockers.push("review does not carry the authoritative implementer session");
    }
    if (run.reviewedChangeDigest && run.reviewedChangeDigest !== run.currentChangeDigest) {
      blockers.push("reviewed digest does not match current digest");
    }
    if (live !== independent.changeDigest) {
      blockers.push("current git digest differs from reviewed digest");
    }
  }
  for (const role of run.requiredReviewers) {
    const found = currentReviews.find((item) => item.reviewerRole === role && item.verdict === "APPROVED");
    if (!found) {
      blockers.push(`missing required assurance reviewer ${role}`);
    }
  }
  if (workOrder.acceptanceCriteria.length > 0 && evidence.filter((item) => item.changeDigest === run.currentChangeDigest && item.status === "PASS").length === 0) {
    blockers.push("required acceptance evidence missing");
  }
  if (run.blockers.length > 0 && run.status === "blocked") {
    blockers.push(...run.blockers);
  }

  if (blockers.length > 0) {
    throw new ExecutionBlockedError("finalize refused", unique(blockers));
  }

  const completedAt = nowIso();
  const reusedCount = evidence.filter(
    (item) => item.changeDigest === run.currentChangeDigest && item.source === "cache-reuse" && item.status === "PASS",
  ).length;
  const executedCount = evidence.filter(
    (item) => item.changeDigest === run.currentChangeDigest && item.source !== "cache-reuse" && item.status === "PASS",
  ).length;
  const updated = touchRun(run, {
    phase: "stopped",
    status: "completed",
    nextAction:
      reusedCount > 0
        ? `Completed with ${executedCount} executed PASS and ${reusedCount} cache-reuse PASS. Generate a review ZIP if required. Do not deploy or transfer funds.`
        : "Generate a review ZIP if required. Do not deploy or transfer funds.",
  });
  persistExecutionRun({ paths: ctx.paths, run: updated, packet: buildPacket(updated, workOrder), schemaRoot });
  const gateStatesAfterFinalize = deriveGateStates({
    selectedGates: updated.selectedGates,
    digest: updated.currentChangeDigest,
    evidence,
    reviews,
    validation: {
      paths: ctx.paths,
      projectId: ctx.projectId,
      workOrderId: updated.workOrderId,
      executionRunId: updated.executionRunId,
      schemaRoot,
    },
  });
  refreshQptSnapshot({
    paths: ctx.paths,
    projectId: ctx.projectId,
    requiredGatesTotal: updated.selectedGates.length,
    requiredGatesSatisfiedCurrent: gateStatesAfterFinalize.filter((gate) => gate.status === "PASS").length,
    requiredIndependentReview: "satisfied",
    contextRadius: updated.contextRadius,
    schemaRoot,
  });
  const completedWorkOrder: WorkOrder = {
    ...workOrder,
    status: "completed",
    updatedAt: completedAt,
    nextAction: updated.nextAction,
  };
  writeCheckpoint(
    ctx.paths,
    {
      ...checkpoint,
      updatedAt: completedAt,
      phase: "stopped",
      status: "completed",
      completedSteps: unique([...checkpoint.completedSteps, "finalize"]),
      blockers: [],
      nextAction: updated.nextAction,
      resumeCursor: "complete:await-review-bundle",
    },
    completedWorkOrder,
    contextPlan,
    schemaRoot,
  );
  try {
    const cursor = readFailureCursor(ctx.paths);
    if (cursor?.failureRecordId && updated.currentChangeDigest) {
      markVerifiedResolution({
        paths: ctx.paths,
        projectId: ctx.projectId,
        failureRecordId: cursor.failureRecordId,
        executionRunId: updated.executionRunId,
        repoRoot: ctx.repoRoot,
        schemaRoot,
      });
    }
  } catch {
    // Finalize remains valid when no reusable failure memory exists.
  }
  return { run: updated };
}

export function runContextExpand(input: {
  cwd?: string;
  uadsHome?: string;
  reason: string;
  approveC5?: boolean;
}): { run: ExecutionRun; packet: ExecutionPacket } {
  const { ctx, schemaRoot, workOrder, contextPlan, checkpoint, run } = loadActive(input);
  const index = RADIUS_ORDER.indexOf(run.contextRadius);
  if (index < 0 || index >= RADIUS_ORDER.length - 1) {
    throw new ExecutionBlockedError("context radius cannot expand further", [`radius is ${run.contextRadius}`]);
  }
  const next = RADIUS_ORDER[index + 1];
  if (!next) {
    throw new ExecutionBlockedError("context radius cannot expand further", [`radius is ${run.contextRadius}`]);
  }
  if (next === "C5" && !input.approveC5) {
    throw new ExecutionBlockedError("C5 is exceptional and blocked by default", ["C5 requires explicit approval"]);
  }
  const mapParsed = readJsonIfValid<RepositoryMap>(ctx.paths.repositoryMap);
  const candidates = mapParsed.ok
    ? selectContextCandidates({
        radius: next,
        intake: {
          schema: "uads.intake",
          schemaVersion: "0.2.0",
          objective: workOrder.objective,
          constraints: [],
          requestedArtifacts: [],
          inScope: workOrder.includedScope,
          outOfScope: workOrder.outOfScope,
          acceptanceCriteria: workOrder.acceptanceCriteria,
          domainSignals: workOrder.domains,
          riskSignals: workOrder.riskReasons,
          destructiveSignals: [],
          affectedAreas: workOrder.affectedAreas,
          uncertainties: [],
          approvedBoundaries: [],
          classifier: "host-structured",
        },
        map: mapParsed.value,
      })
    : unique([...run.contextCandidates]);
  const expansionHistory = [
    ...run.expansionHistory,
    { from: run.contextRadius, to: next, reason: sanitizeOperationalText(input.reason), at: nowIso() },
  ];
  let intel: ReturnType<typeof buildImpactAndPack>;
  try {
    intel = buildImpactAndPack({
      repoRoot: ctx.repoRoot,
      projectId: ctx.projectId,
      paths: ctx.paths,
      radius: next,
      workOrder,
      executionRunId: run.executionRunId,
      expansionHistory,
      approveC5: input.approveC5,
      schemaRoot,
      persist: false,
    });
    enforceTokenBudget({
      paths: ctx.paths,
      workOrder,
      estimatedTokens: intel.pack.estimatedTokens,
      subject: `context-expand:${next}`,
      executionRunId: run.executionRunId,
      schemaRoot,
    });
    publishImpactAndPack({ paths: ctx.paths, report: intel.report, pack: intel.pack, schemaRoot });
  } catch (error) {
    if (error instanceof CostBudgetError) {
      throw new ExecutionBlockedError(error.message, ["hard token budget exceeded"]);
    }
    throw error;
  }
  noteGovernorEvent({
    paths: ctx.paths,
    projectId: ctx.projectId,
    workOrderId: run.workOrderId,
    executionRunId: run.executionRunId,
    outcome: next === "C5" ? "warn" : "allow",
    reasonCodes: next === "C5" ? ["CONTEXT_EXPANDED", "C5_EXCEPTIONAL"] : ["CONTEXT_EXPANDED"],
    subject: `context-expand:${next}`,
    patch: { contextExpansions: 1, c5Uses: next === "C5" ? 1 : 0 },
    schemaRoot,
  });
  const updated = touchRun(run, {
    contextRadius: next,
    contextCandidates: candidates,
    expansionHistory,
    nextAction: `Context expanded to ${next}. Do not treat this as permission to edit unrelated areas.`,
    contextPackId: intel.pack.contextPackId,
    impactReportId: intel.report.impactReportId,
    indexDigest: intel.pack.indexDigest,
  });
  const packet = persistExecutionPacket(ctx.paths, buildPacket(updated, workOrder), schemaRoot);
  persistExecutionRun({ paths: ctx.paths, run: updated, packet, schemaRoot });
  const nextPlan: ContextPlan = {
    ...contextPlan,
    radius: next,
    candidateAreas: candidates,
    reason: `${contextPlan.reason}; expanded: ${input.reason}`,
    contextPackId: intel.pack.contextPackId,
    impactReportId: intel.report.impactReportId,
    indexDigest: intel.pack.indexDigest,
  };
  writeCheckpoint(ctx.paths, { ...checkpoint, updatedAt: nowIso(), nextAction: updated.nextAction }, workOrder, nextPlan, schemaRoot);
  return { run: updated, packet };
}

export function loadExecutionView(input: { cwd?: string; uadsHome?: string }): ExecutionResumeView {
  const cwd = input.cwd ?? process.cwd();
  const ctx = resolveProjectContext(cwd, input.uadsHome);
  try {
    const run = readCurrentExecutionRun(ctx.paths);
    if (!run) {
      return buildExecutionResumeView(null);
    }
    const evidence = listEvidenceRecords(ctx.paths, run.executionRunId);
    const reviews = listReviewRecords(ctx.paths, run.executionRunId);
    const view = buildExecutionResumeView(run, evidence, reviews, ctx.paths);
    try {
      const checkpoint = readCurrentCheckpoint(ctx.paths, schemaRootOf());
      const workOrder = checkpoint?.workOrderId ? readWorkOrder(ctx.paths, checkpoint.workOrderId, schemaRootOf()) : null;
      if (!checkpoint || !workOrder || !workOrder.routingDecisionId) {
        throw new SpecialistSelectionPersistenceError("current assurance artifacts are unavailable");
      }
      const contextPlan = readContextPlan(ctx.paths);
      if (!contextPlan) {
        throw new SpecialistSelectionPersistenceError("current Context/Impact plan is unavailable");
      }
      const routing = readRoutingDecision(ctx.paths, workOrder.routingDecisionId, schemaRootOf());
      assertCurrentSpecialistSelectionForAssurance(ctx.paths, workOrder, routing, contextPlan, schemaRootOf());
      return view;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "current specialist selection is unavailable";
      return {
        ...view,
        blockers: unique([...view.blockers, ASSURANCE_REASON_CODES.SPECIALIST_SELECTION_INVALID]),
        nextAction: `Assurance resume blocked: ${sanitizeOperationalText(reason)}`,
      };
    }
  } catch (error) {
    if (error instanceof InvalidOrchestrationStateError) {
      return {
        ...buildExecutionResumeView(null),
        status: "invalid-state",
        blockers: [error.message],
        nextAction: "Do not guess. Restore or recreate a valid execution run from a planned Work Order.",
      };
    }
    throw error;
  }
}

export function collectOrchestrationSnapshot(paths: UadsPaths): Array<{ name: string; content: string }> {
  const files: Array<{ name: string; content: string }> = [];
  const add = (name: string, abs: string): void => {
    if (!fs.existsSync(abs)) {
      return;
    }
    files.push({ name, content: fs.readFileSync(abs, "utf8") });
  };
  add("orchestration/current-checkpoint.json", paths.currentState);
  const checkpoint = readCurrentCheckpoint(paths);
  if (checkpoint?.workOrderId) {
    add("orchestration/current-work-order.json", path.join(paths.workOrders, `${checkpoint.workOrderId}.json`));
  }
  if (checkpoint?.routingDecisionId) {
    add(
      "orchestration/current-routing-decision.json",
      path.join(paths.decisions, `${checkpoint.routingDecisionId}.json`),
    );
  }
  add("orchestration/context-plan.json", path.join(paths.context, "plan.json"));
  add("models/current-execution-plan.json", paths.currentModelRouting);
  add("models/registry.json", paths.modelRegistry);
  add("models/runtime-capabilities.json", path.join(paths.runtimeCapabilities, "generic-runtime.json"));
  add("specialists/selection-plan.json", paths.currentSpecialistSelection);
  add("specialists/registry-state.json", paths.specialistState);
  add("host-dispatch/current.json", paths.currentHostDispatch);
  for (const adapterId of HOST_ADAPTER_IDS) {
    add(`adapters/${adapterId}/state.json`, getHostAdapterStatePath(adapterId, paths.home));
    add(`models/host-runtime-${adapterId}.json`, path.join(paths.runtimeCapabilities, `host-${adapterId}.json`));
  }
  add("intelligence/index-state.json", path.join(paths.index, "index-state.json"));
  add("intelligence/current-pack.json", path.join(paths.context, "current-pack.json"));
  const run = (() => {
    try {
      return readCurrentExecutionRun(paths);
    } catch {
      return null;
    }
  })();
  if (run) {
    add("orchestration/current-execution-run.json", path.join(paths.executionRuns, run.executionRunId, "run.json"));
    add("orchestration/execution-packet.json", path.join(paths.executionRuns, run.executionRunId, "packet.json"));
    const evidenceDir = path.join(paths.executionRuns, run.executionRunId, "evidence");
    if (fs.existsSync(evidenceDir)) {
      for (const name of fs.readdirSync(evidenceDir).filter((file) => file.endsWith(".json")).sort()) {
        add(`orchestration/evidence/${name}`, path.join(evidenceDir, name));
      }
    }
    const reviewsDir = path.join(paths.executionRuns, run.executionRunId, "reviews");
    if (fs.existsSync(reviewsDir)) {
      for (const name of fs.readdirSync(reviewsDir).filter((file) => file.endsWith(".json")).sort()) {
        add(`orchestration/reviews/${name}`, path.join(reviewsDir, name));
      }
    }
  }
  files.push(...collectFailureSnapshot(paths));
  files.push(...collectCacheCostSnapshot(paths));
  return files;
}
