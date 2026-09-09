import crypto from "node:crypto";
import {
  LEGACY_SECURITY_PROOF_SCHEMA_VERSION,
  SECURITY_PROOF_SCHEMA_VERSION,
  isCorrectedReleaseVersion,
  normalizeSecurityWorkflowProof,
  securityWorkflowAuthorizationErrors,
  validateSecurityWorkflowProof,
  type SecurityWorkflowProof,
} from "./security-proof.js";

export const DIRECT_REVIEW_SCHEMA = "uads.github-direct-review-evidence" as const;
export const DIRECT_REVIEW_SCHEMA_VERSION = SECURITY_PROOF_SCHEMA_VERSION;
export const DIRECT_REVIEW_ARTIFACT_RETENTION_DAYS = 90;

export type DirectReviewOutcome = "success" | "failure" | "cancelled" | "skipped" | "unknown";
export type DirectReviewSecurityStatus = DirectReviewOutcome | "pending" | "unavailable" | "not-evaluated-here";
export type DirectReviewVerdict = "PASS" | "FAIL" | "INCOMPLETE" | "BLOCKED";

export type DirectReviewSummary = {
  passed: number | null;
  failed: number | null;
  total: number | null;
};

export type DirectReviewGate = {
  id: string;
  outcome: DirectReviewOutcome;
  required: boolean;
};

export type DirectReviewWorkflowStatus = {
  status: DirectReviewSecurityStatus;
  outcome: DirectReviewOutcome;
  runId: number | null;
  commitSha: string | null;
  htmlUrl: string | null;
  reasonCode: string | null;
  runAttempt?: number | null;
  artifactName?: string | null;
  artifactSha256?: string | null;
  evidenceDigest?: string | null;
  platform?: "linux" | "windows" | null;
  nodeVersion?: string | null;
  checks?: Record<string, DirectReviewOutcome> | null;
  proof?: SecurityWorkflowProof | null;
};

export type DirectReviewComparison = {
  baseSha: string | null;
  headSha: string | null;
  changedFileCount: number | null;
  changedPaths: string[] | null;
  changedPathsDigest: string | null;
  changedPathsTruncated: boolean;
  comparisonStatus: "complete" | "truncated" | "unavailable" | "not-applicable";
  comparisonReasonCode: string | null;
};

