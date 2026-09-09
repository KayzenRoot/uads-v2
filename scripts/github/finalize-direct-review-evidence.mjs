#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateCompatibilityArtifact } from "./compatibility-artifacts.mjs";
import { resolveSecurityWorkflowProofs } from "./security-proof.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidencePath = required("--ci-evidence");
const manifestPath = required("--release-manifest");
const bindingPath = required("--ci-binding");
const validationPath = valueOf("--validation-report");
const reviewIndexPath = valueOf("--review-index");
const output = path.resolve(valueOf("--output") ?? path.join(root, "tmp", "release", "github-direct-review-evidence.json"));
const checksumOutput = path.resolve(valueOf("--checksum-output") ?? `${output}.sha256`);
const repo = valueOf("--repo") ?? process.env.GITHUB_REPOSITORY ?? "KayzenRoot/uads";
const base = readJson(evidencePath);
const manifest = readJson(manifestPath);
const binding = readJson(bindingPath);
const validation = validationPath ? readJson(validationPath) : null;
const { computeDirectReviewDigest, validateDirectReviewEvidence } = await import("../../dist/github/direct-review.js");
const { isCorrectedReleaseVersion, securityWorkflowAuthorizationErrors } = await import("../../dist/github/security-proof.js");
const { validateGithubReviewIndex } = await import("../../dist/github/review-index.js");
const { assertSchema } = await import("../../dist/lib/json-schema.js");

const version = manifest.version ?? base.version;
const commitSha = base.commitSha;
const mainSha = api(`repos/${repo}/git/ref/heads/main`)?.object?.sha ?? null;
const tag = `v${version}`;
const tagTargetSha = resolveTagCommit(repo, tag);
const release = api(`repos/${repo}/releases/tags/${tag}`);
const releaseRunId = numberOrNull(process.env.GITHUB_RUN_ID) ?? numberOrNull(base.release?.releaseRunId);
const releaseRun = releaseRunId ? api(`repos/${repo}/actions/runs/${releaseRunId}`) : null;
const securityProofs = resolveSecurityWorkflowProofs({ repository: repo, finalCommitSha: commitSha });
const securityWorkflows = {
  codeql: securityProofs.codeql,
  scorecard: securityProofs.scorecard,
  dependencyReview: securityProofs.dependencyReview,
};
const compatibility = {
  linux: validateCompatibilityArtifact({ repository: repo, expectedSha: commitSha, expectedTreeSha: base.gitTreeSha, platform: "linux", expectedRunId: numberOrNull(base.compatibility?.linux?.runId), expectedRunAttempt: numberOrNull(base.compatibility?.linux?.runAttempt) }),
  windows: validateCompatibilityArtifact({ repository: repo, expectedSha: commitSha, expectedTreeSha: base.gitTreeSha, platform: "windows", expectedRunId: numberOrNull(base.compatibility?.windows?.runId), expectedRunAttempt: numberOrNull(base.compatibility?.windows?.runAttempt) }),
};
const reasons = new Set(Array.isArray(base.reasonCodes) ? base.reasonCodes : []);
const identityValues = [
  ["DIRECT_REVIEW_COMMIT", commitSha],
  ["MAIN_SHA", mainSha],
  ["CI_BINDING_HEAD", binding.headSha],
  ["TAG_TARGET", tagTargetSha],
  ["RELEASE_MANIFEST_COMMIT", manifest.commit],
  ["VALIDATION_REPORT_COMMIT", validation?.commit ?? manifest.commit],
];
const identityComplete = identityValues.every(([, value]) => sha(value));
if (!identityComplete) reasons.add("IDENTITY_UNPROVEN");
if (new Set(identityValues.map(([, value]) => value).filter(sha)).size > 1) reasons.add("IDENTITY_MISMATCH");
if (base.finalVerdict !== "PASS") reasons.add("CI_DIRECT_REVIEW_NOT_PASS");
const securityReasons = isCorrectedReleaseVersion(version)
  ? securityWorkflowAuthorizationErrors(securityWorkflows, { repository: repo, finalCommitSha: commitSha, finalTreeSha: base.gitTreeSha })
  : [];
for (const reason of securityReasons) reasons.add(reason);
const securityFailure = Object.values(securityWorkflows).some((status) => ["failure", "cancelled", "skipped"].includes(status.proof?.outcome));
if (version === "0.11.0") {
  for (const platform of ["linux", "windows"]) {
    if (compatibility[platform].outcome !== "success" || compatibility[platform].commitSha !== commitSha) reasons.add(`COMPATIBILITY_NOT_PROVEN:${platform.toUpperCase()}`);
  }
}

