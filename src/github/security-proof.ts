import crypto from "node:crypto";

export const SECURITY_PROOF_SCHEMA_VERSION = "0.9.0" as const;
export const LEGACY_SECURITY_PROOF_SCHEMA_VERSION = "0.8.0" as const;

export type SecurityWorkflowName = "codeql" | "scorecard" | "dependency-review";
export type SecurityProofMode = "exact-sha" | "same-tree-pr";
export type SecurityProofOutcome = "success" | "failure" | "cancelled" | "skipped" | "unknown";

export type SecurityWorkflowProof = {
  workflow: SecurityWorkflowName;
  proofMode: SecurityProofMode;
  outcome: SecurityProofOutcome;
  repository: string;
  event: string;
  headBranch: string | null;
  baseRepository: string | null;
  baseRef: string | null;
  sourceBranch: string | null;
  finalCommitSha: string;
  finalTreeSha: string;
  sourceCommitSha: string;
  sourceTreeSha: string;
  runId: number;
  runAttempt: number;
  pullRequestNumber: number | null;
  htmlUrl: string;
  proofDigest: string;
};

export type SecurityWorkflowStatusKey = "codeql" | "scorecard" | "dependencyReview";
export type SecurityWorkflowStatuses = Partial<Record<SecurityWorkflowStatusKey, { outcome?: unknown; proof?: unknown }>>;

export type SecurityProofExpectation = {
  workflow?: SecurityWorkflowName;
  repository?: string | null;
  finalCommitSha?: string | null;
  finalTreeSha?: string | null;
  sourceCommitSha?: string | null;
};

const SHA_RE = /^[0-9a-f]{40}$/i;
const DIGEST_RE = /^[0-9a-f]{64}$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/actions\/runs\/([0-9]+)$/;
const EVENT_RE = /^[a-z0-9_-]{1,80}$/;
const REF_RE = /^[A-Za-z0-9._/-]{1,255}$/;
const OUTCOMES = new Set<SecurityProofOutcome>(["success", "failure", "cancelled", "skipped", "unknown"]);
const WORKFLOWS = new Set<SecurityWorkflowName>(["codeql", "scorecard", "dependency-review"]);

export function isCorrectedReleaseVersion(version: string | null | undefined): boolean {
  if (typeof version !== "string") return false;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-|\+|$)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 0 || minor > 11 || (minor === 11 && patch >= 1);
}

function sortedObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortedObject(item)]),
  );
}

export function computeSecurityWorkflowProofDigest(
  proof: Omit<SecurityWorkflowProof, "proofDigest"> | SecurityWorkflowProof,
): string {
  const { proofDigest: _ignored, ...withoutDigest } = proof as SecurityWorkflowProof;
  return crypto.createHash("sha256").update(JSON.stringify(sortedObject(withoutDigest))).digest("hex");
}

export function createSecurityWorkflowProof(
  input: Omit<SecurityWorkflowProof, "proofDigest">,
): SecurityWorkflowProof {
  const proof = { ...input, proofDigest: "" } as SecurityWorkflowProof;
  proof.proofDigest = computeSecurityWorkflowProofDigest(proof);
  return proof;
}

