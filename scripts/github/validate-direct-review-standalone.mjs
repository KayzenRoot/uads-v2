#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_GATES, computeContractDigest } from "./ci-gate-receipt-runtime.mjs";
import { validateComparison as validateComparisonValue } from "./comparison-runtime.mjs";
const securityProof = await import("../../dist/github/security-proof.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = valueOf("--file");
if (!file) fail("--file is required");
const evidence = readJson(path.resolve(file));
const errors = validate(evidence);
const expectedSha = valueOf("--expected-sha");
const expectedVersion = valueOf("--expected-version");
const expectedSourceRunId = numberOrNull(valueOf("--expected-source-run-id"));
const expectedSourceRunAttempt = numberOrNull(valueOf("--expected-source-run-attempt"));
const expectedDirectRunId = numberOrNull(valueOf("--expected-direct-run-id"));
if (expectedSha && evidence.commitSha !== expectedSha) errors.push("expected-sha-mismatch");
if (expectedVersion && evidence.version !== expectedVersion) errors.push("expected-version-mismatch");
if (expectedSourceRunId && evidence.provenance?.sourceRunId !== expectedSourceRunId) errors.push("expected-source-run-id-mismatch");
if (expectedSourceRunAttempt && evidence.provenance?.sourceRunAttempt !== expectedSourceRunAttempt) errors.push("expected-source-run-attempt-mismatch");
if (expectedDirectRunId && evidence.workflow?.runId !== expectedDirectRunId) errors.push("expected-direct-run-id-mismatch");
if (errors.length) fail(errors.join(","));
process.stdout.write(JSON.stringify({ ok: true, commitSha: evidence.commitSha, sourceRunId: evidence.provenance.sourceRunId, sourceRunAttempt: evidence.provenance.sourceRunAttempt, directReviewRunId: evidence.workflow.runId, finalVerdict: evidence.finalVerdict, evidenceContractDigest: evidence.evidenceContractDigest }, null, 2) + "\n");

function validate(item) {
  const errors = [];
  const top = ["schema", "schemaVersion", "repository", "branch", "commitSha", "gitTreeSha", "version", "generatedAt", "event", "workflow", "comparison", "requiredGates", "validation", "securityWorkflows", "compatibility", "release", "artifact", "provenance", "finalVerdict", "reasonCodes", "evidenceContractDigest"];
  if (!item || typeof item !== "object" || Array.isArray(item)) return ["evidence-not-object"];
  extra(item, top, errors);
  if (item.schema !== "uads.github-direct-review-evidence" || !["0.8.0", "0.9.0"].includes(item.schemaVersion)) errors.push("schema-version-mismatch");
  if (!sha(item.commitSha) || !sha(item.gitTreeSha) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repository ?? "")) errors.push("identity-invalid");
  errors.push(...validateComparisonValue(item.comparison, { expectedHeadSha: item.commitSha, requireComplete: item.finalVerdict === "PASS" && item.event === "push" }));
  if (!workflow(item.workflow, errors) || !item.provenance || !sha(item.provenance.sourceRunSha) || !positive(item.provenance.sourceRunId) || !positive(item.provenance.sourceRunAttempt)) errors.push("provenance-invalid");
  if (!Array.isArray(item.requiredGates) || item.requiredGates.length !== REQUIRED_GATES.length || item.requiredGates.some((gate) => !gate || typeof gate.id !== "string" || !REQUIRED_GATES.includes(gate.id) || !outcome(gate.outcome) || gate.required !== true)) errors.push("required-gates-invalid");
  validation(item.validation, errors);
  for (const key of ["codeql", "scorecard", "dependencyReview"]) if (!status(item.securityWorkflows?.[key])) errors.push("security-status-invalid:" + key);
  for (const [workflow, statusValue] of [["codeql", item.securityWorkflows?.codeql], ["scorecard", item.securityWorkflows?.scorecard], ["dependency-review", item.securityWorkflows?.dependencyReview]]) {
    if (statusValue?.proof !== undefined && statusValue.proof !== null) errors.push(...securityProof.validateSecurityWorkflowProof(statusValue.proof, { workflow, repository: item.repository, finalCommitSha: item.commitSha, finalTreeSha: item.gitTreeSha }));
  }
  for (const key of ["linux", "windows"]) if (!status(item.compatibility?.[key])) errors.push("compatibility-status-invalid:" + key);
  if (item.version === "0.11.0") for (const key of ["linux", "windows"]) if (!compatibilityProof(item.compatibility?.[key], item.commitSha)) errors.push("compatibility-not-proven:" + key);
  if (!item.artifact || extra(item.artifact, ["name", "retentionDays"], errors) || (item.artifact.name !== null && !safePath(item.artifact.name))) errors.push("artifact-invalid");
  if (!item.release || extra(item.release, ["version", "tag", "tagTargetSha", "releaseRunId", "releaseRunConclusion", "assetNames", "ciBindingAsset", "directReviewArtifactName"], errors)) errors.push("release-invalid");
  if (!Array.isArray(item.reasonCodes) || item.reasonCodes.some((code) => typeof code !== "string" || !/^[A-Z0-9_:-]{1,120}$/.test(code))) errors.push("reason-codes-invalid");
  if (!/^[0-9a-f]{64}$/i.test(item.evidenceContractDigest ?? "") || item.provenance?.evidenceContractDigest !== item.evidenceContractDigest || computeContractDigest(item) !== item.evidenceContractDigest) errors.push("evidence-digest-mismatch");
  if (item.finalVerdict === "PASS" && Array.isArray(item.requiredGates) && item.requiredGates.some((gate) => gate.required && gate.outcome !== "success")) errors.push("pass-with-non-success-gate");
  if (item.finalVerdict === "PASS" && securityProof.isCorrectedReleaseVersion(item.version)) errors.push(...securityProof.securityWorkflowAuthorizationErrors(item.securityWorkflows, { repository: item.repository, finalCommitSha: item.commitSha, finalTreeSha: item.gitTreeSha }));
  return [...new Set(errors)];
}
function workflow(item, errors) { if (!item || extra(item, ["runId", "runAttempt", "workflowName", "jobName", "htmlUrl", "startedAt", "completedAt"], errors)) return false; if (!positive(item.runId) || !positive(item.runAttempt) || typeof item.workflowName !== "string" || typeof item.jobName !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(item.htmlUrl)) { errors.push("workflow-invalid"); return false; } return true; }
function validation(item, errors) { const keys = ["testFilesPassed", "testsPassed", "testsFailed", "orchestrator", "execution", "context", "fault", "cost", "modelRouting", "specialistRouting", "adapters", "assurance", "faultInjection", "specialistPolicyDigest", "builtinSpecialistCatalogDigest", "npmAudit", "packaging"]; if (!item || extra(item, keys, errors)) { errors.push("validation-invalid"); return; } for (const key of ["orchestrator", "execution", "context", "fault", "cost", "modelRouting", "specialistRouting", "adapters", "assurance", "faultInjection"]) if (!summary(item[key])) errors.push("summary-invalid:" + key); for (const key of ["specialistPolicyDigest", "builtinSpecialistCatalogDigest"]) if (!(item[key] === null || /^[0-9a-f]{64}$/i.test(item[key]))) errors.push("specialist-digest-invalid:" + key); if (!item.npmAudit || !outcome(item.npmAudit.outcome) || !(item.npmAudit.highOrGreaterVulnerabilities === null || nonnegative(item.npmAudit.highOrGreaterVulnerabilities))) errors.push("npm-audit-invalid"); if (!item.packaging || !outcome(item.packaging.outcome)) errors.push("packaging-invalid"); }
function summary(value) { return value && Object.keys(value).length === 3 && ["passed", "failed", "total"].every((key) => value[key] === null || nonnegative(value[key])); }
function status(value) { const allowed = ["status", "outcome", "runId", "commitSha", "htmlUrl", "reasonCode", "runAttempt", "artifactName", "artifactSha256", "evidenceDigest", "platform", "nodeVersion", "checks", "proof"]; return value && Object.keys(value).every((key) => allowed.includes(key)) && ["status", "outcome", "runId", "commitSha", "htmlUrl", "reasonCode"].every((key) => Object.prototype.hasOwnProperty.call(value, key)) && typeof value.status === "string" && typeof value.outcome === "string" && (value.runId === null || positive(value.runId)) && (value.commitSha === null || sha(value.commitSha)) && (value.htmlUrl === null || /^https:\/\/github\.com\//.test(value.htmlUrl)) && (value.reasonCode === null || /^[A-Z0-9_:-]{1,100}$/.test(value.reasonCode)) && (value.runAttempt === undefined || value.runAttempt === null || positive(value.runAttempt)) && (value.artifactSha256 === undefined || value.artifactSha256 === null || /^[0-9a-f]{64}$/i.test(value.artifactSha256)) && (value.evidenceDigest === undefined || value.evidenceDigest === null || /^[0-9a-f]{64}$/i.test(value.evidenceDigest)) && (value.platform === undefined || value.platform === null || value.platform === "linux" || value.platform === "windows") && (value.checks === undefined || value.checks === null || typeof value.checks === "object"); }
function compatibilityProof(value, expectedSha) { const required = ["npm-ci", "typecheck-build", "adapter-eval", "isolated-install", "root-resolution", "zero-project-footprint", "privacy-path-assertion"]; return value?.outcome === "success" && value.commitSha === expectedSha && positive(value.runId) && positive(value.runAttempt) && typeof value.artifactName === "string" && /^[0-9a-f]{64}$/i.test(value.artifactSha256 ?? "") && /^[0-9a-f]{64}$/i.test(value.evidenceDigest ?? "") && (value.platform === "linux" || value.platform === "windows") && /^v20\./.test(value.nodeVersion ?? "") && required.every((key) => value.checks?.[key] === "success"); }
function extra(value, allowed, errors) { const unknown = Object.keys(value ?? {}).filter((key) => !allowed.includes(key)); if (unknown.length) errors.push("additional-properties"); return unknown.length > 0; }
function outcome(value) { return ["success", "failure", "cancelled", "skipped", "unknown"].includes(value); }
function sha(value) { return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value); }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function nonnegative(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1000000; }
function safePath(value) { return typeof value === "string" && /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value); }
function numberOrNull(value) { const number = Number(value); return positive(number) ? number : null; }
function valueOf(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail("invalid evidence JSON"); } }
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
void root;
