export const COST_SCHEMA_VERSION = "0.6.0";

export type BudgetStatus = "ok" | "soft-warning" | "hard-blocked";
export type GovernorOutcome = "allow" | "warn" | "block" | "reuse";

export type CostLedger = {
  schema: "uads.cost-ledger";
  schemaVersion: "0.6.0";
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  estimatedContextTokens: number;
  estimatedDiagnosticTokens: number;
  contextExpansions: number;
  c5Uses: number;
  toolExecutions: number;
  gateExecutions: number;
  gateCacheHits: number;
  gateCacheMisses: number;
  evidenceReuseCount: number;
  avoidedToolExecutions: number;
  fullRepositoryScans: number;
  agentCallsReported: number | null;
  modelCapabilityClass: string | null;
  softBudget: number | null;
  hardBudget: number | null;
  budgetStatus: BudgetStatus;
  tokenEstimateMethod: "byte-heuristic";
  updatedAt: string;
};

export type CostDecision = {
  schema: "uads.cost-decision";
  schemaVersion: "0.6.0";
  costDecisionId: string;
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  outcome: GovernorOutcome;
  reasonCodes: string[];
  subject: string;
  createdAt: string;
};

export type QptSnapshot = {
  schema: "uads.qpt-snapshot";
  schemaVersion: "0.6.0";
  projectId: string;
  requiredGatesTotal: number;
  requiredGatesSatisfiedCurrent: number;
  verifiedQualityCoverage: number;
  requiredIndependentReview: "pending" | "satisfied" | "not-required";
  estimatedContextTokens: number;
  tokenEstimateMethod: "byte-heuristic";
  toolExecutions: number;
  gateExecutions: number;
  gateCacheHits: number;
  gateCacheMisses: number;
  avoidedWorkCount: number;
  contextRadius: string | null;
  budgetUtilization: number | null;
  qptRatio: number;
  qptFormula: string;
  limitations: string[];
  estimatedDiagnosticTokens?: number;
  updatedAt: string;
};
