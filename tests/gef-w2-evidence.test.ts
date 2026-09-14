import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildUpir } from "../src/gef/upir.js";
import { sha256Hex } from "../src/lib/hash.js";
import { collectDiffFacts, posixChangedPaths } from "../src/gef/git-facts.js";
import { normalizeRepoRelativePath } from "../src/gef/upir.js";
import { buildWorkReceipt } from "../src/gef/command-receipt.js";
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
