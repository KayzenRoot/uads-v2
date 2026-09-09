import { describe, expect, it } from "vitest";
import { assuranceRoleGateMapping, evaluateAssurancePolicy, ASSURANCE_REASON_CODES } from "../src/kernel/assurance-policy.js";
import type { EvidenceRecord, ExecutionRun, GateStateSnapshot, ReviewRecord } from "../src/kernel/execution-types.js";
import { gateEvidence } from "../src/kernel/gates.js";
import type { WorkOrder } from "../src/kernel/types.js";
import type { SpecialistObligation, SpecialistSelectionPlan } from "../src/kernel/specialist-types.js";
import { sha256Hex } from "../src/lib/hash.js";

const digest = "a".repeat(64);

function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    schema: "uads.work-order",
    schemaVersion: "0.2.0",
    workOrderId: "wo-policy",
    projectId: "project-policy",
    title: "Policy test",
    objective: "Verify assurance semantics",
    status: "active",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    intakeRef: "sidecar://intake",
    routingDecisionId: "rd-policy",
    scopeClass: "local",
    includedScope: ["src"],
    outOfScope: ["vendor"],
    recommendations: [],
    riskLevel: "LOW",
    riskReasons: [],
    domains: ["general"],
    affectedAreas: [],
    specialists: ["implementation-agent"],
    assuranceReviewers: ["independent-reviewer"],
    qualityGates: ["unit-test"],
    contextRadius: "C1",
    tokenBudget: { softLimit: 1000, hardLimit: 2000, capabilityClass: "economy", cachePreference: "refresh", expansionPolicy: "bounded" },
    dependencies: [],
    acceptanceCriteria: ["verified"],
    requiredEvidence: [],
    stopConditions: ["stop"],
    autonomyBoundary: { safeAutonomous: ["edit"], requiresApproval: ["release"] },
    nextAction: "test",
    ...overrides,
  };
}

function run(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    schema: "uads.execution-run",
    schemaVersion: "0.3.0",
    executionRunId: "er-policy",
    projectId: "project-policy",
    workOrderId: "wo-policy",
    routingDecisionId: "rd-policy",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    attempt: 1,
    phase: "review",
    status: "in_progress",
    baseline: { gitHead: "b".repeat(40), dirty: false, capturedAt: "2026-09-04T00:00:00.000Z" },
    contextRadius: "C1",
    contextCandidates: ["src"],
    implementerRole: "implementation-agent",
    implementerSessionId: "implementer-1",
    requiredReviewers: ["independent-reviewer"],
    selectedGates: ["unit-test"],
    currentChangeDigest: digest,
    reviewedChangeDigest: null,
    changedFiles: ["src/index.ts"],
    scopeViolations: [],
    evidenceRefs: ["sidecar://execution-runs/er-policy/evidence/ev-unit-test.json"],
    reviewRefs: [],
    blockers: [],
    nextAction: "review",
    expansionHistory: [],
    ...overrides,
  };
}

function evidence(status: "PASS" | "FAIL" | "BLOCKED" = "PASS", gateId = "unit-test"): EvidenceRecord {
  return {
    schema: "uads.evidence-record",
    schemaVersion: "0.3.0",
    evidenceId: `ev-${gateId}`,
    projectId: "project-policy",
    workOrderId: "wo-policy",
    executionRunId: "er-policy",
    changeDigest: digest,
    gateId,
    sourceRole: "test-engineer",
    kind: "command",
    createdAt: "2026-09-04T00:00:00.000Z",
    status,
    summary: status,
    command: "npm test",
    exitCode: status === "PASS" ? 0 : 1,
    outputRef: "sidecar://output",
    outputDigest: digest,
    source: "executed",
  };
}

