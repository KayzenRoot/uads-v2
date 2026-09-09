#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { assertSchema } = await import("../../dist/lib/json-schema.js");
const { createDirectReviewEvidence, validateDirectReviewEvidence } = await import("../../dist/github/direct-review.js");

const file = valueOf("--file");
const expectedSha = valueOf("--expected-sha");
const expectedRunId = valueOf("--expected-ci-run-id");
const expectedSourceRunId = valueOf("--expected-source-run-id");
const expectedSourceRunAttempt = valueOf("--expected-source-run-attempt");
const expectedVersion = valueOf("--expected-version");
const evidence = file ? readJson(path.resolve(file)) : fixture();
const errors = [];

try {
  assertSchema("github-direct-review-evidence.schema.json", evidence, root);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}
errors.push(...validateDirectReviewEvidence(evidence, root));
if (expectedSha && evidence?.commitSha !== expectedSha.toLowerCase()) errors.push("expected-commit-sha-mismatch");
if (expectedRunId && evidence?.workflow?.runId !== Number(expectedRunId)) errors.push("expected-ci-run-id-mismatch");
if (expectedSourceRunId && evidence?.provenance?.sourceRunId !== Number(expectedSourceRunId)) errors.push("expected-source-run-id-mismatch");
if (expectedSourceRunAttempt && evidence?.provenance?.sourceRunAttempt !== Number(expectedSourceRunAttempt)) errors.push("expected-source-run-attempt-mismatch");
if (expectedVersion && evidence?.version !== expectedVersion) errors.push("expected-version-mismatch");

const result = { ok: errors.length === 0, file: file ? path.basename(file) : "built-in-fixture", verdict: evidence?.finalVerdict ?? null, errors };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exit(1);

function fixture() {
  const sha = "a".repeat(40);
  const steps = Object.fromEntries([
    "install", "lint", "typecheck", "build", "action-pins", "tests", "eval-orchestrator", "eval-execution",
    "eval-context", "eval-fault", "eval-cost", "eval-model-routing", "eval-specialist-routing", "eval-adapters", "eval-assurance", "eval-fault-injection", "skills-validation", "validate", "npm-audit", "packaging",
  ].map((id) => [id, "success"]));
  return createDirectReviewEvidence({
    repository: "KayzenRoot/uads",
    branch: "main",
    commitSha: sha,
    gitTreeSha: sha,
    version: "0.8.0",
    event: "push",
    workflow: { runId: 123, runAttempt: 1, workflowName: "CI", jobName: "foundation", htmlUrl: "https://github.com/KayzenRoot/uads/actions/runs/123" },
    comparison: { baseSha: "b".repeat(40), headSha: sha, changedFileCount: 1, changedPaths: ["src/github/direct-review.ts"] },
    stepOutcomes: steps,
    logs: {
      tests: "Test Files 38 passed (38)\nTests 240 passed (240)\n",
      "eval-orchestrator": "9 passed, 0 failed, 9 total",
      "eval-execution": "9 passed, 0 failed, 9 total",
      "eval-context": "19 passed, 0 failed, 19 total",
      "eval-fault": "18 passed, 0 failed, 18 total",
      "eval-cost": "cost eval 27/27",
      "eval-model-routing": "model routing eval 20/20",
      "eval-specialist-routing": "specialist routing eval 26/26",
      "eval-adapters": "adapter eval 36/36",
      "eval-assurance": "16 passed, 0 failed, 16 total",
      "eval-fault-injection": "16 passed, 0 failed, 16 total",
      "npm-audit": "found 0 vulnerabilities",
    },
    artifactName: `uads-direct-review-${sha}`,
  });
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (error) { throw new Error(`direct review JSON unreadable: ${error instanceof Error ? error.message : String(error)}`); }
}

function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
