import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest } from "./upir.js";
import { verifyWorkReceipt } from "./command-receipt.js";
import type { DiffFacts } from "./git-facts.js";
import type { WorkReceipt } from "./command-receipt.js";

export const MACHINE_EVIDENCE_SCHEMA_VERSION = "0.1.0" as const;
export const MACHINE_EVIDENCE_SCHEMA_FILE = "gef-machine-evidence.schema.json" as const;

export type EvidenceTerminalState = "COMPLETE_CANDIDATE" | "BLOCKED" | "SOURCE_CONFLICT";
export type CheckState = "PASS" | "FAIL" | "TIMEOUT" | "ERROR" | "NOT_RUN" | "UNAVAILABLE";

export type MachineTelemetry = {
  commandsRun: number;
  cacheHits: number;
  cacheMisses: number;
  totalDurationMs: number;
  totalStdoutBytes: number;
  evidenceGeneratedMs: number;
};

export type MachineEvidence = {
  schemaVersion: typeof MACHINE_EVIDENCE_SCHEMA_VERSION;
  projectFingerprint: string;
  taskId: string;
  workOrder: string;
  baseSha: string | null;
  headSha: string | null;
  workingTreeDigest: string | null;
  changedFiles: string[];
  commandReceipts: WorkReceipt[];
  localValidation: Record<string, CheckState>;
  budgets: Record<string, number | string | null>;
  telemetry: MachineTelemetry;
  knownDebt: string[];
  terminalState: EvidenceTerminalState;
  evidenceDigest: string;
};

export type BuildEvidenceInput = {
  projectFingerprint: string;
  taskId: string;
  workOrder: string;
  facts: DiffFacts | null;
  receipts: WorkReceipt[];
  localValidation?: Record<string, CheckState>;
  budgets?: Record<string, number | string | null>;
  telemetry?: Partial<MachineTelemetry>;
  knownDebt?: string[];
  terminalState?: EvidenceTerminalState;
};

export function emptyTelemetry(): MachineTelemetry {
  return { commandsRun: 0, cacheHits: 0, cacheMisses: 0, totalDurationMs: 0, totalStdoutBytes: 0, evidenceGeneratedMs: 0 };
}

export function buildMachineEvidence(input: BuildEvidenceInput): MachineEvidence {
  const started = Date.now();
  const receipts = [...input.receipts].sort((left, right) =>
    left.commandId < right.commandId ? -1 : left.commandId > right.commandId ? 1 : left.receiptDigest < right.receiptDigest ? -1 : 1,
  );
  const telemetry: MachineTelemetry = {
    commandsRun: receipts.length,
    cacheHits: receipts.filter((receipt) => receipt.source === "CACHE_HIT").length,
    cacheMisses: receipts.filter((receipt) => receipt.source === "EXECUTED").length,
    totalDurationMs: receipts.reduce((total, receipt) => total + receipt.durationMs, 0),
    totalStdoutBytes: receipts.reduce((total, receipt) => total + receipt.stdoutBytes, 0),
    evidenceGeneratedMs: 0,
    ...input.telemetry,
  };
  // Digest determinism: wall-clock generation time is observation, not evidence.
  // The digest binds a zeroed evidenceGeneratedMs so identical inputs always
  // produce the identical digest; the measured duration stays on the record.
  const measuredMs = Date.now() - started;
  const provisional: MachineEvidence = {
    schemaVersion: MACHINE_EVIDENCE_SCHEMA_VERSION,
    projectFingerprint: input.projectFingerprint,
    taskId: input.taskId,
    workOrder: input.workOrder,
    baseSha: input.facts?.baseSha ?? null,
    headSha: input.facts?.headSha ?? null,
    workingTreeDigest: input.facts?.worktreeDigest ?? null,
    changedFiles: [...(input.facts?.changedFiles.map((item) => item.path) ?? [])].sort(),
    commandReceipts: receipts,
    localValidation: Object.fromEntries(Object.entries(input.localValidation ?? {}).sort(([left], [right]) => (left < right ? -1 : 1))),
    budgets: Object.fromEntries(Object.entries(input.budgets ?? {}).sort(([left], [right]) => (left < right ? -1 : 1))),
    telemetry: { ...telemetry, evidenceGeneratedMs: measuredMs },
    knownDebt: [...(input.knownDebt ?? [])].sort(),
    terminalState: input.terminalState ?? "COMPLETE_CANDIDATE",
    evidenceDigest: "0".repeat(64),
  };
  const evidence: MachineEvidence = { ...provisional, evidenceDigest: canonicalDigest(evidenceDigestMaterial(provisional)) };
  assertSchema(MACHINE_EVIDENCE_SCHEMA_FILE, evidence, findPackageRoot());
  return evidence;
}