function review(role: string, verdict: "APPROVED" | "CORRECTION_NEEDED" | "BLOCKED" = "APPROVED", overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    schema: "uads.review-record",
    schemaVersion: "0.3.0",
    reviewId: `rv-${role}`,
    projectId: "project-policy",
    workOrderId: "wo-policy",
    executionRunId: "er-policy",
    changeDigest: digest,
    reviewerRole: role,
    reviewSessionId: `session-${role}`,
    implementerRole: "implementation-agent",
    implementerSessionId: "implementer-1",
    verdict,
    summary: "review",
    findings: [],
    reasonCodes: verdict === "APPROVED" ? [] : [ASSURANCE_REASON_CODES.REVIEW_BLOCKED],
    evidenceRefs: ["sidecar://execution-runs/er-policy/evidence/ev-unit-test.json"],
    createdAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function specialistPlan(current: WorkOrder, currentRun: ExecutionRun): SpecialistSelectionPlan {
  const roles = [...new Set(["implementation-agent", "test-engineer", ...current.assuranceReviewers])];
  const assuranceRoles = new Set(["independent-reviewer", "security-reviewer", "performance-reviewer", "reliability-reviewer"]);
  const selected = roles.map((specialistId) => ({
    specialistId,
    kind: assuranceRoles.has(specialistId) ? "assurance" as const : "core" as const,
    role: specialistId,
    required: true,
    reasonCodes: ["fixture"],
    coversDomains: ["general" as const],
    coversGates: [],
    independenceClass: specialistId === "implementation-agent" ? "implementation" as const : assuranceRoles.has(specialistId) ? "assurance" as const : specialistId === "independent-reviewer" ? "independent-review" as const : "support" as const,
  }));
  const requiredObligations: SpecialistObligation[] = [
    ...current.qualityGates.map((gateId) => ({ obligationId: `gate:${gateId}`, kind: "gate" as const, domainId: null, gateId, evidenceId: gateEvidence(gateId), affectedArea: null, specialistId: null })),
    ...current.assuranceReviewers.map((role) => ({ obligationId: `assurance:${role}`, kind: "assurance" as const, domainId: null, gateId: null, evidenceId: role === "independent-reviewer" ? "independent review" : role === "performance-reviewer" ? "performance evidence" : role === "reliability-reviewer" ? "reliability review" : "security review", affectedArea: null, specialistId: role })),
  ];
  const coveredObligations = requiredObligations.map((item) => ({
    obligationId: item.obligationId, gateId: item.gateId, evidenceId: item.evidenceId,
    specialistId: item.specialistId ?? (item.gateId === "security-review" ? "security-reviewer" : item.gateId === "performance-check" ? "performance-reviewer" : item.gateId === "rollback-validation" ? "reliability-reviewer" : "test-engineer"),
    reasonCode: "fixture", coverageKind: item.kind,
  }));
  const withoutDigest = {
    schema: "uads.specialist-selection-plan" as const, schemaVersion: "0.9.0" as const, selectionPlanId: "sp-policy-test",
    projectId: current.projectId, workOrderId: current.workOrderId, workOrderDigest: "work-order", routingDigest: "routing", registryDigest: "registry", policyDigest: "policy",
    changeDigest: currentRun.currentChangeDigest, impactDigest: null, gateContractDigest: "gate-contract", selected,
    assurance: selected.filter((item) => assuranceRoles.has(item.specialistId)), assignments: [], rejections: [], unmetCoverage: [],
    requiredObligations, coveredObligations, unmetObligations: [], conflicts: [], dispatch: { dependencyGroups: [], parallelEligibleGroups: [] }, status: "SELECTED" as const, blockedReasonCodes: [],
  };
  return { ...withoutDigest, selectionDigest: sha256Hex(JSON.stringify(withoutDigest)) };
}

type EvalOverrides = Omit<Partial<Parameters<typeof evaluateAssurancePolicy>[0]>, "workOrder" | "run"> & {
  workOrder?: Partial<WorkOrder>;
  run?: Partial<ExecutionRun>;
};

function evaluate(overrides: EvalOverrides = {}) {
  const { workOrder: orderOverrides, run: runOverrides, ...rest } = overrides;
  const order = workOrder(orderOverrides);
  const execution = run({ ...runOverrides, requiredReviewers: order.assuranceReviewers, selectedGates: order.qualityGates });
  return evaluateAssurancePolicy({
    mode: "finalize",
    projectId: order.projectId,
    workOrder: order,
    run: execution,
    gateStates: overrides.gateStates ?? [{ gateId: "unit-test", status: "PASS", evidenceId: "ev-unit-test" }],
    evidence: overrides.evidence ?? [evidence()],
    reviews: overrides.reviews ?? [review("independent-reviewer")],
    specialistSelectionPlan: specialistPlan(order, execution),
    ...rest,
  });
}

describe("deterministic assurance policy", () => {
  it("accepts the independent happy path and exposes exact role mappings", () => {
    const result = evaluate();
    expect(result.allowed).toBe(true);
    expect(result.satisfiedRoles).toEqual(["independent-reviewer"]);
    expect(assuranceRoleGateMapping(["security-review", "performance-check", "rollback-validation"])).toEqual({
      "independent-reviewer": [],
      "security-reviewer": ["security-review"],
      "performance-reviewer": ["performance-check"],
      "reliability-reviewer": ["rollback-validation"],
    });
  });

  it("rejects unknown or non-required roles", () => {
    const result = evaluate({ reviews: [review("security-reviewer")] });
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain(ASSURANCE_REASON_CODES.REVIEWER_ROLE_NOT_REQUIRED);
  });

  it("rejects APPROVED with HIGH or CRITICAL findings", () => {
    const high = evaluate({ reviews: [review("independent-reviewer", "APPROVED", { findings: [{ severity: "HIGH", category: "security", message: "issue" }] })] });
    const critical = evaluate({ reviews: [review("independent-reviewer", "APPROVED", { findings: [{ severity: "CRITICAL", category: "security", message: "issue" }] })] });
    expect(high.allowed).toBe(false);
    expect(high.reasonCodes).toContain(ASSURANCE_REASON_CODES.APPROVAL_CONTRADICTS_HIGH_FINDING);
    expect(critical.allowed).toBe(false);
    expect(critical.reasonCodes).toContain(ASSURANCE_REASON_CODES.APPROVAL_CONTRADICTS_CRITICAL_FINDING);
  });

  it("requires current digest, current evidence references, and current gates", () => {
    const stale = evaluate({ reviews: [review("independent-reviewer", "APPROVED", { changeDigest: "c".repeat(64) })] });
    expect(stale.allowed).toBe(false);
    expect(stale.reasonCodes).toContain(ASSURANCE_REASON_CODES.MISSING_REQUIRED_REVIEWER);
    const foreignRef = evaluate({ reviews: [review("independent-reviewer", "APPROVED", { evidenceRefs: ["sidecar://execution-runs/er-policy/evidence/other.json"] })] });
    expect(foreignRef.allowed).toBe(false);
    expect(foreignRef.reasonCodes).toContain(ASSURANCE_REASON_CODES.EVIDENCE_REFERENCE_MISMATCH);
    const failedGate = evaluate({ gateStates: [{ gateId: "unit-test", status: "FAIL", evidenceId: "ev-unit-test" }], evidence: [evidence("FAIL")] });
    expect(failedGate.allowed).toBe(false);
    expect(failedGate.reasonCodes).toContain(ASSURANCE_REASON_CODES.CURRENT_FAIL_BLOCKED_EVIDENCE);
  });

  it("keeps security, performance, and reliability responsibilities distinct", () => {
    const cross = evaluate({
      workOrder: { assuranceReviewers: ["independent-reviewer", "performance-reviewer"] },
      reviews: [review("independent-reviewer"), review("security-reviewer")],
    });
    expect(cross.allowed).toBe(false);
    expect(cross.reasonCodes).toContain(ASSURANCE_REASON_CODES.REVIEWER_ROLE_NOT_REQUIRED);
    const reliability = evaluate({
      workOrder: { assuranceReviewers: ["reliability-reviewer"], qualityGates: ["rollback-validation"] },
      run: { currentChangeDigest: digest },
      gateStates: [{ gateId: "rollback-validation", status: "PENDING", evidenceId: null }],
      evidence: [],
      reviews: [review("reliability-reviewer", "APPROVED", { evidenceRefs: [] })],
    });
    expect(reliability.allowed).toBe(false);
    expect(reliability.reasonCodes).toContain(ASSURANCE_REASON_CODES.RELIABILITY_OBLIGATION_UNSATISFIED);
  });

  it("does not counterfeit independence with duplicate sessions", () => {
    const duplicate = evaluate({
      workOrder: { assuranceReviewers: ["independent-reviewer", "security-reviewer"] },
      reviews: [
        review("independent-reviewer", "APPROVED", { reviewSessionId: "same-session" }),
        review("security-reviewer", "APPROVED", { reviewSessionId: "same-session" }),
      ],
      run: { selectedGates: ["unit-test"], currentChangeDigest: digest },
    });
    expect(duplicate.allowed).toBe(false);
    expect(duplicate.reasonCodes).toContain(ASSURANCE_REASON_CODES.DUPLICATE_REVIEW_SESSION);
  });

  it("requires a stable reason for an empty negative verdict", () => {
    const negative = evaluate({ reviews: [review("independent-reviewer", "BLOCKED", { reasonCodes: [] })] });
    expect(negative.allowed).toBe(false);
    expect(negative.reasonCodes).toContain(ASSURANCE_REASON_CODES.NEGATIVE_VERDICT_REASON_REQUIRED);
  });
});
