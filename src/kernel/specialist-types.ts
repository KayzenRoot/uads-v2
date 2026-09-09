import type { DomainId } from "./domains.js";
import type { RiskLevel, ScopeClass } from "./types.js";

export const SPECIALIST_SCHEMA_VERSION = "0.9.0" as const;
export const SPECIALIST_POLICY_VERSION = "0.9.0" as const;

export type SpecialistKind = "core" | "domain" | "assurance";
export type SpecialistStatus = "enabled" | "disabled" | "experimental";
export type SpecialistSource = "builtin" | "user-config" | "adapter";
export type SpecialistIndependenceClass = "implementation" | "support" | "independent-review" | "assurance";

export type SpecialistFunction =
  | "inspect"
  | "requirements"
  | "architecture"
  | "planning"
  | "implementation"
  | "testing"
  | "independent-review"
  | "security-assurance"
  | "performance-assurance"
  | "reliability-assurance"
  | "checkpoint"
  | "frontend"
  | "backend-api"
  | "database"
  | "mobile"
  | "platform-cloud"
  | "data-ai"
  | "web3-contract"
  | "finance-math"
  | "game-systems"
  | "documentation"
  | "release"
  | "quality";

export type SpecialistActivation = {
  scopeClasses?: ScopeClass[];
  minRisk?: RiskLevel;
  domainAny?: DomainId[];
  riskSignalsAny?: string[];
  gatesAny?: string[];
  affectedAreaAny?: string[];
};

export type SpecialistDependencySignals = {
  crossCutting: boolean;
  source: "scope-classifier" | "impact-report" | "host-structured";
};

export type SpecialistObligationKind =
  | "domain"
  | "gate"
  | "evidence"
  | "assurance"
  | "affected-area"
  | "dependency";

export type SpecialistObligation = {
  obligationId: string;
  kind: SpecialistObligationKind;
  domainId: string | null;
  gateId: string | null;
  evidenceId: string | null;
  affectedArea: string | null;
  specialistId: string | null;
};

export type SpecialistObligationCoverage = {
  obligationId: string;
  gateId: string | null;
  evidenceId: string | null;
  specialistId: string;
  reasonCode: string;
  coverageKind: SpecialistObligationKind;
};

export type SpecialistUnmetObligation = {
  obligationId: string;
  gateId: string | null;
  evidenceId: string | null;
  specialistId: string | null;
  reasonCode: string;
  coverageKind: SpecialistObligationKind;
};

export type SpecialistProfile = {
  schema: "uads.specialist-profile";
  schemaVersion: typeof SPECIALIST_SCHEMA_VERSION;
  specialistId: string;
  kind: SpecialistKind;
  status: SpecialistStatus;
  purpose: string;
  coveredDomains: DomainId[];
  functions: SpecialistFunction[];
  mayImplement: boolean;
  reviewOnly: boolean;
  independenceClass: SpecialistIndependenceClass;
  activation: SpecialistActivation;
  requiredInputs: string[];
  producesEvidence: string[];
  incompatibleWith: string[];
  priority: number;
  source: SpecialistSource;
  notes: string | null;
  profileDigest: string;
};

export type SpecialistRegistry = {
  schema: "uads.specialist-registry";
  schemaVersion: typeof SPECIALIST_SCHEMA_VERSION;
  profiles: SpecialistProfile[];
  registryDigest: string;
  policyVersion: typeof SPECIALIST_POLICY_VERSION;
};

export type SpecialistSelection = {
  specialistId: string;
  kind: SpecialistKind;
  role: string;
  required: boolean;
  reasonCodes: string[];
  coversDomains: DomainId[];
  coversGates: string[];
  independenceClass: SpecialistIndependenceClass;
};

export type SpecialistRejection = {
  specialistId: string;
  reasonCodes: string[];
  reasons: string[];
};

export type SpecialistAssignment = {
  specialistId: string;
  role: string;
  objective: string;
  coveredDomains: DomainId[];
  relevantAffectedAreas: string[];
  relevantFiles: string[];
  relevantGates: string[];
  evidenceObligations: string[];
  riskLevel: RiskLevel;
  forbiddenScope: string[];
  dependencyGroup: number;
  parallelEligible: boolean;
};

export type SpecialistDispatchPlan = {
  dependencyGroups: string[][];
  parallelEligibleGroups: string[][];
};

export type SpecialistSelectionPlan = {
  schema: "uads.specialist-selection-plan";
  schemaVersion: typeof SPECIALIST_SCHEMA_VERSION;
  selectionPlanId: string;
  projectId: string;
  workOrderId: string;
  workOrderDigest: string;
  routingDigest: string;
  registryDigest: string;
  policyDigest: string;
  changeDigest: string | null;
  impactDigest: string | null;
  gateContractDigest: string | null;
  selected: SpecialistSelection[];
  assurance: SpecialistSelection[];
  assignments: SpecialistAssignment[];
  rejections: SpecialistRejection[];
  unmetCoverage: string[];
  requiredObligations: SpecialistObligation[];
  coveredObligations: SpecialistObligationCoverage[];
  unmetObligations: SpecialistUnmetObligation[];
  conflicts: string[];
  dispatch: SpecialistDispatchPlan;
  status: "SELECTED" | "BLOCKED";
  blockedReasonCodes: string[];
  selectionDigest: string;
};

export type SpecialistRoutingInput = {
  projectId: string;
  workOrderId: string;
  objective: string;
  constraints: string[];
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  domains: string[];
  scopeClass: ScopeClass;
  riskLevel: RiskLevel;
  riskSignals: string[];
  riskReasons?: string[];
  affectedAreas: string[];
  gates: string[];
  requiredEvidence: string[];
  dependencyInfo?: string[];
  dependencySignals?: SpecialistDependencySignals | null;
  changeDigest?: string | null;
  impactDigest?: string | null;
  gateContractDigest?: string | null;
  registry: SpecialistRegistry;
  allowExperimental?: boolean;
};
