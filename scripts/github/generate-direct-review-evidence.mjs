#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deriveGitComparison } from "./comparison-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(valueOf("--output") ?? path.join(process.env.RUNNER_TEMP ?? path.join(root, "tmp"), "github-direct-review-evidence.json"));
const logRoot = path.resolve(valueOf("--log-dir") ?? process.env.RUNNER_TEMP ?? path.join(root, "tmp"));
const maxLogBytes = 2 * 1024 * 1024;
const repository = process.env.GITHUB_REPOSITORY ?? null;
const commitSha = safeSha(process.env.GITHUB_SHA);
const runId = safeRunId(process.env.GITHUB_RUN_ID);
const runAttempt = safeRunId(process.env.GITHUB_RUN_ATTEMPT);
const stepInput = parseJson(process.env.UADS_DIRECT_REVIEW_STEPS ?? "{}");
const packageJson = readJson(path.join(root, "package.json"));
const version = typeof packageJson?.version === "string" ? packageJson.version : "0.0.0";
const comparison = deriveGitComparison({ baseSha: process.env.UADS_COMPARISON_BASE_SHA ?? null, headSha: commitSha, cwd: root });
const logs = Object.fromEntries([
  "tests",
  "eval-orchestrator",
  "eval-execution",
  "eval-context",
  "eval-fault",
  "eval-cost",
  "eval-model-routing",
  "eval-specialist-routing",
  "eval-adapters",
  "eval-assurance",
  "eval-fault-injection",
  "npm-audit",
].map((id) => [id, readLog(path.join(logRoot, `uads-${id}.log`))]));

const { createDirectReviewEvidence } = await import("../../dist/github/direct-review.js");
const evidence = createDirectReviewEvidence({
  repository,
  branch: process.env.GITHUB_REF_NAME ?? null,
  commitSha,
  gitTreeSha: commitSha ? gitTreeSha(commitSha) : null,
  version,
  event: process.env.GITHUB_EVENT_NAME ?? null,
  workflow: {
    runId,
    runAttempt,
    workflowName: process.env.GITHUB_WORKFLOW ?? null,
    jobName: process.env.GITHUB_JOB ?? null,
    htmlUrl: repository && runId ? `https://github.com/${repository}/actions/runs/${runId}` : null,
    startedAt: process.env.UADS_RUN_STARTED_AT ?? null,
    completedAt: process.env.UADS_RUN_COMPLETED_AT ?? null,
  },
  comparison,
  stepOutcomes: stepInput === null ? "malformed" : stepInput,
  logs,
  artifactName: commitSha ? `uads-direct-review-${commitSha}` : "uads-direct-review-unknown",
  artifactRetentionDays: 90,
});

const text = `${JSON.stringify(evidence, null, 2)}\n`;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, text, "utf8");
process.stdout.write(`UADS_DIRECT_REVIEW_BEGIN\n${text}UADS_DIRECT_REVIEW_END\n`);

function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function readLog(file) {
  try {
    const handle = fs.openSync(file, "r");
    const buffer = Buffer.alloc(maxLogBytes);
    const bytes = fs.readSync(handle, buffer, 0, maxLogBytes, 0);
    fs.closeSync(handle);
    return buffer.subarray(0, bytes).toString("utf8");
  } catch {
    return "";
  }
}

function safeSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
}

function safeRunId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

function gitTreeSha(commit) {
  return safeSha(git(["rev-parse", `${commit}^{tree}`]));
}
