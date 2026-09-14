import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { getCommandContract, listCommandContracts } from "../src/gef/command-contract.js";
import { resolveToolchainBasis, runCommandContract, timeoutTreeCleanupKind } from "../src/gef/command-runner.js";
import { buildWorkReceipt, computeValidityFingerprint, verifyWorkReceipt, type ValidityBasis } from "../src/gef/command-receipt.js";
import { commandCacheLookup, commandCacheStore } from "../src/gef/command-cache.js";
import { collectDiffFacts } from "../src/gef/git-facts.js";
import { runWorkCommand, isPositiveCacheOutcome } from "../src/gef/work-plane.js";
import { sha256Hex } from "../src/lib/hash.js";

const SECRET_FIXTURE = `ghp_${"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd"}`;

afterEach(() => {
  if (process.env.UADS_HOME === undefined) return;
});

function tempRepo(): { repo: string; home: string; fingerprint: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-repo-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w2-fixture.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "a.ts"), `export const a = 1;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "fixture"], { cwd: repo });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-home-"));
  const facts = collectDiffFacts(repo, "c".repeat(64));
  void facts;
  return { repo, home, fingerprint: "c".repeat(64) };
}

function validityFor(fingerprint: string, worktreeDigest: string, extra: Partial<ValidityBasis> = {}): ValidityBasis {
  return {
    projectFingerprint: fingerprint,
    contractDigest: "d".repeat(64),
    worktreeDigest,
    lockDigest: "e".repeat(64),
    toolchain: "node@v24",
    platform: process.platform,
    envClass: "f".repeat(64),
    ...extra,
  };
}

describe("GEF W2 commands, runner, receipts and cache", () => {
  it("lists only non-test contracts by default and resolves test contracts explicitly", () => {
    expect(listCommandContracts(false).some((contract) => contract.testOnly === true)).toBe(false);
    expect(listCommandContracts(true).some((contract) => contract.id === "gef.test.probe")).toBe(true);
    expect(() => getCommandContract("gef.nope.unknown")).toThrow("COMMAND_CONTRACT_UNKNOWN");
    expect(() => getCommandContract("gef.test.probe")).toThrow("COMMAND_CONTRACT_TEST_ONLY");
    expect(getCommandContract("gef.test.probe", { allowTestOnly: true }).id).toBe("gef.test.probe");
  });

  it("returns a deterministic CACHE_HIT for the same contract and basis", () => {
    const { repo, home, fingerprint } = tempRepo();
    const facts = collectDiffFacts(repo, fingerprint);
    const first = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-hit", commandId: "gef.test.probe", facts, uadsHome: home, allowTestOnly: true });
    expect(first.cacheStatus).toBe("MISS");
    expect(first.receipt.outcome).toBe("PASS");
    const second = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-hit", commandId: "gef.test.probe", facts, uadsHome: home, allowTestOnly: true });
    expect(second.cacheStatus).toBe("HIT");
    expect(second.receipt.source).toBe("CACHE_HIT");
    expect(second.receipt.validityFingerprint).toBe(first.receipt.validityFingerprint);
  });

  it("rebinds cross-task cache HIT receipts to the current task with a valid digest", () => {
    const { repo, home, fingerprint } = tempRepo();
    const facts = collectDiffFacts(repo, fingerprint);
    const first = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-cross-a", commandId: "gef.test.probe", facts, uadsHome: home, allowTestOnly: true });
    expect(first.cacheStatus).toBe("MISS");
    expect(first.receipt.source).toBe("EXECUTED");
    const second = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-cross-b", commandId: "gef.test.probe", facts, uadsHome: home, allowTestOnly: true });
    expect(second.cacheStatus).toBe("HIT");
    expect(second.receipt.source).toBe("CACHE_HIT");
    expect(second.receipt.taskId).toBe("w2-cross-b");
    expect(second.receipt.validityFingerprint).toBe(first.receipt.validityFingerprint);
    expect(verifyWorkReceipt(second.receipt).ok).toBe(true);
  });

  it("binds cache validity to HEAD plus the dirty overlay, not the overlay alone", () => {
    const { repo, home, fingerprint } = tempRepo();
    fs.writeFileSync(path.join(repo, "overlay.txt"), "overlay\n");
    const factsA = collectDiffFacts(repo, fingerprint);
    expect(factsA.dirty).toBe(true);
    const first = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-dirty-a", commandId: "gef.test.probe", facts: factsA, uadsHome: home, allowTestOnly: true });
    expect(first.cacheStatus).toBe("MISS");
    fs.writeFileSync(path.join(repo, "a.ts"), `export const a = 2;\n`);
    execFileSync("git", ["add", "a.ts"], { cwd: repo });
    execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "B"], { cwd: repo });
    const factsB = collectDiffFacts(repo, fingerprint);
    expect(factsB.dirty).toBe(true);
    expect(factsB.worktreeDigest).toBe(factsA.worktreeDigest);
    const second = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-dirty-b", commandId: "gef.test.probe", facts: factsB, uadsHome: home, allowTestOnly: true });
    expect(second.cacheStatus).toBe("MISS");
    expect(second.receipt.validityFingerprint).not.toBe(first.receipt.validityFingerprint);
    const third = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-dirty-b2", commandId: "gef.test.probe", facts: factsB, uadsHome: home, allowTestOnly: true });
    expect(third.cacheStatus).toBe("HIT");
    expect(third.receipt.validityFingerprint).toBe(second.receipt.validityFingerprint);
  });

  it("keeps Node execution and toolchain basis aligned under PATH shadowing", () => {
    const { repo, home, fingerprint } = tempRepo();
    const facts = collectDiffFacts(repo, fingerprint);
    const first = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-node-shadow", commandId: "gef.test.probe", facts, uadsHome: home, allowTestOnly: true });
    expect(first.cacheStatus).toBe("MISS");
    expect(first.receipt.outcome).toBe("PASS");
    const shadowDir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-shadow-"));
    fs.writeFileSync(path.join(shadowDir, "node"), "not a real node binary\n");
    const shadowHome = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-shadow-home-"));
    const previousPath = process.env.PATH ?? "";
    try {
      process.env.PATH = `${shadowDir}${path.delimiter}${previousPath}`;
      const rerun = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-node-shadow-2", commandId: "gef.test.probe", facts, uadsHome: home, allowTestOnly: true });
      expect(rerun.cacheStatus).toBe("HIT");
      expect(rerun.receipt.validityFingerprint).toBe(first.receipt.validityFingerprint);
      const forced = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-node-shadow-3", commandId: "gef.test.probe", facts, uadsHome: shadowHome, allowTestOnly: true });
      expect(forced.cacheStatus).toBe("MISS");
      expect(forced.receipt.outcome).toBe("PASS");
      expect(forced.receipt.validityFingerprint).toBe(first.receipt.validityFingerprint);
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("leaves no surviving grandchild marker after a timeout", () => {
    const { repo, home, fingerprint } = tempRepo();
    const marker = path.join(repo, "gef-timeout-grandchild.marker");
    expect(timeoutTreeCleanupKind()).toMatch(/^(process-group|taskkill-tree)$/);
    const ran = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-timeout-tree", commandId: "gef.test.timeout.tree", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(ran.receipt.outcome).toBe("TIMEOUT");
    expect(ran.cacheStatus).toBe("MISS");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000);
    expect(fs.existsSync(marker)).toBe(false);
  }, 25000);

  it("does not replay TIMEOUT receipts as positive cache HITs", () => {
    const { repo, home, fingerprint } = tempRepo();
    const facts = collectDiffFacts(repo, fingerprint);
    const first = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-timeout-nocache", commandId: "gef.test.hang", facts, uadsHome: home, allowTestOnly: true });
    expect(first.receipt.outcome).toBe("TIMEOUT");
    expect(first.cacheStatus).toBe("MISS");
    const second = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-timeout-nocache-2", commandId: "gef.test.hang", facts, uadsHome: home, allowTestOnly: true });
    expect(second.receipt.outcome).toBe("TIMEOUT");
    expect(second.cacheStatus).toBe("MISS");
    expect(isPositiveCacheOutcome("TIMEOUT")).toBe(false);
    expect(isPositiveCacheOutcome("ERROR")).toBe(false);
    expect(isPositiveCacheOutcome("PASS")).toBe(true);
    expect(isPositiveCacheOutcome("FAIL")).toBe(true);
  });

  it("invalidates on changed source bytes through the worktree digest", () => {
    const { repo, home, fingerprint } = tempRepo();
    const before = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-drift", commandId: "gef.test.probe", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(before.cacheStatus).toBe("MISS");
    fs.writeFileSync(path.join(repo, "a.ts"), `export const a = 2;\n`);
    const after = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-drift", commandId: "gef.test.probe", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(after.cacheStatus).toBe("MISS");
    expect(after.receipt.validityFingerprint).not.toBe(before.receipt.validityFingerprint);
  });

  it("invalidates on lock, toolchain and platform basis drift", () => {
    const { home, fingerprint } = tempRepo();
    const basis = validityFor(fingerprint, "clean:abc");
    const contract = getCommandContract("gef.test.probe", { allowTestOnly: true });
    const receipt = buildWorkReceipt({ projectFingerprint: fingerprint, taskId: "w2-basis", contract, validityFingerprint: computeValidityFingerprint(basis), source: "EXECUTED", result: runCommandContract(contract, { repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-run-")) }) });
    commandCacheStore(receipt, home);
    expect(commandCacheLookup(basis, fingerprint, "w2-basis", home).status).toBe("HIT");
    expect(commandCacheLookup(validityFor(fingerprint, "clean:abc", { lockDigest: "0".repeat(64) }), fingerprint, "w2-basis", home).status).toBe("MISS");
    expect(commandCacheLookup(validityFor(fingerprint, "clean:abc", { toolchain: "node@v20" }), fingerprint, "w2-basis", home).status).toBe("MISS");
    expect(commandCacheLookup(validityFor(fingerprint, "clean:changed"), fingerprint, "w2-basis", home).status).toBe("MISS");
  });

  it("rejects cross-project receipt replay", () => {
    const { home, fingerprint } = tempRepo();
    const basis = validityFor(fingerprint, "clean:abc");
    const contract = getCommandContract("gef.test.probe", { allowTestOnly: true });
    const receipt = buildWorkReceipt({ projectFingerprint: fingerprint, taskId: "w2-xproj", contract, validityFingerprint: computeValidityFingerprint(basis), source: "EXECUTED", result: runCommandContract(contract, { repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-run-")) }) });
    commandCacheStore(receipt, home);
    const replay = commandCacheLookup(basis, "0".repeat(64), "w2-xproj", home);
    expect(replay.status).toBe("MISS");
    if (replay.status === "MISS") expect(replay.reason).toBe("CACHE_PROJECT_MISMATCH");
  });

  it("never grants PASS or HIT authority to tampered receipts", () => {
    const { home, fingerprint } = tempRepo();
    const basis = validityFor(fingerprint, "clean:abc");
    const contract = getCommandContract("gef.test.fail", { allowTestOnly: true });
    const receipt = buildWorkReceipt({ projectFingerprint: fingerprint, taskId: "w2-tamper", contract, validityFingerprint: computeValidityFingerprint(basis), source: "EXECUTED", result: runCommandContract(contract, { repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-run-")) }) });
    expect(receipt.outcome).toBe("FAIL");
    expect(verifyWorkReceipt(receipt).ok).toBe(true);
    expect(verifyWorkReceipt({ ...receipt, outcome: "PASS", exitCode: 0 }).ok).toBe(false);
    expect(verifyWorkReceipt({ ...receipt, summary: `${receipt.summary ?? ""} forged` }).ok).toBe(false);
    commandCacheStore(receipt, home);
    const key = computeValidityFingerprint(basis);
    const cached = path.join(home, "gef", "command-cache", `${key}.json`);
    const raw = JSON.parse(fs.readFileSync(cached, "utf8")) as Record<string, unknown>;
    raw.exitCode = 0;
    raw.outcome = "PASS";
    fs.writeFileSync(cached, `${JSON.stringify(raw)}\n`);
    expect(commandCacheLookup(basis, fingerprint, "w2-tamper", home).status).toBe("MISS");
  });

  it("keeps nonzero exits visible as FAIL", () => {
    const { repo, home, fingerprint } = tempRepo();
    const ran = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-fail", commandId: "gef.test.fail", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(ran.receipt.outcome).toBe("FAIL");
    expect(ran.receipt.exitCode).toBe(3);
  });

  it("reports TIMEOUT with truthful receipts", () => {
    const { repo, home, fingerprint } = tempRepo();
    const ran = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-timeout", commandId: "gef.test.hang", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(ran.receipt.outcome).toBe("TIMEOUT");
  });

  it("sets explicit truncation flags over output caps", () => {
    const { repo, home, fingerprint } = tempRepo();
    const ran = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-loud", commandId: "gef.test.loud", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(ran.receipt.stdoutTruncated).toBe(true);
    expect(ran.receipt.stdoutBytes).toBe(200000);
  });

  it("never persists secret fixtures in summaries", () => {
    const { repo, home, fingerprint } = tempRepo();
    const ran = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-secret", commandId: "gef.test.emit-secret", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(ran.receipt.outcome).toBe("PASS");
    expect(JSON.stringify(ran.receipt)).not.toContain(SECRET_FIXTURE);
    expect(ran.receipt.summaryDigest).toBe(sha256Hex(ran.receipt.summary ?? ""));
  });

  it("does not shell-execute metacharacters in argv", () => {
    const { repo, home, fingerprint } = tempRepo();
    const ran = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-argv", commandId: "gef.test.argv-literal", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(ran.receipt.outcome).toBe("PASS");
    expect(fs.existsSync(path.join(repo, "x"))).toBe(false);
  });

  it("distinguishes dirty and clean validity basis", () => {
    const { repo, fingerprint } = tempRepo();
    const clean = collectDiffFacts(repo, fingerprint);
    expect(clean.dirty).toBe(false);
    expect(clean.worktreeDigest).toBe(null);
    fs.writeFileSync(path.join(repo, "dirty-note.txt"), "local change\n");
    const dirty = collectDiffFacts(repo, fingerprint);
    expect(dirty.dirty).toBe(true);
    expect(dirty.worktreeDigest).not.toBe(null);
    expect(computeValidityFingerprint(validityFor(fingerprint, dirty.worktreeDigest ?? "x"))).not.toBe(
      computeValidityFingerprint(validityFor(fingerprint, `clean:${clean.headSha ?? "unknown"}`)),
    );
  });

  it("preserves zero-project-footprint for command artifacts", () => {
    const { repo, home, fingerprint } = tempRepo();
    runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-zero", commandId: "gef.test.probe", facts: collectDiffFacts(repo, fingerprint), uadsHome: home, allowTestOnly: true });
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
    expect(fs.existsSync(path.join(home, "gef", "command-cache"))).toBe(true);
  });

  it("keeps non-allowlisted injected keys out of the child environment", () => {
    const { repo } = tempRepo();
    const contract = getCommandContract("gef.test.env.probe", { allowTestOnly: true });
    const result = runCommandContract(contract, { repoRoot: repo, env: { GEF_TEST_VALUE: "ok", GEF_TEST_INJECTED: "evil" } });
    expect(result.outcome).toBe("PASS");
    expect(JSON.parse(result.stdoutHead)).toEqual({ v: "ok", e: null });
  });

  it("changes validity on allowed env drift and reuses on stable values", () => {
    const { repo, home, fingerprint } = tempRepo();
    const facts = collectDiffFacts(repo, fingerprint);
    const first = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-env", commandId: "gef.test.env.probe", facts, uadsHome: home, allowTestOnly: true, env: { GEF_TEST_VALUE: "A" } });
    expect(first.cacheStatus).toBe("MISS");
    const same = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-env", commandId: "gef.test.env.probe", facts, uadsHome: home, allowTestOnly: true, env: { GEF_TEST_VALUE: "A" } });
    expect(same.cacheStatus).toBe("HIT");
    expect(same.receipt.validityFingerprint).toBe(first.receipt.validityFingerprint);
    const drifted = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-env", commandId: "gef.test.env.probe", facts, uadsHome: home, allowTestOnly: true, env: { GEF_TEST_VALUE: "B" } });
    expect(drifted.cacheStatus).toBe("MISS");
    expect(drifted.receipt.validityFingerprint).not.toBe(first.receipt.validityFingerprint);
  });

  it("fails closed on secret-like allowlisted values without cache reuse", () => {
    const { repo, home, fingerprint } = tempRepo();
    const facts = collectDiffFacts(repo, fingerprint);
    expect(() => runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-env-secret", commandId: "gef.test.env.probe", facts, uadsHome: home, allowTestOnly: true, env: { GEF_TEST_VALUE: SECRET_FIXTURE } })).toThrow("COMMAND_ENV_SECRET_REJECTED:GEF_TEST_VALUE");
    const safe = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-env-secret", commandId: "gef.test.env.probe", facts, uadsHome: home, allowTestOnly: true, env: { GEF_TEST_VALUE: "safe-value" } });
    expect(safe.cacheStatus).toBe("MISS");
    expect(JSON.stringify(safe.receipt)).not.toContain(SECRET_FIXTURE);
  });

  it("binds cache validity to the effective toolchain and resolution basis", () => {
    const { repo, home, fingerprint } = tempRepo();
    const facts = collectDiffFacts(repo, fingerprint);
    const nodeContract = getCommandContract("gef.test.probe", { allowTestOnly: true });
    const gitContract = getCommandContract("gef.work.git.facts");
    expect(resolveToolchainBasis(nodeContract)).toMatch(/^[a-f0-9]{64}$/);
    expect(resolveToolchainBasis(nodeContract)).toBe(resolveToolchainBasis(nodeContract));
    expect(resolveToolchainBasis(gitContract)).not.toBe(resolveToolchainBasis(nodeContract));
    const first = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-toolchain", commandId: "gef.work.git.facts", facts, uadsHome: home });
    expect(first.cacheStatus).toBe("MISS");
    const stable = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-toolchain", commandId: "gef.work.git.facts", facts, uadsHome: home });
    expect(stable.cacheStatus).toBe("HIT");
    const previousPath = process.env.PATH ?? "";
    const driftDir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w2-path-"));
    try {
      process.env.PATH = `${driftDir}${path.delimiter}${previousPath}`;
      const drifted = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-toolchain", commandId: "gef.work.git.facts", facts, uadsHome: home });
      expect(drifted.cacheStatus).toBe("MISS");
      expect(drifted.receipt.validityFingerprint).not.toBe(first.receipt.validityFingerprint);
      const redrift = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-toolchain", commandId: "gef.work.git.facts", facts, uadsHome: home });
      expect(redrift.cacheStatus).toBe("HIT");
    } finally {
      process.env.PATH = previousPath;
    }
    const restored = runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-toolchain", commandId: "gef.work.git.facts", facts, uadsHome: home });
    expect(restored.cacheStatus).toBe("HIT");
    expect(restored.receipt.validityFingerprint).toBe(first.receipt.validityFingerprint);
  });

  it("refuses optimistic reuse when the toolchain probe fails", () => {
    const { repo, home, fingerprint } = tempRepo();
    const facts = collectDiffFacts(repo, fingerprint);
    const previousPath = process.env.PATH;
    const previousPathext = process.env.PATHEXT;
    try {
      process.env.PATH = "";
      delete process.env.PATHEXT;
      expect(() => runWorkCommand({ repoRoot: repo, projectFingerprint: fingerprint, taskId: "w2-toolchain-fail", commandId: "gef.work.git.facts", facts, uadsHome: home })).toThrow("TOOLCHAIN_PROBE_FAILED");
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousPathext === undefined) delete process.env.PATHEXT;
      else process.env.PATHEXT = previousPathext;
    }
  });
});
