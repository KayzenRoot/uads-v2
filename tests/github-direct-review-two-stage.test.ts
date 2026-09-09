import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { createGithubReviewIndex, validateGithubReviewIndex } from "../src/github/review-index.js";
import { assertSchema } from "../src/lib/json-schema.js";
import { changedPathsDigest, deriveGitComparison, validateComparison } from "../scripts/github/comparison-runtime.mjs";

const root = process.cwd();
const tempRoots: string[] = [];

afterAll(() => {
  for (const directory of tempRoots) fs.rmSync(directory, { recursive: true, force: true });
});

describe("two-stage GitHub direct review contract", () => {
  it("publishes a schema-valid FAIL receipt when a source gate fails", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "uads-ci-receipt-"));
    tempRoots.push(directory);
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const gates = Object.fromEntries([
      "install", "lint", "typecheck", "build", "action-pins", "tests", "eval-orchestrator", "eval-execution",
      "eval-context", "eval-fault", "eval-cost", "eval-model-routing", "eval-specialist-routing", "eval-adapters", "eval-assurance", "eval-fault-injection", "skills-validation", "validate", "npm-audit", "packaging",
    ].map((id) => [id, id === "tests" ? "failure" : id === "eval-orchestrator" ? "skipped" : "success"]));
    const result = spawnSync(process.execPath, ["scripts/github/generate-ci-gate-receipt.mjs", "--output", path.join(directory, "receipt.json"), "--log-dir", directory], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_REPOSITORY: "KayzenRoot/uads", GITHUB_SHA: sha, GITHUB_RUN_ID: "987654", GITHUB_RUN_ATTEMPT: "2", GITHUB_WORKFLOW: "CI", GITHUB_JOB: "foundation", GITHUB_REF_NAME: "main", GITHUB_EVENT_NAME: "push", UADS_CI_JOB_NAME: "Foundation checks", UADS_CI_GATE_STEPS: JSON.stringify(gates) },
    });
    expect(result.status).toBe(0);
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, "receipt.json"), "utf8"));
    expect(() => assertSchema("ci-gate-receipt.schema.json", receipt, root)).not.toThrow();
    expect(receipt.finalVerdict).toBe("FAIL");
    expect(receipt.requiredGates.find((gate: { id: string }) => gate.id === "tests").outcome).toBe("failure");
    const validation = spawnSync(process.execPath, ["scripts/github/validate-ci-gate-receipt.mjs", "--file", path.join(directory, "receipt.json"), "--expected-sha", sha, "--expected-run-id", "987654", "--expected-run-attempt", "2"], { cwd: root, encoding: "utf8" });
    expect(validation.status).toBe(0);
    const forged = { ...receipt, commitSha: "b".repeat(40) };
    fs.writeFileSync(path.join(directory, "forged.json"), JSON.stringify(forged));
    const forgedResult = spawnSync(process.execPath, ["scripts/github/validate-ci-gate-receipt.mjs", "--file", path.join(directory, "forged.json")], { cwd: root, encoding: "utf8" });
    expect(forgedResult.status).not.toBe(0);
  });

  it("keeps the release index canonical and rejects schema extensions", () => {
    const index = createGithubReviewIndex({
      repository: "KayzenRoot/uads",
      version: "0.8.0",
      commitSha: "a".repeat(40),
      gitTreeSha: "b".repeat(40),
      ciRunId: 1,
      ciRunAttempt: 1,
      directReviewRunId: 2,
      directReviewArtifactName: "uads-direct-review-" + "a".repeat(40),
      directReviewEvidenceSha256: "c".repeat(64),
      codeqlRunId: 3,
      codeqlStatus: "success",
      scorecardRunId: null,
      scorecardStatus: "unavailable",
      releaseRunId: 4,
      tag: "v0.8.0",
      expectedTagTargetSha: "a".repeat(40),
      releaseAssetNames: ["github-review-index.json", "github-direct-review-evidence.json"],
    });
    expect(() => validateGithubReviewIndex(index)).not.toThrow();
    expect(() => assertSchema("github-review-index.schema.json", index, root)).not.toThrow();
    expect(() => validateGithubReviewIndex({ ...index, unexpected: true })).toThrow(/additional/i);
  });

  it("T6 computes an exact comparison from a full-history checkout", () => {
    const fixture = createGitFixture();
    const comparison = deriveGitComparison({ baseSha: fixture.base, headSha: fixture.head, cwd: fixture.directory });
    expect(comparison).toMatchObject({ baseSha: fixture.base, headSha: fixture.head, changedFileCount: 1, changedPaths: ["src/changed.txt"], comparisonStatus: "complete", comparisonReasonCode: null, changedPathsTruncated: false });
    expect(comparison.changedPathsDigest).toBe(changedPathsDigest(["src/changed.txt"]));
    expect(validateComparison(comparison, { expectedHeadSha: fixture.head })).toEqual([]);
  });

  it("T7 recovers a missing push base from the checked-out parent", () => {
    const fixture = createGitFixture();
    const comparison = deriveGitComparison({ baseSha: null, headSha: fixture.head, cwd: fixture.directory });
    expect(comparison.baseSha).toBe(fixture.base);
    expect(comparison.comparisonStatus).toBe("complete");
    expect(comparison.comparisonReasonCode).toBeNull();
  });

  it("T8 reports an explicit reason for an unreachable comparison base", () => {
    const fixture = createGitFixture();
    const comparison = deriveGitComparison({ baseSha: "b".repeat(40), headSha: fixture.head, cwd: fixture.directory });
    expect(comparison.comparisonStatus).toBe("unavailable");
    expect(comparison.comparisonReasonCode).toBe("COMPARISON_BASE_UNREACHABLE");
    expect(validateComparison(comparison, { expectedHeadSha: fixture.head })).toEqual([]);
  });

  it("T9 rejects unsafe or unbounded comparison paths", () => {
    const base = { baseSha: "a".repeat(40), headSha: "b".repeat(40), changedFileCount: 1, changedPaths: ["../secret.txt"], changedPathsDigest: "c".repeat(64), changedPathsTruncated: false, comparisonStatus: "complete", comparisonReasonCode: null };
    expect(validateComparison(base, { expectedHeadSha: base.headSha })).toContain("comparison-paths-invalid");
    expect(validateComparison({ ...base, changedPaths: ["src/ok.txt"], changedFileCount: 1, changedPathsDigest: changedPathsDigest(["src/ok.txt"]) }, { expectedHeadSha: base.headSha })).toEqual([]);
  });

  it("T10 preserves a digest of the complete set when display paths are truncated", () => {
    const allPaths = Array.from({ length: 501 }, (_, index) => `src/file-${String(index).padStart(3, "0")}.ts`);
    const comparison = { baseSha: "a".repeat(40), headSha: "b".repeat(40), changedFileCount: allPaths.length, changedPaths: allPaths.slice(0, 500), changedPathsDigest: changedPathsDigest(allPaths), changedPathsTruncated: true, comparisonStatus: "truncated" as const, comparisonReasonCode: null };
    expect(validateComparison(comparison, { expectedHeadSha: comparison.headSha })).toEqual([]);
    expect(validateComparison({ ...comparison, changedPathsTruncated: false }, { expectedHeadSha: comparison.headSha })).toContain("comparison-truncated-flag-mismatch");
  });
});

function createGitFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "uads-comparison-git-"));
  tempRoots.push(directory);
  git(directory, ["init", "--quiet"]);
  git(directory, ["config", "user.email", "uads-tests@example.invalid"]);
  git(directory, ["config", "user.name", "UADS Tests"]);
  fs.mkdirSync(path.join(directory, "src"), { recursive: true });
  fs.writeFileSync(path.join(directory, "src", "base.txt"), "base\n");
  git(directory, ["add", "."]);
  git(directory, ["commit", "--quiet", "-m", "base"]);
  const base = git(directory, ["rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(directory, "src", "changed.txt"), "changed\n");
  git(directory, ["add", "."]);
  git(directory, ["commit", "--quiet", "-m", "change"]);
  const head = git(directory, ["rev-parse", "HEAD"]);
  return { directory, base, head };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}
