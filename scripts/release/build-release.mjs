#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createReleaseManifest, checksumFile, assertReleaseTextSafe } from "../../dist/release/release-artifacts.js";
import { createCiBinding, assertCiBinding } from "../../dist/release/ci-binding.js";
import { assertSchema } from "../../dist/lib/json-schema.js";
import { validateDirectReviewEvidence } from "../../dist/github/direct-review.js";
import { createGithubReviewIndex } from "../../dist/github/review-index.js";
import { runNpm } from "../lib/exec.mjs";
import { resolveSecurityWorkflowProofs } from "../github/security-proof.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const version = process.argv[2];
if (!version) fail("usage: node scripts/release/build-release.mjs X.Y.Z --output directory --validation-report file");
const output = path.resolve(valueOf("--output") ?? path.join(root, "tmp", "release", version));
const validationReportPath = valueOf("--validation-report");
const ciBindingPath = valueOf("--ci-binding");
const directReviewPath = valueOf("--direct-review");
const repository = valueOf("--repo") ?? "KayzenRoot/uads";
if (!validationReportPath) fail("--validation-report is required");
if (!ciBindingPath) fail("--ci-binding is required for a published release");
if (!directReviewPath) fail("--direct-review is required for a published release");
fs.mkdirSync(output, { recursive: true });

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== version) fail(`package.json version is ${packageJson.version}, expected ${version}`);
const commit = git(["rev-parse", "HEAD"]);
const npmPack = runNpm(["pack", "--json", "--pack-destination", output]);
if (npmPack.status !== 0) fail(String(npmPack.stderr || npmPack.stdout));
const packed = JSON.parse(String(npmPack.stdout).trim());
const packedName = packed[0]?.filename;
if (!packedName) fail("npm pack did not return an artifact filename");
const packagePath = path.isAbsolute(packedName) ? packedName : path.join(output, packedName);
const expectedPackagePath = path.join(output, `uads-${version}.tgz`);
if (packagePath !== expectedPackagePath) fs.renameSync(packagePath, expectedPackagePath);

const sbom = runNpm(["sbom", "--sbom-format=spdx", "--sbom-type=application", "--omit=dev"]);
if (sbom.status !== 0) fail(String(sbom.stderr || sbom.stdout));
const sbomPath = path.join(output, `uads-${version}.spdx.json`);
const sbomText = String(sbom.stdout).trim();
const sbomJson = JSON.parse(sbomText);
const describesUads = sbomJson.name === `uads@${version}` && (sbomJson.packages ?? []).some((pkg) => pkg.name === "uads" && pkg.versionInfo === version);
if (!describesUads || !String(sbomJson.documentNamespace ?? "").includes(version)) {
  fail("SBOM does not identify the requested UADS release");
}
assertReleaseTextSafe(sbomText);
fs.writeFileSync(sbomPath, `${JSON.stringify(sbomJson, null, 2)}\n`);

const validationReport = JSON.parse(fs.readFileSync(path.resolve(validationReportPath), "utf8"));
if (validationReport.version !== version || validationReport.commit !== commit || validationReport.summary?.failed !== 0 || validationReport.ciBinding !== "ci-binding.json") {
  fail("validation report is not bound to the release version/commit or contains failures");
}
assertReleaseTextSafe(JSON.stringify(validationReport));
const validationPath = path.join(output, "validation-report.json");
fs.writeFileSync(validationPath, `${JSON.stringify(validationReport, null, 2)}\n`);

