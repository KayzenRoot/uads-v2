import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLATFORMS = ["linux", "windows"];

export function validateCompatibilityArtifact(options) {
  const { repository, expectedSha, expectedTreeSha = null, platform, expectedRunId = null, expectedRunAttempt = null } = options;
  if (!PLATFORMS.includes(platform) || !safeSha(expectedSha) || !safeRepo(repository)) return unavailable("COMPATIBILITY_INPUT_INVALID");
  const run = expectedRunId ? api(`repos/${repository}/actions/runs/${expectedRunId}`) : null;
  if (!run || Number(run.id) !== expectedRunId || run.head_sha !== expectedSha || (expectedRunAttempt && Number(run.run_attempt) !== expectedRunAttempt)) return unavailable("COMPATIBILITY_RUN_IDENTITY_MISMATCH");
  if (run.name !== "UADS Cross-Platform Compatibility" || run.status !== "completed") return unavailable("COMPATIBILITY_RUN_NOT_COMPLETED");
  const jobs = api(`repos/${repository}/actions/runs/${expectedRunId}/jobs?per_page=100`);
  const matchingJobs = (jobs?.jobs ?? []).filter((job) => job.name === `${platform} / Node 20` && Number(job.run_id) === expectedRunId);
  if (matchingJobs.length !== 1) return unavailable("COMPATIBILITY_JOB_AMBIGUOUS_OR_MISSING");
  const artifactName = `uads-compatibility-${platform}-${expectedSha}`;
  const artifacts = api(`repos/${repository}/actions/runs/${expectedRunId}/artifacts?per_page=100`);
  const matches = (artifacts?.artifacts ?? []).filter((artifact) => artifact.name === artifactName && artifact.expired !== true && (!artifact.workflow_run?.id || Number(artifact.workflow_run.id) === expectedRunId));
  if (matches.length !== 1) return unavailable(matches.length === 0 ? "COMPATIBILITY_ARTIFACT_MISSING" : "COMPATIBILITY_ARTIFACT_AMBIGUOUS");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "uads-compatibility-artifact-"));
  try {
    const downloaded = spawnSync("gh", ["run", "download", String(expectedRunId), "--repo", repository, "--name", artifactName, "--dir", temp], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    if (downloaded.status !== 0) return unavailable("COMPATIBILITY_ARTIFACT_DOWNLOAD_FAILED");
    const files = fs.readdirSync(temp, { withFileTypes: true });
    if (files.length !== 1 || !files[0].isFile() || files[0].name !== "uads-compatibility-evidence.json") return unavailable("COMPATIBILITY_ARTIFACT_CONTENT_AMBIGUOUS");
    const file = path.join(temp, files[0].name);
    const bytes = fs.readFileSync(file);
    let evidence;
    try { evidence = JSON.parse(bytes.toString("utf8")); } catch { return unavailable("COMPATIBILITY_EVIDENCE_JSON_INVALID"); }
    const validationErrors = validateEvidence(evidence, { repository, expectedSha, expectedTreeSha, platform, expectedRunId, expectedRunAttempt, job: matchingJobs[0] });
    if (validationErrors.length > 0) return unavailable(validationErrors[0]);
    return {
      status: evidence.outcome === "success" ? "success" : evidence.outcome,
      outcome: evidence.outcome,
      runId: expectedRunId,
      runAttempt: Number(run.run_attempt),
      commitSha: evidence.commitSha,
      htmlUrl: safeUrl(run.html_url),
      reasonCode: evidence.reasonCodes[0] ?? null,
      artifactName,
      artifactSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      evidenceDigest: evidence.evidenceDigest,
      platform,
      nodeVersion: evidence.nodeVersion,
      checks: evidence.checks,
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function validateEvidence(evidence, expected) {
  const errors = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return ["COMPATIBILITY_EVIDENCE_NOT_OBJECT"];
  if (evidence.schema !== "uads.compatibility-evidence" || evidence.schemaVersion !== "0.2.0") errors.push("COMPATIBILITY_SCHEMA_MISMATCH");
  if (evidence.repository !== expected.repository || evidence.platform !== expected.platform || evidence.commitSha !== expected.expectedSha) errors.push("COMPATIBILITY_EVIDENCE_IDENTITY_MISMATCH");
  if (!safeSha(evidence.sourceTreeSha) || (expected.expectedTreeSha && evidence.sourceTreeSha !== expected.expectedTreeSha)) errors.push("COMPATIBILITY_TREE_IDENTITY_MISMATCH");
  if (evidence.workflowName !== "UADS Cross-Platform Compatibility" || evidence.jobName !== `${expected.platform} / Node 20`) errors.push("COMPATIBILITY_JOB_METADATA_MISMATCH");
  if (evidence.workflowRunId !== expected.expectedRunId || evidence.workflowRunAttempt !== expected.expectedRunAttempt) errors.push("COMPATIBILITY_RUN_METADATA_MISMATCH");
  if (evidence.nodeMajor !== 20 || typeof evidence.nodeVersion !== "string" || !/^v20\./.test(evidence.nodeVersion)) errors.push("COMPATIBILITY_NODE_MAJOR_MISMATCH");
  const keys = ["npm-ci", "typecheck-build", "adapter-eval", "isolated-install", "root-resolution", "zero-project-footprint", "privacy-path-assertion"];
  if (!evidence.checks || keys.some((key) => evidence.checks[key] !== "success")) errors.push("COMPATIBILITY_CHECK_NOT_SUCCESS");
  if (evidence.outcome !== "success") errors.push(evidence.reasonCodes?.[0] ?? "COMPATIBILITY_OUTCOME_NOT_SUCCESS");
  const recomputed = crypto.createHash("sha256").update(JSON.stringify({ ...evidence, evidenceDigest: "" })).digest("hex");
  if (evidence.evidenceDigest !== recomputed) errors.push("COMPATIBILITY_EVIDENCE_DIGEST_MISMATCH");
  if (expected.job && expected.job.conclusion !== evidence.outcome) errors.push("COMPATIBILITY_JOB_OUTCOME_MISMATCH");
  return [...new Set(errors)];
}

function unavailable(reasonCode) {
  return { status: "unavailable", outcome: "unknown", runId: null, runAttempt: null, commitSha: null, htmlUrl: null, reasonCode, artifactName: null, artifactSha256: null, evidenceDigest: null, platform: null, nodeVersion: null, checks: null };
}
function api(endpoint) { const result = spawnSync("gh", ["api", endpoint], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 }); if (result.status !== 0) return null; try { return JSON.parse(result.stdout); } catch { return null; } }
function safeSha(value) { return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value); }
function safeRepo(value) { return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value); }
function safeUrl(value) { return typeof value === "string" && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(value) ? value : null; }
