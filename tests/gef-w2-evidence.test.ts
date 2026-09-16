import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildUpir } from "../src/gef/upir.js";
import { sha256Hex } from "../src/lib/hash.js";
import { collectDiffFacts, posixChangedPaths, type GitRunner } from "../src/gef/git-facts.js";
import { normalizeRepoRelativePath } from "../src/gef/upir.js";
import { buildWorkReceipt, verifyWorkReceipt } from "../src/gef/command-receipt.js";
import { getCommandContract } from "../src/gef/command-contract.js";
import { buildMachineEvidence, evidenceDigestMaterial, verifyMachineEvidence } from "../src/gef/machine-evidence.js";
import { canonicalDigest } from "../src/gef/upir.js";
import { renderEvidenceReport } from "../src/gef/evidence-report.js";
import { runWorkForPack, runWorkPlane } from "../src/gef/work-plane.js";
import { runGefCacheInspect, runGefCachePrune, runGefCommandList, runGefCommandRun, runGefEvidenceBuild, runGefEvidenceReport, runGefReceiptShow, runGefWorkFacts } from "../src/commands/gef-work.js";

const FINGERPRINT = "d".repeat(64);

function tempRepo(): { repo: string; home: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-ev-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-evidence.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "a.ts"), `export const a = 1;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "fixture"], { cwd: repo });
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-ev-home-")) };
}

function committedFixture(): { repo: string; home: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-committed-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-committed.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "keep.ts"), `export const k = 1;\n`);
  fs.writeFileSync(path.join(repo, "change.ts"), `export const c = 1;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "A"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "change.ts"), `export const c = 2;\n`);
  fs.writeFileSync(path.join(repo, "added.ts"), `export const n = 1;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "B"], { cwd: repo });
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-committed-home-")) };
}

function committedRenameFixture(): { repo: string; home: string; baseA: string; headB: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-rename-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-rename.git"], { cwd: repo });
  const body = Array.from({ length: 30 }, (_, index) => `export const v${index} = ${index};\n`).join("");
  fs.writeFileSync(path.join(repo, "before.ts"), body);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "A"], { cwd: repo });
  const baseA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  execFileSync("git", ["mv", "before.ts", "after.ts"], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "B"], { cwd: repo });
  const headB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-rename-home-")), baseA, headB };
}

function committedCopyFixture(): { repo: string; home: string; baseA: string; headB: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-copy-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-copy.git"], { cwd: repo });
  const body = Array.from({ length: 60 }, (_, index) => `export const c${index} = ${index};\n`).join("");
  fs.writeFileSync(path.join(repo, "orig.ts"), body);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "A"], { cwd: repo });
  const baseA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(repo, "orig.ts"), `${body}export const extra = 1;\n`);
  fs.writeFileSync(path.join(repo, "copy-of-orig.ts"), body);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "B"], { cwd: repo });
  const headB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-copy-home-")), baseA, headB };
}

function divergentHistoryFixture(): { repo: string; home: string; siblingBase: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-divergent-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-divergent.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "root.ts"), `export const r = 1;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "A"], { cwd: repo });
  execFileSync("git", ["checkout", "-b", "sibling"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "sib.ts"), `export const s = 1;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "S"], { cwd: repo });
  const siblingBase = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  execFileSync("git", ["checkout", "main"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "root.ts"), `export const r = 2;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "B"], { cwd: repo });
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-divergent-home-")), siblingBase };
}

