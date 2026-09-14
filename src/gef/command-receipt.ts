import fs from "node:fs";
import path from "node:path";
import { readJsonIfValid } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { resolveUadsHome } from "../lib/workspace.js";
import { canonicalDigest } from "./upir.js";
import type { CommandContract } from "./command-contract.js";
import { summarizeResult, type RunnerResult } from "./command-runner.js";

export const WORK_RECEIPT_SCHEMA_VERSION = "0.1.0" as const;
export const WORK_RECEIPT_SCHEMA_FILE = "gef-work-receipt.schema.json" as const;
export const WORK_RECEIPT_MAX_ENTRIES = 200 as const;

export type ReceiptSource = "EXECUTED" | "CACHE_HIT";
export type ReceiptOutcome = "PASS" | "FAIL" | "TIMEOUT" | "ERROR";

export type WorkReceipt = {
  schemaVersion: typeof WORK_RECEIPT_SCHEMA_VERSION;
  projectFingerprint: string;
  taskId: string;
  commandId: string;
  commandVersion: string;
  contractDigest: string;
  validityFingerprint: string;
  source: ReceiptSource;
  outcome: ReceiptOutcome;
  exitCode: number | null;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  summary?: string;
  summaryDigest: string;
  receiptDigest: string;
};

export type ValidityBasis = {
  projectFingerprint: string;
  contractDigest: string;
  worktreeDigest: string;
  lockDigest: string;
  toolchain: string;
  platform: string;
  envClass: string;
};

export function computeValidityFingerprint(basis: ValidityBasis): string {
  return canonicalDigest(basis);
}

export function computeReceiptDigest(receipt: Omit<WorkReceipt, "receiptDigest">): string {
  return canonicalDigest(receipt);
}

export function buildWorkReceipt(input: {
  projectFingerprint: string;
  taskId: string;
  contract: CommandContract;
  validityFingerprint: string;
  source: ReceiptSource;
  result: RunnerResult;
}): WorkReceipt {
  const summary = summarizeResult(input.result);
  const withoutDigest = {
    schemaVersion: WORK_RECEIPT_SCHEMA_VERSION,
    projectFingerprint: input.projectFingerprint,
    taskId: input.taskId,
    commandId: input.contract.id,
    commandVersion: input.contract.version,
    contractDigest: input.contract.contractDigest,
    validityFingerprint: input.validityFingerprint,
    source: input.source,
    outcome: input.result.outcome,
    exitCode: input.result.exitCode,
    durationMs: input.result.durationMs,
    stdoutBytes: input.result.stdoutBytes,
    stderrBytes: input.result.stderrBytes,
    stdoutTruncated: input.result.stdoutTruncated,
    stderrTruncated: input.result.stderrTruncated,
    summary: summary.text,
    summaryDigest: summary.digest,
  };
  const receipt: WorkReceipt = { ...withoutDigest, receiptDigest: computeReceiptDigest(withoutDigest) };
  assertSchema(WORK_RECEIPT_SCHEMA_FILE, receipt, findPackageRoot());
  return receipt;
}

export function reissueCacheHit(stored: WorkReceipt, taskId: string): WorkReceipt {
  // Cross-task reuse: the deterministic command result (validityFingerprint)
  // stays reusable, but receipt attribution is rebound to the current task.
  const { receiptDigest: _dropped, taskId: _previousTask, ...rest } = stored;
  void _dropped;
  void _previousTask;
  const hit = { ...rest, taskId, source: "CACHE_HIT" as const };
  return { ...hit, receiptDigest: computeReceiptDigest(hit) };
}

export function verifyWorkReceipt(data: unknown): { ok: true; receipt: WorkReceipt } | { ok: false; reason: string } {
  const errors = validateAgainstSchema(WORK_RECEIPT_SCHEMA_FILE, data, findPackageRoot());
  if (errors.length > 0) return { ok: false, reason: `SCHEMA_INVALID:${errors[0] ?? "unknown"}` };
  const receipt = data as WorkReceipt;
  const { receiptDigest, ...rest } = receipt;
  if (computeReceiptDigest(rest) !== receiptDigest) return { ok: false, reason: "RECEIPT_DIGEST_MISMATCH" };
  if (sha256Hex(receipt.summary ?? "") !== receipt.summaryDigest) return { ok: false, reason: "SUMMARY_DIGEST_MISMATCH" };
  return { ok: true, receipt };
}

export function workReceiptsDirectory(uadsHome?: string): string {
  return path.join(resolveUadsHome(uadsHome), "gef", "work-receipts");
}

export function persistWorkReceipt(receipt: WorkReceipt, uadsHome?: string): string {
  if (!/^[a-f0-9]{64}$/.test(receipt.receiptDigest)) throw new Error("RECEIPT_DIGEST_INVALID");
  const directory = workReceiptsDirectory(uadsHome);
  fs.mkdirSync(directory, { recursive: true });
  const target = path.resolve(directory, `${receipt.receiptDigest}.json`);
  if (!target.startsWith(path.resolve(directory))) throw new Error("RECEIPT_PATH_TRAVERSAL_REJECTED");
  assertSchema(WORK_RECEIPT_SCHEMA_FILE, receipt, findPackageRoot());
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  pruneWorkReceipts({ uadsHome });
  return target;
}

export function loadWorkReceipt(receiptDigest: string, uadsHome?: string): WorkReceipt {
  if (!/^[a-f0-9]{64}$/.test(receiptDigest)) throw new Error("RECEIPT_ID_REJECTED");
  const directory = workReceiptsDirectory(uadsHome);
  const target = path.resolve(directory, `${receiptDigest}.json`);
  if (!target.startsWith(path.resolve(directory))) throw new Error("RECEIPT_PATH_TRAVERSAL_REJECTED");
  const parsed = readJsonIfValid<WorkReceipt>(target);
  if (!parsed.ok) throw new Error(parsed.error === "missing" ? "RECEIPT_MISSING" : "RECEIPT_CORRUPT");
  const verified = verifyWorkReceipt(parsed.value);
  if (!verified.ok) throw new Error(`RECEIPT_CORRUPT:${verified.reason}`);
  return verified.receipt;
}

export function pruneWorkReceipts(input: { maxEntries?: number; uadsHome?: string } = {}): { kept: number; pruned: number } {
  const directory = workReceiptsDirectory(input.uadsHome);
  if (!fs.existsSync(directory)) return { kept: 0, pruned: 0 };
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
  const maxEntries = input.maxEntries ?? WORK_RECEIPT_MAX_ENTRIES;
  if (files.length <= maxEntries) return { kept: files.length, pruned: 0 };
  let pruned = 0;
  for (const name of files.slice(0, files.length - maxEntries)) {
    try {
      fs.unlinkSync(path.join(directory, name));
      pruned += 1;
    } catch {
      continue;
    }
  }
  return { kept: files.length - pruned, pruned };
}
