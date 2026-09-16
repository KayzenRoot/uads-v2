import fsSync from "node:fs";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest } from "./upir.js";
import { proofTypeForContract, type CommandProofType } from "./command-contract.js";
import { verifyWorkReceipt, type ReceiptOutcome, type ReceiptSource, type WorkReceipt } from "./command-receipt.js";
import type { DiffFacts } from "./git-facts.js";

export const PROOF_RECORD_SCHEMA_VERSION = "0.1.0" as const;
export const PROOF_RECORD_SCHEMA_FILE = "gef-proof-record.schema.json" as const;
export const PROOF_PRODUCER_VERSION = "gef-assurance/1.0.0" as const;

export type ProofType = CommandProofType;
export type ProofOutcome = ReceiptOutcome;
export type ProofSource = "EXECUTED" | "REUSED";

export type ProofRecord = {
  schemaVersion: typeof PROOF_RECORD_SCHEMA_VERSION;
  proofId: string;
  projectFingerprint: string;
  proofType: ProofType;
  producerId: string;
  producerVersion: string;
  validityFingerprint: string;
  dependsOn: string[];
  commandReceiptDigest: string;
  outcome: ProofOutcome;
  source: ProofSource;
  reasonCode: string;
  proofDigest: string;
};

// A proof is reusable only against this exact basis: project, producer
// identity, the source/config bytes the proof actually depended on, the
// toolchain and platform class, the semantic env class, the graph producer
// generation and the digests of the proofs it was derived from. Time is never
// part of it, so an identical basis reproduces an identical fingerprint.
export type ProofValidityBasis = {
  projectFingerprint: string;
  proofType: ProofType;
  proofVersion: string;
  producerId: string;
  producerDigest: string;
  sourceDigests: Array<{ path: string; digest: string | null }>;
  configDigests: Array<{ path: string; digest: string | null }>;
  toolchain: string;
  platform: string;
  envClass: string;
  graphVersion: string;
  producerVersion: string;
  dependencyProofDigests: string[];
};

export function computeProofValidityFingerprint(basis: ProofValidityBasis): string {
  return canonicalDigest(basis);
}

export function computeProofId(input: { projectFingerprint: string; producerId: string; validityFingerprint: string }): string {
  return canonicalDigest({ projectFingerprint: input.projectFingerprint, producerId: input.producerId, validityFingerprint: input.validityFingerprint });
}

export function computeProofDigest(record: Omit<ProofRecord, "proofDigest">): string {
  return canonicalDigest(record);
}

export function buildProofRecord(input: {
  projectFingerprint: string;
  proofType: ProofType;
  producerId: string;
  producerVersion?: string;
  basis: ProofValidityBasis;
  receipt: WorkReceipt;
  dependsOn?: string[];
  source: ProofSource;
  reasonCode: string;
}): ProofRecord {
  const verified = verifyWorkReceipt(input.receipt);
  if (!verified.ok) throw new Error(`PROOF_RECEIPT_INVALID:${verified.reason}`);
  if (verified.receipt.projectFingerprint !== input.projectFingerprint) throw new Error("PROOF_RECEIPT_PROJECT_MISMATCH");
  if (verified.receipt.commandId !== input.producerId) throw new Error("PROOF_RECEIPT_PRODUCER_MISMATCH");
  const validityFingerprint = computeProofValidityFingerprint(input.basis);
  const dependsOn = [...new Set(input.dependsOn ?? [])].sort();
  const withoutDigest: Omit<ProofRecord, "proofDigest"> = {
    schemaVersion: PROOF_RECORD_SCHEMA_VERSION,
    proofId: computeProofId({ projectFingerprint: input.projectFingerprint, producerId: input.producerId, validityFingerprint }),
    projectFingerprint: input.projectFingerprint,
    proofType: input.proofType,
    producerId: input.producerId,
    producerVersion: input.producerVersion ?? PROOF_PRODUCER_VERSION,
    validityFingerprint,
    dependsOn,
    commandReceiptDigest: verified.receipt.receiptDigest,
    outcome: verified.receipt.outcome,
    source: input.source,
    reasonCode: input.reasonCode,
  };
  const record: ProofRecord = { ...withoutDigest, proofDigest: computeProofDigest(withoutDigest) };
  assertSchema(PROOF_RECORD_SCHEMA_FILE, record, findPackageRoot());
  return record;
}