function nestedRenameFixture(): { repo: string; home: string; baseA: string; headB: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-nested-rename-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-nested-rename.git"], { cwd: repo });
  fs.mkdirSync(path.join(repo, "src", "old"), { recursive: true });
  const body = Array.from({ length: 24 }, (_, index) => `line${index + 1}\n`).join("");
  fs.writeFileSync(path.join(repo, "src", "old", "file.ts"), body);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "A"], { cwd: repo });
  const baseA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  fs.mkdirSync(path.join(repo, "src", "new"), { recursive: true });
  execFileSync("git", ["mv", "src/old/file.ts", "src/new/file.ts"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "src", "new", "file.ts"), `${body}extra1\nextra2\nextra3\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "B"], { cwd: repo });
  const headB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-nested-rename-home-")), baseA, headB };
}

function nestedCopyFixture(): { repo: string; home: string; baseA: string; headB: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-nested-copy-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-nested-copy.git"], { cwd: repo });
  fs.mkdirSync(path.join(repo, "src", "orig"), { recursive: true });
  const body = Array.from({ length: 60 }, (_, index) => `export const c${index} = ${index};\n`).join("");
  fs.writeFileSync(path.join(repo, "src", "orig", "big.ts"), body);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "A"], { cwd: repo });
  const baseA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(repo, "src", "orig", "big.ts"), `${body}export const extra = 1;\n`);
  fs.mkdirSync(path.join(repo, "src", "copy"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "copy", "big.ts"), body);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "B"], { cwd: repo });
  const headB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-nested-copy-home-")), baseA, headB };
}

function corruptIndexFixture(): { repo: string; home: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-corrupt-index-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-corrupt-index.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "a.ts"), `export const a = 1;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "fixture"], { cwd: repo });
  // A real non-zero `git status`/`git diff` without shell tricks: Git refuses to
  // read a corrupt index (exit 128) while `rev-parse HEAD` still succeeds.
  fs.writeFileSync(path.join(repo, ".git", "index"), "corrupt-index-not-a-real-index");
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-corrupt-index-home-")) };
}

