import fs from "node:fs";
import path from "node:path";
import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { sha256Hex } from "../lib/hash.js";
import { canonicalDigest } from "./upir.js";
import { collectDiffFacts, type DiffFacts } from "./git-facts.js";
import { getCommandContract, validatePackCommandIds } from "./command-contract.js";
import { runCommandContract } from "./command-runner.js";
import { buildWorkReceipt, computeValidityFingerprint, type ValidityBasis, type WorkReceipt } from "./command-receipt.js";
import { commandCacheLookup, commandCacheStore } from "./command-cache.js";
import { buildMachineEvidence, type CheckState, type EvidenceTerminalState, type MachineEvidence } from "./machine-evidence.js";
import { renderEvidenceReport } from "./evidence-report.js";
import type { Upir } from "./upir.js";

export const WORK_PLANE_VERSION = "1.0.0" as const;

export type WorkPlaneResult = {
  workPlaneVersion: typeof WORK_PLANE_VERSION;
  taskId: string;
  facts: DiffFacts;
  receipts: WorkReceipt[];
  evidence: MachineEvidence;
  report: string;
  terminalState: EvidenceTerminalState;
};

export type RunWorkInput = {
  taskId: string;
  workOrder?: string;
  commandIds?: string[];
  baseSha?: string;
  cwd?: string;
  uadsHome?: string;
  allowTestOnly?: boolean;
  knownDebt?: string[];
  localValidation?: Record<string, CheckState>;
};

export function resolveWorkIdentity(cwd: string): { repoRoot: string; projectId: string; fingerprint: string } {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? path.resolve(cwd);
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  return { repoRoot, projectId: fingerprint.projectId, fingerprint: fingerprint.fingerprint };
}

function lockDigestFor(repoRoot: string, relevantFiles: string[]): string {
  const parts: string[] = [];
  for (const relative of [...relevantFiles].sort()) {
    const target = path.join(repoRoot, ...relative.split("/"));
    try {
      const stat = fs.statSync(target);
      if (!stat.isFile()) continue;
      parts.push(`${relative}:${sha256Hex(fs.readFileSync(target))}`);
    } catch {
      parts.push(`${relative}:MISSING`);
    }
  }
  return canonicalDigest(parts);
}

function toolchainFingerprint(): string {
  return canonicalDigest({ node: process.version, platform: process.platform });
}

export function runWorkCommand(input: {
  repoRoot: string;
  projectFingerprint: string;
  taskId: string;
  commandId: string;
  facts: DiffFacts;
  uadsHome?: string;
  allowTestOnly?: boolean;
}): { receipt: WorkReceipt; cacheStatus: "HIT" | "MISS"; cacheReason: string | null } {
  const contract = getCommandContract(input.commandId, { allowTestOnly: input.allowTestOnly });
  const worktreeDigest = input.facts.worktreeDigest ?? `clean:${input.facts.headSha ?? "unknown"}`;
  const basis: ValidityBasis = {
    projectFingerprint: input.projectFingerprint,
    contractDigest: contract.contractDigest,
    worktreeDigest,
    lockDigest: lockDigestFor(input.repoRoot, contract.relevantFiles),
    toolchain: toolchainFingerprint(),
    platform: process.platform,
    envClass: canonicalDigest({ allowlist: [...contract.envAllowlist].sort() }),
  };
  const lookup = commandCacheLookup(basis, input.projectFingerprint, input.uadsHome);
  if (lookup.status === "HIT") return { receipt: lookup.receipt, cacheStatus: "HIT", cacheReason: null };
  const result = runCommandContract(contract, { repoRoot: input.repoRoot });
  const receipt = buildWorkReceipt({
    projectFingerprint: input.projectFingerprint,
    taskId: input.taskId,
    contract,
    validityFingerprint: computeValidityFingerprint(basis),
    source: "EXECUTED",
    result,
  });
  commandCacheStore(receipt, input.uadsHome);
  return { receipt, cacheStatus: "MISS", cacheReason: lookup.status === "MISS" ? lookup.reason : null };
}

export function runWorkPlane(input: RunWorkInput): WorkPlaneResult {
  const cwd = input.cwd ?? process.cwd();
  const identity = resolveWorkIdentity(cwd);
  const facts = collectDiffFacts(identity.repoRoot, identity.fingerprint, input.baseSha);
  const receipts: WorkReceipt[] = [];
  for (const commandId of input.commandIds ?? []) {
    const ran = runWorkCommand({
      repoRoot: identity.repoRoot,
      projectFingerprint: identity.fingerprint,
      taskId: input.taskId,
      commandId,
      facts,
      uadsHome: input.uadsHome,
      allowTestOnly: input.allowTestOnly,
    });
    receipts.push(ran.receipt);
  }
  const failed = receipts.some((receipt) => receipt.outcome === "FAIL" || receipt.outcome === "TIMEOUT" || receipt.outcome === "ERROR");
  const terminalState: EvidenceTerminalState = failed ? "BLOCKED" : "COMPLETE_CANDIDATE";
  const evidence = buildMachineEvidence({
    projectFingerprint: identity.fingerprint,
    taskId: input.taskId,
    workOrder: input.workOrder ?? "GEF-W2",
    facts,
    receipts,
    localValidation: input.localValidation,
    knownDebt: input.knownDebt,
    terminalState,
  });
  return { workPlaneVersion: WORK_PLANE_VERSION, taskId: input.taskId, facts, receipts, evidence, report: renderEvidenceReport(evidence), terminalState };
}

export function runWorkForPack(input: { upir: Upir; commandIds: string[]; cwd?: string; uadsHome?: string }): WorkPlaneResult {
  validatePackCommandIds(input.commandIds);
  return runWorkPlane({
    taskId: input.upir.taskId,
    workOrder: input.upir.workOrder,
    commandIds: input.commandIds,
    baseSha: input.upir.baseSha,
    cwd: input.cwd,
    uadsHome: input.uadsHome,
  });
}
