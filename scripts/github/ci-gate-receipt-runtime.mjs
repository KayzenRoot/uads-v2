import crypto from "node:crypto";
import { unavailable, validateComparison } from "./comparison-runtime.mjs";

export const CI_GATE_RECEIPT_SCHEMA = "uads.ci-gate-receipt";
export const CI_GATE_RECEIPT_SCHEMA_VERSION = "0.8.0";
export const DIRECT_REVIEW_ARTIFACT_RETENTION_DAYS = 90;

export const REQUIRED_GATES = [
  "install", "lint", "typecheck", "build", "action-pins", "tests",
  "eval-orchestrator", "eval-execution", "eval-context", "eval-fault",
  "eval-cost", "eval-model-routing", "eval-specialist-routing", "eval-adapters", "eval-assurance", "eval-fault-injection", "skills-validation", "validate",
  "npm-audit", "packaging",
];

export const GATE_STEP_NAMES = {
  install: "Install dependencies",
  lint: "Lint",
  typecheck: "Typecheck",
  build: "Build",
  "action-pins": "Validate immutable action pins",
  tests: "Test",
  "eval-orchestrator": "Orchestrator eval",
  "eval-execution": "Execution eval",
  "eval-context": "Context eval",
  "eval-fault": "Fault eval",
  "eval-cost": "Cost eval",
  "eval-model-routing": "Model routing eval",
  "eval-specialist-routing": "Specialist routing eval",
  "eval-adapters": "Adapter eval",
  "eval-assurance": "Assurance eval",
  "eval-fault-injection": "Fault-injection eval",
  "skills-validation": "Skills preflight",
  validate: "Validate foundation",
  "npm-audit": "Audit dependencies",
  packaging: "Packaging smoke test",
};

const OUTCOMES = new Set(["success", "failure", "cancelled", "skipped"]);
const SHA_RE = /^[0-9a-f]{40}$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_PATH_RE = /^[A-Za-z0-9._/-]+$/;

export function normalizeOutcome(value) {
  return OUTCOMES.has(value) ? value : "unknown";
}

export function safeSha(value) {
  return typeof value === "string" && SHA_RE.test(value) ? value.toLowerCase() : null;
}

function safeRepository(value) {
  return typeof value === "string" && REPOSITORY_RE.test(value) ? value : null;
}

function safeRunId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeText(value, maxLength) {
  return typeof value === "string" && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}

function safeUrl(value) {
  return typeof value === "string" && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/.test(value) ? value : null;
}

function safeDateTime(value) {
  if (typeof value !== "string" || value.length > 64 || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function safePath(value) {
  return typeof value === "string" && value.length <= 240 && SAFE_PATH_RE.test(value) && !value.includes("..") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value) ? value : null;
}

function sortedPaths(values) {
  if (!Array.isArray(values)) return null;
  return [...new Set(values.map(safePath).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 500);
}

function normalizeComparison(value, headSha) {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : unavailable(null, headSha, "COMPARISON_METADATA_UNAVAILABLE");
  return validateComparison(candidate, { expectedHeadSha: headSha }).length === 0
    ? candidate
    : unavailable(null, headSha, "COMPARISON_METADATA_INVALID");
}

export function emptySummary() {
  return { passed: null, failed: null, total: null };
}

function boundedInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

export function parseCountLine(text, prefix) {
  const line = String(text ?? "").split(/\r?\n/).find((item) => item.includes(prefix));
  if (!line) return emptySummary();
  const passed = line.match(/(\d+)\s+passed\b/i)?.[1];
  const failed = line.match(/(\d+)\s+failed\b/i)?.[1];
  const total = line.match(/\((\d+)\)/)?.[1];
  const parsedPassed = passed === undefined ? null : boundedInteger(Number(passed));
  const parsedFailed = failed === undefined ? null : boundedInteger(Number(failed));
  const parsedTotal = total === undefined
    ? parsedPassed === null && parsedFailed === null ? null : (parsedPassed ?? 0) + (parsedFailed ?? 0)
    : boundedInteger(Number(total));
  const inferredFailed = parsedFailed === null && parsedPassed !== null && parsedTotal !== null
    ? Math.max(0, parsedTotal - parsedPassed)
    : parsedFailed;
  return { passed: parsedPassed, failed: inferredFailed, total: parsedTotal };
}

export function parseVitestSummary(text) {
  const files = parseCountLine(text, "Test Files");
  const tests = parseCountLine(text, "Tests");
  return { testFilesPassed: files.passed, testsPassed: tests.passed, testsFailed: tests.failed };
}

export function parseEvalSummary(text) {
  const source = String(text ?? "");
  const complete = [...source.matchAll(/(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+total/gi)].pop();
  if (complete) return { passed: boundedInteger(Number(complete[1])), failed: boundedInteger(Number(complete[2])), total: boundedInteger(Number(complete[3])) };
  const compact = [...source.matchAll(/\b(?:eval\s+)?(\d+)\/(\d+)\b/gi)].pop();
  if (compact) {
    const passed = boundedInteger(Number(compact[1]));
    const total = boundedInteger(Number(compact[2]));
    return { passed, failed: passed === null || total === null ? null : Math.max(0, total - passed), total };
  }
  return emptySummary();
}

export function parseAuditSummary(text) {
  const source = String(text ?? "");
  const clean = /found\s+0\s+vulnerabilities/i.test(source);
  const count = source.match(/found\s+(\d+)\s+vulnerabilit(?:y|ies)/i)?.[1];
  return { outcome: clean ? "success" : "unknown", highOrGreaterVulnerabilities: count === undefined ? (clean ? 0 : null) : boundedInteger(Number(count)) };
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortedObject(item)]));
}

