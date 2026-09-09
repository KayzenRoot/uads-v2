import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSURANCE_REASON_CODES, evaluateAssurancePolicy } from "../kernel/assurance-policy.js";
import { runNormativeFaultInjectionCase } from "./fault-injection-normative.js";
import type { EvidenceRecord, ExecutionRun, GateStateSnapshot, ReviewRecord } from "../kernel/execution-types.js";
import { gateEvidence } from "../kernel/gates.js";
import type { WorkOrder } from "../kernel/types.js";
import type { SpecialistObligation, SpecialistSelectionPlan } from "../kernel/specialist-types.js";
import { sha256Hex } from "../lib/hash.js";
import { findPackageRoot } from "../lib/version.js";

type EvalCase = { id: string; name: string };
type FixtureInput = {
  workOrder?: Partial<WorkOrder>;
  run?: Partial<ExecutionRun>;
  gateStates?: GateStateSnapshot[];
  evidence?: EvidenceRecord[];
  reviews?: ReviewRecord[];
  specialistSelectionPlan?: SpecialistSelectionPlan;
};

const PROJECT = "fault-injection-eval-project";
const WORK_ORDER = "wo-fault-injection-eval";
const RUN = "er-fault-injection-eval";
const DIGEST = "d".repeat(64);
const IMPL = "implementation-agent";

function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    schema: "uads.work-order", schemaVersion: "0.2.0", workOrderId: WORK_ORDER, projectId: PROJECT,
    title: "Fault injection eval", objective: "Exercise fail-closed assurance", status: "active",
    createdAt: "2026-09-04T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z", intakeRef: "sidecar://intake",
    routingDecisionId: "rd-fault-injection-eval", scopeClass: "local", includedScope: ["src"], outOfScope: ["outside"],
    recommendations: [], riskLevel: "LOW", riskReasons: [], domains: ["general"], affectedAreas: [], specialists: [IMPL],
    assuranceReviewers: ["independent-reviewer"], qualityGates: ["unit-test"], contextRadius: "C1",
    tokenBudget: { softLimit: 1000, hardLimit: 2000, capabilityClass: "economy", cachePreference: "refresh", expansionPolicy: "bounded" },
    dependencies: [], acceptanceCriteria: ["verified"], requiredEvidence: [], stopConditions: ["stop"],
    autonomyBoundary: { safeAutonomous: ["edit"], requiresApproval: ["release"] }, nextAction: "review", ...overrides,
  };
}

function run(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    schema: "uads.execution-run", schemaVersion: "0.3.0", executionRunId: RUN, projectId: PROJECT, workOrderId: WORK_ORDER,
    routingDecisionId: "rd-fault-injection-eval", createdAt: "2026-09-04T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z",
    attempt: 1, phase: "review", status: "in_progress", baseline: { gitHead: "a".repeat(40), dirty: false, capturedAt: "2026-09-04T00:00:00.000Z" },
    contextRadius: "C1", contextCandidates: ["src"], implementerRole: IMPL, implementerSessionId: "impl-1",
    requiredReviewers: ["independent-reviewer"], selectedGates: ["unit-test"], currentChangeDigest: DIGEST, reviewedChangeDigest: null,
    changedFiles: ["src/index.ts"], scopeViolations: [], evidenceRefs: [], reviewRefs: [], blockers: [], nextAction: "review", expansionHistory: [], ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    schema: "uads.evidence-record", schemaVersion: "0.3.0", evidenceId: "ev-unit-test", projectId: PROJECT,
    workOrderId: WORK_ORDER, executionRunId: RUN, changeDigest: DIGEST, gateId: "unit-test", sourceRole: "test-engineer", kind: "command",
    createdAt: "2026-09-04T00:00:00.000Z", status: "PASS", summary: "fixture", command: "fixture", exitCode: 0,
    outputRef: "sidecar://output", outputDigest: DIGEST, source: "executed", ...overrides,
  };
}

function review(role = "independent-reviewer", overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    schema: "uads.review-record", schemaVersion: "0.3.0", reviewId: `rv-${role}`, projectId: PROJECT,
    workOrderId: WORK_ORDER, executionRunId: RUN, changeDigest: DIGEST, reviewerRole: role, reviewSessionId: `session-${role}`,
    implementerRole: IMPL, implementerSessionId: "impl-1", verdict: "APPROVED", summary: "fixture", findings: [], reasonCodes: [],
    evidenceRefs: [`sidecar://execution-runs/${RUN}/evidence/ev-unit-test.json`], createdAt: "2026-09-04T00:00:00.000Z", ...overrides,
  };
}

