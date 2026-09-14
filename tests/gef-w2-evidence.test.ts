import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildUpir } from "../src/gef/upir.js";
import { collectDiffFacts, posixChangedPaths } from "../src/gef/git-facts.js";
import { normalizeRepoRelativePath } from "../src/gef/upir.js";
import { buildMachineEvidence } from "../src/gef/machine-evidence.js";
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

function packUpir(taskId: string) {
  return buildUpir({
    schemaVersion: "0.1.0",
    taskId,
    projectFingerprint: FINGERPRINT,
    workOrder: "GEF-W2",
    taskClass: "T1",
    contextRadius: "C1",
    baseSha: "0".repeat(40),
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
  });

  it("distinguishes clean committed heads from dirty trees", () => {
    const { repo } = tempRepo();
    const clean = collectDiffFacts(repo, FINGERPRINT);
    expect(clean.dirty).toBe(false);
    expect(clean.worktreeDigest).toBe(null);
    expect(clean.changedFiles).toEqual([]);
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

  it("lets W1 packs invoke only registered deterministic command IDs", () => {
    const { repo } = tempRepo();
    const upir = packUpir("w2-pack-ok");
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
