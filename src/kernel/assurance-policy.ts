import type {
  EvidenceRecord,
  ExecutionRun,
  GateStateSnapshot,
  ReviewRecord,
} from "./execution-types.js";
import { sha256Hex } from "../lib/hash.js";
import { gateDef, isKnownGateId, isReviewGate } from "./gates.js";
import type { WorkOrder } from "./types.js";
import type { SpecialistObligation, SpecialistSelectionPlan } from "./specialist-types.js";

export const ASSURANCE_POLICY_VERSION = "0.11.0" as const;

export const ASSURANCE_ROLES = [
  "independent-reviewer",
  "security-reviewer",
  "performance-reviewer",
  "reliability-reviewer",
] as const;

export type AssuranceRole = (typeof ASSURANCE_ROLES)[number];
export type AssuranceMode = "status" | "submission" | "finalize";

export const ASSURANCE_REASON_CODES = {
  UNKNOWN_REVIEWER_ROLE: "UNKNOWN_REVIEWER_ROLE",
  REVIEWER_ROLE_NOT_REQUIRED: "REVIEWER_ROLE_NOT_REQUIRED",
  REQUIRED_ROLE_BINDING_MISMATCH: "REQUIRED_ROLE_BINDING_MISMATCH",
  SELECTED_GATE_BINDING_MISMATCH: "SELECTED_GATE_BINDING_MISMATCH",
  CURRENT_DIGEST_REQUIRED: "CURRENT_DIGEST_REQUIRED",
  IMPLEMENTER_SESSION_REQUIRED: "IMPLEMENTER_SESSION_REQUIRED",
  SCOPE_VIOLATION: "SCOPE_VIOLATION",
  REVIEWED_DIGEST_MISMATCH: "REVIEWED_DIGEST_MISMATCH",
  STALE_REVIEW_DIGEST: "STALE_REVIEW_DIGEST",
  REVIEW_IDENTITY_MISMATCH: "REVIEW_IDENTITY_MISMATCH",
  IMPLEMENTER_ROLE_REVIEW: "IMPLEMENTER_ROLE_REVIEW",
  IMPLEMENTER_SESSION_REVIEW: "IMPLEMENTER_SESSION_REVIEW",
  REVIEW_SESSION_MISSING: "REVIEW_SESSION_MISSING",
  REVIEW_IMPLEMENTER_SESSION_MISMATCH: "REVIEW_IMPLEMENTER_SESSION_MISMATCH",
  DUPLICATE_REVIEW_APPROVAL: "DUPLICATE_REVIEW_APPROVAL",
  DUPLICATE_REVIEW_ID: "DUPLICATE_REVIEW_ID",
  DUPLICATE_REVIEW_SESSION: "DUPLICATE_REVIEW_SESSION",
  NON_REVIEW_GATE_NOT_PASS: "NON_REVIEW_GATE_NOT_PASS",
  CURRENT_FAIL_BLOCKED_EVIDENCE: "CURRENT_FAIL_BLOCKED_EVIDENCE",
  EVIDENCE_REFERENCE_MISMATCH: "EVIDENCE_REFERENCE_MISMATCH",
  EVIDENCE_IDENTITY_MISMATCH: "EVIDENCE_IDENTITY_MISMATCH",
  APPROVAL_CONTRADICTS_HIGH_FINDING: "APPROVAL_CONTRADICTS_HIGH_FINDING",
  APPROVAL_CONTRADICTS_CRITICAL_FINDING: "APPROVAL_CONTRADICTS_CRITICAL_FINDING",
  NEGATIVE_VERDICT_REASON_REQUIRED: "NEGATIVE_VERDICT_REASON_REQUIRED",
  REVIEW_BLOCKED: "REVIEW_BLOCKED",
  REVIEW_CORRECTION_REQUIRED: "REVIEW_CORRECTION_REQUIRED",
  ROLE_GATE_MISMATCH: "ROLE_GATE_MISMATCH",
  PERFORMANCE_EVIDENCE_MISSING: "PERFORMANCE_EVIDENCE_MISSING",
  RELIABILITY_OBLIGATION_UNSATISFIED: "RELIABILITY_OBLIGATION_UNSATISFIED",
  MISSING_REQUIRED_REVIEWER: "MISSING_REQUIRED_REVIEWER",
  REVIEW_NOT_APPROVED: "REVIEW_NOT_APPROVED",
  SPECIALIST_SELECTION_INVALID: "SPECIALIST_SELECTION_INVALID",
  TYPED_ASSURANCE_OBLIGATION_MISSING: "TYPED_ASSURANCE_OBLIGATION_MISSING",
  TYPED_ASSURANCE_OBLIGATION_UNSATISFIED: "TYPED_ASSURANCE_OBLIGATION_UNSATISFIED",
} as const;