const ciBindingRaw = JSON.parse(fs.readFileSync(path.resolve(ciBindingPath), "utf8"));
let ciBinding;
try {
  ciBinding = createCiBinding(ciBindingRaw, commit, repository);
  assertCiBinding(ciBinding, commit, repository);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const ciBindingOutput = path.join(output, "ci-binding.json");
fs.writeFileSync(ciBindingOutput, `${JSON.stringify(ciBinding, null, 2)}\n`);
assertReleaseTextSafe(fs.readFileSync(ciBindingOutput, "utf8"));

const directReview = JSON.parse(fs.readFileSync(path.resolve(directReviewPath), "utf8"));
try {
  assertSchema("github-direct-review-evidence.schema.json", directReview, root);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
if (validateDirectReviewEvidence(directReview, root).length > 0 || directReview.finalVerdict !== "PASS" || directReview.commitSha !== commit || directReview.version !== version || directReview.provenance?.sourceRunId !== ciBinding.runId || (ciBinding.runAttempt && directReview.provenance?.sourceRunAttempt !== ciBinding.runAttempt)) {
  fail("direct review evidence is not a successful exact-SHA CI proof");
}
const securityModule = await import("../../dist/github/security-proof.js");
const securityProofResult = securityModule.isCorrectedReleaseVersion(version)
  ? resolveSecurityWorkflowProofs({ repository, finalCommitSha: commit })
  : null;
const codeqlStatus = securityProofResult?.codeql ?? githubWorkflowStatus(repository, "codeql.yml", commit);
const scorecardStatus = securityProofResult?.scorecard ?? githubWorkflowStatus(repository, "scorecard.yml", commit);
if (securityProofResult) {
  const proofErrors = securityModule.securityWorkflowAuthorizationErrors({ codeql: securityProofResult.codeql, scorecard: securityProofResult.scorecard, dependencyReview: securityProofResult.dependencyReview }, { repository, finalCommitSha: commit, finalTreeSha: directReview.gitTreeSha });
  if (proofErrors.length > 0) fail(`release security proof is not authorized: ${proofErrors.join(",")}`);
  for (const [key, resolved] of [["codeql", securityProofResult.codeql], ["scorecard", securityProofResult.scorecard], ["dependencyReview", securityProofResult.dependencyReview]]) {
    if (resolved.proof?.proofDigest !== directReview.securityWorkflows?.[key]?.proof?.proofDigest) fail(`direct-review security proof does not match independently reconstructed ${key} proof`);
  }
}
const directReviewOutput = path.join(output, "github-direct-review-evidence.json");
fs.copyFileSync(path.resolve(directReviewPath), directReviewOutput);
assertReleaseTextSafe(fs.readFileSync(directReviewOutput, "utf8"));

const reviewIndexOutput = path.join(output, "github-review-index.json");
const reviewIndex = createGithubReviewIndex({
  repository,
  version,
  commitSha: directReview.commitSha,
  gitTreeSha: directReview.gitTreeSha,
  ciRunId: directReview.provenance?.sourceRunId ?? ciBinding.runId,
  ciRunAttempt: directReview.provenance?.sourceRunAttempt ?? ciBinding.runAttempt ?? null,
  directReviewRunId: directReview.workflow?.runId ?? null,
  directReviewArtifactName: directReview.artifact?.name ?? null,
  directReviewEvidenceSha256: sha256File(directReviewOutput),
  codeqlRunId: codeqlStatus.runId ?? directReview.securityWorkflows?.codeql?.runId ?? null,
  codeqlStatus: codeqlStatus.status ?? reviewStatus(directReview.securityWorkflows?.codeql),
  scorecardRunId: scorecardStatus.runId ?? directReview.securityWorkflows?.scorecard?.runId ?? null,
  scorecardStatus: scorecardStatus.status ?? reviewStatus(directReview.securityWorkflows?.scorecard),
  releaseRunId: positiveOrNull(process.env.GITHUB_RUN_ID),
  tag: `v${version}`,
  expectedTagTargetSha: commit,
  releaseAssetNames: [
    `uads-${version}.tgz`, `uads-${version}.spdx.json`, "validation-report.json", "ci-binding.json",
    "github-direct-review-evidence.json", "github-review-index.json", "release-manifest.json", "SHA256SUMS.txt",
    "github-direct-review-evidence-final.json", "github-direct-review-evidence-final.json.sha256",
  ],
  securityProofs: securityProofResult ? {
    codeql: securityProofResult.codeql.proof,
    scorecard: securityProofResult.scorecard.proof,
    dependencyReview: securityProofResult.dependencyReview.proof,
  } : undefined,
});
assertSchema("github-review-index.schema.json", reviewIndex, root);
fs.writeFileSync(reviewIndexOutput, `${JSON.stringify(reviewIndex, null, 2)}\n`, "utf8");
assertReleaseTextSafe(fs.readFileSync(reviewIndexOutput, "utf8"));

const artifactPaths = [expectedPackagePath, sbomPath, validationPath, ciBindingOutput, directReviewOutput, reviewIndexOutput];
const artifacts = artifactPaths.map((artifactPath) => ({
  name: path.basename(artifactPath),
  size: fs.statSync(artifactPath).size,
  sha256: sha256File(artifactPath),
}));
const checksumPath = path.join(output, "SHA256SUMS.txt");
fs.writeFileSync(checksumPath, checksumFile(artifacts));
const manifest = createReleaseManifest({
  version,
  tag: `v${version}`,
  commit,
  generatedAt: new Date().toISOString(),
  artifacts,
  validationReport: "validation-report.json",
  ciBinding: "ci-binding.json",
  schemaVersion: version,
});
const manifestPath = path.join(output, "release-manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
assertReleaseTextSafe(fs.readFileSync(manifestPath, "utf8"));
fs.writeFileSync(checksumPath, checksumFile([...artifacts, {
  name: path.basename(manifestPath),
  size: fs.statSync(manifestPath).size,
  sha256: sha256File(manifestPath),
}]));

const finalArtifacts = [...artifactPaths, manifestPath, checksumPath].map((file) => path.basename(file));
process.stdout.write(`${JSON.stringify({ output, version, commit, artifacts: finalArtifacts }, null, 2)}\n`);

function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) fail(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function positiveOrNull(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function reviewStatus(value) {
  const status = value?.status;
  return ["success", "failure", "cancelled", "skipped", "pending", "unavailable", "not-evaluated-here", "unknown"].includes(status) ? status : "unknown";
}

function githubWorkflowStatus(targetRepo, workflowFile, expectedSha) {
  const result = spawnSync("gh", ["api", `repos/${targetRepo}/actions/workflows/${workflowFile}/runs?per_page=100&head_sha=${expectedSha}`], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return { status: null, runId: null };
  let data;
  try { data = JSON.parse(result.stdout); } catch { return { status: null, runId: null }; }
  const candidates = (data.workflow_runs ?? []).filter((run) => run.head_sha === expectedSha);
  const run = candidates.filter((item) => item.status === "completed").sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0] ?? candidates.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
  if (!run) return { status: "unavailable", runId: null };
  if (run.status !== "completed") return { status: "pending", runId: positiveOrNull(run.id) };
  return { status: ["success", "failure", "cancelled", "skipped"].includes(run.conclusion) ? run.conclusion : "unknown", runId: positiveOrNull(run.id) };
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