const derivative = {
  ...base,
  generatedAt: new Date().toISOString(),
  securityWorkflows,
  compatibility,
  release: {
    version,
    tag,
    tagTargetSha: sha(tagTargetSha) ? tagTargetSha : null,
    releaseRunId,
    releaseRunConclusion: normalizeOutcome(releaseRun?.conclusion),
    assetNames: [...new Set([
      ...(Array.isArray(release?.assets) ? release.assets.map((asset) => asset.name).filter((name) => typeof name === "string" && /^[A-Za-z0-9._/-]+$/.test(name)) : base.release?.assetNames ?? []),
      path.basename(output),
      path.basename(checksumOutput),
    ])].sort(),
    ciBindingAsset: "ci-binding.json",
    directReviewArtifactName: base.artifact?.name ?? null,
  },
  artifact: { name: "github-direct-review-evidence.json", retentionDays: null },
  provenance: {
    ...base.provenance,
    generatedByScript: "scripts/github/finalize-direct-review-evidence.mjs",
    evidenceContractDigest: "",
    sourceRunSha: base.commitSha ?? null,
    sourceRunId: base.provenance?.sourceRunId ?? base.workflow?.runId ?? null,
    sourceRunAttempt: base.provenance?.sourceRunAttempt ?? base.workflow?.runAttempt ?? null,
  },
  finalVerdict: base.finalVerdict === "FAIL"
    ? "FAIL"
    : identityComplete && !reasons.has("IDENTITY_MISMATCH") && base.finalVerdict === "PASS" && securityReasons.length === 0
      ? "PASS"
      : securityFailure ? "FAIL"
        : "INCOMPLETE",
  reasonCodes: [...reasons].sort(),
};
if (reviewIndexPath) {
  const reviewIndex = readJson(reviewIndexPath);
  try { validateGithubReviewIndex(reviewIndex); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  const canonicalFileSha = crypto.createHash("sha256").update(fs.readFileSync(evidencePath)).digest("hex");
  if (reviewIndex.commitSha !== derivative.commitSha || reviewIndex.gitTreeSha !== derivative.gitTreeSha || reviewIndex.ciRunId !== derivative.provenance.sourceRunId || reviewIndex.ciRunAttempt !== derivative.provenance.sourceRunAttempt || reviewIndex.directReviewRunId !== derivative.workflow.runId || reviewIndex.directReviewArtifactName !== base.artifact?.name || reviewIndex.directReviewEvidenceSha256 !== canonicalFileSha || reviewIndex.releaseRunId !== releaseRunId || reviewIndex.expectedTagTargetSha !== tagTargetSha || reviewIndex.tag !== tag) {
    fail("GitHub review index is not bound to canonical direct-review/release identity");
  }
  for (const [key, proof] of [["codeql", derivative.securityWorkflows.codeql.proof], ["scorecard", derivative.securityWorkflows.scorecard.proof], ["dependencyReview", derivative.securityWorkflows.dependencyReview.proof]]) {
    if (isCorrectedReleaseVersion(version) && proof?.proofDigest !== reviewIndex.securityProofs?.[key]?.proofDigest) fail(`GitHub review index security proof mismatch: ${key}`);
  }
  if (!reviewIndex.releaseAssetNames?.includes(path.basename(reviewIndexPath)) || !reviewIndex.releaseAssetNames.includes(path.basename(output)) || !reviewIndex.releaseAssetNames.includes(path.basename(checksumOutput))) fail("GitHub review index release asset list is incomplete");
}
const digest = computeDirectReviewDigest(derivative);
derivative.provenance.evidenceContractDigest = digest;
derivative.evidenceContractDigest = digest;
try {
  assertSchema("github-direct-review-evidence.schema.json", derivative, root);
  const errors = validateDirectReviewEvidence(derivative, root);
  if (errors.length > 0) fail(errors.join(", "));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(derivative, null, 2)}\n`, "utf8");
const fileDigest = crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex");
fs.writeFileSync(checksumOutput, `${fileDigest}  ${path.basename(output)}\n`, "utf8");
process.stdout.write(JSON.stringify({ output, checksumOutput, verdict: derivative.finalVerdict, evidenceContractDigest: digest, fileSha256: fileDigest }, null, 2) + "\n");

function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
function required(name) {
  const value = valueOf(name);
  if (!value) fail(`${name} is required`);
  return path.resolve(value);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { fail(`invalid JSON: ${file}: ${error instanceof Error ? error.message : String(error)}`); }
}
function sha(value) { return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value); }
function numberOrNull(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function api(endpoint) {
  const result = spawnSync("gh", ["api", endpoint], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}
function resolveTagCommit(targetRepo, tagName) {
  const ref = api(`repos/${targetRepo}/git/ref/tags/${tagName}`);
  if (!ref?.object?.sha) return null;
  if (ref.object.type === "commit") return ref.object.sha;
  return api(`repos/${targetRepo}/git/tags/${ref.object.sha}`)?.object?.sha ?? null;
}
function normalizeOutcome(value) {
  return value === "success" || value === "failure" || value === "cancelled" || value === "skipped" ? value : "unknown";
}
function safeUrl(value) { return typeof value === "string" && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(value) ? value : null; }
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