export function computeContractDigest(value) {
  const { evidenceContractDigest: _ignored, ...withoutDigest } = value;
  const digestInput = {
    ...withoutDigest,
    generatedAt: null,
    provenance: { ...withoutDigest.provenance, evidenceContractDigest: null },
  };
  return crypto.createHash("sha256").update(JSON.stringify(sortedObject(digestInput))).digest("hex");
}

function parseSteps(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { outcomes: {}, malformed: true };
  const outcomes = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_PATH_RE.test(key) || key.length > 80) return { outcomes: {}, malformed: true };
    outcomes[key] = normalizeOutcome(item);
  }
  return { outcomes, malformed: false };
}

function workflowIdentity(input) {
  const runId = safeRunId(input?.runId);
  return {
    runId,
    runAttempt: safeRunId(input?.runAttempt),
    workflowName: safeText(input?.workflowName, 128),
    jobName: safeText(input?.jobName, 128),
    htmlUrl: safeUrl(input?.htmlUrl),
    startedAt: safeDateTime(input?.startedAt),
    completedAt: safeDateTime(input?.completedAt),
  };
}

function summariesFromLogs(logs) {
  const source = logs ?? {};
  const vitest = parseVitestSummary(source.tests ?? "");
  const evals = Object.fromEntries([
    ["orchestrator", "eval-orchestrator"], ["execution", "eval-execution"], ["context", "eval-context"],
    ["fault", "eval-fault"], ["cost", "eval-cost"], ["modelRouting", "eval-model-routing"], ["specialistRouting", "eval-specialist-routing"], ["adapters", "eval-adapters"], ["assurance", "eval-assurance"], ["faultInjection", "eval-fault-injection"],
  ].map(([name, log]) => [name, parseEvalSummary(source[log] ?? "")]));
  return {
    ...vitest,
    ...evals,
    npmAudit: parseAuditSummary(source["npm-audit"] ?? ""),
  };
}

function baseValidation(summary, steps, input) {
  return {
    testFilesPassed: summary.testFilesPassed,
    testsPassed: summary.testsPassed,
    testsFailed: summary.testsFailed,
    orchestrator: summary.orchestrator,
    execution: summary.execution,
    context: summary.context,
    fault: summary.fault,
    cost: summary.cost,
    modelRouting: summary.modelRouting,
    specialistRouting: summary.specialistRouting,
    adapters: summary.adapters,
    assurance: summary.assurance,
    faultInjection: summary.faultInjection,
    specialistPolicyDigest: typeof input?.specialistPolicyDigest === "string" && /^[0-9a-f]{64}$/i.test(input.specialistPolicyDigest) ? input.specialistPolicyDigest.toLowerCase() : null,
    builtinSpecialistCatalogDigest: typeof input?.builtinSpecialistCatalogDigest === "string" && /^[0-9a-f]{64}$/i.test(input.builtinSpecialistCatalogDigest) ? input.builtinSpecialistCatalogDigest.toLowerCase() : null,
    npmAudit: { outcome: steps["npm-audit"] ?? summary.npmAudit.outcome, highOrGreaterVulnerabilities: summary.npmAudit.highOrGreaterVulnerabilities },
    packaging: { outcome: steps.packaging ?? "unknown" },
  };
}

function outcomeReasons(gates, malformed, summaries) {
  const reasons = [];
  if (Object.keys(gates).length === 0) reasons.push("STEP_OUTCOME_UNAVAILABLE");
  if (malformed) reasons.push("STEP_OUTCOME_MALFORMED");
  for (const gate of REQUIRED_GATES) if (gates[gate] !== "success") reasons.push(`REQUIRED_GATE_NOT_SUCCESS:${gate.toUpperCase()}`);
  if (summaries.testsPassed === null || summaries.testsFailed === null || summaries.testFilesPassed === null) reasons.push("COUNT_PARSE_UNAVAILABLE:TESTS");
  for (const [name, summary] of Object.entries(summaries)) {
    if (["testFilesPassed", "testsPassed", "testsFailed", "npmAudit"].includes(name)) continue;
    if (summary.passed === null || summary.failed === null || summary.total === null) reasons.push(`COUNT_PARSE_UNAVAILABLE:${name.toUpperCase()}`);
  }
  return reasons;
}

