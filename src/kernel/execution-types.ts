import type { ContextRadius, RiskLevel } from "./types.js";
import type { ModelExecutionStrategy } from "./model-types.js";

export const EXECUTION_SCHEMA_VERSION = "0.3.0";

export type ExecutionPhase = "implement" | "verify" | "review" | "stopped";
export type ExecutionStatus =
  | "ready"
  | "in_progress"
  | "correction_needed"
  | "blocked"
  | "completed"
  | "failed";

export type GateRuntimeStatus = "PENDING" | "PASS" | "FAIL" | "BLOCKED";
export type EvidenceKind = "command" | "file" | "invariant" | "review";
export type EvidenceRuntimeStatus = "PASS" | "FAIL" | "BLOCKED";
export type ReviewVerdict = "APPROVED" | "CORRECTION_NEEDED" | "BLOCKED";
export type ScopeClassification = "in-scope" | "supporting" | "out-of-scope" | "sensitive";

export type ExecutionBaseline = {
  gitHead: string | null;
  dirty: boolean;
  capturedAt: string;
};

export type ScopeViolation = {
  path: string;
  classification: "out-of-scope" | "sensitive";
  reason: string;
};

export type ContextExpansion = {
  from: ContextRadius;
  to: ContextRadius;
  reason: string;
  at: string;
};

export type ExecutionRun = {
  schema: "uads.execution-run";
  schemaVersion: "0.3.0";
  executionRunId: string;
  projectId: string;
  workOrderId: string;
  routingDecisionId: string;
  createdAt: string;
  updatedAt: string;
  attempt: number;
  phase: ExecutionPhase;
  status: ExecutionStatus;
  baseline: ExecutionBaseline;
  contextRadius: ContextRadius;
  contextCandidates: string[];
  implementerRole: string;
  implementerSessionId: string | null;
  requiredReviewers: string[];
  selectedGates: string[];
  currentChangeDigest: string | null;
  reviewedChangeDigest: string | null;
  changedFiles: string[];
  scopeViolations: ScopeViolation[];
  evidenceRefs: string[];
  reviewRefs: string[];
  blockers: string[];
  nextAction: string;
  expansionHistory: ContextExpansion[];
  contextPackId?: string | null;
  impactReportId?: string | null;
  indexDigest?: string | null;
  modelPlanId?: string | null;
  selectedProfileId?: string | null;
  selectedProviderId?: string | null;
  selectedModelId?: string | null;
  selectionMode?: "router" | "host-managed";
  modelExecutionStrategy?: ModelExecutionStrategy;
};

export type ExecutionPacket = {
  schema: "uads.execution-packet";
  schemaVersion: "0.3.0";
  executionRunId: string;
  workOrderId: string;
  objective: string;
  includedScope: string[];
  outOfScope: string[];
  riskLevel: RiskLevel;
  domains: string[];
  contextRadius: ContextRadius;
  contextCandidates: string[];
  specialists: string[];
  assuranceReviewers: string[];
  specialistSelectionPlanId?: string | null;
  specialistSelectionDigest?: string | null;
  specialistAssignments?: Array<{
    specialistId: string;
    role: string;
    objective: string;
    coveredDomains: string[];
    relevantAffectedAreas: string[];
    relevantFiles: string[];
    relevantGates: string[];
    evidenceObligations: string[];
    riskLevel: RiskLevel;
    forbiddenScope: string[];
    dependencyGroup: number;
    parallelEligible: boolean;
  }>;
  selectedGates: string[];
  acceptanceCriteria: string[];
  requiredEvidence: string[];
  safeAutonomousActions: string[];
  approvalGatedActions: string[];
  stopConditions: string[];
  baselineGitHead: string | null;
  nextAction: string;
  contextPackId?: string | null;
  impactReportId?: string | null;
  indexDigest?: string | null;
  modelPlanId?: string | null;
  selectedProfileId?: string | null;
  selectedProviderId?: string | null;
  selectedModelId?: string | null;
  selectionMode?: "router" | "host-managed";
  modelExecutionStrategy?: ModelExecutionStrategy;
};

export type EvidenceRecord = {
  schema: "uads.evidence-record";
  schemaVersion: "0.3.0";
  evidenceId: string;
  projectId: string;
  workOrderId: string;
  executionRunId: string;
  changeDigest: string;
  gateId: string;
  sourceRole: string;
  kind: EvidenceKind;
  createdAt: string;
  status: EvidenceRuntimeStatus;
  summary: string;
  command?: string;
  exitCode?: number | null;
  outputRef?: string | null;
  outputDigest?: string | null;
  fileRef?: string | null;
  fileDigest?: string | null;
  source?: "executed" | "cache-reuse";
  sourceCacheRecordId?: string;
  sourceEvidenceId?: string;
  cacheDecisionId?: string;
  reuseProofDigest?: string;
  gateReuseContractIdentity?: string;
};

export type ReviewFinding = {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: string;
  message: string;
};

export type ReviewRecord = {
  schema: "uads.review-record";
  schemaVersion: "0.3.0";
  reviewId: string;
  projectId: string;
  workOrderId: string;
  executionRunId: string;
  changeDigest: string;
  reviewerRole: string;
  reviewSessionId: string;
  implementerRole: string;
  implementerSessionId: string;
  verdict: ReviewVerdict;
  summary: string;
  findings: ReviewFinding[];
  reasonCodes?: string[];
  evidenceRefs: string[];
  createdAt: string;
};

export type ReviewPacket = {
  schema: "uads.review-packet";
  schemaVersion: "0.3.0";
  executionRunId: string;
  workOrderId: string;
  objective: string;
  acceptanceCriteria: string[];
  includedScope: string[];
  outOfScope: string[];
  changedFiles: string[];
  changeDigest: string;
  gateStates: Array<{ gateId: string; status: GateRuntimeStatus }>;
  evidenceRefs: string[];
  requiredReviewers: string[];
  riskLevel: RiskLevel;
  roleToGateMapping?: Record<string, string[]>;
  requiredEvidenceObligations?: string[];
  unresolvedBlockers?: string[];
  doNotImplement?: string[];
  independentReviewInvariant?: string;
  nextAction: string;
};

export type GateStateSnapshot = {
  gateId: string;
  status: GateRuntimeStatus;
  evidenceId: string | null;
};

export type ExecutionResumeView = {
  executionRunId: string | null;
  attempt: number | null;
  phase: ExecutionPhase | null;
  status: ExecutionStatus | string;
  changeDigest: string | null;
  pendingGates: string[];
  failedGates: string[];
  requiredReviewers: string[];
  completedReviewers: string[];
  blockers: string[];
  nextAction: string;
};

export type ChangedFile = {
  path: string;
  classification: ScopeClassification;
  reason: string;
};

export type ChangeSet = {
  digest: string;
  files: ChangedFile[];
  violations: ScopeViolation[];
};
