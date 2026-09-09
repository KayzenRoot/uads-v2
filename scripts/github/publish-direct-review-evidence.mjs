#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  GATE_STEP_NAMES,
  REQUIRED_GATES,
  createDirectReviewFromReceipt,
  safeSha,
  validateReceiptDigest,
} from "./ci-gate-receipt-runtime.mjs";
import { deriveGitComparison, validateComparison } from "./comparison-runtime.mjs";
import { validateCompatibilityArtifact } from "./compatibility-artifacts.mjs";
import { resolveSecurityWorkflowProofs } from "./security-proof.mjs";
const { isCorrectedReleaseVersion, waitForSecurityProofReadiness } = await import("../../dist/github/security-proof.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = valueOf("--repo") ?? process.env.GITHUB_REPOSITORY;
const receiptPath = required("--receipt");
const output = path.resolve(valueOf("--output") ?? path.join(process.env.RUNNER_TEMP ?? path.join(root, "tmp"), "github-direct-review-evidence.json"));
const checksumOutput = path.resolve(valueOf("--checksum-output") ?? `${output}.sha256`);
const sourceRunId = numberOrNull(valueOf("--source-run-id") ?? process.env.SOURCE_CI_RUN_ID);
const sourceRunAttempt = numberOrNull(valueOf("--source-run-attempt") ?? process.env.SOURCE_CI_RUN_ATTEMPT);
const compatibilityRunId = numberOrNull(valueOf("--compatibility-run-id") ?? process.env.COMPATIBILITY_RUN_ID);
const compatibilityRunAttempt = numberOrNull(valueOf("--compatibility-run-attempt") ?? process.env.COMPATIBILITY_RUN_ATTEMPT);
if (!repo || !sourceRunId || !sourceRunAttempt) fail("repository and exact source CI run identity are required");
const receipt = readJson(receiptPath);
const receiptErrors = validateReceiptDigest(receipt);
if (receiptErrors.length) fail(`source CI receipt is invalid: ${receiptErrors.join(",")}`);
if (receipt.schema !== "uads.ci-gate-receipt" || receipt.schemaVersion !== "0.8.0") fail("source CI receipt schema mismatch");
const sourceRun = api(`repos/${repo}/actions/runs/${sourceRunId}`);
const jobs = api(`repos/${repo}/actions/runs/${sourceRunId}/jobs?per_page=100`);
const artifacts = api(`repos/${repo}/actions/runs/${sourceRunId}/artifacts?per_page=100`);
if (!sourceRun || !jobs || !artifacts) fail("source CI metadata is unavailable");
const artifactName = `uads-ci-gate-receipt-${receipt.commitSha}`;
const receiptArtifacts = (artifacts.artifacts ?? []).filter((item) => item.name === artifactName && item.expired !== true);
if (receiptArtifacts.length !== 1) fail(`source receipt artifact is ambiguous or missing: ${receiptArtifacts.length}`);
if (receiptArtifacts[0].workflow_run?.id && Number(receiptArtifacts[0].workflow_run.id) !== sourceRunId) fail("source receipt artifact run identity mismatch");

crossCheckSourceRun(sourceRun, receipt, repo, sourceRunId, sourceRunAttempt);
crossCheckSourceJob(jobs.jobs ?? [], receipt);
const headSha = safeSha(git(["rev-parse", "HEAD"]));
if (headSha !== receipt.commitSha) fail("checked out source SHA does not match receipt");
const treeSha = safeSha(git(["rev-parse", "HEAD^{tree}"]));
if (treeSha !== receipt.gitTreeSha) fail("checked out source tree SHA does not match receipt");
const comparison = deriveGitComparison({ baseSha: receipt.comparison?.baseSha ?? null, headSha: receipt.commitSha, cwd: root });
const comparisonErrors = validateComparison(comparison, {
  expectedHeadSha: receipt.commitSha,
  requireComplete: receipt.finalVerdict === "PASS" && receipt.event === "push",
});
if (comparisonErrors.length) fail(`canonical comparison is invalid: ${comparisonErrors.join(",")}`);

const directRunId = numberOrNull(process.env.GITHUB_RUN_ID);
const directRunAttempt = numberOrNull(process.env.GITHUB_RUN_ATTEMPT);
const securityReadiness = isCorrectedReleaseVersion(receipt.version)
  ? await waitForSecurityProofReadiness({
      resolve: () => resolveSecurityWorkflowProofs({ repository: repo, finalCommitSha: receipt.commitSha }),
      maxAttempts: numberOrNull(process.env.UADS_SECURITY_PROOF_MAX_ATTEMPTS) ?? 12,
      intervalMs: numberOrNull(process.env.UADS_SECURITY_PROOF_POLL_MS) ?? 5_000,
    })
  : { ready: true, attempts: 1, resolution: resolveSecurityWorkflowProofs({ repository: repo, finalCommitSha: receipt.commitSha }), reasonCode: null };
if (!securityReadiness.ready) fail(`security proof readiness failed after ${securityReadiness.attempts} attempt(s): ${securityReadiness.reasonCode ?? "SECURITY_PROOF_NOT_READY"}`);
const securityProofs = securityReadiness.resolution;
const directEvidence = createDirectReviewFromReceipt(receipt, {
  repository: repo,
  branch: process.env.GITHUB_REF_NAME ?? "main",
  commitSha: receipt.commitSha,
  gitTreeSha: receipt.gitTreeSha,
  version: receipt.version,
  event: receipt.event,
  sourceRunId,
  sourceRunAttempt,
  sourceRunSha: receipt.commitSha,
  comparison,
  workflow: {
    runId: directRunId,
    runAttempt: directRunAttempt,
    workflowName: process.env.GITHUB_WORKFLOW ?? "UADS Direct Review Evidence",
    jobName: process.env.GITHUB_JOB ?? "publish",
    htmlUrl: directRunId ? `https://github.com/${repo}/actions/runs/${directRunId}` : null,
    startedAt: process.env.UADS_RUN_STARTED_AT ?? null,
    completedAt: process.env.UADS_RUN_COMPLETED_AT ?? null,
  },
  artifactName: `uads-direct-review-${receipt.commitSha}`,
  artifactRetentionDays: 90,
  securityWorkflows: {
    codeql: securityProofs.codeql,
    scorecard: securityProofs.scorecard,
    dependencyReview: securityProofs.dependencyReview,
  },
  compatibility: {
    linux: validateCompatibilityArtifact({ repository: repo, expectedSha: receipt.commitSha, expectedTreeSha: receipt.gitTreeSha, platform: "linux", expectedRunId: compatibilityRunId, expectedRunAttempt: compatibilityRunAttempt }),
    windows: validateCompatibilityArtifact({ repository: repo, expectedSha: receipt.commitSha, expectedTreeSha: receipt.gitTreeSha, platform: "windows", expectedRunId: compatibilityRunId, expectedRunAttempt: compatibilityRunAttempt }),
  },
});
const { validateDirectReviewEvidence } = await import("../../dist/github/direct-review.js");
const directEvidenceErrors = validateDirectReviewEvidence(directEvidence, root);
if (directEvidenceErrors.length > 0) fail(`security-gated direct-review evidence is invalid: ${directEvidenceErrors.join(",")}`);
if (directEvidence.finalVerdict === "INCOMPLETE" && receipt.finalVerdict === "PASS") fail("canonical direct-review identity is incomplete");
fs.mkdirSync(path.dirname(output), { recursive: true });
const text = `${JSON.stringify(directEvidence, null, 2)}\n`;
fs.writeFileSync(output, text, "utf8");
const fileSha256 = crypto.createHash("sha256").update(text).digest("hex");
fs.writeFileSync(checksumOutput, `${fileSha256}  ${path.basename(output)}\n`, "utf8");
const summary = [
  "## UADS Direct Review Evidence",
  `- Source CI SHA: ${receipt.commitSha}`,
  `- Source CI run: ${sourceRunId} (attempt ${sourceRunAttempt})`,
  `- Source CI verdict: ${receipt.finalVerdict}`,
  `- Tests: ${formatTests(receipt.validation)}`,
  `- Evals: ${formatEvals(receipt.validation)}`,
  `- npm audit: ${receipt.validation.npmAudit?.outcome ?? "unknown"}`,
  `- Security proof readiness: ${securityReadiness.attempts} bounded attempt(s)`,
  `- Reason codes: ${directEvidence.reasonCodes.join(", ") || "none"}`,
  `- Evidence SHA-256: ${fileSha256}`,
  `- Artifact: ${directEvidence.artifact.name}`,
].join("\n") + "\n";
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
process.stdout.write(`UADS_DIRECT_REVIEW_BEGIN\n${text}UADS_DIRECT_REVIEW_END\n${JSON.stringify({ output, checksumOutput, sourceRunId, sourceRunAttempt, verdict: directEvidence.finalVerdict, fileSha256 }, null, 2)}\n`);

function crossCheckSourceRun(run, item, repository, runId, runAttempt) {
  if (Number(run.id) !== runId || Number(run.run_attempt) !== runAttempt || run.head_sha !== item.commitSha || run.name !== "CI" || run.event !== "push" || run.head_branch !== "main") fail("source CI run identity or security boundary mismatch");
  if (run.repository?.full_name && run.repository.full_name !== repository) fail("source CI repository mismatch");
  if (item.repository !== repository || item.branch !== "main" || item.event !== "push" || item.workflow.runId !== runId || item.workflow.runAttempt !== runAttempt || item.workflow.workflowName !== "CI") fail("receipt metadata does not match GitHub source run");
  if (item.workflow.htmlUrl !== run.html_url) fail("receipt source run URL mismatch");
}
function crossCheckSourceJob(jobs, item) {
  const matches = jobs.filter((job) => job.name === item.workflow.jobName && Number(job.run_id) === item.workflow.runId);
  if (matches.length !== 1) fail(`source CI job is ambiguous or missing: ${matches.length}`);
  const job = matches[0];
  for (const gate of item.requiredGates) {
    const name = GATE_STEP_NAMES[gate.id];
    const steps = (job.steps ?? []).filter((step) => step.name === name);
    if (steps.length !== 1) fail(`source CI step is ambiguous or missing: ${gate.id}`);
    if (normalizeGitHubOutcome(steps[0].conclusion) !== gate.outcome) fail(`source CI step outcome mismatch: ${gate.id}`);
  }
  if (item.requiredGates.length !== REQUIRED_GATES.length) fail("source receipt gate set is incomplete");
}
function normalizeGitHubOutcome(value) { return ["success", "failure", "cancelled", "skipped"].includes(value) ? value : "unknown"; }
function safeUrl(value) { return typeof value === "string" && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(value) ? value : null; }
function api(endpoint) { const result = spawnSync("gh", ["api", endpoint], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 }); if (result.status !== 0) return null; try { return JSON.parse(result.stdout); } catch { return null; } }
function git(args) { try { return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim(); } catch { return null; } }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(`invalid JSON: ${file}`); } }
function required(name) { const value = valueOf(name); if (!value) fail(`${name} is required`); return path.resolve(value); }
function valueOf(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function numberOrNull(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function formatTests(validation) { return `${validation.testFilesPassed ?? "unknown"} files; ${validation.testsPassed ?? "unknown"} passed; ${validation.testsFailed ?? "unknown"} failed`; }
function formatEvals(validation) { return ["orchestrator", "execution", "context", "fault", "cost", "modelRouting", "specialistRouting", "adapters", "assurance", "faultInjection"].map((key) => `${key} ${validation[key]?.passed ?? "unknown"}/${validation[key]?.total ?? "unknown"}`).join(", "); }
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
