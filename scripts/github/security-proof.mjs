import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const {
  selectUniqueSecurityRun,
  selectUniqueMergedDependencyReviewPullRequest,
  validateDependencyReviewRunBinding,
} = await import("../../dist/github/security-proof.js");

export function resolveSecurityWorkflowProofs({ repository, finalCommitSha }) {
  const normalizedFinalCommitSha = safeSha(finalCommitSha);
  if (!REPOSITORY_RE.test(repository ?? "") || !normalizedFinalCommitSha) {
    return unavailableProofs("SECURITY_PROOF_IDENTITY_MISMATCH");
  }
  const finalRef = api(`repos/${repository}/git/ref/heads/main`);
  const finalCommit = api(`repos/${repository}/git/commits/${normalizedFinalCommitSha}`);
  const finalTreeSha = safeSha(finalCommit?.tree?.sha);
  const localTreeSha = git(["rev-parse", `${normalizedFinalCommitSha}^{tree}`]);
  if (safeSha(finalRef?.object?.sha) !== normalizedFinalCommitSha || !finalTreeSha || finalTreeSha !== localTreeSha) {
    return unavailableProofs("SECURITY_PROOF_IDENTITY_MISMATCH");
  }

  const codeql = resolveExactProof({ repository, workflow: "codeql", workflowFile: "codeql.yml", finalCommitSha: normalizedFinalCommitSha, finalTreeSha });
  const scorecard = resolveExactProof({ repository, workflow: "scorecard", workflowFile: "scorecard.yml", finalCommitSha: normalizedFinalCommitSha, finalTreeSha, expectedEvent: "push", expectedHeadBranch: "main" });
  const dependencyReview = resolveDependencyReviewProof({ repository, finalCommitSha: normalizedFinalCommitSha, finalTreeSha });
  return { codeql, scorecard, dependencyReview, finalTreeSha };
}

function resolveExactProof({ repository, workflow, workflowFile, finalCommitSha, finalTreeSha, expectedEvent, expectedHeadBranch }) {
  const result = api(`repos/${repository}/actions/workflows/${workflowFile}/runs?per_page=100&head_sha=${finalCommitSha}`);
  const candidates = (result?.workflow_runs ?? []).map(normalizeRun).filter((run) => run.id !== null && run.headSha === finalCommitSha);
  const selection = selectUniqueSecurityRun(candidates, finalCommitSha, {
    expectedEvent,
    expectedHeadBranch,
    ambiguousReasonCode: `${workflow.toUpperCase()}_RUN_AMBIGUOUS`,
    eventRefMismatchReasonCode: workflow === "scorecard" ? "SCORECARD_EVENT_REF_MISMATCH" : `${workflow.toUpperCase()}_EVENT_REF_MISMATCH`,
    unavailableReasonCode: "SECURITY_RUN_UNAVAILABLE",
    pendingReasonCode: "SECURITY_RUN_PENDING",
    notSuccessReasonCode: "SECURITY_RUN_NOT_SUCCESS",
  });
  if (selection.reasonCode) return unavailableStatus(selection.reasonCode, selection.run);
  const candidate = selection.run;
  if (!candidate) return unavailableStatus("SECURITY_RUN_UNAVAILABLE");
  const fullRun = api(`repos/${repository}/actions/runs/${candidate.id}`) ?? denormalizeRun(candidate);
  if (fullRun.status !== "completed") return unavailableStatus("SECURITY_RUN_PENDING", fullRun);
  const runId = positive(fullRun.id);
  const runAttempt = positive(fullRun.run_attempt);
  const outcome = normalizeOutcome(fullRun.conclusion);
  const sourceTreeSha = safeSha(finalTreeSha);
  if (!runId || !runAttempt || safeSha(fullRun.head_sha) !== finalCommitSha || fullRun.repository?.full_name && fullRun.repository.full_name !== repository || (expectedEvent !== undefined && fullRun.event !== expectedEvent) || (expectedHeadBranch !== undefined && fullRun.head_branch !== expectedHeadBranch) || !SAFE_URL_RE.test(fullRun.html_url ?? "") || !sourceTreeSha || !fullRun.html_url.startsWith(`https://github.com/${repository}/`)) {
    return unavailableStatus(workflow === "scorecard" ? "SCORECARD_EVENT_REF_MISMATCH" : "SECURITY_PROOF_IDENTITY_MISMATCH", fullRun);
  }
  const proof = createProof({ workflow, proofMode: "exact-sha", outcome, repository, event: fullRun.event, headBranch: safeRef(fullRun.head_branch), baseRepository: null, baseRef: null, sourceBranch: null, finalCommitSha, finalTreeSha, sourceCommitSha: finalCommitSha, sourceTreeSha, runId, runAttempt, pullRequestNumber: null, htmlUrl: fullRun.html_url });
  return statusForProof(proof);
}

