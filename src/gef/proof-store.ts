import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { resolveUadsHome } from "../lib/workspace.js";
import { verifyProofRecord, type ProofRecord, type ProofType } from "./proof-record.js";

export const PROOF_STORE_MAX_RECORDS = 500 as const;

export type ProofStoreLookup =
  | { status: "HIT"; record: ProofRecord }
  | { status: "MISS"; reason: string };

const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_TYPE = /^[A-Z]{3,12}$/;

export function proofStoreDirectory(uadsHome?: string): string {
  return path.join(resolveUadsHome(uadsHome), "gef", "proofs");
}

export function proofIndexDirectory(uadsHome?: string): string {
  return path.join(resolveUadsHome(uadsHome), "gef", "proof-index");
}

export function proofRecordPath(proofDigest: string, uadsHome?: string): string {
  if (!DIGEST.test(proofDigest)) throw new Error("PROOF_STORE_ID_REJECTED");
  const directory = proofStoreDirectory(uadsHome);
  const target = path.resolve(directory, `${proofDigest}.json`);
  if (!target.startsWith(path.resolve(directory))) throw new Error("PROOF_STORE_PATH_TRAVERSAL_REJECTED");
  return target;
}

export function proofIndexPath(proofType: ProofType, validityFingerprint: string, uadsHome?: string): string {
  if (!SAFE_TYPE.test(proofType)) throw new Error("PROOF_INDEX_TYPE_REJECTED");
  if (!DIGEST.test(validityFingerprint)) throw new Error("PROOF_INDEX_KEY_REJECTED");
  const directory = path.resolve(proofIndexDirectory(uadsHome), proofType);
  const target = path.resolve(directory, `${validityFingerprint}.json`);
  if (!target.startsWith(path.resolve(proofIndexDirectory(uadsHome)))) throw new Error("PROOF_INDEX_PATH_TRAVERSAL_REJECTED");
  return target;
}

export type ProofIndexEntry = {
  validityFingerprint: string;
  proofType: ProofType;
  proofDigest: string;
  projectFingerprint: string;
  producerId: string;
  sourceBasis: string;
  configBasis: string;
  toolchain: string;
  platform: string;
  envClass: string;
  graphVersion: string;
  updatedAtMs: number;
};

// The index is the reuse-authority lookup record. It stores only bounded class
// digests of the basis (never source bodies, paths beyond the proof scope or
// raw environment values) so invalidation reasons can name what drifted.
export type ProofIndexContext = {
  producerId: string;
  sourceBasis: string;
  configBasis: string;
  toolchain: string;
  platform: string;
  envClass: string;
  graphVersion: string;
};

export function storeProofRecord(record: ProofRecord, context: ProofIndexContext, uadsHome?: string): { recordPath: string; indexPath: string } {
  const verified = verifyProofRecord(record, record.projectFingerprint);
  if (!verified.ok) throw new Error(`PROOF_STORE_REJECTED:${verified.reason}`);
  const target = proofRecordPath(verified.record.proofDigest, uadsHome);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  atomicWriteJson(target, verified.record);
  const index: ProofIndexEntry = {
    validityFingerprint: verified.record.validityFingerprint,
    proofType: verified.record.proofType,
    proofDigest: verified.record.proofDigest,
    projectFingerprint: verified.record.projectFingerprint,
    producerId: context.producerId,
    sourceBasis: context.sourceBasis,
    configBasis: context.configBasis,
    toolchain: context.toolchain,
    platform: context.platform,
    envClass: context.envClass,
    graphVersion: context.graphVersion,
    updatedAtMs: Date.now(),
  };
  const indexTarget = proofIndexPath(verified.record.proofType, verified.record.validityFingerprint, uadsHome);
  fs.mkdirSync(path.dirname(indexTarget), { recursive: true });
  atomicWriteJson(indexTarget, index);
  return { recordPath: target, indexPath: indexTarget };
}

export function priorEntriesForProducer(input: { producerId: string; projectFingerprint: string; uadsHome?: string }): ProofIndexEntry[] {
  return listProofIndexEntries(input.uadsHome).filter(
    (entry) => entry.producerId === input.producerId && entry.projectFingerprint === input.projectFingerprint,
  );
}

export function loadProofRecord(proofDigest: string, uadsHome?: string): ProofRecord {
  const parsed = readJsonIfValid<ProofRecord>(proofRecordPath(proofDigest, uadsHome));
  if (!parsed.ok) throw new Error(parsed.error === "missing" ? "PROOF_MISSING" : "PROOF_CORRUPT");
  const verified = verifyProofRecord(parsed.value);
  if (!verified.ok) throw new Error(`PROOF_CORRUPT:${verified.reason}`);
  return verified.record;
}