// Delegate the injected seam to the real Git binary so only the targeted
// subcommand is forced to fail.
const delegateGitRunner: GitRunner = (repoRoot, args) => {
  const result = spawnSync("git", args, { cwd: repoRoot, shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { stdout: (result.stdout ?? Buffer.alloc(0)) as Buffer, status: result.status ?? 1 };
};

function failingGitSubcommand(subcommand: string): GitRunner {
  return (repoRoot, args) => (args[0] === subcommand ? { stdout: Buffer.alloc(0), status: 128 } : delegateGitRunner(repoRoot, args));
}

function captureGitFailure(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a Git fact failure");
}

function packUpir(taskId: string, baseSha?: string) {
  return buildUpir({
    schemaVersion: "0.1.0",
    taskId,
    projectFingerprint: FINGERPRINT,
    workOrder: "GEF-W2",
    taskClass: "T1",
    contextRadius: "C1",
    baseSha: baseSha ?? "0".repeat(40),
    reviewedHeadSha: null,
    goal: "evidence pack check",
    acceptedFindings: [],
    openFindings: [],
    targetSymbols: ["a"],
    frozenInvariants: ["Global-first / zero-project-footprint is mandatory."],
    requiredProofs: ["gef.work.git.facts"],
    budgets: { maxRepositorySearches: 12, maxExtraFilesOpened: 16, maxSourceFilesChanged: 8, maxTestFilesChanged: 4, maxSemanticLOC: 800, retryBudget: 1, targetInputTokens: null, targetOutputTokens: null, targetActiveSeconds: null },
    stopConditions: ["STOP at COMPLETE_CANDIDATE."],
  });
}

describe("GEF W2 git facts, evidence and pack integration", () => {
  it("handles rename, unicode, space and binary changed paths deterministically", () => {
    const { repo } = tempRepo();
    execFileSync("git", ["mv", "a.ts", "renamed-a.ts"], { cwd: repo });
    fs.writeFileSync(path.join(repo, "ünïcode-ﬁle.ts"), `export const u = 1;\n`);
    fs.writeFileSync(path.join(repo, "my module.ts"), `export const s = 1;\n`);
    fs.writeFileSync(path.join(repo, "blob.bin"), Buffer.from([0, 1, 2, 255, 254, 0, 17]));
    const first = collectDiffFacts(repo, FINGERPRINT);
    const second = collectDiffFacts(repo, FINGERPRINT);
    expect(first.factsDigest).toBe(second.factsDigest);
    expect(first.dirty).toBe(true);
    const paths = posixChangedPaths(first);
    expect(paths).toContain("renamed-a.ts");
    expect(paths).toContain("ünïcode-ﬁle.ts");
    expect(paths).toContain("my module.ts");
    expect(paths).toContain("blob.bin");
    expect(paths.every((item) => !item.includes("\\"))).toBe(true);
    const binary = first.changedFiles.find((item) => item.path === "blob.bin");
    expect(binary?.binary).toBe(true);
    expect(binary?.digest).toMatch(/^[a-f0-9]{64}$/);
    const renamed = first.changedFiles.find((item) => item.path === "renamed-a.ts");
    expect(renamed?.status).toBe("renamed");
    expect(renamed?.previousPath).toBe("a.ts");
    expect(first.changedFiles).toHaveLength(4);
    expect(first.changedFiles.some((item) => item.path === "a.ts")).toBe(false);
    const renamedBytes = fs.readFileSync(path.join(repo, "renamed-a.ts"));
    expect(renamed?.digest).toBe(sha256Hex(renamedBytes));
  });

  it("distinguishes clean committed heads from dirty trees", () => {
    const { repo } = tempRepo();
    const clean = collectDiffFacts(repo, FINGERPRINT);
    expect(clean.dirty).toBe(false);
    expect(clean.worktreeDigest).toBe(null);
    expect(clean.changedFiles).toEqual([]);
  });

  it("reports the exact committed base-to-head delta on a clean candidate", () => {
    const { repo } = committedFixture();
    const headB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const baseA = execFileSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf8" }).trim();
    const facts = collectDiffFacts(repo, FINGERPRINT, baseA);
    expect(facts.dirty).toBe(false);
    expect(facts.headSha).toBe(headB);
    expect(facts.baseSha).toBe(baseA);
    expect(facts.worktreeDigest).toBe(null);
    expect(facts.changedFiles.map((item) => `${item.path}:${item.status}`)).toEqual(["added.ts:added", "change.ts:modified"]);
  });

  it("reports committed renames with the destination path and source previousPath", () => {
    const { repo, baseA, headB } = committedRenameFixture();
    const facts = collectDiffFacts(repo, FINGERPRINT, baseA);
    expect(facts.dirty).toBe(false);
    expect(facts.headSha).toBe(headB);
    expect(facts.baseSha).toBe(baseA);
    expect(facts.worktreeDigest).toBe(null);
    expect(facts.changedFiles).toHaveLength(1);
    const renamed = facts.changedFiles[0];
    expect(renamed?.path).toBe("after.ts");
    expect(renamed?.status).toBe("renamed");
    expect(renamed?.previousPath).toBe("before.ts");
    expect(facts.changedFiles.some((item) => item.path === "before.ts")).toBe(false);
    expect(renamed?.digest).toBe(sha256Hex(fs.readFileSync(path.join(repo, "after.ts"))));
  });

  it("reports committed copies with the destination path and source previousPath", () => {
    const { repo, baseA } = committedCopyFixture();
    const facts = collectDiffFacts(repo, FINGERPRINT, baseA);
    expect(facts.dirty).toBe(false);
    const copied = facts.changedFiles.find((item) => item.path === "copy-of-orig.ts");
    expect(copied?.status).toBe("copied");
    expect(copied?.previousPath).toBe("orig.ts");
    expect(facts.changedFiles.some((item) => item.path === "orig.ts" && item.status === "copied")).toBe(false);
    expect(facts.changedFiles).toHaveLength(2);
    expect(copied?.digest).toBe(sha256Hex(fs.readFileSync(path.join(repo, "copy-of-orig.ts"))));
  });

  it("fails closed on an existing but divergent base that is not an ancestor of HEAD", () => {
    const { repo, siblingBase } = divergentHistoryFixture();
    expect(() => collectDiffFacts(repo, FINGERPRINT, siblingBase)).toThrow("DIFF_BASE_NOT_ANCESTOR");
  });

  it("maps nested-directory rename numstat to the destination path exactly", () => {
    const { repo, baseA, headB } = nestedRenameFixture();
    const facts = collectDiffFacts(repo, FINGERPRINT, baseA);
    expect(facts.dirty).toBe(false);
    expect(facts.headSha).toBe(headB);
    expect(facts.changedFiles).toHaveLength(1);
    const renamed = facts.changedFiles[0];
    expect(renamed?.path).toBe("src/new/file.ts");
    expect(renamed?.status).toBe("renamed");
    expect(renamed?.previousPath).toBe("src/old/file.ts");
    expect(facts.changedFiles.some((item) => item.path === "src/old/file.ts")).toBe(false);
    expect(renamed?.insertions).toBe(3);
    expect(renamed?.deletions).toBe(0);
    expect(renamed?.binary).toBe(false);
    expect(renamed?.digest).toBe(sha256Hex(fs.readFileSync(path.join(repo, "src", "new", "file.ts"))));
  });

  it("maps nested-directory copy numstat to the destination path exactly", () => {
    const { repo, baseA } = nestedCopyFixture();
    const facts = collectDiffFacts(repo, FINGERPRINT, baseA);
    expect(facts.dirty).toBe(false);
    expect(facts.changedFiles).toHaveLength(2);
    const copied = facts.changedFiles.find((item) => item.path === "src/copy/big.ts");
    expect(copied?.status).toBe("copied");
    expect(copied?.previousPath).toBe("src/orig/big.ts");
    expect(copied?.insertions).toBe(0);
    expect(copied?.deletions).toBe(0);
    expect(copied?.binary).toBe(false);
    expect(copied?.digest).toBe(sha256Hex(fs.readFileSync(path.join(repo, "src", "copy", "big.ts"))));
    const modified = facts.changedFiles.find((item) => item.path === "src/orig/big.ts");
    expect(modified?.status).toBe("modified");
    expect(modified?.insertions).toBe(1);
    expect(facts.changedFiles.some((item) => item.path === "src/orig/big.ts" && item.status === "copied")).toBe(false);
  });

  it("fails closed instead of silently truncating facts past the file limit", () => {
    const { repo } = tempRepo();
    fs.writeFileSync(path.join(repo, "extra-a.ts"), `export const ea = 1;\n`);
    fs.writeFileSync(path.join(repo, "extra-b.ts"), `export const eb = 1;\n`);
    fs.writeFileSync(path.join(repo, "extra-c.ts"), `export const ec = 1;\n`);
    expect(() => collectDiffFacts(repo, FINGERPRINT, undefined, { maxFiles: 2 })).toThrow("DIFF_FILE_LIMIT_EXCEEDED");
    const facts = collectDiffFacts(repo, FINGERPRINT, undefined, { maxFiles: 50 });
    expect(facts.changedFiles.map((item) => item.path)).toEqual(["extra-a.ts", "extra-b.ts", "extra-c.ts"]);
  });

  it("fails closed when committed and dirty sets jointly exceed the file limit", () => {
    const { repo } = committedFixture();
    const baseA = execFileSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf8" }).trim();
    fs.writeFileSync(path.join(repo, "local-a.ts"), `export const la = 1;\n`);
    fs.writeFileSync(path.join(repo, "local-b.ts"), `export const lb = 1;\n`);
    fs.writeFileSync(path.join(repo, "local-c.ts"), `export const lc = 1;\n`);
    expect(() => collectDiffFacts(repo, FINGERPRINT, baseA, { maxFiles: 4 })).toThrow("DIFF_FILE_LIMIT_EXCEEDED");
  });

  it("verifies task-B machine evidence built from a rebound cache HIT receipt", () => {
    const { repo, home } = tempRepo();
    const first = runWorkPlane({ taskId: "w2-plane-a", workOrder: "GEF-W2", commandIds: ["gef.test.probe"], cwd: repo, uadsHome: home, allowTestOnly: true });
    expect(first.receipts[0]?.source).toBe("EXECUTED");
    const second = runWorkPlane({ taskId: "w2-plane-b", workOrder: "GEF-W2", commandIds: ["gef.test.probe"], cwd: repo, uadsHome: home, allowTestOnly: true });
    const hit = second.receipts[0];
    expect(second.receipts).toHaveLength(1);
    expect(hit?.source).toBe("CACHE_HIT");
    expect(hit?.taskId).toBe("w2-plane-b");
    expect(verifyWorkReceipt(hit).ok).toBe(true);
    expect(verifyMachineEvidence(second.evidence, second.evidence.projectFingerprint, "w2-plane-b").ok).toBe(true);
    expect(second.report).toContain("w2-plane-b");
    expect(second.terminalState).toBe("COMPLETE_CANDIDATE");
  });

  it("preserves the committed delta under a dirty overlay with its own digest", () => {
    const { repo } = committedFixture();
    const baseA = execFileSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf8" }).trim();
    fs.writeFileSync(path.join(repo, "local.ts"), `export const l = 1;\n`);
    const facts = collectDiffFacts(repo, FINGERPRINT, baseA);
    expect(facts.dirty).toBe(true);
    expect(facts.worktreeDigest).not.toBe(null);
    expect(facts.changedFiles.map((item) => item.path)).toEqual(["added.ts", "change.ts", "local.ts"]);
  });

  it("fails closed on invalid or unreachable base without HEAD substitution", () => {
    const { repo } = committedFixture();
    expect(() => collectDiffFacts(repo, FINGERPRINT, "0".repeat(40))).toThrow("DIFF_BASE_UNAVAILABLE");
    expect(() => collectDiffFacts(repo, FINGERPRINT, "not-a-sha")).toThrow("DIFF_BASE_UNAVAILABLE");
  });

  it("fails closed on a non-zero authoritative Git command without producing facts", () => {
    const { repo, home } = corruptIndexFixture();
    let facts: unknown;
    const message = captureGitFailure(() => {
      facts = collectDiffFacts(repo, FINGERPRINT);
      return facts;
    });
    // Bounded identity: no raw stderr, no host path, no arbitrary command text.
    expect(message).toBe("GIT_FACTS_COMMAND_FAILED:status");
    expect(message).not.toContain(os.tmpdir());
    expect(message).not.toContain(repo);
    expect(facts).toBeUndefined();

    let evidence: unknown;
    const planeFailure = captureGitFailure(() => {
      evidence = runWorkPlane({ taskId: "w2-git-failure", cwd: repo, uadsHome: home, commandIds: ["gef.work.git.facts"] });
      return evidence;
    });
    expect(planeFailure).toBe("GIT_FACTS_COMMAND_FAILED:status");
    expect(evidence).toBeUndefined();
  });

  it("fails closed when a committed or dirty diff command exits non-zero", () => {
    const { repo: renameRepo, baseA } = committedRenameFixture();
    // Control: the same basis with the real runner yields committed facts.
    const control = collectDiffFacts(renameRepo, FINGERPRINT, baseA);
    expect(control.headSha).toBeTruthy();
    expect(control.changedFiles.map((item) => item.path)).toEqual(["after.ts"]);
    expect(captureGitFailure(() => collectDiffFacts(renameRepo, FINGERPRINT, baseA, { gitRunner: failingGitSubcommand("diff") }))).toBe(
      "GIT_FACTS_COMMAND_FAILED:diff",
    );

    const { repo: dirtyRepo } = tempRepo();
    fs.writeFileSync(path.join(dirtyRepo, "a.ts"), `export const a = 2;\n`);
    expect(collectDiffFacts(dirtyRepo, FINGERPRINT).dirty).toBe(true);
    expect(captureGitFailure(() => collectDiffFacts(dirtyRepo, FINGERPRINT, undefined, { gitRunner: failingGitSubcommand("diff") }))).toBe(
      "GIT_FACTS_COMMAND_FAILED:diff",
    );
    expect(captureGitFailure(() => collectDiffFacts(dirtyRepo, FINGERPRINT, undefined, { gitRunner: failingGitSubcommand("status") }))).toBe(
      "GIT_FACTS_COMMAND_FAILED:status",
    );
  });

  it("keeps operational Git errors distinguishable from the NOT_ANCESTOR semantic", () => {
    const { repo, siblingBase } = divergentHistoryFixture();
    expect(captureGitFailure(() => collectDiffFacts(repo, FINGERPRINT, siblingBase))).toMatch(/^DIFF_BASE_NOT_ANCESTOR:/);
    expect(captureGitFailure(() => collectDiffFacts(repo, FINGERPRINT, siblingBase, { gitRunner: failingGitSubcommand("merge-base") }))).toBe(
      "GIT_FACTS_COMMAND_FAILED:merge-base",
    );
  });

  it("builds deterministic machine evidence digests", () => {
    const { repo } = tempRepo();
    const facts = collectDiffFacts(repo, FINGERPRINT);
    const input = { projectFingerprint: FINGERPRINT, taskId: "w2-det", workOrder: "GEF-W2", facts, receipts: [], localValidation: { typecheck: "NOT_RUN" as const }, knownDebt: ["debt-a"] };
    expect(buildMachineEvidence(input).evidenceDigest).toBe(buildMachineEvidence(input).evidenceDigest);
  });

  it("renders human reports only from machine evidence", () => {
    const { repo } = tempRepo();
    const evidence = buildMachineEvidence({ projectFingerprint: FINGERPRINT, taskId: "w2-report", workOrder: "GEF-W2", facts: collectDiffFacts(repo, FINGERPRINT), receipts: [], localValidation: { typecheck: "NOT_RUN" }, knownDebt: [] });
    const report = renderEvidenceReport(evidence);
    expect(report).toContain("w2-report");
    expect(report).toContain("NOT_RUN");
    expect(report).toContain(evidence.evidenceDigest);
    expect(report).not.toContain("APPROVED");
    expect(report).not.toContain("token savings");
  });

  it("keeps NOT_RUN as NOT_RUN and never fabricates PASS", () => {
    const { repo } = tempRepo();
    const evidence = buildMachineEvidence({ projectFingerprint: FINGERPRINT, taskId: "w2-notrun", workOrder: "GEF-W2", facts: null, receipts: [], localValidation: { hostedA3: "NOT_RUN" }, knownDebt: [] });
    expect(evidence.localValidation.hostedA3).toBe("NOT_RUN");
    expect(evidence.headSha).toBe(null);
    expect(renderEvidenceReport(evidence)).toContain("NOT_RUN");
  });

  it("rejects every tampered machine evidence field", () => {
    const { repo } = tempRepo();
    const evidence = buildMachineEvidence({ projectFingerprint: FINGERPRINT, taskId: "w2-tamper-ev", workOrder: "GEF-W2", facts: collectDiffFacts(repo, FINGERPRINT), receipts: [], localValidation: { typecheck: "PASS" }, knownDebt: ["debt-a"] });
    expect(verifyMachineEvidence(evidence, FINGERPRINT, "w2-tamper-ev").ok).toBe(true);
    expect(verifyMachineEvidence({ ...evidence, terminalState: "BLOCKED" }).ok).toBe(false);
    expect(verifyMachineEvidence({ ...evidence, localValidation: { typecheck: "FAIL" } }).ok).toBe(false);
    expect(verifyMachineEvidence({ ...evidence, changedFiles: [...evidence.changedFiles, "forged.ts"] }).ok).toBe(false);
    expect(verifyMachineEvidence({ ...evidence, knownDebt: [] }).ok).toBe(false);
    expect(verifyMachineEvidence({ ...evidence, evidenceDigest: "0".repeat(64) }).ok).toBe(false);
    expect(verifyMachineEvidence(evidence, "1".repeat(64), "w2-tamper-ev").ok).toBe(false);
    expect(verifyMachineEvidence(evidence, FINGERPRINT, "other-task").ok).toBe(false);
    expect(verifyMachineEvidence({ ...evidence, commandReceipts: [{ forged: true }] }).ok).toBe(false);
  });

  it("rejects receipt outcome tampering inside machine evidence", () => {
    const contract = getCommandContract("gef.test.probe", { allowTestOnly: true });
    const receipt = buildWorkReceipt({
      projectFingerprint: FINGERPRINT,
      taskId: "w2-tamper-rcpt",
      contract,
      validityFingerprint: "a".repeat(64),
      source: "EXECUTED",
      result: { exitCode: 0, signal: null, timedOut: false, durationMs: 5, stdoutBytes: 12, stderrBytes: 0, stdoutTruncated: false, stderrTruncated: false, stdoutHead: "gef-probe-ok", stderrHead: "", outcome: "PASS" },
    });
    const evidence = buildMachineEvidence({ projectFingerprint: FINGERPRINT, taskId: "w2-tamper-rcpt", workOrder: "GEF-W2", facts: null, receipts: [receipt], localValidation: {}, knownDebt: [] });
    expect(verifyMachineEvidence(evidence, FINGERPRINT, "w2-tamper-rcpt").ok).toBe(true);
    expect(verifyMachineEvidence({ ...evidence, commandReceipts: [{ ...receipt, outcome: "FAIL" as const }] }).ok).toBe(false);
  });

  it("rejects nested tampering even when the outer digest is recomputed", () => {
    const contract = getCommandContract("gef.test.probe", { allowTestOnly: true });
    const receipt = buildWorkReceipt({
      projectFingerprint: FINGERPRINT,
      taskId: "w2-nested-recompute",
      contract,
      validityFingerprint: "b".repeat(64),
      source: "EXECUTED",
      result: { exitCode: 0, signal: null, timedOut: false, durationMs: 5, stdoutBytes: 12, stderrBytes: 0, stdoutTruncated: false, stderrTruncated: false, stdoutHead: "gef-probe-ok", stderrHead: "", outcome: "PASS" },
    });
    const evidence = buildMachineEvidence({ projectFingerprint: FINGERPRINT, taskId: "w2-nested-recompute", workOrder: "GEF-W2", facts: null, receipts: [receipt], localValidation: {}, knownDebt: [] });
    const tampered = { ...evidence, commandReceipts: [{ ...receipt, outcome: "FAIL" as const }] };
    const repackaged = { ...tampered, evidenceDigest: canonicalDigest(evidenceDigestMaterial(tampered)) };
    expect(verifyMachineEvidence(repackaged, FINGERPRINT, "w2-nested-recompute").ok).toBe(false);
    expect(verifyMachineEvidence(repackaged).ok).toBe(false);
  });

  it("rejects nested receipts bound to another project or task", () => {
    const contract = getCommandContract("gef.test.probe", { allowTestOnly: true });
    const foreign = buildWorkReceipt({
      projectFingerprint: "1".repeat(64),
      taskId: "foreign-task",
      contract,
      validityFingerprint: "c".repeat(64),
      source: "EXECUTED",
      result: { exitCode: 0, signal: null, timedOut: false, durationMs: 5, stdoutBytes: 12, stderrBytes: 0, stdoutTruncated: false, stderrTruncated: false, stdoutHead: "gef-probe-ok", stderrHead: "", outcome: "PASS" },
    });
    const evidence = buildMachineEvidence({ projectFingerprint: FINGERPRINT, taskId: "w2-nested-bind", workOrder: "GEF-W2", facts: null, receipts: [foreign], localValidation: {}, knownDebt: [] });
    expect(verifyMachineEvidence(evidence, FINGERPRINT, "w2-nested-bind").ok).toBe(false);
  });

  it("fails closed when persisted evidence is tampered before report", () => {
    const { repo, home } = tempRepo();
    process.env.UADS_HOME = home;
    try {
      JSON.parse(runGefEvidenceBuild("w2-ev-tamper", { cwd: repo, json: true, commands: "" }));
      const projects = path.join(home, "gef", "projects");
      const projectDir = fs.readdirSync(projects).map((name) => path.join(projects, name)).find((candidate) => fs.existsSync(path.join(candidate, "w2-evidence", "w2-ev-tamper.json")));
      expect(projectDir).toBeDefined();
      const target = path.join(projectDir as string, "w2-evidence", "w2-ev-tamper.json");
      const stored = JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, unknown>;
      stored.terminalState = "BLOCKED";
      fs.writeFileSync(target, `${JSON.stringify(stored)}\n`);
      expect(() => runGefEvidenceReport("w2-ev-tamper", { cwd: repo, format: "md" })).toThrow("W2_EVIDENCE_CORRUPT");
    } finally {
      delete process.env.UADS_HOME;
    }
  });

  it("lets W1 packs invoke only registered deterministic command IDs", () => {
    const { repo } = tempRepo();
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const upir = packUpir("w2-pack-ok", head);
    const result = runWorkForPack({ upir, commandIds: ["gef.work.git.facts"], cwd: repo, uadsHome: tempRepo().home });
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]?.outcome).toBe("PASS");
    expect(result.terminalState).toBe("COMPLETE_CANDIDATE");
    expect(() => runWorkForPack({ upir, commandIds: ["gef.evil.unknown"], cwd: repo })).toThrow("PACK_COMMAND_UNKNOWN");
    expect(() => runWorkForPack({ upir, commandIds: ["gef.test.probe"], cwd: repo })).toThrow("PACK_COMMAND_UNKNOWN");
  });

  it("keeps Windows and Linux path normalization deterministic", () => {
    expect(normalizeRepoRelativePath("src\\gef\\work-plane.ts")).toBe("src/gef/work-plane.ts");
    expect(normalizeRepoRelativePath("src/gef/work-plane.ts")).toBe("src/gef/work-plane.ts");
  });

  it("exposes structured CLI surfaces with zero project footprint", () => {
    const { repo, home } = tempRepo();
    process.env.UADS_HOME = home;
    try {
      expect(JSON.parse(runGefWorkFacts(undefined, { cwd: repo, json: true })).zeroProjectFootprint).toBe(true);
      expect(JSON.parse(runGefCommandList({ json: true })).contracts.length).toBeGreaterThan(0);
      const built = JSON.parse(runGefEvidenceBuild("w2-cli", { cwd: repo, json: true, commands: "" }));
      expect(built.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
      const report = runGefEvidenceReport("w2-cli", { cwd: repo, format: "md" });
      expect(report).toContain("w2-cli");
      expect(JSON.parse(runGefCacheInspect({ kind: "command", json: true })).kind).toBe("command");
      expect(JSON.parse(runGefCachePrune({ kind: "command", dryRun: true, json: true })).dryRun).toBe(true);
      const ran = JSON.parse(runGefCommandRun("gef.work.git.facts", "w2-cli", { cwd: repo, json: true }));
      expect(["HIT", "MISS"]).toContain(ran.cacheStatus);
      expect(["EXECUTED", "CACHE_HIT"]).toContain(ran.source);
      const shown = JSON.parse(runGefReceiptShow(ran.receiptDigest, { cwd: repo, json: true }));
      expect(shown.receiptDigest).toBe(ran.receiptDigest);
      expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
    } finally {
      delete process.env.UADS_HOME;
    }
    void runWorkPlane;
    void execSync;
  });
});