export type DirectReviewEvidence = {
  schema: typeof DIRECT_REVIEW_SCHEMA;
  schemaVersion: typeof DIRECT_REVIEW_SCHEMA_VERSION | typeof LEGACY_SECURITY_PROOF_SCHEMA_VERSION;
  repository: string | null;
  branch: string | null;
  commitSha: string | null;
  gitTreeSha: string | null;
  version: string;
  generatedAt: string;
  event: string | null;
  workflow: {
    runId: number | null;
    runAttempt: number | null;
    workflowName: string | null;
    jobName: string | null;
    htmlUrl: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
  comparison: DirectReviewComparison;
  requiredGates: DirectReviewGate[];
  validation: {
    testFilesPassed: number | null;
    testsPassed: number | null;
    testsFailed: number | null;
    orchestrator: DirectReviewSummary;
    execution: DirectReviewSummary;
    context: DirectReviewSummary;
    fault: DirectReviewSummary;
    cost: DirectReviewSummary;
    modelRouting: DirectReviewSummary;
    specialistRouting: DirectReviewSummary;
    adapters: DirectReviewSummary;
    assurance: DirectReviewSummary;
    faultInjection: DirectReviewSummary;
    specialistPolicyDigest: string | null;
    builtinSpecialistCatalogDigest: string | null;
    npmAudit: {
      outcome: DirectReviewOutcome;
      highOrGreaterVulnerabilities: number | null;
    };
    packaging: {
      outcome: DirectReviewOutcome;
    };
  };
  securityWorkflows: {
    codeql: DirectReviewWorkflowStatus;
    scorecard: DirectReviewWorkflowStatus;
    dependencyReview: DirectReviewWorkflowStatus;
  };
  compatibility: {
    linux: DirectReviewWorkflowStatus;
    windows: DirectReviewWorkflowStatus;
  };
  release: {
    version: string | null;
    tag: string | null;
    tagTargetSha: string | null;
    releaseRunId: number | null;
    releaseRunConclusion: DirectReviewOutcome;
    assetNames: string[] | null;
    ciBindingAsset: string | null;
    directReviewArtifactName: string | null;
  };
  artifact: {
    name: string | null;
    retentionDays: number | null;
  };
  provenance: {
    generatedByScript: string;
    evidenceContractDigest: string;
    sourceRunSha: string | null;
    sourceRunId: number | null;
    sourceRunAttempt: number | null;
  };
  finalVerdict: DirectReviewVerdict;
  reasonCodes: string[];
  evidenceContractDigest: string;
};

export const REQUIRED_DIRECT_REVIEW_GATES = [
  "install",
  "lint",
  "typecheck",
  "build",
  "action-pins",
  "tests",
  "eval-orchestrator",
  "eval-execution",
  "eval-context",
  "eval-fault",
  "eval-cost",
  "eval-model-routing",
  "eval-specialist-routing",
  "eval-adapters",
  "eval-assurance",
  "eval-fault-injection",
  "skills-validation",
  "validate",
  "npm-audit",
  "packaging",
] as const;

const SHA_RE = /^[0-9a-f]{40}$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_PATH_RE = /^[A-Za-z0-9._/-]+$/;
const COMPARISON_DIGEST_RE = /^[0-9a-f]{64}$/;

export function emptySummary(): DirectReviewSummary {
  return { passed: null, failed: null, total: null };
}

export function normalizeOutcome(value: unknown): DirectReviewOutcome {
  return value === "success" || value === "failure" || value === "cancelled" || value === "skipped"
    ? value
    : "unknown";
}

function boundedInteger(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
    ? value
    : null;
}

function parseCountLine(text: string, prefix: string): DirectReviewSummary {
  const line = text.split(/\r?\n/).find((item) => item.includes(prefix));
  if (!line) return emptySummary();
  const passed = line.match(/(\d+)\s+passed\b/i)?.[1];
  const failed = line.match(/(\d+)\s+failed\b/i)?.[1];
  const total = line.match(/\((\d+)\)/)?.[1];
  const parsedPassed = passed === undefined ? null : boundedInteger(Number(passed));
  const parsedFailed = failed === undefined ? null : boundedInteger(Number(failed));
  const parsedTotal = total === undefined
    ? parsedPassed === null && parsedFailed === null
      ? null
      : (parsedPassed ?? 0) + (parsedFailed ?? 0)
      : boundedInteger(Number(total));
  const inferredFailed = parsedFailed === null && parsedPassed !== null && parsedTotal !== null
    ? Math.max(0, parsedTotal - parsedPassed)
    : parsedFailed;
  return { passed: parsedPassed, failed: inferredFailed, total: parsedTotal };
}

export function parseVitestSummary(text: string): Pick<DirectReviewEvidence["validation"], "testFilesPassed" | "testsPassed" | "testsFailed"> {
  const files = parseCountLine(text, "Test Files");
  const tests = parseCountLine(text, "Tests");
  return {
    testFilesPassed: files.passed,
    testsPassed: tests.passed,
    testsFailed: tests.failed,
  };
}

export function parseEvalSummary(text: string): DirectReviewSummary {
  const complete = [...text.matchAll(/(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+total/gi)].pop();
  if (complete) {
    return {
      passed: boundedInteger(Number(complete[1])),
      failed: boundedInteger(Number(complete[2])),
      total: boundedInteger(Number(complete[3])),
    };
  }
  const compact = [...text.matchAll(/\b(?:eval\s+)?(\d+)\/(\d+)\b/gi)].pop();
  if (compact) {
    const passed = boundedInteger(Number(compact[1]));
    const total = boundedInteger(Number(compact[2]));
    return { passed, failed: passed === null || total === null ? null : Math.max(0, total - passed), total };
  }
  return emptySummary();
}

export function parseAuditSummary(text: string): { outcome: DirectReviewOutcome; highOrGreaterVulnerabilities: number | null } {
  const clean = /found\s+0\s+vulnerabilities/i.test(text);
  const count = text.match(/found\s+(\d+)\s+vulnerabilit(?:y|ies)/i)?.[1];
  return {
    outcome: clean ? "success" : "unknown",
    highOrGreaterVulnerabilities: count === undefined ? clean ? 0 : null : boundedInteger(Number(count)),
  };
}

export function parseStepOutcomes(value: unknown): { outcomes: Record<string, DirectReviewOutcome>; malformed: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { outcomes: {}, malformed: true };
  const outcomes: Record<string, DirectReviewOutcome> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_PATH_RE.test(key) || key.length > 80) return { outcomes: {}, malformed: true };
    outcomes[key] = normalizeOutcome(item);
  }
  return { outcomes, malformed: false };
}