function resolveDependencyReviewProof({ repository, finalCommitSha, finalTreeSha }) {
  const exact = resolveExactProof({ repository, workflow: "dependency-review", workflowFile: "dependency-review.yml", finalCommitSha, finalTreeSha, expectedEvent: "pull_request" });
  if (exact.proof || exact.outcome === "failure" || exact.outcome === "cancelled" || exact.outcome === "skipped") return exact;
  return resolveSameTreeDependencyProof({ repository, finalCommitSha, finalTreeSha });
}

function resolveSameTreeDependencyProof({ repository, finalCommitSha, finalTreeSha }) {
  const pullRequests = api(`repos/${repository}/commits/${finalCommitSha}/pulls`, { headers: ["Accept: application/vnd.github+json"] });
  const mergedSelection = selectUniqueMergedDependencyReviewPullRequest((Array.isArray(pullRequests) ? pullRequests : []).map(normalizePullRequest), { repository, finalCommitSha });
  if (mergedSelection.reasonCode) return unavailableStatus(mergedSelection.reasonCode);
  const pullRequest = mergedSelection.pullRequest;
  if (!pullRequest) return unavailableStatus("DEPENDENCY_REVIEW_PR_NOT_FOUND");
  if (!pullRequest.headRef) return unavailableStatus("DEPENDENCY_REVIEW_SOURCE_REF_UNAVAILABLE");
  const pullRequestNumber = positive(pullRequest.number);
  if (!pullRequestNumber) return unavailableStatus("DEPENDENCY_REVIEW_PR_BINDING_MISMATCH");
  const sourceCommitSha = safeSha(pullRequest.headSha);
  if (!sourceCommitSha || pullRequest.headRepository !== repository) return unavailableStatus("DEPENDENCY_REVIEW_SOURCE_SHA_MISMATCH");
  const sourcePullRequests = api(`repos/${repository}/commits/${sourceCommitSha}/pulls`, { headers: ["Accept: application/vnd.github+json"] });
  const sourceSelection = selectUniqueMergedDependencyReviewPullRequest((Array.isArray(sourcePullRequests) ? sourcePullRequests : []).map(normalizePullRequest), { repository, finalCommitSha, sourceCommitSha });
  if (sourceSelection.reasonCode) return unavailableStatus(sourceSelection.reasonCode === "DEPENDENCY_REVIEW_PR_AMBIGUOUS" ? "DEPENDENCY_REVIEW_SOURCE_PR_AMBIGUOUS" : "DEPENDENCY_REVIEW_SOURCE_PR_NOT_FOUND");
  if (!sourceSelection.pullRequest || sourceSelection.pullRequest.number !== pullRequestNumber) return unavailableStatus("DEPENDENCY_REVIEW_SOURCE_PR_MISMATCH");
  const sourceCommit = api(`repos/${repository}/git/commits/${sourceCommitSha}`);
  const sourceTreeSha = safeSha(sourceCommit?.tree?.sha);
  if (!sourceTreeSha) return unavailableStatus("DEPENDENCY_REVIEW_SOURCE_SHA_MISMATCH");
  if (sourceTreeSha !== finalTreeSha) return unavailableStatus("DEPENDENCY_REVIEW_TREE_MISMATCH");

  const result = api(`repos/${repository}/actions/workflows/dependency-review.yml/runs?per_page=100&head_sha=${sourceCommitSha}`);
  const rawCandidates = (result?.workflow_runs ?? []).map(normalizeRun).filter((run) => run.id !== null && run.headSha === sourceCommitSha);
  const attributableCandidates = rawCandidates.filter((run) => !validateDependencyReviewRunBinding(run, { pullRequestNumber, sourceBranch: pullRequest.headRef }));
  if (rawCandidates.length > 0 && attributableCandidates.length === 0) return unavailableStatus("DEPENDENCY_REVIEW_RUN_PR_MISMATCH");
  const selection = selectUniqueSecurityRun(attributableCandidates, sourceCommitSha, {
    expectedEvent: "pull_request",
    ambiguousReasonCode: "DEPENDENCY_REVIEW_RUN_AMBIGUOUS",
    eventRefMismatchReasonCode: "DEPENDENCY_REVIEW_RUN_EVENT_REF_MISMATCH",
    unavailableReasonCode: "DEPENDENCY_REVIEW_RUN_NOT_SUCCESS",
    pendingReasonCode: "DEPENDENCY_REVIEW_RUN_PENDING",
    notSuccessReasonCode: "DEPENDENCY_REVIEW_RUN_NOT_SUCCESS",
  });
  if (selection.reasonCode) return unavailableStatus(selection.reasonCode, selection.run);
  const candidate = selection.run;
  if (!candidate) return unavailableStatus("DEPENDENCY_REVIEW_RUN_NOT_SUCCESS");
  const fullRun = api(`repos/${repository}/actions/runs/${candidate.id}`) ?? candidate;
  const runId = positive(fullRun.id);
  const runAttempt = positive(fullRun.run_attempt ?? candidate.runAttempt);
  if (!runId || !runAttempt || fullRun.status !== "completed" || safeSha(fullRun.head_sha) !== sourceCommitSha || fullRun.repository?.full_name && fullRun.repository.full_name !== repository || fullRun.event !== "pull_request" || validateDependencyReviewRunBinding(normalizeRun(fullRun), { pullRequestNumber, sourceBranch: pullRequest.headRef }) || !SAFE_URL_RE.test(fullRun.html_url ?? "") || !fullRun.html_url.startsWith(`https://github.com/${repository}/`)) return unavailableStatus("DEPENDENCY_REVIEW_RUN_PR_MISMATCH", fullRun);
  if (fullRun.conclusion !== "success") return unavailableStatus("DEPENDENCY_REVIEW_RUN_NOT_SUCCESS", fullRun);
  const proof = createProof({ workflow: "dependency-review", proofMode: "same-tree-pr", outcome: "success", repository, event: fullRun.event, headBranch: safeRef(fullRun.head_branch), baseRepository: pullRequest.baseRepository, baseRef: pullRequest.baseRef, sourceBranch: pullRequest.headRef, finalCommitSha, finalTreeSha, sourceCommitSha, sourceTreeSha, runId, runAttempt, pullRequestNumber, htmlUrl: fullRun.html_url });
  return statusForProof(proof);
}