export function normalizeSecurityWorkflowProof(value: unknown): SecurityWorkflowProof | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<SecurityWorkflowProof>;
  const workflow = WORKFLOWS.has(item.workflow as SecurityWorkflowName) ? item.workflow as SecurityWorkflowName : null;
  const proofMode = item.proofMode === "exact-sha" || item.proofMode === "same-tree-pr" ? item.proofMode : null;
  const outcome = OUTCOMES.has(item.outcome as SecurityProofOutcome) ? item.outcome as SecurityProofOutcome : null;
  const repository = typeof item.repository === "string" && REPOSITORY_RE.test(item.repository) ? item.repository : null;
  const event = typeof item.event === "string" && EVENT_RE.test(item.event) ? item.event : null;
  const ref = (candidate: unknown): string | null => candidate === null ? null : typeof candidate === "string" && REF_RE.test(candidate) && !candidate.includes("..") ? candidate : null;
  const headBranch = ref(item.headBranch);
  const baseRepository = item.baseRepository === null ? null : typeof item.baseRepository === "string" && REPOSITORY_RE.test(item.baseRepository) ? item.baseRepository : null;
  const baseRef = ref(item.baseRef);
  const sourceBranch = ref(item.sourceBranch);
  const sha = (candidate: unknown): string | null => typeof candidate === "string" && SHA_RE.test(candidate) ? candidate.toLowerCase() : null;
  const positive = (candidate: unknown): number | null => typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
  const pullRequestNumber = item.pullRequestNumber === null ? null : positive(item.pullRequestNumber);
  const htmlUrl = typeof item.htmlUrl === "string" && URL_RE.test(item.htmlUrl) ? item.htmlUrl : null;
  const proofDigest = typeof item.proofDigest === "string" && DIGEST_RE.test(item.proofDigest) ? item.proofDigest.toLowerCase() : null;
  if (!workflow || !proofMode || !outcome || !repository || !event || (item.headBranch !== null && headBranch === null) || (item.baseRepository !== null && baseRepository === null) || (item.baseRef !== null && baseRef === null) || (item.sourceBranch !== null && sourceBranch === null) || !sha(item.finalCommitSha) || !sha(item.finalTreeSha) || !sha(item.sourceCommitSha) || !sha(item.sourceTreeSha) || !positive(item.runId) || !positive(item.runAttempt) || (item.pullRequestNumber !== null && pullRequestNumber === null) || !htmlUrl || !proofDigest) return null;
  return {
    workflow,
    proofMode,
    outcome,
    repository,
    event,
    headBranch,
    baseRepository,
    baseRef,
    sourceBranch,
    finalCommitSha: sha(item.finalCommitSha)!,
    finalTreeSha: sha(item.finalTreeSha)!,
    sourceCommitSha: sha(item.sourceCommitSha)!,
    sourceTreeSha: sha(item.sourceTreeSha)!,
    runId: positive(item.runId)!,
    runAttempt: positive(item.runAttempt)!,
    pullRequestNumber,
    htmlUrl,
    proofDigest,
  };
}

