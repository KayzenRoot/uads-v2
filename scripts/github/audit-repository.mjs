#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = valueOf("--repo") ?? "KayzenRoot/uads";
const releaseVersion = valueOf("--release-version") ?? JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const output = path.resolve(valueOf("--output") ?? defaultOutput());
fs.mkdirSync(output, { recursive: true });

const repositoryRaw = api("repos/" + repo);
const mainRef = api("repos/" + repo + "/git/ref/heads/main");
const mainBranchSha = mainRef?.object?.sha ?? null;
const runs = api("repos/" + repo + "/actions/runs?branch=main&per_page=100");
const ciRuns = (runs?.workflow_runs ?? []).filter((run) => run.name === "CI").map(summarizeRun);
const exactCiRuns = ciRuns.filter((run) => run.headSha === mainBranchSha);
const releaseRuns = api("repos/" + repo + "/actions/workflows/release.yml/runs?per_page=100");
const releaseRun = (releaseRuns?.workflow_runs ?? [])
  .filter((run) => run.head_sha === mainBranchSha)
  .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0] ?? null;
const directReviewRuns = api("repos/" + repo + "/actions/workflows/direct-review.yml/runs?per_page=100");
const exactDirectReviewRuns = (directReviewRuns?.workflow_runs ?? []).filter((run) => run.head_sha === mainBranchSha).map(summarizeRun);
const exactSuccessfulDirectReviewRuns = exactDirectReviewRuns.filter((run) => run.status === "completed" && run.conclusion === "success");

write("repository.json", {
  full_name: repositoryRaw?.full_name ?? repo,
  visibility: repositoryRaw?.visibility ?? null,
  default_branch: repositoryRaw?.default_branch ?? "main",
  defaultBranchSha: mainBranchSha,
  mainBranchSha,
  description: repositoryRaw?.description ?? null,
  homepage: repositoryRaw?.homepage ?? null,
  topics: repositoryRaw?.topics ?? [],
  has_issues: repositoryRaw?.has_issues ?? null,
  has_projects: repositoryRaw?.has_projects ?? null,
  has_wiki: repositoryRaw?.has_wiki ?? null,
  has_discussions: repositoryRaw?.has_discussions ?? null,
  license: repositoryRaw?.license ?? null,
  permissions: repositoryRaw?.permissions ?? null,
});
write("releases.json", (api("repos/" + repo + "/releases?per_page=100") ?? []).map((release) => ({
  id: release.id,
  tagName: release.tag_name,
  name: release.name,
  draft: release.draft,
  prerelease: release.prerelease,
  targetCommitish: release.target_commitish,
  publishedAt: release.published_at,
  assets: (release.assets ?? []).map((asset) => ({ name: asset.name, size: asset.size, state: asset.state })),
})));
write("tags.json", awaitResolvedTags(repo));
write("workflows.json", (api("repos/" + repo + "/actions/workflows?per_page=100")?.workflows ?? []).map((workflow) => ({
  id: workflow.id,
  name: workflow.name,
  path: workflow.path,
  state: workflow.state,
})));
write("main-protection.json", optional("repos/" + repo + "/branches/main/protection"));
write("main-ruleset.json", optional("repos/" + repo + "/rulesets?includes_parents=true"));
write("security-summary.json", {
  securityAndAnalysis: optional("repos/" + repo + "/security-and-analysis"),
  automatedSecurityFixes: optional("repos/" + repo + "/automated-security-fixes"),
  privateVulnerabilityReporting: optional("repos/" + repo + "/private-vulnerability-reporting"),
  limitations: ["GitHub may omit plan-gated security fields from the API response."],
});
write("labels.json", (api("repos/" + repo + "/labels?per_page=100") ?? []).map((label) => ({
  name: label.name,
  color: label.color,
  description: label.description,
})));
const releaseRaw = optional("repos/" + repo + "/releases/tags/v" + releaseVersion);
write("release-v" + releaseVersion + ".json", summarizeRelease(releaseRaw, resolveTagCommit(repo, "v" + releaseVersion)));
write("ci-runs.json", ciRuns);
write("ci-final.json", {
  schema: "uads.github-ci-final",
  schemaVersion: releaseVersion,
  repository: repo,
  mainBranchSha,
  headSha: exactCiRuns.length === 1 ? exactCiRuns[0].headSha : null,
  status: exactCiRuns.length === 1 ? exactCiRuns[0].status : "ambiguous",
  conclusion: exactCiRuns.length === 1 ? exactCiRuns[0].conclusion : "ambiguous",
  runId: exactCiRuns.length === 1 ? exactCiRuns[0].id : null,
  event: exactCiRuns.length === 1 ? exactCiRuns[0].event : null,
  htmlUrl: exactCiRuns.length === 1 ? exactCiRuns[0].url : null,
  exactSuccessfulRunCount: exactCiRuns.filter((run) => run.status === "completed" && run.conclusion === "success").length,
});
write("release-run-v" + releaseVersion + ".json", awaitReleaseRunSummary(releaseRun, repo));
const securityWorkflows = {
  codeql: awaitWorkflowStatus(repo, "codeql.yml", mainBranchSha),
  scorecard: awaitWorkflowStatus(repo, "scorecard.yml", mainBranchSha),
  dependencyReview: awaitWorkflowStatus(repo, "dependency-review.yml", mainBranchSha),
};
write("security-workflows.json", securityWorkflows);
const directReviewRun = exactSuccessfulDirectReviewRuns.length === 1 ? exactSuccessfulDirectReviewRuns[0] : null;
const directReview = awaitDirectReviewArtifact(repo, directReviewRun, mainBranchSha, exactSuccessfulDirectReviewRuns.length);
write("direct-review-index.json", directReview.index);
if (directReview.evidence) write("github-direct-review-evidence.json", directReview.evidence);