export type AssuranceReasonCode = (typeof ASSURANCE_REASON_CODES)[keyof typeof ASSURANCE_REASON_CODES];

type RoleDefinition = {
  gateIds: readonly string[];
};

const ROLE_DEFINITIONS: Readonly<Record<AssuranceRole, RoleDefinition>> = Object.freeze({
  "independent-reviewer": { gateIds: [] },
  "security-reviewer": { gateIds: ["security-review"] },
  "performance-reviewer": { gateIds: ["performance-check"] },
  "reliability-reviewer": { gateIds: ["database-migration", "rollback-validation"] },
});

export type AssurancePolicyInput = {
  mode: AssuranceMode;
  projectId: string;
  workOrder: WorkOrder;
  run: ExecutionRun;
  gateStates: GateStateSnapshot[];
  evidence: EvidenceRecord[];
  reviews: ReviewRecord[];
  candidate?: ReviewRecord;
  specialistSelectionPlan?: SpecialistSelectionPlan;
};

export type AssurancePolicyResult = {
  allowed: boolean;
  reasonCodes: AssuranceReasonCode[];
  blockers: string[];
  requiredRoles: AssuranceRole[];
  satisfiedRoles: AssuranceRole[];
  pendingRoles: AssuranceRole[];
  blockedRoles: AssuranceRole[];
  currentEvidenceRefs: string[];
  currentFindingCounts: Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number>;
};

export function isRecognizedAssuranceRole(value: string): value is AssuranceRole {
  return (ASSURANCE_ROLES as readonly string[]).includes(value);
}

export function assuranceRoleToGates(role: string): string[] {
  if (!isRecognizedAssuranceRole(role)) return [];
  return [...ROLE_DEFINITIONS[role].gateIds];
}

export function assuranceRoleGateMapping(selectedGates: string[]): Record<AssuranceRole, string[]> {
  const selected = new Set(selectedGates);
  return Object.fromEntries(
    ASSURANCE_ROLES.map((role) => [role, assuranceRoleToGates(role).filter((gateId) => selected.has(gateId))]),
  ) as Record<AssuranceRole, string[]>;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) => a.localeCompare(b));
}