export function validateSecurityWorkflowProof(
  value: unknown,
  expectation: SecurityProofExpectation = {},
): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["SECURITY_PROOF_IDENTITY_MISMATCH"];
  const item = value as Partial<SecurityWorkflowProof>;
  const allowed = ["workflow", "proofMode", "outcome", "repository", "event", "headBranch", "baseRepository", "baseRef", "sourceBranch", "finalCommitSha", "finalTreeSha", "sourceCommitSha", "sourceTreeSha", "runId", "runAttempt", "pullRequestNumber", "htmlUrl", "proofDigest"];
  if (Object.keys(item).some((key) => !allowed.includes(key))) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (!WORKFLOWS.has(item.workflow as SecurityWorkflowName)) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (!(["exact-sha", "same-tree-pr"] as unknown[]).includes(item.proofMode)) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (!OUTCOMES.has(item.outcome as SecurityProofOutcome)) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (typeof item.repository !== "string" || !REPOSITORY_RE.test(item.repository)) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (typeof item.event !== "string" || !EVENT_RE.test(item.event)) errors.push("SECURITY_PROOF_EVENT_REF_MISMATCH");
  for (const key of ["headBranch", "baseRef", "sourceBranch"] as const) if (item[key] !== null && (typeof item[key] !== "string" || !REF_RE.test(item[key]) || item[key].includes(".."))) errors.push("SECURITY_PROOF_EVENT_REF_MISMATCH");
  if (item.baseRepository !== null && (typeof item.baseRepository !== "string" || !REPOSITORY_RE.test(item.baseRepository))) errors.push("SECURITY_PROOF_EVENT_REF_MISMATCH");
  for (const key of ["finalCommitSha", "finalTreeSha", "sourceCommitSha", "sourceTreeSha"] as const) {
    if (!SHA_RE.test(item[key] ?? "")) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  }
  if (!Number.isSafeInteger(item.runId) || (item.runId ?? 0) <= 0 || !Number.isSafeInteger(item.runAttempt) || (item.runAttempt ?? 0) <= 0) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (item.pullRequestNumber !== null && (!Number.isSafeInteger(item.pullRequestNumber) || (item.pullRequestNumber ?? 0) <= 0)) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  const urlMatch = typeof item.htmlUrl === "string" ? URL_RE.exec(item.htmlUrl) : null;
  if (!urlMatch || urlMatch[1] !== item.repository || Number(urlMatch[2]) !== item.runId) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (!DIGEST_RE.test(item.proofDigest ?? "") || computeSecurityWorkflowProofDigest(item as SecurityWorkflowProof) !== item.proofDigest) errors.push("SECURITY_PROOF_DIGEST_MISMATCH");

  if (expectation.workflow && item.workflow !== expectation.workflow) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (expectation.repository && item.repository !== expectation.repository) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (expectation.finalCommitSha && item.finalCommitSha !== expectation.finalCommitSha.toLowerCase()) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (expectation.finalTreeSha && item.finalTreeSha !== expectation.finalTreeSha.toLowerCase()) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  if (expectation.sourceCommitSha && item.sourceCommitSha !== expectation.sourceCommitSha.toLowerCase()) errors.push("DEPENDENCY_REVIEW_SOURCE_SHA_MISMATCH");
  if (item.workflow === "codeql" || item.workflow === "scorecard") {
    if (item.proofMode !== "exact-sha" || item.pullRequestNumber !== null || item.sourceCommitSha !== item.finalCommitSha || item.sourceTreeSha !== item.finalTreeSha) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
  }
  if (item.workflow === "scorecard" && (item.event !== "push" || item.headBranch !== "main")) errors.push("SCORECARD_EVENT_REF_MISMATCH");
  if (item.workflow === "dependency-review") {
    if (item.proofMode === "exact-sha" && (item.pullRequestNumber !== null || item.sourceCommitSha !== item.finalCommitSha || item.sourceTreeSha !== item.finalTreeSha || item.baseRepository !== null || item.baseRef !== null || item.sourceBranch !== null)) errors.push("SECURITY_PROOF_IDENTITY_MISMATCH");
    if (item.proofMode === "same-tree-pr") {
      if (item.pullRequestNumber === null || item.sourceTreeSha !== item.finalTreeSha) errors.push("DEPENDENCY_REVIEW_TREE_MISMATCH");
      if (item.event !== "pull_request" || item.baseRepository !== item.repository || item.baseRef !== "main" || item.sourceBranch === null || (item.headBranch !== null && item.headBranch !== item.sourceBranch)) errors.push("DEPENDENCY_REVIEW_PR_BINDING_MISMATCH");
    }
  }
  return [...new Set(errors)];
}

export function securityWorkflowAuthorizationErrors(
  statuses: SecurityWorkflowStatuses,
  expectation: { repository?: string | null; finalCommitSha?: string | null; finalTreeSha?: string | null } = {},
): string[] {
  const errors: string[] = [];
  const entries: Array<[SecurityWorkflowName, SecurityWorkflowStatusKey, string]> = [
    ["codeql", "codeql", "CODEQL_NOT_PROVEN"],
    ["scorecard", "scorecard", "SCORECARD_NOT_PROVEN"],
    ["dependency-review", "dependencyReview", "DEPENDENCY_REVIEW_NOT_PROVEN"],
  ];
  for (const [workflow, statusKey, reason] of entries) {
    const status = statuses[statusKey];
    const proof = status?.proof;
    if (!proof) {
      errors.push(reason);
      continue;
    }
    const proofErrors = validateSecurityWorkflowProof(proof, {
      workflow,
      repository: expectation.repository,
      finalCommitSha: expectation.finalCommitSha,
      finalTreeSha: expectation.finalTreeSha,
    });
    if (proofErrors.length > 0) errors.push(...proofErrors, reason);
    if (proof && typeof proof === "object" && (proof as Partial<SecurityWorkflowProof>).outcome !== "success") errors.push(reason);
  }
  return [...new Set(errors)];
}

export type SecurityRunCandidate = {
  id: number;
  headSha: string | null;
  status: string | null;
  conclusion: string | null;
  runAttempt: number | null;
  event?: string | null;
  headBranch?: string | null;
  repository?: string | null;
  pullRequestMetadata?: "absent" | "empty" | "present" | "invalid";
  pullRequestNumbers?: number[] | null;
};