export function createCiGateReceipt(input) {
  const parsed = parseSteps(input.stepOutcomes === null ? "malformed" : input.stepOutcomes ?? {});
  const gates = parsed.outcomes;
  const requiredGates = REQUIRED_GATES.map((id) => ({ id, outcome: gates[id] ?? "unknown", required: true }));
  const summaries = summariesFromLogs(input.logs ?? {});
  const reasons = outcomeReasons(gates, parsed.malformed, summaries);
  const repository = safeRepository(input.repository);
  const commitSha = safeSha(input.commitSha);
  const gitTreeSha = safeSha(input.gitTreeSha);
  const workflow = workflowIdentity(input.workflow);
  const identityProven = Boolean(repository && commitSha && gitTreeSha && workflow.runId && workflow.runAttempt && workflow.htmlUrl);
  if (!identityProven) reasons.push("IDENTITY_UNPROVEN");
  const allRequiredSuccess = requiredGates.every((gate) => gate.outcome === "success");
  const hasKnownFailure = requiredGates.some((gate) => gate.outcome === "failure" || gate.outcome === "cancelled");
  const hasUnknown = requiredGates.some((gate) => gate.outcome === "unknown");
  const receipt = {
    schema: CI_GATE_RECEIPT_SCHEMA,
    schemaVersion: CI_GATE_RECEIPT_SCHEMA_VERSION,
    repository,
    branch: safeText(input.branch, 128),
    commitSha,
    gitTreeSha,
    version: typeof input.version === "string" ? input.version : "0.0.0",
    generatedAt: typeof input.generatedAt === "string" ? input.generatedAt : new Date().toISOString(),
    event: safeText(input.event, 80),
    workflow,
    comparison: normalizeComparison(input.comparison, commitSha),
    requiredGates,
    validation: baseValidation(summaries, gates, input),
    provenance: {
      generatedByScript: "scripts/github/generate-ci-gate-receipt.mjs",
      evidenceContractDigest: "",
      sourceRunSha: commitSha,
      sourceRunId: workflow.runId,
      sourceRunAttempt: workflow.runAttempt,
    },
    finalVerdict: !identityProven ? "INCOMPLETE" : allRequiredSuccess ? "PASS" : hasKnownFailure ? "FAIL" : hasUnknown ? "INCOMPLETE" : "FAIL",
    reasonCodes: [...new Set(reasons)].sort(),
    evidenceContractDigest: "",
  };
  const digest = computeContractDigest(receipt);
  receipt.provenance.evidenceContractDigest = digest;
  receipt.evidenceContractDigest = digest;
  return receipt;
}

