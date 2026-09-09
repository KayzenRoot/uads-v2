#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { REPOSITORY_DESCRIPTION, REPOSITORY_LABELS, REPOSITORY_TOPICS, MAIN_PROTECTION } from "../../dist/release/github-config.js";

const repo = valueOf("--repo") ?? "KayzenRoot/uads";
const result = { repo, applied: [], limitations: [], errors: [] };

const auth = spawnSync("gh", ["auth", "status"], { encoding: "utf8", windowsHide: true, stdio: "ignore" });
if (auth.status !== 0) fail("gh authentication is unavailable");
const currentResponse = ghJson(`repos/${repo}`);
const current = currentResponse.value;
if (current?.full_name !== repo || current?.permissions?.admin !== true) {
  result.limitations.push("BLOCKED_BY_GITHUB_PERMISSION");
  result.errors.push("authenticated account is not an administrator of the target repository");
  emit(result, 1);
}

apply("metadata", () => ghJson(`repos/${repo}`, "PATCH", {
  description: REPOSITORY_DESCRIPTION,
  homepage: current.homepage ?? "https://github.com/KayzenRoot/uads",
  has_issues: true,
  has_projects: current.has_projects,
  has_wiki: false,
  has_discussions: true,
}));
apply("topics", () => ghJson(`repos/${repo}/topics`, "PUT", { names: [...REPOSITORY_TOPICS] }));

for (const label of REPOSITORY_LABELS) {
  apply(`label:${label.name}`, () => ghCommand(["label", "create", label.name, "--repo", repo, "--color", label.color, "--description", label.description, "--force"]));
}

apply("main-protection", () => ghJson(`repos/${repo}/branches/main/protection`, "PUT", MAIN_PROTECTION));
apply("dependabot-security-updates", () => ghJson(`repos/${repo}/automated-security-fixes`, "PATCH", { enable: true }));
apply("private-vulnerability-reporting", () => ghJson(`repos/${repo}/private-vulnerability-reporting`, "PATCH", { enabled: true }));
apply("security-and-analysis", () => ghJson(`repos/${repo}`, "PATCH", {
  security_and_analysis: {
    secret_scanning: { status: "enabled" },
    secret_scanning_push_protection: { status: "enabled" },
  },
}));

const verified = {
  repository: ghJson(`repos/${repo}`).value,
  topics: ghJson(`repos/${repo}/topics`).value,
  protection: ghJson(`repos/${repo}/branches/main/protection`).value,
  security: optionalGhJson(`repos/${repo}/security-and-analysis`),
  automatedSecurityFixes: optionalGhJson(`repos/${repo}/automated-security-fixes`),
  privateVulnerabilityReporting: optionalGhJson(`repos/${repo}/private-vulnerability-reporting`),
};
result.verified = sanitize(verified);
emit(result, result.errors.length > 0 ? 1 : 0);

function apply(name, operation) {
  const response = operation();
  if (response.ok) result.applied.push(name);
  else result.limitations.push(`${name}:${response.reason}`);
}

function ghJson(endpoint, method = "GET", body) {
  const args = ["api", endpoint];
  if (method !== "GET") args.push("--method", method, "--input", "-");
  const response = spawnSync("gh", args, {
    encoding: "utf8",
    input: body === undefined ? undefined : JSON.stringify(body),
    windowsHide: true,
  });
  if (response.status !== 0) return { ok: false, reason: `github-api-${response.status ?? "unknown"}` };
  try {
    return { ok: true, value: JSON.parse(response.stdout) };
  } catch {
    return { ok: true, value: response.stdout.trim() };
  }
}

function optionalGhJson(endpoint) {
  const response = ghJson(endpoint);
  return response.ok ? response.value : { status: "unavailable", reason: response.reason };
}

function ghCommand(args) {
  const response = spawnSync("gh", args, { encoding: "utf8", windowsHide: true, stdio: "ignore" });
  return response.status === 0 ? { ok: true } : { ok: false, reason: `github-command-${response.status ?? "unknown"}` };
}

function sanitize(value) {
  const text = JSON.stringify(value);
  return JSON.parse(text.replace(/gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}/g, "[REDACTED:TOKEN]"));
}

function emit(value, code) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(code);
}

function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