export type SecurityRunSelectionOptions = {
  expectedEvent?: string;
  expectedHeadBranch?: string;
  ambiguousReasonCode?: string;
  eventRefMismatchReasonCode?: string;
  unavailableReasonCode?: string;
  pendingReasonCode?: string;
  notSuccessReasonCode?: string;
};

export function selectUniqueSecurityRun(
  candidates: SecurityRunCandidate[],
  expectedHeadSha: string,
  options: SecurityRunSelectionOptions = {},
): { run: SecurityRunCandidate | null; reasonCode: string | null } {
  const defaults = {
    ambiguousReasonCode: "SECURITY_RUN_AMBIGUOUS",
    eventRefMismatchReasonCode: "SECURITY_RUN_EVENT_REF_MISMATCH",
    unavailableReasonCode: "SECURITY_RUN_UNAVAILABLE",
    pendingReasonCode: "SECURITY_RUN_PENDING",
    notSuccessReasonCode: "SECURITY_RUN_NOT_SUCCESS",
  };
  const settings = { ...defaults, ...options };
  const shaMatches = candidates.filter((run) => run.headSha === expectedHeadSha);
  if (shaMatches.length === 0) return { run: null, reasonCode: settings.unavailableReasonCode };
  const authoritative = shaMatches.filter((run) =>
    (settings.expectedEvent === undefined || run.event === settings.expectedEvent) &&
    (settings.expectedHeadBranch === undefined || run.headBranch === settings.expectedHeadBranch),
  );
  if (authoritative.length === 0) return { run: null, reasonCode: settings.eventRefMismatchReasonCode };
  const completed = authoritative.filter((run) => run.status === "completed");
  if (completed.length === 0) {
    return { run: null, reasonCode: authoritative.some((run) => run.status !== "completed") ? settings.pendingReasonCode : settings.unavailableReasonCode };
  }
  const distinctIds = new Set(completed.map((run) => run.id));
  if (distinctIds.size > 1) return { run: null, reasonCode: settings.ambiguousReasonCode };
  const run = [...completed].sort((left, right) => (right.runAttempt ?? 0) - (left.runAttempt ?? 0))[0] ?? null;
  if (!run || run.conclusion !== "success") return { run, reasonCode: settings.notSuccessReasonCode };
  return { run, reasonCode: null };
}

export type DependencyReviewPullRequestCandidate = {
  number: number;
  state: string | null;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  baseRepository: string | null;
  baseRef: string | null;
  headRepository: string | null;
  headRef: string | null;
  headSha: string | null;
};

export type DependencyReviewPullRequestExpectation = {
  repository: string;
  finalCommitSha: string;
  sourceCommitSha?: string;
};

function uniquePullRequests(candidates: DependencyReviewPullRequestCandidate[]): DependencyReviewPullRequestCandidate[] {
  return [...new Map(candidates.filter((candidate) => Number.isSafeInteger(candidate.number) && candidate.number > 0).map((candidate) => [candidate.number, candidate])).values()];
}

export function selectUniqueMergedDependencyReviewPullRequest(
  candidates: DependencyReviewPullRequestCandidate[],
  expected: DependencyReviewPullRequestExpectation,
): { pullRequest: DependencyReviewPullRequestCandidate | null; reasonCode: string | null } {
  const unique = uniquePullRequests(candidates);
  const matches = unique.filter((pr) => pr.state === "closed" && Boolean(pr.mergedAt) && pr.mergeCommitSha === expected.finalCommitSha && pr.baseRepository === expected.repository && pr.baseRef === "main" && pr.headRepository === expected.repository && (!expected.sourceCommitSha || pr.headSha === expected.sourceCommitSha));
  if (matches.length === 1) return { pullRequest: matches[0]!, reasonCode: null };
  if (matches.length > 1) return { pullRequest: null, reasonCode: "DEPENDENCY_REVIEW_PR_AMBIGUOUS" };
  return { pullRequest: null, reasonCode: unique.length > 1 ? "DEPENDENCY_REVIEW_PR_AMBIGUOUS" : "DEPENDENCY_REVIEW_PR_NOT_FOUND" };
}