export function verifyProofRecord(data: unknown, expectedProjectFingerprint?: string): { ok: true; record: ProofRecord } | { ok: false; reason: string } {
  const errors = validateAgainstSchema(PROOF_RECORD_SCHEMA_FILE, data, findPackageRoot());
  if (errors.length > 0) return { ok: false, reason: `PROOF_SCHEMA_INVALID:${errors[0] ?? "unknown"}` };
  const record = data as ProofRecord;
  const { proofDigest, ...rest } = record;
  if (computeProofDigest(rest) !== proofDigest) return { ok: false, reason: "PROOF_DIGEST_MISMATCH" };
  const expectedId = computeProofId({ projectFingerprint: record.projectFingerprint, producerId: record.producerId, validityFingerprint: record.validityFingerprint });
  if (expectedId !== record.proofId) return { ok: false, reason: "PROOF_ID_MISMATCH" };
  if (expectedProjectFingerprint !== undefined && record.projectFingerprint !== expectedProjectFingerprint) {
    return { ok: false, reason: "PROOF_PROJECT_MISMATCH" };
  }
  return { ok: true, record };
}

// Reuse is attribution, never mutation: the stored record keeps its source and
// digest, and the reused view is a new record bound to the current task's
// purpose while carrying the same proof identity and validity fingerprint.
export function reissueReusedProof(record: ProofRecord, reasonCode: string): ProofRecord {
  if (record.source !== "EXECUTED") throw new Error("PROOF_REUSE_SOURCE_REJECTED");
  const { proofDigest: _dropped, ...rest } = record;
  void _dropped;
  const withoutDigest: Omit<ProofRecord, "proofDigest"> = { ...rest, source: "REUSED", reasonCode };
  return { ...withoutDigest, proofDigest: computeProofDigest(withoutDigest) };
}

// Same raw-byte identity W2 uses for change digests, so a proof basis and a diff
// fact about the same file can be compared directly. Unreadable files bind null.
export function digestRepoFiles(repoRoot: string, relatives: string[]): Array<{ path: string; digest: string | null }> {
  return [...new Set(relatives)]
    .sort()
    .map((relative) => {
      try {
        return { path: relative, digest: sha256Hex(fsSync.readFileSync(path.join(repoRoot, ...relative.split("/")))) };
      } catch {
        return { path: relative, digest: null };
      }
    });
}

export function proofTypeForCommand(commandId: string): ProofType {
  return proofTypeForContract(commandId);
}

export function isPositiveProofOutcome(outcome: ProofOutcome): boolean {
  // TIMEOUT/ERROR are transient observations and never durable assurance.
  return outcome === "PASS" || outcome === "FAIL";
}

export function proofBasisForContract(input: {
  projectFingerprint: string;
  commandId: string;
  proofType: ProofType;
  proofVersion: string;
  contractDigest: string;
  sourceDigests: Array<{ path: string; digest: string | null }>;
  configDigests: Array<{ path: string; digest: string | null }>;
  toolchain: string;
  envClass: string;
  graphVersion: string;
  dependencyProofDigests: string[];
}): ProofValidityBasis {
  return {
    projectFingerprint: input.projectFingerprint,
    proofType: input.proofType,
    proofVersion: input.proofVersion,
    producerId: input.commandId,
    producerDigest: input.contractDigest,
    sourceDigests: [...input.sourceDigests].sort((left, right) => (left.path < right.path ? -1 : 1)),
    configDigests: [...input.configDigests].sort((left, right) => (left.path < right.path ? -1 : 1)),
    toolchain: input.toolchain,
    platform: process.platform,
    envClass: input.envClass,
    graphVersion: input.graphVersion,
    producerVersion: PROOF_PRODUCER_VERSION,
    dependencyProofDigests: [...new Set(input.dependencyProofDigests)].sort(),
  };
}
