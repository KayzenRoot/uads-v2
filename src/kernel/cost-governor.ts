import type { UadsPaths } from "../lib/workspace.js";
import type { BudgetStatus, CostDecision, CostLedger, GovernorOutcome, QptSnapshot } from "./cost-types.js";
import { COST_SCHEMA_VERSION } from "./cost-types.js";
import {
  emptyCostLedger,
  persistCostDecision,
  persistCostLedger,
  persistQptSnapshot,
  readCostLedger,
} from "./cost-persist.js";
import { newPrefixedId } from "./ids.js";
import type { WorkOrder } from "./types.js";

export const QPT_FORMULA = "verifiedQualityCoverage / max(1, estimatedContextTokens/1000)";
export const QPT_LIMITATIONS = [
  "byte-heuristic estimates only; not provider tokenizer counts",
  "not a financial cost, latency, or billing score",
  "agentCallsReported stays null unless the host reports them",
  "estimatedDiagnosticTokens is tracked separately and is not part of the QPT denominator",
];

export class CostBudgetError extends Error {
  readonly code = "HARD_TOKEN_BUDGET";

  constructor(
    message: string,
    readonly estimatedTokens: number,
    readonly hardLimit: number,
  ) {
    super(message);
    this.name = "CostBudgetError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export function evaluateTokenBudget(estimated: number, soft: number | null, hard: number | null): BudgetStatus {
  if (hard != null && estimated > hard) {
    return "hard-blocked";
  }
  if (soft != null && estimated > soft) {
    return "soft-warning";
  }
  return "ok";
}

function loadLedger(paths: UadsPaths, projectId: string, schemaRoot?: string): CostLedger {
  return readCostLedger(paths, projectId, schemaRoot) ?? emptyCostLedger(projectId);
}

function writeDecision(input: {
  paths: UadsPaths;
  projectId: string;
  workOrderId?: string | null;
  executionRunId?: string | null;
  outcome: GovernorOutcome;
  reasonCodes: string[];
  subject: string;
  schemaRoot?: string;
}): CostDecision {
  const createdAt = nowIso();
  const decision: CostDecision = {
    schema: "uads.cost-decision",
    schemaVersion: COST_SCHEMA_VERSION,
    costDecisionId: newPrefixedId("csd", `${input.projectId}:${input.subject}:${createdAt}:${input.outcome}`),
    projectId: input.projectId,
    workOrderId: input.workOrderId ?? null,
    executionRunId: input.executionRunId ?? null,
    outcome: input.outcome,
    reasonCodes: input.reasonCodes,
    subject: input.subject,
    createdAt,
  };
  try {
    persistCostDecision(input.paths, decision, input.schemaRoot);
  } catch {
    // Cost decision persist must not break the authoritative path.
  }
  return decision;
}

export function applyLedgerPatch(
  paths: UadsPaths,
  projectId: string,
  patch: Partial<CostLedger>,
  schemaRoot?: string,
): CostLedger {
  const current = loadLedger(paths, projectId, schemaRoot);
  const next: CostLedger = {
    ...current,
    ...patch,
    projectId,
    tokenEstimateMethod: "byte-heuristic",
    agentCallsReported: patch.agentCallsReported === undefined ? current.agentCallsReported : patch.agentCallsReported,
    updatedAt: nowIso(),
  };
  return persistCostLedger(paths, next, schemaRoot);
}

export function enforceTokenBudget(input: {
  paths: UadsPaths;
  workOrder: WorkOrder;
  estimatedTokens: number;
  subject: string;
  executionRunId?: string | null;
  schemaRoot?: string;
}): { status: BudgetStatus; decision: CostDecision } {
  const soft = input.workOrder.tokenBudget.softLimit;
  const hard = input.workOrder.tokenBudget.hardLimit;
  const status = evaluateTokenBudget(input.estimatedTokens, soft, hard);
  const ledger = applyLedgerPatch(
    input.paths,
    input.workOrder.projectId,
    {
      workOrderId: input.workOrder.workOrderId,
      executionRunId: input.executionRunId ?? null,
      estimatedContextTokens: input.estimatedTokens,
      softBudget: soft,
      hardBudget: hard,
      modelCapabilityClass: input.workOrder.tokenBudget.capabilityClass,
      budgetStatus: status,
    },
    input.schemaRoot,
  );
  if (status === "hard-blocked") {
    const decision = writeDecision({
      paths: input.paths,
      projectId: input.workOrder.projectId,
      workOrderId: input.workOrder.workOrderId,
      executionRunId: input.executionRunId,
      outcome: "block",
      reasonCodes: ["HARD_TOKEN_BUDGET", "BYTE_HEURISTIC_ESTIMATE"],
      subject: input.subject,
      schemaRoot: input.schemaRoot,
    });
    throw new CostBudgetError(
      `hard token budget exceeded: estimated ${input.estimatedTokens} > hard ${hard}`,
      input.estimatedTokens,
      hard,
    );
  }
  const decision = writeDecision({
    paths: input.paths,
    projectId: input.workOrder.projectId,
    workOrderId: input.workOrder.workOrderId,
    executionRunId: input.executionRunId,
    outcome: status === "soft-warning" ? "warn" : "allow",
    reasonCodes:
      status === "soft-warning"
        ? ["SOFT_TOKEN_BUDGET", "RECOMMEND_REUSE_OR_NARROWER_CONTEXT", "BYTE_HEURISTIC_ESTIMATE"]
        : ["BUDGET_OK", "BYTE_HEURISTIC_ESTIMATE"],
    subject: input.subject,
    schemaRoot: input.schemaRoot,
  });
  void ledger;
  return { status, decision };
}

const COUNTER_KEYS = [
  "estimatedContextTokens",
  "estimatedDiagnosticTokens",
  "contextExpansions",
  "c5Uses",
  "toolExecutions",
  "gateExecutions",
  "gateCacheHits",
  "gateCacheMisses",
  "evidenceReuseCount",
  "avoidedToolExecutions",
  "fullRepositoryScans",
] as const;

export function incrementCostCounters(
  paths: UadsPaths,
  projectId: string,
  deltas: Partial<CostLedger>,
  extra?: Partial<CostLedger>,
  schemaRoot?: string,
): CostLedger {
  const current = loadLedger(paths, projectId, schemaRoot);
  const patch: Partial<CostLedger> = { ...extra };
  for (const key of COUNTER_KEYS) {
    const delta = deltas[key];
    if (typeof delta === "number") {
      patch[key] = current[key] + delta;
    }
  }
  return applyLedgerPatch(paths, projectId, patch, schemaRoot);
}

export function noteGovernorEvent(input: {
  paths: UadsPaths;
  projectId: string;
  workOrderId?: string | null;
  executionRunId?: string | null;
  outcome: GovernorOutcome;
  reasonCodes: string[];
  subject: string;
  patch?: Partial<CostLedger>;
  schemaRoot?: string;
}): CostDecision {
  if (input.patch) {
    incrementCostCounters(
      input.paths,
      input.projectId,
      input.patch as Partial<CostLedger>,
      {
        workOrderId: input.workOrderId ?? null,
        executionRunId: input.executionRunId ?? null,
      },
      input.schemaRoot,
    );
  }
  return writeDecision(input);
}

export function buildQptSnapshot(input: {
  projectId: string;
  requiredGatesTotal: number;
  requiredGatesSatisfiedCurrent: number;
  requiredIndependentReview: QptSnapshot["requiredIndependentReview"];
  ledger: CostLedger;
  contextRadius: string | null;
}): QptSnapshot {
  const coverage =
    input.requiredGatesTotal <= 0 ? 0 : input.requiredGatesSatisfiedCurrent / input.requiredGatesTotal;
  const denom = Math.max(1, input.ledger.estimatedContextTokens / 1000);
  const utilization =
    input.ledger.hardBudget && input.ledger.hardBudget > 0
      ? input.ledger.estimatedContextTokens / input.ledger.hardBudget
      : null;
  return {
    schema: "uads.qpt-snapshot",
    schemaVersion: COST_SCHEMA_VERSION,
    projectId: input.projectId,
    requiredGatesTotal: input.requiredGatesTotal,
    requiredGatesSatisfiedCurrent: input.requiredGatesSatisfiedCurrent,
    verifiedQualityCoverage: coverage,
    requiredIndependentReview: input.requiredIndependentReview,
    estimatedContextTokens: input.ledger.estimatedContextTokens,
    tokenEstimateMethod: "byte-heuristic",
    toolExecutions: input.ledger.toolExecutions,
    gateExecutions: input.ledger.gateExecutions,
    gateCacheHits: input.ledger.gateCacheHits,
    gateCacheMisses: input.ledger.gateCacheMisses,
    avoidedWorkCount: input.ledger.avoidedToolExecutions + input.ledger.evidenceReuseCount,
    contextRadius: input.contextRadius,
    budgetUtilization: utilization,
    qptRatio: coverage / denom,
    qptFormula: QPT_FORMULA,
    limitations: [...QPT_LIMITATIONS],
    estimatedDiagnosticTokens: input.ledger.estimatedDiagnosticTokens,
    updatedAt: nowIso(),
  };
}

export function refreshQptSnapshot(input: {
  paths: UadsPaths;
  projectId: string;
  requiredGatesTotal: number;
  requiredGatesSatisfiedCurrent: number;
  requiredIndependentReview: QptSnapshot["requiredIndependentReview"];
  contextRadius: string | null;
  schemaRoot?: string;
}): QptSnapshot | null {
  const ledger = readCostLedger(input.paths, input.projectId, input.schemaRoot);
  if (!ledger) {
    return null;
  }
  const snapshot = buildQptSnapshot({
    projectId: input.projectId,
    requiredGatesTotal: input.requiredGatesTotal,
    requiredGatesSatisfiedCurrent: input.requiredGatesSatisfiedCurrent,
    requiredIndependentReview: input.requiredIndependentReview,
    ledger,
    contextRadius: input.contextRadius,
  });
  return persistQptSnapshot(input.paths, snapshot, input.schemaRoot);
}
