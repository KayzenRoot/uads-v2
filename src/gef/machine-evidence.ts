import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest } from "./upir.js";
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
  const withoutDigest = {
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
    telemetry: { ...telemetry, evidenceGeneratedMs: 0 },
    knownDebt: [...(input.knownDebt ?? [])].sort(),
    terminalState: input.terminalState ?? "COMPLETE_CANDIDATE",
  };
  const evidence: MachineEvidence = { ...withoutDigest, telemetry: { ...withoutDigest.telemetry, evidenceGeneratedMs: measuredMs }, evidenceDigest: canonicalDigest(withoutDigest) };
  assertSchema(MACHINE_EVIDENCE_SCHEMA_FILE, evidence, findPackageRoot());
  return evidence;
}

export function validateMachineEvidence(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(MACHINE_EVIDENCE_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
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