export function createDirectReviewFromReceipt(receipt, input) {
  const reasons = new Set(Array.isArray(receipt.reasonCodes) ? receipt.reasonCodes : []);
  const sourceRunId = safeRunId(input.sourceRunId ?? receipt.provenance?.sourceRunId ?? receipt.workflow?.runId);
  const sourceRunAttempt = safeRunId(input.sourceRunAttempt ?? receipt.provenance?.sourceRunAttempt ?? receipt.workflow?.runAttempt);
  const sourceRunSha = safeSha(input.sourceRunSha ?? receipt.commitSha);
  const repository = safeRepository(input.repository ?? receipt.repository);
  const commitSha = safeSha(input.commitSha ?? receipt.commitSha);
  const gitTreeSha = safeSha(input.gitTreeSha ?? receipt.gitTreeSha);
  const workflow = workflowIdentity(input.workflow);
  if (!repository || !commitSha || !gitTreeSha || !workflow.runId || !workflow.runAttempt || !workflow.htmlUrl) reasons.add("IDENTITY_UNPROVEN");
  if (!sourceRunId || !sourceRunAttempt || !sourceRunSha) reasons.add("SOURCE_RUN_IDENTITY_UNPROVEN");
  const receiptVerdict = receipt.finalVerdict;
  const compatibility = input.compatibility ?? {
    linux: { status: "unknown", outcome: "unknown", runId: null, commitSha: null, htmlUrl: null, reasonCode: "NOT_EVALUATED_HERE" },
    windows: { status: "unknown", outcome: "unknown", runId: null, commitSha: null, htmlUrl: null, reasonCode: "NOT_EVALUATED_HERE" },
  };
  if (receipt.version === "0.11.0") {
    for (const platform of ["linux", "windows"]) {
      if (!compatibilityProof(compatibility[platform], receipt.commitSha)) reasons.add(`COMPATIBILITY_NOT_PROVEN:${platform.toUpperCase()}`);
    }
  }
  const finalVerdict = receiptVerdict === "FAIL"
    ? "FAIL"
    : receiptVerdict !== "PASS" || reasons.has("IDENTITY_UNPROVEN") || reasons.has("SOURCE_RUN_IDENTITY_UNPROVEN")
      ? "INCOMPLETE"
      : "PASS";
  const evidence = {
    schema: "uads.github-direct-review-evidence",
    schemaVersion: correctedReleaseVersion(input.version ?? receipt.version) ? "0.9.0" : "0.8.0",
    repository,
    branch: safeText(input.branch ?? receipt.branch, 128),
    commitSha,
    gitTreeSha,
    version: typeof input.version === "string" ? input.version : receipt.version,
    generatedAt: typeof input.generatedAt === "string" ? input.generatedAt : new Date().toISOString(),
    event: safeText(input.event ?? receipt.event, 80),
    workflow,
    comparison: input.comparison ?? receipt.comparison,
    requiredGates: receipt.requiredGates,
    validation: receipt.validation,
    securityWorkflows: input.securityWorkflows ?? {
      codeql: { status: "unknown", outcome: "unknown", runId: null, commitSha: null, htmlUrl: null, reasonCode: "NOT_EVALUATED_HERE" },
      scorecard: { status: "unknown", outcome: "unknown", runId: null, commitSha: null, htmlUrl: null, reasonCode: "NOT_EVALUATED_HERE" },
      dependencyReview: { status: "unknown", outcome: "unknown", runId: null, commitSha: null, htmlUrl: null, reasonCode: "NOT_EVALUATED_HERE" },
    },
    compatibility,
    release: { version: null, tag: null, tagTargetSha: null, releaseRunId: null, releaseRunConclusion: "unknown", assetNames: null, ciBindingAsset: null, directReviewArtifactName: null },
    artifact: { name: safePath(input.artifactName) ?? null, retentionDays: input.artifactRetentionDays ?? DIRECT_REVIEW_ARTIFACT_RETENTION_DAYS },
    provenance: {
      generatedByScript: "scripts/github/publish-direct-review-evidence.mjs",
      evidenceContractDigest: "",
      sourceRunSha,
      sourceRunId,
      sourceRunAttempt,
    },
    finalVerdict,
    reasonCodes: [...reasons].sort(),
    evidenceContractDigest: "",
  };
  const digest = computeContractDigest(evidence);
  evidence.provenance.evidenceContractDigest = digest;
  evidence.evidenceContractDigest = digest;
  return evidence;
}

export function validateReceiptDigest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["receipt-not-object"];
  const errors = [];
  if (value.schema !== CI_GATE_RECEIPT_SCHEMA || value.schemaVersion !== CI_GATE_RECEIPT_SCHEMA_VERSION) errors.push("schema-version-mismatch");
  if (!/^[0-9a-f]{64}$/i.test(value.evidenceContractDigest ?? "") || computeContractDigest(value) !== value.evidenceContractDigest) errors.push("receipt-digest-mismatch");
  if (value.provenance?.evidenceContractDigest !== value.evidenceContractDigest) errors.push("receipt-provenance-digest-mismatch");
  errors.push(...validateComparison(value.comparison, { expectedHeadSha: value.commitSha, requireComplete: value.finalVerdict === "PASS" && value.event === "push" }));
  if (value.finalVerdict === "PASS" && value.requiredGates?.some((gate) => gate.required && gate.outcome !== "success")) errors.push("pass-with-non-success-gate");
  return errors;
}

function compatibilityProof(value, expectedSha) {
  const checks = value?.checks;
  const required = ["npm-ci", "typecheck-build", "adapter-eval", "isolated-install", "root-resolution", "zero-project-footprint", "privacy-path-assertion"];
  return value?.outcome === "success" && value.commitSha === expectedSha && Number.isSafeInteger(value.runId) && Number.isSafeInteger(value.runAttempt) &&
    typeof value.artifactName === "string" && /^[0-9a-f]{64}$/i.test(value.artifactSha256 ?? "") && /^[0-9a-f]{64}$/i.test(value.evidenceDigest ?? "") &&
    (value.platform === "linux" || value.platform === "windows") && /^v20\./.test(value.nodeVersion ?? "") && required.every((key) => checks?.[key] === "success");
}

function correctedReleaseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-|\+|$)/.exec(String(value ?? ""));
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 0 || minor > 11 || (minor === 11 && patch >= 1);
}