function specialistPlan(current: WorkOrder): SpecialistSelectionPlan {
  const roles = [...new Set([IMPL, "test-engineer", ...current.assuranceReviewers])];
  const assuranceRoles = new Set(["independent-reviewer", "security-reviewer", "performance-reviewer", "reliability-reviewer"]);
  const selected = roles.map((specialistId) => ({
    specialistId,
    kind: assuranceRoles.has(specialistId) ? "assurance" as const : "core" as const,
    role: specialistId,
    required: true,
    reasonCodes: ["fixture"],
    coversDomains: ["general" as const],
    coversGates: [],
    independenceClass: specialistId === IMPL ? "implementation" as const : assuranceRoles.has(specialistId) ? "assurance" as const : specialistId === "independent-reviewer" ? "independent-review" as const : "support" as const,
  }));
  const requiredObligations: SpecialistObligation[] = [
    ...current.qualityGates.map((gateId) => ({ obligationId: `gate:${gateId}`, kind: "gate" as const, domainId: null, gateId, evidenceId: gateEvidence(gateId), affectedArea: null, specialistId: null })),
    ...current.assuranceReviewers.map((role) => ({ obligationId: `assurance:${role}`, kind: "assurance" as const, domainId: null, gateId: null, evidenceId: role === "independent-reviewer" ? "independent review" : role === "performance-reviewer" ? "performance evidence" : role === "reliability-reviewer" ? "reliability review" : "security review", affectedArea: null, specialistId: role })),
  ];
  const coveredObligations = requiredObligations.map((item) => ({
    obligationId: item.obligationId,
    gateId: item.gateId,
    evidenceId: item.evidenceId,
    specialistId: item.specialistId ?? (item.gateId === "security-review" ? "security-reviewer" : item.gateId === "performance-check" ? "performance-reviewer" : item.gateId === "rollback-validation" ? "reliability-reviewer" : "test-engineer"),
    reasonCode: "fixture",
    coverageKind: item.kind,
  }));
  const withoutDigest = {
    schema: "uads.specialist-selection-plan" as const,
    schemaVersion: "0.9.0" as const,
    selectionPlanId: "sp-fault-injection-eval",
    projectId: PROJECT,
    workOrderId: current.workOrderId,
    workOrderDigest: "work-order",
    routingDigest: "routing",
    registryDigest: "registry",
    policyDigest: "policy",
    changeDigest: DIGEST,
    impactDigest: null,
    gateContractDigest: "gate-contract",
    selected,
    assurance: selected.filter((item) => assuranceRoles.has(item.specialistId)),
    assignments: [],
    rejections: [],
    unmetCoverage: [],
    requiredObligations,
    coveredObligations,
    unmetObligations: [],
    conflicts: [],
    dispatch: { dependencyGroups: [], parallelEligibleGroups: [] },
    status: "SELECTED" as const,
    blockedReasonCodes: [],
  };
  return { ...withoutDigest, selectionDigest: sha256Hex(JSON.stringify(withoutDigest)) };
}

function evaluate(input: FixtureInput = {}) {
  const currentOrder = workOrder(input.workOrder);
  const currentRun = run({ ...input.run, requiredReviewers: currentOrder.assuranceReviewers, selectedGates: currentOrder.qualityGates });
  return evaluateAssurancePolicy({
    mode: "finalize", projectId: PROJECT, workOrder: currentOrder, run: currentRun,
    gateStates: input.gateStates ?? currentRun.selectedGates.map((gateId) => ({ gateId, status: "PASS", evidenceId: `ev-${gateId}` })),
    evidence: input.evidence ?? [evidence()], reviews: input.reviews ?? [review()], specialistSelectionPlan: input.specialistSelectionPlan ?? specialistPlan(currentOrder),
  });
}

function blocked(input: FixtureInput, code: string): void {
  const result = evaluate(input);
  if (result.allowed || !result.reasonCodes.some((item) => item === code)) throw new Error(`expected ${code}, got ${result.reasonCodes.join(",")}`);
}