function safeSha(value: string | null | undefined): string | null {
  return value && SHA_RE.test(value) ? value.toLowerCase() : null;
}

function safeRepository(value: string | null | undefined): string | null {
  return value && REPOSITORY_RE.test(value) ? value : null;
}

function safeUrl(value: string | null | undefined): string | null {
  return value && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(value) ? value : null;
}

function safeRunId(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function safeRunAttempt(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function safeText(value: string | null | undefined, maxLength: number): string | null {
  return typeof value === "string" && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}

function safeDateTime(value: string | null | undefined): string | null {
  if (!value || value.length > 64 || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function safePath(value: string): string | null {
  return SAFE_PATH_RE.test(value) && !value.includes("..") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value) ? value : null;
}

function sortedUnique(values: string[] | null | undefined): string[] | null {
  if (values === null || values === undefined) return null;
  const safe = values.filter((value) => typeof value === "string" && value.length <= 240).map(safePath).filter((value): value is string => value !== null);
  return [...new Set(safe)].sort((a, b) => a.localeCompare(b)).slice(0, 500);
}

function comparisonDigest(paths: string[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(paths)).digest("hex");
}

function normalizeComparison(input: Partial<DirectReviewComparison> | undefined, commitSha: string | null): DirectReviewComparison {
  const baseSha = safeSha(input?.baseSha);
  const headSha = safeSha(input?.headSha ?? commitSha);
  const changedPaths = sortedUnique(input?.changedPaths);
  const changedFileCount = boundedInteger(input?.changedFileCount);
  const explicitStatus = input?.comparisonStatus;
  const inferredComplete = explicitStatus === undefined && baseSha !== null && headSha !== null && changedPaths !== null && changedFileCount === changedPaths.length;
  const comparisonStatus = explicitStatus === "complete" || explicitStatus === "truncated" || explicitStatus === "unavailable" || explicitStatus === "not-applicable"
    ? explicitStatus
    : inferredComplete ? "complete" : "unavailable";
  const completeLike = comparisonStatus === "complete" || comparisonStatus === "truncated";
  return {
    baseSha,
    headSha,
    changedFileCount: completeLike ? changedFileCount : null,
    changedPaths: completeLike ? changedPaths : null,
    changedPathsDigest: completeLike
      ? COMPARISON_DIGEST_RE.test(input?.changedPathsDigest ?? "")
        ? input?.changedPathsDigest ?? null
        : changedPaths ? comparisonDigest(changedPaths) : null
      : null,
    changedPathsTruncated: comparisonStatus === "truncated",
    comparisonStatus,
    comparisonReasonCode: completeLike
      ? null
      : input?.comparisonReasonCode && /^[A-Z0-9_:-]{1,120}$/.test(input.comparisonReasonCode)
        ? input.comparisonReasonCode
        : comparisonStatus === "not-applicable" ? "COMPARISON_BASE_NOT_APPLICABLE" : "COMPARISON_METADATA_UNAVAILABLE",
  };
}

function comparisonErrors(value: unknown, expectedHeadSha: string | null, requireComplete: boolean): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["comparison-invalid"];
  const item = value as Partial<DirectReviewComparison>;
  const errors: string[] = [];
  if (!safeSha(item.baseSha) && item.baseSha !== null) errors.push("comparison-base-sha-invalid");
  if (!safeSha(item.headSha) && item.headSha !== null) errors.push("comparison-head-sha-invalid");
  if (expectedHeadSha !== null && item.headSha !== expectedHeadSha) errors.push("comparison-head-mismatch");
  if (!["complete", "truncated", "unavailable", "not-applicable"].includes(item.comparisonStatus ?? "")) errors.push("comparison-status-invalid");
  if (typeof item.changedPathsTruncated !== "boolean") errors.push("comparison-truncation-invalid");
  if (item.comparisonReasonCode !== null && (typeof item.comparisonReasonCode !== "string" || !/^[A-Z0-9_:-]{1,120}$/.test(item.comparisonReasonCode))) errors.push("comparison-reason-invalid");
  if (item.comparisonStatus === "complete" || item.comparisonStatus === "truncated") {
    if (!Number.isSafeInteger(item.changedFileCount) || (item.changedFileCount ?? -1) < 0 || (item.changedFileCount ?? 1_000_001) > 1_000_000) errors.push("comparison-count-invalid");
    if (!Array.isArray(item.changedPaths) || item.changedPaths.length > 500 || item.changedPaths.some((path) => typeof path !== "string" || safePath(path) === null)) errors.push("comparison-paths-invalid");
    if (!COMPARISON_DIGEST_RE.test(item.changedPathsDigest ?? "")) errors.push("comparison-digest-invalid");
    if (item.comparisonStatus === "complete" && (item.changedPathsTruncated !== false || item.changedFileCount !== item.changedPaths?.length || item.changedPathsDigest !== comparisonDigest(item.changedPaths ?? []))) errors.push("comparison-complete-inconsistent");
    if (item.comparisonStatus === "truncated" && item.changedPathsTruncated !== true) errors.push("comparison-truncated-inconsistent");
  } else if (item.changedFileCount !== null || item.changedPaths !== null || item.changedPathsDigest !== null || item.changedPathsTruncated !== false || !item.comparisonReasonCode) {
    errors.push("comparison-unavailable-inconsistent");
  }
  if (requireComplete && item.comparisonStatus !== "complete" && item.comparisonStatus !== "truncated") errors.push("comparison-not-complete");
  return [...new Set(errors)];
}

function status(value?: Partial<DirectReviewWorkflowStatus>): DirectReviewWorkflowStatus {
  const hasValue = value && Object.values(value).some((item) => item !== null && item !== undefined && item !== "");
  const result: DirectReviewWorkflowStatus = {
    status: normalizeOutcome(value?.status),
    outcome: normalizeOutcome(value?.outcome),
    runId: safeRunId(value?.runId),
    commitSha: safeSha(value?.commitSha),
    htmlUrl: safeUrl(value?.htmlUrl),
    reasonCode: value?.reasonCode && /^[A-Z0-9_:-]{1,100}$/.test(value.reasonCode)
      ? value.reasonCode
      : hasValue ? "SECURITY_STATUS_UNAVAILABLE" : "NOT_EVALUATED_HERE",
  };
  if (value?.runAttempt !== undefined) result.runAttempt = safeRunAttempt(value.runAttempt);
  if (value?.artifactName !== undefined) result.artifactName = value.artifactName && safePath(value.artifactName) ? value.artifactName : null;
  if (value?.artifactSha256 !== undefined) result.artifactSha256 = value.artifactSha256 && /^[0-9a-f]{64}$/i.test(value.artifactSha256) ? value.artifactSha256.toLowerCase() : null;
  if (value?.evidenceDigest !== undefined) result.evidenceDigest = value.evidenceDigest && /^[0-9a-f]{64}$/i.test(value.evidenceDigest) ? value.evidenceDigest.toLowerCase() : null;
  if (value?.platform !== undefined) result.platform = value.platform === "linux" || value.platform === "windows" ? value.platform : null;
  if (value?.nodeVersion !== undefined) result.nodeVersion = safeText(value.nodeVersion, 64);
  if (value?.checks !== undefined) result.checks = value.checks && typeof value.checks === "object" && !Array.isArray(value.checks) ? value.checks : null;
  if (value?.proof !== undefined) result.proof = normalizeSecurityWorkflowProof(value.proof);
  return result;
}

function compatibilityProof(value: DirectReviewWorkflowStatus | undefined, expectedSha: string | null | undefined): boolean {
  const checks = value?.checks;
  const expectedChecks = ["npm-ci", "typecheck-build", "adapter-eval", "isolated-install", "root-resolution", "zero-project-footprint", "privacy-path-assertion"];
  return value?.outcome === "success" && value.commitSha === expectedSha && value.runId !== null && value.runAttempt !== null &&
    Boolean(value.artifactName) && /^[0-9a-f]{64}$/i.test(value.artifactSha256 ?? "") && /^[0-9a-f]{64}$/i.test(value.evidenceDigest ?? "") &&
    (value.platform === "linux" || value.platform === "windows") && /^v20\./.test(value.nodeVersion ?? "") &&
    Boolean(checks) && expectedChecks.every((key) => checks?.[key] === "success");
}

function sortedObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortedObject(item)]));
}