export function validateDependencyReviewRunBinding(
  run: SecurityRunCandidate,
  expected: { pullRequestNumber: number; sourceBranch: string },
): string | null {
  if (run.pullRequestMetadata === "invalid") return "DEPENDENCY_REVIEW_RUN_PR_MISMATCH";
  if (run.pullRequestMetadata === "present" && (run.pullRequestNumbers?.length !== 1 || run.pullRequestNumbers[0] !== expected.pullRequestNumber)) return "DEPENDENCY_REVIEW_RUN_PR_MISMATCH";
  if (run.headBranch !== null && run.headBranch !== undefined && run.headBranch !== expected.sourceBranch) return "DEPENDENCY_REVIEW_RUN_PR_MISMATCH";
  return null;
}

export type SecurityProofResolutionStatus = {
  outcome?: unknown;
  reasonCode?: string | null;
  proof?: { outcome?: unknown } | null;
};

export type SecurityProofResolution = {
  codeql: SecurityProofResolutionStatus;
  scorecard: SecurityProofResolutionStatus;
  dependencyReview: SecurityProofResolutionStatus;
};

export async function waitForSecurityProofReadiness(input: {
  resolve: () => SecurityProofResolution | Promise<SecurityProofResolution>;
  maxAttempts?: number;
  intervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<{ ready: boolean; attempts: number; resolution: SecurityProofResolution; reasonCode: string | null }> {
  const maxAttempts = Number.isSafeInteger(input.maxAttempts) ? Math.min(60, Math.max(1, input.maxAttempts!)) : 6;
  const intervalMs = Number.isSafeInteger(input.intervalMs) ? Math.min(60_000, Math.max(0, input.intervalMs!)) : 5_000;
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastResolution: SecurityProofResolution = {
    codeql: { outcome: "unknown", reasonCode: "SECURITY_PROOF_READINESS_UNAVAILABLE" },
    scorecard: { outcome: "unknown", reasonCode: "SECURITY_PROOF_READINESS_UNAVAILABLE" },
    dependencyReview: { outcome: "unknown", reasonCode: "SECURITY_PROOF_READINESS_UNAVAILABLE" },
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      lastResolution = await input.resolve();
    } catch {
      return { ready: false, attempts: attempt, resolution: lastResolution, reasonCode: "SECURITY_PROOF_READINESS_RESOLVER_ERROR" };
    }
    const statuses = [lastResolution.codeql, lastResolution.scorecard, lastResolution.dependencyReview];
    if (statuses.every((status) => status?.proof?.outcome === "success")) return { ready: true, attempts: attempt, resolution: lastResolution, reasonCode: null };
    const terminal = statuses.find((status) => {
      if (["failure", "cancelled", "skipped"].includes(String(status?.proof?.outcome ?? status?.outcome))) return true;
      const reason = status?.reasonCode ?? "";
      return reason !== "" && !["SECURITY_RUN_UNAVAILABLE", "SECURITY_RUN_PENDING", "DEPENDENCY_REVIEW_PR_NOT_FOUND", "DEPENDENCY_REVIEW_SOURCE_PR_NOT_FOUND", "DEPENDENCY_REVIEW_RUN_NOT_SUCCESS"].includes(reason);
    });
    if (terminal) return { ready: false, attempts: attempt, resolution: lastResolution, reasonCode: terminal.reasonCode ?? "SECURITY_PROOF_NOT_SUCCESS" };
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
  return { ready: false, attempts: maxAttempts, resolution: lastResolution, reasonCode: "SECURITY_PROOF_READINESS_TIMEOUT" };
}

export function selectUniqueDependencyReviewRun(
  candidates: SecurityRunCandidate[],
  expectedHeadSha: string,
): { run: SecurityRunCandidate | null; reasonCode: string | null } {
  return selectUniqueSecurityRun(candidates, expectedHeadSha, {
    ambiguousReasonCode: "DEPENDENCY_REVIEW_RUN_AMBIGUOUS",
    unavailableReasonCode: "DEPENDENCY_REVIEW_RUN_NOT_SUCCESS",
    pendingReasonCode: "DEPENDENCY_REVIEW_RUN_NOT_SUCCESS",
    notSuccessReasonCode: "DEPENDENCY_REVIEW_RUN_NOT_SUCCESS",
  });
}
