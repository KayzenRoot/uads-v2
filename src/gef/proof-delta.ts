import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest } from "./upir.js";

export const PROOF_DELTA_SCHEMA_VERSION = "0.1.0" as const;
export const PROOF_DELTA_SCHEMA_FILE = "gef-proof-delta.schema.json" as const;

export type ProofDeltaStatus = "NEW" | "REUSED" | "INVALIDATED" | "NOT_APPLICABLE";

export type ProofDeltaEntry = {
  proof: string;
  proofKey: string;
  status: ProofDeltaStatus;
  reasonCode: string;
  proofDigest?: string | null;
  priorProofDigest?: string | null;
};

export type ProofDeltaMetrics = {
  impactedNodes: number;
  selectedProofs: number;
  reusedProofs: number;
  invalidatedProofs: number;
  executedProofs: number;
  planningDurationMs: number;
  executionDurationMs: number;
};

export type ProofDelta = {
  schemaVersion: typeof PROOF_DELTA_SCHEMA_VERSION;
  projectFingerprint: string;
  taskId: string;
  candidateDigest: string | null;
  planDigest: string;
  entries: ProofDeltaEntry[];
  summary: { new: number; reused: number; invalidated: number; notApplicable: number };
  metrics: ProofDeltaMetrics;
  deltaDigest: string;
};

export function buildProofDelta(input: {
  projectFingerprint: string;
  taskId: string;
  candidateDigest: string | null;
  planDigest: string;
  entries: ProofDeltaEntry[];
  metrics: ProofDeltaMetrics;
}): ProofDelta {
  const entries = [...input.entries].sort((left, right) => (left.proofKey < right.proofKey ? -1 : left.proofKey > right.proofKey ? 1 : 0));
  const summary = {
    new: entries.filter((entry) => entry.status === "NEW").length,
    reused: entries.filter((entry) => entry.status === "REUSED").length,
    invalidated: entries.filter((entry) => entry.status === "INVALIDATED").length,
    notApplicable: entries.filter((entry) => entry.status === "NOT_APPLICABLE").length,
  };
  const delta: ProofDelta = {
    schemaVersion: PROOF_DELTA_SCHEMA_VERSION,
    projectFingerprint: input.projectFingerprint,
    taskId: input.taskId,
    candidateDigest: input.candidateDigest,
    planDigest: input.planDigest,
    entries,
    summary,
    metrics: input.metrics,
    deltaDigest: "0".repeat(64),
  };
  // Durations are observation, not authority: the digest binds the same delta
  // for identical results regardless of how long the run took.
  const certified: ProofDelta = { ...delta, deltaDigest: canonicalDigest(deltaDigestMaterial(delta)) };
  assertSchema(PROOF_DELTA_SCHEMA_FILE, certified, findPackageRoot());
  return certified;
}

export function deltaDigestMaterial(delta: ProofDelta): Omit<ProofDelta, "deltaDigest"> {
  return {
    schemaVersion: delta.schemaVersion,
    projectFingerprint: delta.projectFingerprint,
    taskId: delta.taskId,
    candidateDigest: delta.candidateDigest,
    planDigest: delta.planDigest,
    entries: delta.entries,
    summary: delta.summary,
    metrics: { ...delta.metrics, planningDurationMs: 0, executionDurationMs: 0 },
  };
}

export function verifyProofDelta(data: unknown, expectedProjectFingerprint?: string): { ok: true; delta: ProofDelta } | { ok: false; reason: string } {
  const errors = validateAgainstSchema(PROOF_DELTA_SCHEMA_FILE, data, findPackageRoot());
  if (errors.length > 0) return { ok: false, reason: `DELTA_SCHEMA_INVALID:${errors[0] ?? "unknown"}` };
  const delta = data as ProofDelta;
  if (expectedProjectFingerprint !== undefined && delta.projectFingerprint !== expectedProjectFingerprint) {
    return { ok: false, reason: "DELTA_PROJECT_MISMATCH" };
  }
  if (canonicalDigest(deltaDigestMaterial(delta)) !== delta.deltaDigest) return { ok: false, reason: "DELTA_DIGEST_MISMATCH" };
  return { ok: true, delta };
}