export function computeDirectReviewDigest(evidence: Omit<DirectReviewEvidence, "evidenceContractDigest">): string {
  const { evidenceContractDigest: _ignored, ...withoutDigest } = evidence as DirectReviewEvidence;
  const digestInput = { ...withoutDigest, generatedAt: null, provenance: { ...withoutDigest.provenance, evidenceContractDigest: null } };
  return crypto.createHash("sha256").update(JSON.stringify(sortedObject(digestInput))).digest("hex");
}

export function createDirectReviewEvidence(input: {
  repository?: string | null;
  branch?: string | null;
  commitSha?: string | null;
  gitTreeSha?: string | null;
  version: string;
  event?: string | null;
  workflow?: Partial<DirectReviewEvidence["workflow"]>;
  comparison?: Partial<DirectReviewEvidence["comparison"]>;
  stepOutcomes?: Record<string, unknown>;
  logs?: Partial<Record<string, string>>;
  securityWorkflows?: Partial<DirectReviewEvidence["securityWorkflows"]>;
  compatibility?: Partial<DirectReviewEvidence["compatibility"]>;
  specialistPolicyDigest?: string | null;
  builtinSpecialistCatalogDigest?: string | null;
  release?: Partial<DirectReviewEvidence["release"]>;
  artifactName?: string | null;
  artifactRetentionDays?: number | null;
  generatedAt?: string;
  generatedByScript?: "generator" | "publisher" | "finalizer";
}): DirectReviewEvidence {
  const logs = input.logs ?? {};
  const parsedSteps = parseStepOutcomes(input.stepOutcomes ?? {}).outcomes;
  const requiredGates = REQUIRED_DIRECT_REVIEW_GATES.map((id) => ({ id, outcome: parsedSteps[id] ?? "unknown", required: true }));
  const reasons: string[] = [];
  if (Object.keys(parsedSteps).length === 0) reasons.push("STEP_OUTCOME_UNAVAILABLE");
  if (input.stepOutcomes && parseStepOutcomes(input.stepOutcomes).malformed) reasons.push("STEP_OUTCOME_MALFORMED");
  for (const gate of requiredGates) {
    if (gate.outcome !== "success") reasons.push(`REQUIRED_GATE_NOT_SUCCESS:${gate.id.toUpperCase()}`);
  }
  const vitest = parseVitestSummary(logs.tests ?? "");
  if (vitest.testsPassed === null || vitest.testsFailed === null || vitest.testFilesPassed === null) reasons.push("COUNT_PARSE_UNAVAILABLE:TESTS");
  const npmAudit = parseAuditSummary(logs["npm-audit"] ?? "");
  const evals = {
    orchestrator: parseEvalSummary(logs["eval-orchestrator"] ?? ""),
    execution: parseEvalSummary(logs["eval-execution"] ?? ""),
    context: parseEvalSummary(logs["eval-context"] ?? ""),
    fault: parseEvalSummary(logs["eval-fault"] ?? ""),
    cost: parseEvalSummary(logs["eval-cost"] ?? ""),
    modelRouting: parseEvalSummary(logs["eval-model-routing"] ?? ""),
    specialistRouting: parseEvalSummary(logs["eval-specialist-routing"] ?? ""),
    adapters: parseEvalSummary(logs["eval-adapters"] ?? ""),
    assurance: parseEvalSummary(logs["eval-assurance"] ?? ""),
    faultInjection: parseEvalSummary(logs["eval-fault-injection"] ?? ""),
  };
  for (const [id, summary] of Object.entries(evals)) {
    if (summary.passed === null || summary.failed === null || summary.total === null) reasons.push(`COUNT_PARSE_UNAVAILABLE:${id.toUpperCase()}`);
  }
  const commitSha = safeSha(input.commitSha);
  const repository = safeRepository(input.repository);
  const runId = safeRunId(input.workflow?.runId);
  const workflow = {
    runId,
    runAttempt: safeRunAttempt(input.workflow?.runAttempt),
    workflowName: safeText(input.workflow?.workflowName, 128),
    jobName: safeText(input.workflow?.jobName, 128),
    htmlUrl: safeUrl(input.workflow?.htmlUrl),
    startedAt: safeDateTime(input.workflow?.startedAt),
    completedAt: safeDateTime(input.workflow?.completedAt),
  };
  const artifactName = input.artifactName && safePath(input.artifactName) ? input.artifactName : null;
  const securityWorkflows = {
    codeql: status(input.securityWorkflows?.codeql),
    scorecard: status(input.securityWorkflows?.scorecard),
    dependencyReview: status(input.securityWorkflows?.dependencyReview),
  };
  const allRequiredSuccess = requiredGates.every((gate) => gate.outcome === "success");
  const hasKnownFailure = requiredGates.some((gate) => gate.outcome === "failure" || gate.outcome === "cancelled");
  const hasUnknown = requiredGates.some((gate) => gate.outcome === "unknown");
  const identityProven = Boolean(repository && commitSha && safeSha(input.gitTreeSha) && runId && workflow.htmlUrl);
  if (!identityProven) reasons.push("IDENTITY_UNPROVEN");
  const securityReasons = isCorrectedReleaseVersion(input.version)
    ? securityWorkflowAuthorizationErrors(securityWorkflows, { repository, finalCommitSha: commitSha, finalTreeSha: safeSha(input.gitTreeSha) })
    : [];
  reasons.push(...securityReasons);
  const securityFailure = Object.values(securityWorkflows).some((item) => item.proof?.outcome === "failure" || item.proof?.outcome === "cancelled");
  const finalVerdict: DirectReviewVerdict = !identityProven
    ? "INCOMPLETE"
    : !allRequiredSuccess
    ? hasKnownFailure
      ? "FAIL"
      : hasUnknown
        ? "INCOMPLETE"
        : "FAIL"
    : securityReasons.length > 0
    ? securityFailure ? "FAIL" : "INCOMPLETE"
    : "PASS";
  const base: Omit<DirectReviewEvidence, "evidenceContractDigest"> = {
    schema: DIRECT_REVIEW_SCHEMA,
    schemaVersion: isCorrectedReleaseVersion(input.version) ? DIRECT_REVIEW_SCHEMA_VERSION : LEGACY_SECURITY_PROOF_SCHEMA_VERSION,
    repository,
    branch: safeText(input.branch, 128),
    commitSha,
    gitTreeSha: safeSha(input.gitTreeSha),
    version: input.version,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    event: safeText(input.event, 80),
    workflow,
    comparison: normalizeComparison(input.comparison, commitSha),
    requiredGates,
    validation: {
      ...vitest,
      orchestrator: evals.orchestrator,
      execution: evals.execution,
      context: evals.context,
      fault: evals.fault,
      cost: evals.cost,
      modelRouting: evals.modelRouting,
      specialistRouting: evals.specialistRouting,
      adapters: evals.adapters,
      assurance: evals.assurance,
      faultInjection: evals.faultInjection,
      specialistPolicyDigest: input.specialistPolicyDigest ?? null,
      builtinSpecialistCatalogDigest: input.builtinSpecialistCatalogDigest ?? null,
      npmAudit: { outcome: parsedSteps["npm-audit"] ?? npmAudit.outcome, highOrGreaterVulnerabilities: npmAudit.highOrGreaterVulnerabilities },
      packaging: { outcome: parsedSteps.packaging ?? "unknown" },
    },
    securityWorkflows,
    compatibility: {
      linux: status(input.compatibility?.linux),
      windows: status(input.compatibility?.windows),
    },
    release: {
      version: input.release?.version ?? null,
      tag: input.release?.tag ?? null,
      tagTargetSha: safeSha(input.release?.tagTargetSha),
      releaseRunId: safeRunId(input.release?.releaseRunId),
      releaseRunConclusion: normalizeOutcome(input.release?.releaseRunConclusion),
      assetNames: sortedUnique(input.release?.assetNames),
      ciBindingAsset: input.release?.ciBindingAsset && safePath(input.release.ciBindingAsset) ? input.release.ciBindingAsset : null,
      directReviewArtifactName: input.release?.directReviewArtifactName && safePath(input.release.directReviewArtifactName) ? input.release.directReviewArtifactName : null,
    },
    artifact: { name: artifactName, retentionDays: boundedInteger(input.artifactRetentionDays ?? DIRECT_REVIEW_ARTIFACT_RETENTION_DAYS) },
    provenance: {
      generatedByScript: input.generatedByScript === "finalizer"
        ? "scripts/github/finalize-direct-review-evidence.mjs"
        : input.generatedByScript === "publisher"
          ? "scripts/github/publish-direct-review-evidence.mjs"
        : "scripts/github/generate-direct-review-evidence.mjs",
      evidenceContractDigest: "",
      sourceRunSha: commitSha,
      sourceRunId: runId,
      sourceRunAttempt: workflow.runAttempt,
    },
    finalVerdict,
    reasonCodes: [...new Set(reasons)].sort(),
  };
  const digest = computeDirectReviewDigest(base);
  base.provenance.evidenceContractDigest = digest;
  return { ...base, evidenceContractDigest: digest };
}

