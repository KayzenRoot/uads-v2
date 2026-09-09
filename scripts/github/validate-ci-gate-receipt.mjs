#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_GATES, validateReceiptDigest, computeContractDigest } from "./ci-gate-receipt-runtime.mjs";
import { validateComparison as validateComparisonValue } from "./comparison-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = valueOf("--file");
const value = file ? readJson(path.resolve(file)) : fixture();
const errors = validate(value);
const expectedSha = valueOf("--expected-sha");
const expectedRunId = numberOrNull(valueOf("--expected-run-id"));
const expectedRunAttempt = numberOrNull(valueOf("--expected-run-attempt"));
if (expectedSha && value?.commitSha !== expectedSha) errors.push("expected-sha-mismatch");
if (expectedRunId && value?.workflow?.runId !== expectedRunId) errors.push("expected-run-id-mismatch");
if (expectedRunAttempt && value?.workflow?.runAttempt !== expectedRunAttempt) errors.push("expected-run-attempt-mismatch");
if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({ ok: true, schema: value.schema, schemaVersion: value.schemaVersion, commitSha: value.commitSha, runId: value.workflow.runId, finalVerdict: value.finalVerdict }, null, 2) + "\n");

function validate(item) {
  const errors = [];
  const top = ["schema", "schemaVersion", "repository", "branch", "commitSha", "gitTreeSha", "version", "generatedAt", "event", "workflow", "comparison", "requiredGates", "validation", "provenance", "finalVerdict", "reasonCodes", "evidenceContractDigest"];
  if (!item || typeof item !== "object" || Array.isArray(item)) return ["receipt-not-object"];
  if (extra(item, top, "top-level", errors)) return errors;
  if (item.schema !== "uads.ci-gate-receipt" || item.schemaVersion !== "0.8.0") errors.push("schema-version-mismatch");
  if (!shaOrNull(item.commitSha) || !shaOrNull(item.gitTreeSha)) errors.push("identity-sha-invalid");
  if (!item.repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repository)) errors.push("repository-invalid");
  validateWorkflow(item.workflow, errors);
  validateComparison(item.comparison, errors, item.commitSha);
  if (!Array.isArray(item.requiredGates) || item.requiredGates.length !== REQUIRED_GATES.length) errors.push("required-gates-count-invalid");
  else {
    const seen = new Set();
    for (const gate of item.requiredGates) {
      if (extra(gate, ["id", "outcome", "required"], "gate", errors)) continue;
      if (!REQUIRED_GATES.includes(gate.id) || seen.has(gate.id) || gate.required !== true || !["success", "failure", "cancelled", "skipped", "unknown"].includes(gate.outcome)) errors.push("gate-invalid");
      seen.add(gate.id);
    }
  }
  validateValidation(item.validation, errors);
  if (!item.provenance || extra(item.provenance, ["generatedByScript", "evidenceContractDigest", "sourceRunSha", "sourceRunId", "sourceRunAttempt"], "provenance", errors)) errors.push("provenance-invalid");
  else if (item.provenance.generatedByScript !== "scripts/github/generate-ci-gate-receipt.mjs" || item.provenance.sourceRunSha !== item.commitSha || item.provenance.sourceRunId !== item.workflow?.runId || item.provenance.sourceRunAttempt !== item.workflow?.runAttempt) errors.push("provenance-mismatch");
  if (!['PASS', 'FAIL', 'INCOMPLETE', 'BLOCKED'].includes(item.finalVerdict) || !Array.isArray(item.reasonCodes) || item.reasonCodes.some((code) => typeof code !== "string" || !/^[A-Z0-9_:-]{1,120}$/.test(code))) errors.push("verdict-or-reasons-invalid");
  errors.push(...validateReceiptDigest(item));
  return [...new Set(errors)];
}
function validateWorkflow(item, errors) {
  if (!item || extra(item, ["runId", "runAttempt", "workflowName", "jobName", "htmlUrl", "startedAt", "completedAt"], "workflow", errors)) return;
  if (!number(item.runId) || !number(item.runAttempt) || typeof item.workflowName !== "string" || typeof item.jobName !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(item.htmlUrl)) errors.push("workflow-identity-invalid");
}
function validateComparison(item, errors, expectedHeadSha) {
  errors.push(...validateComparisonValue(item, { expectedHeadSha }));
}
function validateValidation(item, errors) {
  const keys = ["testFilesPassed", "testsPassed", "testsFailed", "orchestrator", "execution", "context", "fault", "cost", "modelRouting", "specialistRouting", "adapters", "assurance", "faultInjection", "specialistPolicyDigest", "builtinSpecialistCatalogDigest", "npmAudit", "packaging"];
  if (!item || extra(item, keys, "validation", errors)) return;
  for (const key of ["orchestrator", "execution", "context", "fault", "cost", "modelRouting", "specialistRouting", "adapters", "assurance", "faultInjection"]) {
    if (!summary(item[key])) errors.push("validation-summary-invalid:" + key);
  }
  for (const key of ["specialistPolicyDigest", "builtinSpecialistCatalogDigest"]) if (!(item[key] === null || /^[0-9a-f]{64}$/i.test(item[key]))) errors.push("specialist-digest-invalid:" + key);
  if (!item.npmAudit || extra(item.npmAudit, ["outcome", "highOrGreaterVulnerabilities"], "npmAudit", errors) || !outcome(item.npmAudit.outcome)) errors.push("npm-audit-invalid");
  if (!item.packaging || extra(item.packaging, ["outcome"], "packaging", errors) || !outcome(item.packaging.outcome)) errors.push("packaging-invalid");
}
function summary(item) { return item && Object.keys(item).length === 3 && ["passed", "failed", "total"].every((key) => item[key] === null || (Number.isSafeInteger(item[key]) && item[key] >= 0 && item[key] <= 1000000)); }
function outcome(value) { return ["success", "failure", "cancelled", "skipped", "unknown"].includes(value); }
function extra(item, keys, label, errors) { const allowed = new Set(keys); const unknown = Object.keys(item).filter((key) => !allowed.has(key)); if (unknown.length) errors.push(`${label}-additional-properties`); return unknown.length > 0; }
function shaOrNull(value) { return value === null || (typeof value === "string" && /^[0-9a-f]{40}$/.test(value)); }
function number(value) { return Number.isSafeInteger(value) && value > 0; }
function numberOrNull(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { process.stderr.write(`invalid receipt JSON: ${file}\n`); process.exit(1); } }
function valueOf(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function fixture() {
  const sha = "a".repeat(40);
  const gates = Object.fromEntries(REQUIRED_GATES.map((id) => [id, "success"]));
  const base = { schema: "uads.ci-gate-receipt", schemaVersion: "0.8.0", repository: "KayzenRoot/uads", branch: "main", commitSha: sha, gitTreeSha: sha, version: "0.8.0", generatedAt: "2026-09-02T00:00:00.000Z", event: "push", workflow: { runId: 1, runAttempt: 1, workflowName: "CI", jobName: "Foundation checks", htmlUrl: "https://github.com/KayzenRoot/uads/actions/runs/1", startedAt: null, completedAt: null }, comparison: { baseSha: "b".repeat(40), headSha: sha, changedFileCount: 0, changedPaths: [], changedPathsDigest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945", changedPathsTruncated: false, comparisonStatus: "complete", comparisonReasonCode: null }, requiredGates: REQUIRED_GATES.map((id) => ({ id, outcome: "success", required: true })), validation: { testFilesPassed: null, testsPassed: null, testsFailed: null, ...Object.fromEntries(["orchestrator", "execution", "context", "fault", "cost", "modelRouting", "specialistRouting", "adapters", "assurance", "faultInjection"].map((key) => [key, { passed: null, failed: null, total: null }])), specialistPolicyDigest: null, builtinSpecialistCatalogDigest: null, npmAudit: { outcome: "success", highOrGreaterVulnerabilities: 0 }, packaging: { outcome: "success" } }, provenance: { generatedByScript: "scripts/github/generate-ci-gate-receipt.mjs", evidenceContractDigest: "", sourceRunSha: sha, sourceRunId: 1, sourceRunAttempt: 1 }, finalVerdict: "PASS", reasonCodes: [], evidenceContractDigest: "" };
  const digest = computeContractDigest(base);
  base.provenance.evidenceContractDigest = digest;
  base.evidenceContractDigest = digest;
  return base;
}