function sameSet(left: string[], right: string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function evidenceRef(run: ExecutionRun, record: EvidenceRecord): string {
  return `sidecar://execution-runs/${run.executionRunId}/evidence/${record.evidenceId}.json`;
}

function reviewIdentityMatches(input: AssurancePolicyInput, review: ReviewRecord): boolean {
  return (
    review.projectId === input.projectId &&
    review.projectId === input.workOrder.projectId &&
    review.workOrderId === input.workOrder.workOrderId &&
    review.executionRunId === input.run.executionRunId &&
    review.changeDigest === input.run.currentChangeDigest
  );
}

function evidenceIdentityMatches(input: AssurancePolicyInput, record: EvidenceRecord): boolean {
  return (
    record.projectId === input.projectId &&
    record.projectId === input.workOrder.projectId &&
    record.workOrderId === input.workOrder.workOrderId &&
    record.executionRunId === input.run.executionRunId &&
    record.changeDigest === input.run.currentChangeDigest
  );
}

function currentEvidence(input: AssurancePolicyInput): EvidenceRecord[] {
  return input.evidence.filter((record) => evidenceIdentityMatches(input, record));
}

function currentReviews(input: AssurancePolicyInput): ReviewRecord[] {
  const records = input.candidate ? [...input.reviews, input.candidate] : input.reviews;
  return records.filter((review) => reviewIdentityMatches(input, review));
}

function addReason(
  reasons: Set<AssuranceReasonCode>,
  blockers: string[],
  code: AssuranceReasonCode,
  subject?: string,
): void {
  reasons.add(code);
  blockers.push(subject ? `${code}:${subject}` : code);
}

function reviewFindingCounts(reviews: ReviewRecord[]): Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number> {
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const review of reviews) {
    for (const finding of review.findings) {
      if (finding.severity in counts) counts[finding.severity] += 1;
    }
  }
  return counts;
}

function sameNullable(left: string | null, right: string | null): boolean {
  return left === right;
}

function typedPlanDigestIsValid(plan: SpecialistSelectionPlan): boolean {
  const { selectionDigest, ...withoutDigest } = plan;
  return selectionDigest === sha256Hex(JSON.stringify(withoutDigest));
}

function typedSelectionPlanIsValid(input: AssurancePolicyInput): boolean {
  const plan = input.specialistSelectionPlan;
  if (!plan || plan.status !== "SELECTED" || !typedPlanDigestIsValid(plan)) return false;
  if (plan.projectId !== input.projectId || plan.projectId !== input.workOrder.projectId || plan.workOrderId !== input.workOrder.workOrderId) return false;
  if (plan.unmetCoverage.length > 0 || plan.unmetObligations.length > 0 || plan.blockedReasonCodes.length > 0) return false;
  const selectedIds = new Set([...plan.selected, ...plan.assurance].map((item) => item.specialistId));
  const required = new Map<string, SpecialistObligation>();
  for (const obligation of plan.requiredObligations) {
    if (required.has(obligation.obligationId)) return false;
    required.set(obligation.obligationId, obligation);
    if (obligation.kind === "gate") {
      if (!obligation.gateId || !isKnownGateId(obligation.gateId)) return false;
      if (obligation.evidenceId !== gateDef(obligation.gateId)?.evidence) return false;
    }
  }
  for (const gateId of input.run.selectedGates) {
    if (![...required.values()].some((item) => item.kind === "gate" && item.gateId === gateId)) return false;
  }
  for (const role of input.run.requiredReviewers) {
    if (!required.has(`assurance:${role}`)) return false;
  }
  const covered = new Map<string, SpecialistSelectionPlan["coveredObligations"]>();
  for (const item of plan.coveredObligations) {
    const obligation = required.get(item.obligationId);
    if (!obligation || !selectedIds.has(item.specialistId)) return false;
    if (!sameNullable(item.gateId, obligation.gateId) || !sameNullable(item.evidenceId, obligation.evidenceId) || item.coverageKind !== obligation.kind) return false;
    if (obligation.specialistId !== null && item.specialistId !== obligation.specialistId) return false;
    covered.set(item.obligationId, [...(covered.get(item.obligationId) ?? []), item]);
  }
  for (const obligation of required.values()) {
    const matches = covered.get(obligation.obligationId) ?? [];
    if (matches.length !== 1 || !sameNullable(matches[0]?.gateId ?? null, obligation.gateId) || !sameNullable(matches[0]?.evidenceId ?? null, obligation.evidenceId)) return false;
  }
  return true;
}