export function validateDirectReviewEvidence(value: unknown, schemaRoot?: string): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["evidence-not-object"];
  const evidence = value as Partial<DirectReviewEvidence>;
  if (evidence.schema !== DIRECT_REVIEW_SCHEMA || ![LEGACY_SECURITY_PROOF_SCHEMA_VERSION, DIRECT_REVIEW_SCHEMA_VERSION].includes(evidence.schemaVersion as typeof DIRECT_REVIEW_SCHEMA_VERSION | typeof LEGACY_SECURITY_PROOF_SCHEMA_VERSION)) errors.push("schema-version-mismatch");
  if (evidence.commitSha !== null && evidence.commitSha !== undefined && !safeSha(evidence.commitSha)) errors.push("commit-sha-invalid");
  if (evidence.gitTreeSha !== null && evidence.gitTreeSha !== undefined && !safeSha(evidence.gitTreeSha)) errors.push("tree-sha-invalid");
  if (evidence.repository !== null && evidence.repository !== undefined && !safeRepository(evidence.repository)) errors.push("repository-invalid");
  errors.push(...comparisonErrors(evidence.comparison, safeSha(evidence.commitSha ?? undefined), evidence.finalVerdict === "PASS" && evidence.event === "push"));
  if (evidence.provenance?.generatedByScript !== "scripts/github/generate-direct-review-evidence.mjs" && evidence.provenance?.generatedByScript !== "scripts/github/publish-direct-review-evidence.mjs" && evidence.provenance?.generatedByScript !== "scripts/github/finalize-direct-review-evidence.mjs") errors.push("generator-script-invalid");
  const digest = typeof evidence.evidenceContractDigest === "string" ? evidence.evidenceContractDigest : "";
  if (!/^[0-9a-f]{64}$/i.test(digest)) errors.push("evidence-digest-invalid");
  if (digest) {
    const { evidenceContractDigest: _ignored, ...withoutDigest } = evidence as DirectReviewEvidence;
    if (computeDirectReviewDigest(withoutDigest) !== digest) errors.push("evidence-digest-mismatch");
  }
  const identityProven = Boolean(safeRepository(evidence.repository ?? undefined) && safeSha(evidence.commitSha ?? undefined) && safeSha(evidence.gitTreeSha ?? undefined) && safeRunId(evidence.workflow?.runId) && safeUrl(evidence.workflow?.htmlUrl ?? undefined));
  if (evidence.finalVerdict === "PASS" && !identityProven) errors.push("identity-unproven");
  const sourceIdentityProven = Boolean(safeSha(evidence.provenance?.sourceRunSha ?? undefined) && safeRunId(evidence.provenance?.sourceRunId ?? undefined) && safeRunAttempt(evidence.provenance?.sourceRunAttempt ?? undefined));
  if (evidence.finalVerdict === "PASS" && !sourceIdentityProven) errors.push("source-run-identity-unproven");
  if (evidence.finalVerdict === "PASS" && evidence.requiredGates?.some((gate) => gate.required && gate.outcome !== "success")) errors.push("pass-with-non-success-gate");
  for (const [statusKey, statusValue] of Object.entries(evidence.securityWorkflows ?? {})) {
    if (statusValue?.proof !== undefined && statusValue.proof !== null) {
      const workflow = statusKey === "dependencyReview" ? "dependency-review" : statusKey;
      errors.push(...validateSecurityWorkflowProof(statusValue.proof, {
        workflow: workflow as "codeql" | "scorecard" | "dependency-review",
        repository: evidence.repository,
        finalCommitSha: evidence.commitSha,
        finalTreeSha: evidence.gitTreeSha,
      }));
    }
  }
  if (evidence.finalVerdict === "PASS" && isCorrectedReleaseVersion(evidence.version)) {
    errors.push(...securityWorkflowAuthorizationErrors(evidence.securityWorkflows ?? {}, {
      repository: evidence.repository,
      finalCommitSha: evidence.commitSha,
      finalTreeSha: evidence.gitTreeSha,
    }));
  }
  if (evidence.version === "0.11.0") {
    for (const key of ["linux", "windows"] as const) {
      const compatibility = evidence.compatibility?.[key];
      if (!compatibilityProof(compatibility, evidence.commitSha)) errors.push("compatibility-not-proven:" + key);
    }
  }
  void schemaRoot;
  return errors;
}