const headSha = git(["rev-parse", "HEAD"]);
write("summary.json", {
  schema: "uads.github-audit",
  schemaVersion: releaseVersion,
  generatedAt: new Date().toISOString(),
  repository: repo,
  finalCommitSha: headSha,
  mainBranchSha,
  exactHeadCiRuns: exactCiRuns,
  exactDirectReviewRuns,
  exactSuccessfulDirectReviewRuns,
  releaseRunId: releaseRun?.id ?? null,
  securityWorkflows,
  directReviewArtifact: directReview.index,
  limitations: [
    ...(repositoryRaw?.permissions?.admin === true ? [] : ["BLOCKED_BY_GITHUB_PERMISSION"]),
    "Administrative settings are reported as returned by the authenticated API.",
  ],
});
process.stdout.write(JSON.stringify({ output, files: fs.readdirSync(output).sort() }, null, 2) + "\n");

function defaultOutput() {
  const originUrl = git(["config", "--get", "remote.origin.url"]) ?? repo;
  const normalized = originUrl.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^https?:\/\//, "");
  const projectId = crypto.createHash("sha256").update(normalized || root).digest("hex").slice(0, 16);
  const uadsHome = process.env.UADS_HOME ? path.resolve(process.env.UADS_HOME) : path.join(process.env.USERPROFILE ?? process.cwd(), ".uads");
  return path.join(uadsHome, "workspaces", projectId, "review-evidence", "github");
}
function summarizeRun(run) {
  return {
    id: run.id,
    name: run.name,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    url: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}
function summarizeRelease(release, tagCommit) {
  if (!release || release.status === "unavailable") return release;
  return {
    id: release.id,
    tag_name: release.tag_name,
    name: release.name,
    draft: release.draft,
    prerelease: release.prerelease,
    targetCommitish: release.target_commitish,
    targetCommitSha: tagCommit ?? release.target_commitish,
    published_at: release.published_at,
    body: release.body,
    assets: (release.assets ?? []).map((asset) => ({ name: asset.name, size: asset.size, state: asset.state, browser_download_url: asset.browser_download_url })),
  };
}
function resolveTagCommit(targetRepo, tagName) {
  const ref = api("repos/" + targetRepo + "/git/ref/tags/" + tagName);
  if (!ref?.object?.sha) return null;
  if (ref.object.type === "commit") return ref.object.sha;
  const tag = api("repos/" + targetRepo + "/git/tags/" + ref.object.sha);
  return tag?.object?.sha ?? null;
}
function awaitResolvedTags(targetRepo) {
  const refs = api("repos/" + targetRepo + "/git/matching-refs/tags") ?? [];
  return refs.map((ref) => ({
    name: ref.ref.replace(/^refs\/tags\//, ""),
    object: ref.object,
    targetCommitSha: resolveTagCommit(targetRepo, ref.ref.replace(/^refs\/tags\//, "")),
  }));
}
function awaitReleaseRunSummary(run, targetRepo) {
  if (!run) return { status: "unavailable", reason: "release-workflow-run-unavailable" };
  const jobs = api("repos/" + targetRepo + "/actions/runs/" + run.id + "/jobs?per_page=100");
  return {
    id: run.id,
    name: run.name,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    url: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    jobs: (jobs?.jobs ?? []).map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      steps: (job.steps ?? []).map((step) => ({ name: step.name, status: step.status, conclusion: step.conclusion })),
    })),
  };
}
function api(endpoint) {
  const result = spawnSync("gh", ["api", endpoint], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function awaitWorkflowStatus(targetRepo, workflowFile, expectedSha) {
  const runs = api("repos/" + targetRepo + "/actions/workflows/" + workflowFile + "/runs?per_page=100");
  const candidates = (runs?.workflow_runs ?? []).filter((run) => run.head_sha === expectedSha);
  const run = candidates.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
  if (!run) return { status: "unknown", outcome: "unknown", runId: null, commitSha: null, htmlUrl: null, reasonCode: "SECURITY_RUN_UNAVAILABLE" };
  return {
    status: run.status ?? "unknown",
    outcome: run.conclusion ?? "unknown",
    runId: run.id ?? null,
    commitSha: run.head_sha ?? null,
    htmlUrl: run.html_url ?? null,
    reasonCode: null,
  };
}

function awaitDirectReviewArtifact(targetRepo, directRun, expectedSha, exactRunCount) {
  const artifactName = expectedSha ? `uads-direct-review-${expectedSha}` : null;
  if (exactRunCount !== 1 || !directRun || !artifactName) {
    return { index: { status: exactRunCount > 1 ? "ambiguous" : "unavailable", reasonCode: exactRunCount > 1 ? "DIRECT_REVIEW_RUN_AMBIGUOUS" : "DIRECT_REVIEW_ARTIFACT_UNAVAILABLE", runId: directRun?.id ?? null, name: artifactName, commitSha: expectedSha, files: [], sourceCiRunId: directRun?.sourceCiRunId ?? null }, evidence: null };
  }
  const artifacts = api("repos/" + targetRepo + "/actions/runs/" + directRun.id + "/artifacts?per_page=100");
  const matches = (artifacts?.artifacts ?? []).filter((item) => item.name === artifactName && item.expired !== true);
  if (matches.length !== 1) {
    return { index: { status: matches.length > 1 ? "ambiguous" : "unavailable", reasonCode: matches.length > 1 ? "DIRECT_REVIEW_ARTIFACT_AMBIGUOUS" : "DIRECT_REVIEW_ARTIFACT_NOT_FOUND", runId: directRun.id, name: artifactName, commitSha: expectedSha, files: [] }, evidence: null };
  }
  const artifact = matches[0];
  if (!artifact) {
    return { index: { status: "unavailable", reasonCode: "DIRECT_REVIEW_ARTIFACT_NOT_FOUND", runId: directRun.id, name: artifactName, commitSha: expectedSha, files: [] }, evidence: null };
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "uads-direct-review-"));
  try {
    const downloaded = spawnSync("gh", ["run", "download", String(directRun.id), "--repo", targetRepo, "--name", artifactName, "--dir", temp], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    if (downloaded.status !== 0) return { index: { status: "unavailable", reasonCode: "DIRECT_REVIEW_ARTIFACT_DOWNLOAD_FAILED", runId: directRun.id, name: artifactName, commitSha: expectedSha, files: [] }, evidence: null };
    const evidencePath = findFile(temp, "github-direct-review-evidence.json");
    if (!evidencePath) return { index: { status: "unavailable", reasonCode: "DIRECT_REVIEW_EVIDENCE_FILE_MISSING", runId: directRun.id, name: artifactName, commitSha: expectedSha, files: [] }, evidence: null };
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    return { index: { status: "available", reasonCode: null, runId: directRun.id, sourceCiRunId: evidence.provenance?.sourceRunId ?? null, sourceCiRunAttempt: evidence.provenance?.sourceRunAttempt ?? null, name: artifactName, commitSha: expectedSha, files: ["github-direct-review-evidence.json", "github-direct-review-evidence.json.sha256"], artifactId: artifact.id, size: artifact.size_in_bytes ?? artifact.size ?? null, digest: artifact.digest ?? null, expired: artifact.expired ?? null }, evidence };
  } catch {
    return { index: { status: "unavailable", reasonCode: "DIRECT_REVIEW_EVIDENCE_UNREADABLE", runId: directRun.id, name: artifactName, commitSha: expectedSha, files: [] }, evidence: null };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function findFile(directory, filename) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === filename) return candidate;
    if (entry.isDirectory()) {
      const nested = findFile(candidate, filename);
      if (nested) return nested;
    }
  }
  return null;
}
function optional(endpoint) {
  const value = api(endpoint);
  return value ?? { status: "unavailable", reason: "github-api-response-unavailable" };
}
function write(name, value) {
  fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + "\n");
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}
function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
