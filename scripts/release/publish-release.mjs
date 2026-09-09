#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { releaseTitle } = await import("../../dist/release/release-title.js");
const { assertSchema } = await import("../../dist/lib/json-schema.js");
const { validateDirectReviewEvidence } = await import("../../dist/github/direct-review.js");
const securityModule = await import("../../dist/github/security-proof.js");
const { resolveSecurityWorkflowProofs } = await import("../github/security-proof.mjs");
const version = process.argv[2];
const artifactDir = valueOf("--artifacts");
const repo = valueOf("--repo") ?? "KayzenRoot/uads";
if (!version || !artifactDir) fail("usage: node scripts/release/publish-release.mjs X.Y.Z --artifacts directory");
const tag = `v${version}`;
const head = git(["rev-parse", "HEAD"]);
const localTagSha = localTag(tag);
const tagSha = remoteTagSha(tag) ?? localTagSha;
if (tagSha && tagSha !== head) fail(`RELEASE_TAG_CONFLICT ${tag}: ${tagSha}`);
if (git(["status", "--porcelain"]).length > 0) fail("release requires a clean worktree");
const artifactRoot = path.resolve(artifactDir);
const directReviewPath = path.join(artifactRoot, "github-direct-review-evidence.json");
if (!fs.existsSync(directReviewPath)) fail("release direct review evidence is missing");
const directReview = JSON.parse(fs.readFileSync(directReviewPath, "utf8"));
try { assertSchema("github-direct-review-evidence.schema.json", directReview, root); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
const directReviewErrors = validateDirectReviewEvidence(directReview, root);
if (directReviewErrors.length > 0 || directReview.finalVerdict !== "PASS" || directReview.commitSha !== head || directReview.version !== version) fail(`release security authorization is invalid: ${directReviewErrors.join(",") || "direct-review-not-pass-or-identity-mismatch"}`);
if (securityModule.isCorrectedReleaseVersion(version)) {
  const resolved = resolveSecurityWorkflowProofs({ repository: repo, finalCommitSha: head });
  const proofErrors = securityModule.securityWorkflowAuthorizationErrors({ codeql: resolved.codeql, scorecard: resolved.scorecard, dependencyReview: resolved.dependencyReview }, { repository: repo, finalCommitSha: head, finalTreeSha: directReview.gitTreeSha });
  if (proofErrors.length > 0) fail(`release security proof is not authorized: ${proofErrors.join(",")}`);
  for (const [key, status] of [["codeql", resolved.codeql], ["scorecard", resolved.scorecard], ["dependencyReview", resolved.dependencyReview]]) {
    if (status.proof?.proofDigest !== directReview.securityWorkflows?.[key]?.proof?.proofDigest) fail(`release security proof does not match direct-review evidence: ${key}`);
  }
}
if (!tagSha) {
  run("git", ["tag", "-a", tag, head, "-m", `UADS ${tag} release`]);
  run("git", ["push", "origin", `refs/tags/${tag}`]);
} else if (!remoteTagSha(tag)) {
  run("git", ["push", "origin", `refs/tags/${tag}`]);
}
const assets = fs.readdirSync(artifactRoot).filter((name) => /\.(tgz|json|txt)$/.test(name)).sort();
if (assets.length < 7 || !assets.includes("github-direct-review-evidence.json") || !assets.includes("github-review-index.json")) fail("release artifact directory is incomplete or lacks direct review evidence/index");
const existing = spawnSync("gh", ["release", "view", tag, "--repo", repo], { cwd: root, windowsHide: true }).status === 0;
if (!existing) {
  const notes = releaseNotes(version);
  run("gh", ["release", "create", tag, "--repo", repo, "--title", releaseTitle(version, notes), "--notes", notes, "--prerelease", "--verify-tag", ...assets.map((asset) => path.join(artifactDir, asset))]);
}
process.stdout.write(`published ${tag} at ${head}\n`);

function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
function git(args) { return run("git", args); }
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) fail(result.stderr || `${command} ${args.join(" ")} failed`);
  return result.stdout.trim();
}
function remoteTagSha(tag) {
  const result = spawnSync("git", ["ls-remote", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { cwd: root, encoding: "utf8", windowsHide: true });
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const peeled = lines.find((line) => line.endsWith(`refs/tags/${tag}^{}`));
  return (peeled ?? lines[0])?.split(/\s+/)[0] ?? null;
}
function localTag(tag) {
  const result = spawnSync("git", ["rev-parse", `${tag}^{commit}`], { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}
function releaseNotes(version) {
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = changelog.indexOf("## [" + version + "]");
  if (start < 0) fail("release changelog section is missing");
  const next = changelog.indexOf("\n## [", start + 1);
  const section = changelog.slice(start, next < 0 ? changelog.length : next).trim();
  if (!/(Highlights|Fixed|Verification)/i.test(section) || /Release artifacts were produced/i.test(section)) {
    fail("release changelog section is not professional or is a placeholder");
  }
  const directReviewPath = path.join(path.resolve(artifactDir), "github-direct-review-evidence.json");
  if (!fs.existsSync(directReviewPath)) fail("release direct review evidence is missing");
  const evidence = JSON.parse(fs.readFileSync(directReviewPath, "utf8"));
  const indexPath = path.join(path.resolve(artifactDir), "github-review-index.json");
  if (!fs.existsSync(indexPath)) fail("release GitHub review index is missing");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  if (evidence.finalVerdict !== "PASS" || evidence.commitSha !== head) fail("release notes cannot be derived from a non-PASS direct review proof");
  if (index.commitSha !== evidence.commitSha || index.version !== version || index.tag !== tag || index.directReviewRunId !== evidence.workflow?.runId || index.ciRunId !== evidence.provenance?.sourceRunId || index.directReviewArtifactName !== evidence.artifact?.name || (process.env.GITHUB_RUN_ID && index.releaseRunId !== Number(process.env.GITHUB_RUN_ID))) fail("release notes index is not bound to canonical direct review evidence");
  const validation = evidence.validation ?? {};
  const evals = ["orchestrator", "execution", "context", "fault", "cost", "modelRouting", "specialistRouting", "adapters", "assurance", "faultInjection"]
    .map((name) => `${name}: ${formatSummary(validation[name])}`)
    .join("; ");
  const audit = validation.npmAudit?.outcome === "success"
    ? `clean (${validation.npmAudit.highOrGreaterVulnerabilities ?? 0} high-or-greater)`
    : "not provable";
  const reviewBlock = [
    "### Review Evidence",
    `- Commit SHA: ${evidence.commitSha}`,
    `- CI run ID + conclusion: ${evidence.provenance?.sourceRunId ?? "unknown"} + ${evidence.finalVerdict === "PASS" ? "success" : "unknown"}`,
    `- Direct-review workflow run ID: ${evidence.workflow?.runId ?? "unknown"}`,
    `- Test summary: ${validation.testFilesPassed ?? "unknown"} test files; ${validation.testsPassed ?? "unknown"} passed; ${validation.testsFailed ?? "unknown"} failed`,
    `- Eval summary: ${evals}`,
    `- npm audit: ${audit}`,
    `- Release run ID: ${process.env.GITHUB_RUN_ID ?? index.releaseRunId ?? "unknown-at-note-generation"}`,
    `- Direct-review artifact: ${evidence.artifact?.name ?? "unknown"}`,
    `- Direct-review evidence SHA-256: ${index.directReviewEvidenceSha256 ?? "unknown"}`,
    "- GitHub review index: github-review-index.json",
  ].join("\n");
  return `${section}\n\n${reviewBlock}`;
}
function formatSummary(summary) {
  if (!summary || summary.passed === null || summary.failed === null || summary.total === null) return "not provable";
  return `${summary.passed}/${summary.total} passed`;
}
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