// The index grants reuse authority, so a corrupt or mismatched entry degrades to
// an explicit MISS: it never silently authorises a stale or foreign proof.
export function lookupProof(input: {
  proofType: ProofType;
  validityFingerprint: string;
  projectFingerprint: string;
  uadsHome?: string;
}): ProofStoreLookup {
  let indexTarget: string;
  try {
    indexTarget = proofIndexPath(input.proofType, input.validityFingerprint, input.uadsHome);
  } catch {
    return { status: "MISS", reason: "PROOF_INDEX_KEY_INVALID" };
  }
  const parsedIndex = readJsonIfValid<ProofIndexEntry>(indexTarget);
  if (!parsedIndex.ok) return { status: "MISS", reason: parsedIndex.error === "missing" ? "PROOF_INDEX_MISS" : "PROOF_INDEX_CORRUPT" };
  const entry = parsedIndex.value;
  if (entry.validityFingerprint !== input.validityFingerprint || entry.proofType !== input.proofType) {
    return { status: "MISS", reason: "PROOF_INDEX_MISMATCH" };
  }
  if (entry.projectFingerprint !== input.projectFingerprint) return { status: "MISS", reason: "PROOF_PROJECT_MISMATCH" };
  if (!DIGEST.test(entry.proofDigest)) return { status: "MISS", reason: "PROOF_INDEX_DIGEST_INVALID" };
  const record = readJsonIfValid<ProofRecord>(proofRecordPath(entry.proofDigest, input.uadsHome));
  if (!record.ok) return { status: "MISS", reason: record.error === "missing" ? "PROOF_RECORD_MISSING" : "PROOF_RECORD_CORRUPT" };
  const verified = verifyProofRecord(record.value, input.projectFingerprint);
  if (!verified.ok) return { status: "MISS", reason: `PROOF_RECORD_INVALID:${verified.reason}` };
  if (verified.record.validityFingerprint !== input.validityFingerprint) return { status: "MISS", reason: "PROOF_BASIS_MISMATCH" };
  return { status: "HIT", record: verified.record };
}

export function listProofIndexEntries(uadsHome?: string): ProofIndexEntry[] {
  const root = proofIndexDirectory(uadsHome);
  if (!fs.existsSync(root)) return [];
  const entries: ProofIndexEntry[] = [];
  for (const typeName of fs.readdirSync(root).sort()) {
    if (!SAFE_TYPE.test(typeName)) continue;
    const directory = path.join(root, typeName);
    let names: string[];
    try {
      names = fs.readdirSync(directory).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const parsed = readJsonIfValid<ProofIndexEntry>(path.join(directory, name));
      if (!parsed.ok) continue;
      const entry = parsed.value;
      if (!DIGEST.test(entry.validityFingerprint ?? "") || !DIGEST.test(entry.proofDigest ?? "")) continue;
      entries.push(entry);
    }
  }
  return entries;
}

export function inspectProofStore(uadsHome?: string): { records: number; indexes: number; referenced: number; orphans: number } {
  const recordDirectory = proofStoreDirectory(uadsHome);
  const files = fs.existsSync(recordDirectory) ? fs.readdirSync(recordDirectory).filter((name) => DIGEST.test(name.replace(/\.json$/, ""))) : [];
  const entries = listProofIndexEntries(uadsHome);
  const referencedDigests = new Set(entries.map((entry) => entry.proofDigest));
  let referenced = 0;
  let orphans = 0;
  for (const name of files) {
    const digest = name.replace(/\.json$/, "");
    if (referencedDigests.has(digest)) referenced += 1;
    else orphans += 1;
  }
  return { records: files.length, indexes: entries.length, referenced, orphans };
}

export function pruneProofStore(input: { maxEntries?: number; dryRun?: boolean; uadsHome?: string } = {}): {
  kept: number;
  pruned: number;
  retainedReferenced: number;
  dryRun: boolean;
} {
  const directory = proofStoreDirectory(input.uadsHome);
  const dryRun = input.dryRun ?? false;
  if (!fs.existsSync(directory)) return { kept: 0, pruned: 0, retainedReferenced: 0, dryRun };
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
  const maxEntries = input.maxEntries ?? PROOF_STORE_MAX_RECORDS;
  if (files.length <= maxEntries) return { kept: files.length, pruned: 0, retainedReferenced: 0, dryRun };
  const referenced = new Set(listProofIndexEntries(input.uadsHome).map((entry) => entry.proofDigest));
  const candidates = files.slice(0, files.length - maxEntries);
  let pruned = 0;
  let retainedReferenced = 0;
  for (const name of candidates) {
    const digest = name.replace(/\.json$/, "");
    // A proof an authoritative index still references is never removed: doing so
    // would leave the index pointing at a missing record.
    if (referenced.has(digest)) {
      retainedReferenced += 1;
      continue;
    }
    if (dryRun) {
      pruned += 1;
      continue;
    }
    try {
      fs.unlinkSync(path.join(directory, name));
      pruned += 1;
    } catch {
      continue;
    }
  }
  return { kept: files.length - pruned, pruned, retainedReferenced, dryRun };
}