function createProof(input) {
  const withoutDigest = { ...input };
  const proofDigest = crypto.createHash("sha256").update(JSON.stringify(sortedObject(withoutDigest))).digest("hex");
  return { ...withoutDigest, proofDigest };
}

function statusForProof(proof) {
  return {
    status: proof.outcome,
    outcome: proof.outcome,
    runId: proof.runId,
    runAttempt: proof.runAttempt,
    commitSha: proof.sourceCommitSha,
    htmlUrl: proof.htmlUrl,
    reasonCode: proof.outcome === "success" ? null : "SECURITY_WORKFLOW_NOT_SUCCESS",
    proof,
  };
}

function unavailableProofs(reasonCode) {
  return { codeql: unavailableStatus(reasonCode), scorecard: unavailableStatus(reasonCode), dependencyReview: unavailableStatus(reasonCode), finalTreeSha: null };
}

function unavailableStatus(reasonCode, run = null) {
  return {
    status: run?.status === "completed" ? normalizeOutcome(run.conclusion) : "unknown",
    outcome: run?.status === "completed" ? normalizeOutcome(run.conclusion) : "unknown",
    runId: positive(run?.id ?? run?.runId),
    runAttempt: positive(run?.run_attempt ?? run?.runAttempt),
    commitSha: safeSha(run?.head_sha ?? run?.headSha),
    htmlUrl: SAFE_URL_RE.test(run?.html_url ?? "") ? run.html_url : null,
    reasonCode,
  };
}