function runLegacyCase(id: string): void {
  switch (id) {
    case "FI1": blocked({ run: { scopeViolations: [{ path: "outside.txt", classification: "out-of-scope", reason: "fixture" }] } }, ASSURANCE_REASON_CODES.SCOPE_VIOLATION); break;
    case "FI2": blocked({ gateStates: [{ gateId: "unit-test", status: "PENDING", evidenceId: null }], evidence: [] }, ASSURANCE_REASON_CODES.NON_REVIEW_GATE_NOT_PASS); break;
    case "FI3": blocked({ gateStates: [{ gateId: "unit-test", status: "PASS", evidenceId: "ev-unit-test" }], evidence: [evidence({ status: "FAIL", exitCode: 1 })] }, ASSURANCE_REASON_CODES.CURRENT_FAIL_BLOCKED_EVIDENCE); break;
    case "FI4": blocked({ reviews: [review("independent-reviewer", { changeDigest: "e".repeat(64) })] }, ASSURANCE_REASON_CODES.MISSING_REQUIRED_REVIEWER); break;
    case "FI5": blocked({ reviews: [review("independent-reviewer", { projectId: "foreign-project" })] }, ASSURANCE_REASON_CODES.MISSING_REQUIRED_REVIEWER); break;
    case "FI6": blocked({ run: { reviewedChangeDigest: "e".repeat(64) } }, ASSURANCE_REASON_CODES.REVIEWED_DIGEST_MISMATCH); break;
    case "FI7": blocked({ reviews: [review(), review("independent-reviewer", { reviewId: "rv-independent-reviewer-duplicate", reviewSessionId: "session-duplicate" })] }, ASSURANCE_REASON_CODES.DUPLICATE_REVIEW_APPROVAL); break;
    case "FI8": blocked({ reviews: [review("forged-reviewer")] }, ASSURANCE_REASON_CODES.UNKNOWN_REVIEWER_ROLE); break;
    case "FI9": blocked({ reviews: [review("independent-reviewer", { evidenceRefs: [`sidecar://execution-runs/${RUN}/evidence/missing.json`] })] }, ASSURANCE_REASON_CODES.EVIDENCE_REFERENCE_MISMATCH); break;
    case "FI10": blocked({ specialistSelectionPlan: { ...specialistPlan(workOrder()), status: "BLOCKED" } }, ASSURANCE_REASON_CODES.SPECIALIST_SELECTION_INVALID); break;
    case "FI11": blocked({ reviews: [review("independent-reviewer", { verdict: "CORRECTION_NEEDED", reasonCodes: [ASSURANCE_REASON_CODES.REVIEW_CORRECTION_REQUIRED] })] }, ASSURANCE_REASON_CODES.MISSING_REQUIRED_REVIEWER); break;
    case "FI12": blocked({ reviews: [review("independent-reviewer", { findings: [{ severity: "CRITICAL", category: "tamper", message: "fixture" }] })] }, ASSURANCE_REASON_CODES.APPROVAL_CONTRADICTS_CRITICAL_FINDING); break;
    case "FI13": blocked({ workOrder: { assuranceReviewers: ["independent-reviewer", "performance-reviewer"] }, reviews: [review(), review("security-reviewer")] }, ASSURANCE_REASON_CODES.REVIEWER_ROLE_NOT_REQUIRED); break;
    case "FI14": blocked({ run: { implementerSessionId: null } }, ASSURANCE_REASON_CODES.IMPLEMENTER_SESSION_REQUIRED); break;
    case "FI15": blocked({ evidence: [], reviews: [review()] }, ASSURANCE_REASON_CODES.EVIDENCE_REFERENCE_MISMATCH); break;
    case "FI16": {
      const valid = review();
      if (!evaluate({ reviews: [valid] }).allowed) throw new Error("valid persisted review was rejected");
      blocked({ reviews: [{ ...valid, findings: [{ severity: "HIGH", category: "tamper", message: "persisted mutation" }] }] }, ASSURANCE_REASON_CODES.APPROVAL_CONTRADICTS_HIGH_FINDING);
      break;
    }
    default: throw new Error(`unknown fault-injection case ${id}`);
  }
}

function runCase(id: string): void {
  const numericId = Number(id.slice(2));
  if (numericId >= 1 && numericId <= 16) {
    runNormativeFaultInjectionCase(id);
    return;
  }
  if (numericId >= 17 && numericId <= 32) {
    runLegacyCase(`FI${numericId - 16}`);
    return;
  }
  throw new Error(`unknown fault-injection case ${id}`);
}

export function runFaultInjectionEvals(): number {
  const root = findPackageRoot();
  const cases = JSON.parse(fs.readFileSync(path.join(root, "evals/fault-injection/cases.json"), "utf8")) as EvalCase[];
  const failures: string[] = [];
  for (const item of cases) {
    try { runCase(item.id); process.stdout.write(`${item.id} PASS ${item.name}\n`); }
    catch (error) { failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`); process.stdout.write(`FAIL ${item.id} ${item.name}\n`); }
  }
  process.stdout.write(`\n${cases.length - failures.length} passed, ${failures.length} failed, ${cases.length} total\n`);
  if (failures.length) { process.stderr.write(`${failures.join("\n")}\n`); return 1; }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exit(runFaultInjectionEvals());