function typedRoleObligations(input: AssurancePolicyInput, role: AssuranceRole): SpecialistObligation[] {
  const plan = input.specialistSelectionPlan;
  if (!plan) return [];
  const roleGates = new Set(ROLE_DEFINITIONS[role].gateIds);
  return plan.requiredObligations.filter((item) => item.specialistId === role || (item.kind === "gate" && item.gateId !== null && roleGates.has(item.gateId)));
}

function hasRelevantEvidence(input: AssurancePolicyInput, role: AssuranceRole): boolean {
  if (role === "independent-reviewer") return typedRoleObligations(input, role).some((item) => item.kind === "assurance" && item.specialistId === role);
  const plan = input.specialistSelectionPlan;
  const obligations = typedRoleObligations(input, role);
  if (!plan || obligations.length === 0) return false;
  const selectedGates = new Set(input.run.selectedGates);
  const requiredRoleGate = role === "security-reviewer"
    ? "security-review"
    : role === "performance-reviewer"
      ? "performance-check"
      : role === "reliability-reviewer"
        ? "rollback-validation"
        : null;
  if (requiredRoleGate && !selectedGates.has(requiredRoleGate)) return false;
  const current = currentEvidence(input);
  return obligations.every((obligation) => {
    const coverage = plan.coveredObligations.find((item) => item.obligationId === obligation.obligationId);
    if (!coverage || coverage.specialistId !== role || coverage.gateId !== obligation.gateId || coverage.evidenceId !== obligation.evidenceId) return false;
    if (obligation.kind === "assurance") return true;
    if (obligation.kind !== "gate" && obligation.kind !== "evidence") return true;
    const definition = obligation.gateId ? gateDef(obligation.gateId) : undefined;
    if (definition?.contractKind === "review" && definition.reviewerRole === role) return true;
    return current.some((record) => record.status === "PASS" && record.gateId === obligation.gateId);
  });
}

function reviewReferencesAreCurrent(input: AssurancePolicyInput, review: ReviewRecord, evidence: EvidenceRecord[]): boolean {
  const validRefs = new Set(evidence.map((record) => evidenceRef(input.run, record)));
  return review.evidenceRefs.every((ref) => validRefs.has(ref));
}

function roleGateIsSufficient(
  input: AssurancePolicyInput,
  role: AssuranceRole,
  review: ReviewRecord,
): boolean {
  const selected = new Set(input.run.selectedGates);
  const states = new Map(input.gateStates.map((state) => [state.gateId, state.status]));
  for (const gateId of assuranceRoleToGates(role)) {
    if (!selected.has(gateId)) continue;
    const state = states.get(gateId);
    if (role === "security-reviewer" || role === "performance-reviewer") {
      // The review being submitted is the proof for its own review gate.
      if (gateDef(gateId)?.reviewerRole === role && review.verdict === "APPROVED") continue;
    }
    if (state !== "PASS") return false;
  }
  return true;
}

