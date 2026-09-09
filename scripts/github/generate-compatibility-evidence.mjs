#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(valueOf("--output") ?? path.join(process.env.RUNNER_TEMP ?? path.join(root, "tmp"), "uads-compatibility-evidence.json"));
const platform = valueOf("--platform");
const sourceSha = valueOf("--source-sha");
const sourceTreeSha = valueOf("--source-tree-sha");
const checksFile = valueOf("--checks-file");
const repository = process.env.GITHUB_REPOSITORY ?? null;
const status = process.env.UADS_COMPATIBILITY_STATUS;
const actualSha = git(["rev-parse", "HEAD"]);
const actualTreeSha = git(["rev-parse", "HEAD^{tree}"]);
if ((platform !== "linux" && platform !== "windows") || !/^[0-9a-f]{40}$/i.test(sourceSha ?? "")) fail("explicit compatibility source SHA is required");
if (actualSha !== sourceSha.toLowerCase()) fail("checked out HEAD does not match explicit compatibility source SHA");
if (sourceTreeSha && actualTreeSha !== sourceTreeSha.toLowerCase()) fail("checked out tree does not match explicit compatibility source tree SHA");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) fail("compatibility repository identity is incomplete");

const expectedChecks = ["npm-ci", "typecheck-build", "adapter-eval", "isolated-install", "root-resolution", "zero-project-footprint", "privacy-path-assertion"];
const stepChecks = parseObject(process.env.UADS_COMPATIBILITY_CHECKS);
const smokeChecks = checksFile ? readJson(checksFile) : {};
const checks = Object.fromEntries(expectedChecks.map((key) => [key, outcome(smokeChecks[key] ?? stepChecks[key] ?? "unknown")]));
const checkFailures = expectedChecks.filter((key) => checks[key] !== "success");
const reasons = [];
if (checkFailures.length > 0) reasons.push("COMPATIBILITY_CHECK_NOT_SUCCESS");
if (status !== "success") reasons.push("COMPATIBILITY_JOB_NOT_SUCCESS");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 20) reasons.push("NODE_MAJOR_MISMATCH");
const finalOutcome = reasons.length === 0 ? "success" : status === "cancelled" ? "cancelled" : "failure";
const evidence = {
  schema: "uads.compatibility-evidence",
  schemaVersion: "0.2.0",
  repository,
  platform,
  nodeVersion: process.version,
  nodeMajor,
  commitSha: sourceSha.toLowerCase(),
  sourceTreeSha: (sourceTreeSha ?? actualTreeSha)?.toLowerCase() ?? null,
  workflowName: boundedText(process.env.GITHUB_WORKFLOW, 128),
  jobName: boundedText(valueOf("--job-name") ?? process.env.GITHUB_JOB, 128),
  workflowRunId: positive(process.env.GITHUB_RUN_ID),
  workflowRunAttempt: positive(process.env.GITHUB_RUN_ATTEMPT),
  event: boundedText(process.env.GITHUB_EVENT_NAME, 80),
  checks,
  outcome: finalOutcome,
  reasonCodes: [...new Set(reasons)].sort(),
  evidenceDigest: "",
};
evidence.evidenceDigest = crypto.createHash("sha256").update(JSON.stringify({ ...evidence, evidenceDigest: "" })).digest("hex");
try {
  const { assertSchema } = await import("../../dist/lib/json-schema.js");
  assertSchema("compatibility-evidence.schema.json", evidence, root);
} catch (error) { fail(error instanceof Error ? error.message : String(error)); }
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(evidence)}\n`);

function valueOf(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function positive(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function outcome(value) { return ["success", "failure", "cancelled", "skipped", "unknown"].includes(value) ? value : "unknown"; }
function boundedText(value, max) { return typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : null; }
function parseObject(value) { try { const parsed = JSON.parse(value ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function readJson(file) { try { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); } catch { return {}; } }
function git(args) { try { return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10000 }).trim().toLowerCase(); } catch { return null; } }
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
