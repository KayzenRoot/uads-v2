import type { SpecialistDependencySignals } from "./specialist-types.js";

export const SCHEMA_VERSION = "0.2.0";

export type ScopeClass = "trivial" | "local" | "cross-cutting" | "architectural";
export type ScopeControl = "NECESSARY" | "IMPORTANT" | "FUTURE" | "OUT_OF_SCOPE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ContextRadius = "C0" | "C1" | "C2" | "C3" | "C4" | "C5";
export type CapabilityClass = "economy" | "balanced" | "strong" | "critical";
export type Phase = "intake" | "classify" | "plan" | "implement" | "verify" | "review" | "stopped";
export type IntakeClassifier = "host-structured" | "fallback-text";

export type ActiveApprovalGatedAction =
  | "production deployment"
  | "destructive production database operation"
  | "spending money / material-cost external infrastructure action"
  | "rotating real credentials"
  | "destructive Git history rewrite"
  | "publishing package/release when not already authorized"
  | "transferring assets/funds"
  | "on-chain transaction execution";

export type NormalizedIntake = {
  schema: "uads.intake";
  schemaVersion: "0.2.0";
  objective: string;
  constraints: string[];
  requestedArtifacts: string[];
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  domainSignals: string[];
  riskSignals: string[];
  destructiveSignals: string[];
  affectedAreas: string[];
  uncertainties: string[];
  approvedBoundaries: string[];
  classifier: IntakeClassifier;
};

export type RepositoryMap = {
  schema: "uads.repository-map";
  schemaVersion: "0.2.0";
  projectId: string;
  generatedAt: string;
  mapVersion: "0.2.0";
  repositoryName: string;
  digest: string;
  gitHead: string | null;
  branch: string | null;
  dirty: boolean;
  dirtyDigest: string;
  reused: boolean;
  languages: string[];
  packageManager: string | null;
  frameworks: string[];
  commands: Record<string, string | null>;
  signals: Record<string, boolean>;
  modules: Array<{ id: string; path: string; kind: string }>;
  entrypoints: string[];
  locations: {
    agentsMd: string[];
    cursor: string[];
    skills: string[];
  };
  manifestHashes: Record<string, string>;
};

export type RoutingDecision = {
  schema: "uads.routing-decision";
  schemaVersion: "0.2.0";
  routingDecisionId: string;
  projectId: string;
  createdAt: string;
  scopeClass: ScopeClass;
  scopeReasons: string[];
  riskLevel: RiskLevel;
  riskReasons: string[];
  domains: Array<{ id: string; reason: string }>;
  specialists: string[];
  assuranceSpecialists: string[];
  specialistSelectionPlanId?: string;
  specialistSelectionDigest?: string;
  specialistRegistryDigest?: string;
  specialistPolicyDigest?: string;
  specialistChangeDigest?: string | null;
  specialistImpactDigest?: string | null;
  specialistGateContractDigest?: string | null;
  specialistRiskSignals?: string[];
  specialistDependencySignals?: SpecialistDependencySignals | null;
  gates: Array<{ id: string; reason: string }>;
  contextRadius: ContextRadius;
  contextReason: string;
  capabilityClass: CapabilityClass;
  orderConstraints: string[];
  stopConditions: string[];
  warnings: string[];
};

export type WorkOrder = {
  schema: "uads.work-order";
  schemaVersion: "0.2.0";
  workOrderId: string;
  projectId: string;
  title: string;
  objective: string;
  status: "draft" | "planned" | "active" | "blocked" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  intakeRef: string;
  routingDecisionId: string;
  scopeClass: ScopeClass;
  includedScope: string[];
  outOfScope: string[];
  recommendations: string[];
  riskLevel: RiskLevel;
  riskReasons: string[];
  constraints?: string[];
  requestedArtifacts?: string[];
  destructiveSignals?: string[];
  domains: string[];
  affectedAreas: string[];
  specialists: string[];
  assuranceReviewers: string[];
  specialistSelectionPlanId?: string;
  specialistSelectionDigest?: string;
  specialistRegistryDigest?: string;
  specialistPolicyDigest?: string;
  specialistChangeDigest?: string | null;
  specialistImpactDigest?: string | null;
  specialistGateContractDigest?: string | null;
  specialistRiskSignals?: string[];
  specialistDependencySignals?: SpecialistDependencySignals | null;
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
  qualityGates: string[];
  contextRadius: ContextRadius;
  tokenBudget: {
    softLimit: number;
    hardLimit: number;
    capabilityClass: CapabilityClass;
    cachePreference: "prefer-cache" | "refresh";
    expansionPolicy: string;
  };
  dependencies: string[];
  acceptanceCriteria: string[];
  requiredEvidence: string[];
  stopConditions: string[];
  autonomyBoundary: {
    safeAutonomous: string[];
    requiresApproval: string[];
    activeApprovalGatedActions?: ActiveApprovalGatedAction[];
    activeApprovalIntentAmbiguous?: boolean;
  };
  nextAction: string;
};

export type Checkpoint = {
  schema: "uads.checkpoint";
  schemaVersion: "0.2.0";
  checkpointId: string;
  projectId: string;
  workOrderId: string | null;
  routingDecisionId: string | null;
  createdAt: string;
  updatedAt: string;
  phase: Phase;
  status: "pending" | "in_progress" | "blocked" | "completed" | "failed";
  completedSteps: string[];
  nextAction: string;
  blockers: string[];
  evidenceRefs: string[];
  repositoryMapDigest: string | null;
  contextPlanRef: string | null;
  resumeCursor: string;
};

export type ResumePacket = {
  projectId: string;
  workOrderId: string | null;
  phase: Phase | null;
  status: string;
  objective: string | null;
  completedSteps: string[];
  scopeClass: ScopeClass | null;
  riskLevel: RiskLevel | null;
  specialists: string[];
  gates: string[];
  repositoryMapDigest: string | null;
  contextPlanRef: string | null;
  evidenceRefs: string[];
  blockers: string[];
  nextAction: string;
  invalidState?: string;
  executionRunId?: string | null;
  attempt?: number | null;
  changeDigest?: string | null;
  pendingGates?: string[];
  failedGates?: string[];
  requiredReviewers?: string[];
  completedReviewers?: string[];
  contextPackId?: string | null;
  impactReportId?: string | null;
  indexDigest?: string | null;
  activeFailureId?: string | null;
  failureSignaturePrefix?: string | null;
  diagnosisStatus?: string | null;
  loopDetected?: boolean;
  recommendedDiagnosticRadius?: string | null;
  cacheReusableRecords?: number;
  costBudgetStatus?: string;
  qptRatio?: number | null;
  modelPlanId?: string | null;
  modelRoutingStatus?: string | null;
  selectedProfileId?: string | null;
  modelSelectionMode?: string | null;
  specialistSelectionPlanId?: string | null;
  specialistSelectionStatus?: string | null;
};

export type ContextPlan = {
  radius: ContextRadius;
  reason: string;
  candidateAreas: string[];
  reusableArtifacts: string[];
  contextPackId?: string | null;
  impactReportId?: string | null;
  indexDigest?: string | null;
};

export const IMPLEMENTER_ROLE = "implementation-agent";
export const INDEPENDENT_REVIEWER_ROLE = "independent-reviewer";