export function evaluateAssurancePolicy(input: AssurancePolicyInput): AssurancePolicyResult {
  const reasons = new Set<AssuranceReasonCode>();
  const blockers: string[] = [];
  const requiredRoles = sortedUnique(input.run.requiredReviewers) as AssuranceRole[];
  const current = currentReviews(input);
  const evidence = currentEvidence(input);
  const evidenceRefs = evidence.map((record) => evidenceRef(input.run, record)).sort((a, b) => a.localeCompare(b));
  const counts = reviewFindingCounts(current);

  if (!input.run.currentChangeDigest) addReason(reasons, blockers, ASSURANCE_REASON_CODES.CURRENT_DIGEST_REQUIRED);
  if (!input.run.implementerSessionId) addReason(reasons, blockers, ASSURANCE_REASON_CODES.IMPLEMENTER_SESSION_REQUIRED);
  if (input.run.scopeViolations.length > 0) addReason(reasons, blockers, ASSURANCE_REASON_CODES.SCOPE_VIOLATION);
  if (input.run.reviewedChangeDigest && input.run.reviewedChangeDigest !== input.run.currentChangeDigest) {
    addReason(reasons, blockers, ASSURANCE_REASON_CODES.REVIEWED_DIGEST_MISMATCH);
  }
  if (!sameSet(input.run.requiredReviewers, input.workOrder.assuranceReviewers) || requiredRoles.some((role) => !isRecognizedAssuranceRole(role))) {
    addReason(reasons, blockers, ASSURANCE_REASON_CODES.REQUIRED_ROLE_BINDING_MISMATCH);
  }
  if (!sameSet(input.run.selectedGates, input.workOrder.qualityGates) || input.run.selectedGates.some((gateId) => !isKnownGateId(gateId))) {
    addReason(reasons, blockers, ASSURANCE_REASON_CODES.SELECTED_GATE_BINDING_MISMATCH);
  }
  if (!typedSelectionPlanIsValid(input)) addReason(reasons, blockers, ASSURANCE_REASON_CODES.SPECIALIST_SELECTION_INVALID);

  for (const gate of input.gateStates) {
    if (!isReviewGate(gate.gateId) && gate.status !== "PASS") {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.NON_REVIEW_GATE_NOT_PASS, `${gate.gateId}:${gate.status}`);
    }
  }
  for (const record of evidence.filter((item) => input.run.selectedGates.includes(item.gateId))) {
    if ((record.status === "FAIL" || record.status === "BLOCKED") && !isReviewGate(record.gateId)) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.CURRENT_FAIL_BLOCKED_EVIDENCE, record.gateId);
    }
  }

  const approvalsByRole = new Map<AssuranceRole, ReviewRecord[]>();
  const approvedSessions = new Map<string, AssuranceRole>();
  const reviewIds = new Set<string>();
  for (const review of current) {
    if (reviewIds.has(review.reviewId)) addReason(reasons, blockers, ASSURANCE_REASON_CODES.DUPLICATE_REVIEW_ID, review.reviewId);
    reviewIds.add(review.reviewId);
    if (!isRecognizedAssuranceRole(review.reviewerRole)) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.UNKNOWN_REVIEWER_ROLE, review.reviewerRole);
      continue;
    }
    const role = review.reviewerRole;
    if (!requiredRoles.includes(role)) addReason(reasons, blockers, ASSURANCE_REASON_CODES.REVIEWER_ROLE_NOT_REQUIRED, role);
    if (!reviewIdentityMatches(input, review)) addReason(reasons, blockers, ASSURANCE_REASON_CODES.STALE_REVIEW_DIGEST, role);
    if (!review.reviewSessionId) addReason(reasons, blockers, ASSURANCE_REASON_CODES.REVIEW_SESSION_MISSING, role);
    if (role === input.run.implementerRole) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.IMPLEMENTER_ROLE_REVIEW, role);
    }
    if (review.implementerRole !== input.run.implementerRole) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.REVIEW_IDENTITY_MISMATCH, role);
    }
    if (!input.run.implementerSessionId || review.implementerSessionId !== input.run.implementerSessionId) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.REVIEW_IMPLEMENTER_SESSION_MISMATCH, role);
    }
    if (review.reviewSessionId === input.run.implementerSessionId) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.IMPLEMENTER_SESSION_REVIEW, role);
    }
    if (!reviewReferencesAreCurrent(input, review, evidence)) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.EVIDENCE_REFERENCE_MISMATCH, role);
    }
    if (review.evidenceRefs.some((ref) => !ref.startsWith(`sidecar://execution-runs/${input.run.executionRunId}/evidence/`))) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.EVIDENCE_IDENTITY_MISMATCH, role);
    }
    const high = review.findings.some((finding) => finding.severity === "HIGH");
    const critical = review.findings.some((finding) => finding.severity === "CRITICAL");
    if (review.verdict === "APPROVED" && high) addReason(reasons, blockers, ASSURANCE_REASON_CODES.APPROVAL_CONTRADICTS_HIGH_FINDING, role);
    if (review.verdict === "APPROVED" && critical) addReason(reasons, blockers, ASSURANCE_REASON_CODES.APPROVAL_CONTRADICTS_CRITICAL_FINDING, role);
    if ((review.verdict === "BLOCKED" || review.verdict === "CORRECTION_NEEDED") && review.findings.length === 0 && (review.reasonCodes ?? []).length === 0) {
      addReason(reasons, blockers, ASSURANCE_REASON_CODES.NEGATIVE_VERDICT_REASON_REQUIRED, role);
    }
    if (review.verdict === "APPROVED") {
      const approvals = approvalsByRole.get(role) ?? [];
      approvals.push(review);
      approvalsByRole.set(role, approvals);
      if (approvedSessions.has(review.reviewSessionId) && approvedSessions.get(review.reviewSessionId) !== role) {
        addReason(reasons, blockers, ASSURANCE_REASON_CODES.DUPLICATE_REVIEW_SESSION, review.reviewSessionId);
      } else {
        approvedSessions.set(review.reviewSessionId, role);
      }
      if (approvals.length > 1) addReason(reasons, blockers, ASSURANCE_REASON_CODES.DUPLICATE_REVIEW_APPROVAL, role);
      if (input.mode !== "status" && !roleGateIsSufficient(input, role, review)) {
        addReason(
          reasons,
          blockers,
          role === "reliability-reviewer" ? ASSURANCE_REASON_CODES.RELIABILITY_OBLIGATION_UNSATISFIED : ASSURANCE_REASON_CODES.ROLE_GATE_MISMATCH,
          role,
        );
      }
      if (input.mode !== "status" && !hasRelevantEvidence(input, role)) {
        addReason(reasons, blockers, role === "performance-reviewer" ? ASSURANCE_REASON_CODES.PERFORMANCE_EVIDENCE_MISSING : ASSURANCE_REASON_CODES.TYPED_ASSURANCE_OBLIGATION_UNSATISFIED, role);
      }
    }
  }

  const satisfiedRoles = requiredRoles.filter((role) => (approvalsByRole.get(role)?.length ?? 0) > 0);
  const blockedRoles = requiredRoles.filter((role) => current.some((review) => review.reviewerRole === role && review.verdict === "BLOCKED"));
  const pendingRoles = requiredRoles.filter((role) => !satisfiedRoles.includes(role));
  if (input.mode === "finalize") {
    for (const role of pendingRoles) addReason(reasons, blockers, ASSURANCE_REASON_CODES.MISSING_REQUIRED_REVIEWER, role);
    for (const role of requiredRoles) {
      const review = approvalsByRole.get(role)?.[0];
      if (!review) continue;
      if (review.verdict !== "APPROVED") addReason(reasons, blockers, ASSURANCE_REASON_CODES.REVIEW_NOT_APPROVED, role);
    }
  }

  const candidateIsValid = input.mode !== "submission" || (
    Boolean(input.candidate) &&
    Boolean(input.candidate && isRecognizedAssuranceRole(input.candidate.reviewerRole)) &&
    Boolean(input.candidate && requiredRoles.includes(input.candidate.reviewerRole as AssuranceRole)) &&
    input.candidate?.changeDigest === input.run.currentChangeDigest
  );
  if (input.mode === "submission" && !candidateIsValid) {
    addReason(reasons, blockers, ASSURANCE_REASON_CODES.REVIEWER_ROLE_NOT_REQUIRED);
  }

  return {
    allowed: blockers.length === 0,
    reasonCodes: [...reasons].sort((a, b) => a.localeCompare(b)),
    blockers: sortedUnique(blockers),
    requiredRoles,
    satisfiedRoles,
    pendingRoles,
    blockedRoles,
    currentEvidenceRefs: evidenceRefs,
    currentFindingCounts: counts,
  };
}
