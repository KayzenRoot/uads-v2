#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { validateReleaseMetadata } = await import("../../dist/release/semver.js");
const { createCiBinding } = await import("../../dist/release/ci-binding.js");
const { assertSchema } = await import("../../dist/lib/json-schema.js");
const { validateDirectReviewEvidence } = await import("../../dist/github/direct-review.js");
const securityProofModule = await import("../../dist/github/security-proof.js");
const { resolveSecurityWorkflowProofs } = await import("../github/security-proof.mjs");

const version = process.argv[2];
if (!version) fail("usage: node scripts/release/verify-release.mjs X.Y.Z [--ci-binding file] [--historical]");
const historical = process.argv.includes("--historical");
const bindingPath = valueOf("--ci-binding");
const directReviewPath = valueOf("--direct-review");
const packageJson = readJson("package.json");
const lockfile = readJson("package-lock.json");
const currentSha = git(["rev-parse", "HEAD"]);
const branch = git(["branch", "--show-current"]);
const originMainSha = remoteMainSha();
const tag = `v${version}`;
const localTagSha = resolveTag(tag);
const remoteTagCommitSha = remoteTagSha(tag);
const tagSha = remoteTagCommitSha ?? localTagSha;

const errors = validateReleaseMetadata({
  version,
  packageVersion: typeof packageJson.version === "string" ? packageJson.version : null,
  versionFile: readText("VERSION"),
  lockfileVersion: typeof lockfile.packages?.[""]?.version === "string" ? lockfile.packages[""].version : null,
  changelog: readText("CHANGELOG.md"),
  branch,
  currentSha,
  originMainSha,
  tagSha,
  historical,
});

if (!historical && !isClean()) errors.push("worktree-not-clean");
if (tagSha && tagSha !== currentSha && !historical) errors.push("release-tag-conflict");
if (tagSha && historical) errors.push("historical-release-requires-explicit-map");

if (!historical) {
  if (!bindingPath) {
    const local = runLocalValidation();
    if (!local) errors.push("local-validation-failed");
  } else if (!verifyCiBinding(bindingPath, currentSha)) {
    errors.push("ci-binding-invalid");
  }
  if (!directReviewPath) {
    errors.push("direct-review-evidence-missing");
  } else if (!verifyDirectReview(directReviewPath, currentSha, version, bindingPath)) {
    errors.push("direct-review-evidence-invalid");
  }
}

const result = {
  ok: errors.length === 0,
  version,
  tag,
  branch,
  currentSha,
  originMainSha,
  localTagSha,
  remoteTagSha: remoteTagCommitSha,
  errors,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exit(1);

function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readText(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function readJson(relative) {
  return JSON.parse(readText(relative));
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function remoteMainSha() {
  const result = spawnSync("git", ["ls-remote", "origin", "refs/heads/main"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim().split(/\s+/)[0] || null;
}

function remoteTagSha(tagName) {
  const result = spawnSync("git", ["ls-remote", "origin", `refs/tags/${tagName}`, `refs/tags/${tagName}^{}`], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const peeled = lines.find((line) => line.endsWith(`refs/tags/${tagName}^{}`));
  return (peeled ?? lines[0])?.split(/\s+/)[0] ?? null;
}

function resolveTag(tagName) {
  const result = spawnSync("git", ["rev-parse", `${tagName}^{commit}`], { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function isClean() {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 && result.stdout.trim().length === 0;
}

function verifyCiBinding(file, expectedSha) {
  try {
    const value = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
    createCiBinding(value, expectedSha, "KayzenRoot/uads");
    return true;
  } catch {
    return false;
  }
}

function verifyDirectReview(file, expectedSha, expectedVersion, bindingFile) {
  try {
    const evidence = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
    assertSchema("github-direct-review-evidence.schema.json", evidence, root);
    if (validateDirectReviewEvidence(evidence, root).length > 0) return false;
    if (evidence.commitSha !== expectedSha || evidence.version !== expectedVersion || evidence.finalVerdict !== "PASS") return false;
    if (bindingFile) {
      const rawBinding = JSON.parse(fs.readFileSync(path.resolve(bindingFile), "utf8"));
      const binding = createCiBinding(rawBinding, expectedSha, "KayzenRoot/uads");
      if (evidence.provenance?.sourceRunId !== binding.runId || (binding.runAttempt && evidence.provenance?.sourceRunAttempt !== binding.runAttempt)) return false;
    }
    if (securityProofModule.isCorrectedReleaseVersion(expectedVersion)) {
      const resolved = resolveSecurityWorkflowProofs({ repository: "KayzenRoot/uads", finalCommitSha: expectedSha });
      const proofErrors = securityProofModule.securityWorkflowAuthorizationErrors({ codeql: resolved.codeql, scorecard: resolved.scorecard, dependencyReview: resolved.dependencyReview }, { repository: "KayzenRoot/uads", finalCommitSha: expectedSha, finalTreeSha: evidence.gitTreeSha });
      if (proofErrors.length > 0) return false;
      for (const [key, status] of [["codeql", resolved.codeql], ["scorecard", resolved.scorecard], ["dependencyReview", resolved.dependencyReview]]) {
        if (status.proof?.proofDigest !== evidence.securityWorkflows?.[key]?.proof?.proofDigest) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function runLocalValidation() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "release:validate"];
  if (directReviewPath) args.push("--", "--direct-review", path.resolve(directReviewPath));
  const result = spawnSync(npm, args, { cwd: root, stdio: "inherit", windowsHide: true });
  return result.status === 0;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