export function validateMachineEvidence(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(MACHINE_EVIDENCE_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}

export function evidenceDigestMaterial(evidence: MachineEvidence): Omit<MachineEvidence, "evidenceDigest"> {
  const receipts = [...evidence.commandReceipts].sort((left, right) =>
    left.commandId < right.commandId ? -1 : left.commandId > right.commandId ? 1 : left.receiptDigest < right.receiptDigest ? -1 : 1,
  );
  return {
    schemaVersion: evidence.schemaVersion,
    projectFingerprint: evidence.projectFingerprint,
    taskId: evidence.taskId,
    workOrder: evidence.workOrder,
    baseSha: evidence.baseSha,
    headSha: evidence.headSha,
    workingTreeDigest: evidence.workingTreeDigest,
    changedFiles: [...evidence.changedFiles].sort(),
    commandReceipts: receipts,
    localValidation: Object.fromEntries(Object.entries(evidence.localValidation).sort(([left], [right]) => (left < right ? -1 : 1))),
    budgets: Object.fromEntries(Object.entries(evidence.budgets).sort(([left], [right]) => (left < right ? -1 : 1))),
    telemetry: { ...evidence.telemetry, evidenceGeneratedMs: 0 },
    knownDebt: [...evidence.knownDebt].sort(),
    terminalState: evidence.terminalState,
  };
}

export function verifyMachineEvidence(
  data: unknown,
  expectedProjectFingerprint?: string,
  expectedTaskId?: string,
): { ok: true; evidence: MachineEvidence } | { ok: false; reason: string } {
  const errors = validateMachineEvidence(data);
  if (errors.length > 0) return { ok: false, reason: `EVIDENCE_SCHEMA_INVALID:${errors[0] ?? "unknown"}` };
  const evidence = data as MachineEvidence;
  if (expectedTaskId !== undefined && evidence.taskId !== expectedTaskId) {
    return { ok: false, reason: "EVIDENCE_TASK_MISMATCH" };
  }
  if (expectedProjectFingerprint !== undefined && evidence.projectFingerprint !== expectedProjectFingerprint) {
    return { ok: false, reason: "EVIDENCE_PROJECT_MISMATCH" };
  }
  for (const receipt of evidence.commandReceipts) {
    const nested = verifyWorkReceipt(receipt);
    if (!nested.ok) return { ok: false, reason: `EVIDENCE_RECEIPT_INVALID:${nested.reason}` };
    if (nested.receipt.projectFingerprint !== evidence.projectFingerprint) {
      return { ok: false, reason: "EVIDENCE_RECEIPT_PROJECT_MISMATCH" };
    }
    if (nested.receipt.taskId !== evidence.taskId) {
      return { ok: false, reason: "EVIDENCE_RECEIPT_TASK_MISMATCH" };
    }
  }
  if (canonicalDigest(evidenceDigestMaterial(evidence)) !== evidence.evidenceDigest) {
    return { ok: false, reason: "EVIDENCE_DIGEST_MISMATCH" };
  }
  return { ok: true, evidence };
}

export function summarizeValidation(evidence: MachineEvidence): { pass: number; fail: number; notRun: number } {
  let pass = 0;
  let fail = 0;
  let notRun = 0;
  for (const state of Object.values(evidence.localValidation)) {
    if (state === "PASS") pass += 1;
    else if (state === "NOT_RUN" || state === "UNAVAILABLE") notRun += 1;
    else fail += 1;
  }
  for (const receipt of evidence.commandReceipts) {
    if (receipt.outcome === "PASS") pass += 1;
    else fail += 1;
  }
  return { pass, fail, notRun };
}