function normalizeRun(run) {
  const pullRequestMetadata = extractPullRequestMetadata(run?.pull_requests);
  return {
    id: positive(run?.id),
    headSha: safeSha(run?.head_sha),
    status: typeof run?.status === "string" ? run.status : null,
    conclusion: typeof run?.conclusion === "string" ? run.conclusion : null,
    runAttempt: positive(run?.run_attempt),
    event: typeof run?.event === "string" ? run.event : null,
    headBranch: typeof run?.head_branch === "string" ? run.head_branch : null,
    repository: typeof run?.repository?.full_name === "string" ? run.repository.full_name : null,
    pullRequestMetadata: pullRequestMetadata.state,
    pullRequestNumbers: pullRequestMetadata.numbers,
    htmlUrl: run?.html_url,
  };
}

function denormalizeRun(run) {
  return {
    id: run.id,
    head_sha: run.headSha,
    status: run.status,
    conclusion: run.conclusion,
    run_attempt: run.runAttempt,
    event: run.event,
    head_branch: run.headBranch,
    repository: run.repository ? { full_name: run.repository } : undefined,
    html_url: run.htmlUrl,
  };
}

function normalizePullRequest(pr) {
  return {
    number: positive(pr?.number),
    state: typeof pr?.state === "string" ? pr.state : null,
    mergedAt: typeof pr?.merged_at === "string" ? pr.merged_at : null,
    mergeCommitSha: safeSha(pr?.merge_commit_sha),
    baseRepository: typeof pr?.base?.repo?.full_name === "string" ? pr.base.repo.full_name : null,
    baseRef: typeof pr?.base?.ref === "string" ? pr.base.ref : null,
    headRepository: typeof pr?.head?.repo?.full_name === "string" ? pr.head.repo.full_name : null,
    headRef: typeof pr?.head?.ref === "string" ? pr.head.ref : null,
    headSha: safeSha(pr?.head?.sha),
  };
}

function extractPullRequestMetadata(value) {
  if (value === undefined) return { state: "absent", numbers: null };
  if (!Array.isArray(value)) return { state: "invalid", numbers: null };
  if (value.length === 0) return { state: "empty", numbers: [] };
  const numbers = value.map((item) => positive(item?.number));
  if (numbers.some((number) => number === null)) return { state: "invalid", numbers: null };
  return { state: "present", numbers: [...new Set(numbers)] };
}

function safeRef(value) {
  return typeof value === "string" && /^[A-Za-z0-9._/-]{1,255}$/.test(value) && !value.includes("..") ? value : null;
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortedObject(item)]));
}

function api(endpoint, options = {}) {
  const args = ["api", endpoint];
  for (const header of options.headers ?? []) args.push("-H", header);
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function git(args) {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim(); } catch { return null; }
}

function safeSha(value) { return typeof value === "string" && SHA_RE.test(value) ? value.toLowerCase() : null; }
function positive(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function normalizeOutcome(value) { return ["success", "failure", "cancelled", "skipped"].includes(value) ? value : "unknown"; }
