import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import { safeErrorMessage } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  RUNTIME_CAPABILITY_KEYS,
  computeRuntimeIdentityDigest,
  normalizeRuntimeCapabilitySnapshot,
} from "./model-runtime.js";
import type {
  ModelCapability,
  RuntimeCapabilities,
  RuntimeCapabilitySnapshot,
} from "./model-types.js";
import { persistOperationalEvent } from "./operational-events.js";

export const HOST_CAPABILITY_PROOF_SCHEMA = "uads.host-capability-proof" as const;
export const HOST_CAPABILITY_PROOF_SCHEMA_VERSION = "1.0.0" as const;
export const HOST_CAPABILITY_PROOF_SCHEMA_VERSION_V11 = "1.1.0" as const;
export const HOST_CAPABILITY_PROOF_STATES = [
  "SUPPORTED",
  "UNSUPPORTED",
  "UNKNOWN",
  "BLOCKED",
  "STALE",
] as const;
export const HOST_CAPABILITY_EVIDENCE_CLASSES = ["E0", "E1", "E2", "E3", "E4"] as const;
export const HOST_CAPABILITY_VALIDITY_CLASSES = ["IDENTITY_BOUND", "LEASED"] as const;
export const HOST_CAPABILITY_NEGATIVE_PROOF_KINDS = [
  "adapter-contract-impossible",
  "active-probe-recognized-unsupported",
  "complete-enumeration-exclusion",
] as const;

export type HostCapabilityProofState = (typeof HOST_CAPABILITY_PROOF_STATES)[number];
export type HostCapabilityEvidenceClass = (typeof HOST_CAPABILITY_EVIDENCE_CLASSES)[number];
export type HostCapabilityValidityClass = (typeof HOST_CAPABILITY_VALIDITY_CLASSES)[number];
export type HostCapabilityNegativeProofKind = (typeof HOST_CAPABILITY_NEGATIVE_PROOF_KINDS)[number];

export type HostCapabilityValidityBasis = {
  adapterContractDigest: string;
  probeDefinitionDigest: string;
  policyDigest: string;
  configurationDigest: string | null;
};

export type HostCapabilityProofRecord = {
  schema: typeof HOST_CAPABILITY_PROOF_SCHEMA;
  schemaVersion:
    | typeof HOST_CAPABILITY_PROOF_SCHEMA_VERSION
    | typeof HOST_CAPABILITY_PROOF_SCHEMA_VERSION_V11;
  capabilityId: ModelCapability;
  state: HostCapabilityProofState;
  evidenceClass: HostCapabilityEvidenceClass;
  subjectDigest: string;
  adapterId: string;
  runtimeVersion: string | null;
  probeId: string;
  validityBasis: HostCapabilityValidityBasis;
  observedAt: string;
  validUntil: string | null;
  validityClass: HostCapabilityValidityClass;
  evidenceDigest: string;
  negativeProofKind: HostCapabilityNegativeProofKind | null;
  reasonCodes: string[];
  proofDigest: string;
};

export type HostCapabilityProofInput = Omit<
  HostCapabilityProofRecord,
  "schema" | "schemaVersion" | "proofDigest"
>;

export type HostCapabilityCurrentBasis = {
  subjectDigest: string;
  adapterId: string;
  runtimeVersion: string | null;
  validityBasis: HostCapabilityValidityBasis;
};

export type HostCapabilityProofEvaluation = {
  proof: HostCapabilityProofRecord;
  effectiveState: HostCapabilityProofState;
  current: boolean;
  reasonCodes: string[];
};

export type HostCapabilityProofRead =
  | { status: "VALID"; proof: HostCapabilityProofRecord; error: null }
  | { status: "MISSING"; proof: null; error: null }
  | { status: "REJECTED"; proof: null; error: string };

export type HostCapabilityTelemetryContext = {
  projectId: string;
  correlationId: string;
  workOrderId?: string | null;
  executionRunId?: string | null;
  reviewId?: string | null;
  occurredAt?: string;
};

export type HostCapabilityProofPersistence = {
  proof: HostCapabilityProofRecord;
  telemetry:
    | { status: "SKIPPED"; eventId: null; error: null }
    | { status: "EMITTED"; eventId: string; error: null }
    | { status: "FAILED"; eventId: null; error: string };
};

const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_REASON = /^[A-Z0-9._:-]+$/;
const EVIDENCE_RANK: Record<HostCapabilityEvidenceClass, number> = {
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
  E4: 4,
};

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

function canonicalProof(
  proof: Omit<HostCapabilityProofRecord, "proofDigest">,
): string {
  return JSON.stringify(canonicalValue(proof));
}

export function computeHostCapabilityProofDigest(
  proof: Omit<HostCapabilityProofRecord, "proofDigest">,
): string {
  return sha256Hex(canonicalProof(proof));
}

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) {
    throw new Error(`${label} must be a sha256 hex digest`);
  }
}

function assertSafeText(value: string, label: string, maxLength: number): void {
  if (
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    containsAbsoluteHostPath(value) ||
    containsUnredactedSecret(value)
  ) {
    throw new Error(`${label} contains unsafe or unbounded text`);
  }
}

function assertCapabilityId(value: string): asserts value is ModelCapability {
  if (!(RUNTIME_CAPABILITY_KEYS as readonly string[]).includes(value)) {
    throw new Error("capabilityId is not part of the Slice-1 legacy vocabulary");
  }
}

function assertTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function assertProofPrivacy(proof: Omit<HostCapabilityProofRecord, "proofDigest">): void {
  assertCapabilityId(proof.capabilityId);
  assertDigest(proof.subjectDigest, "subjectDigest");
  assertSafeText(proof.adapterId, "adapterId", 128);
  if (proof.runtimeVersion !== null) {
    assertSafeText(proof.runtimeVersion, "runtimeVersion", 128);
  }
  assertSafeText(proof.probeId, "probeId", 128);
  assertDigest(proof.validityBasis.adapterContractDigest, "adapterContractDigest");
  assertDigest(proof.validityBasis.probeDefinitionDigest, "probeDefinitionDigest");
  assertDigest(proof.validityBasis.policyDigest, "policyDigest");
  if (proof.validityBasis.configurationDigest !== null) {
    assertDigest(proof.validityBasis.configurationDigest, "configurationDigest");
  }
  assertDigest(proof.evidenceDigest, "evidenceDigest");
  if (proof.reasonCodes.length > 32) {
    throw new Error("reasonCodes exceeds 32 entries");
  }
  const seen = new Set<string>();
  for (const reason of proof.reasonCodes) {
    if (
      reason.length === 0 ||
      reason.length > 128 ||
      !SAFE_REASON.test(reason) ||
      containsAbsoluteHostPath(reason) ||
      containsUnredactedSecret(reason)
    ) {
      throw new Error("reasonCodes contains unsafe or unbounded text");
    }
    if (seen.has(reason)) {
      throw new Error("reasonCodes must be unique");
    }
    seen.add(reason);
  }
}

function assertProofSemantics(proof: Omit<HostCapabilityProofRecord, "proofDigest">): void {
  const observedAt = assertTimestamp(proof.observedAt, "observedAt");

  if (proof.validityClass === "LEASED") {
    if (proof.validUntil === null) {
      throw new Error("LEASED proof requires validUntil");
    }
    const validUntil = assertTimestamp(proof.validUntil, "validUntil");
    if (validUntil <= observedAt) {
      throw new Error("LEASED proof validUntil must be later than observedAt");
    }
  } else if (proof.validUntil !== null) {
    throw new Error("IDENTITY_BOUND proof must not carry validUntil in Slice 1");
  }

  if (proof.state === "SUPPORTED") {
    if (EVIDENCE_RANK[proof.evidenceClass] < EVIDENCE_RANK.E2) {
      throw new Error("SUPPORTED requires E2 or stronger evidence");
    }
    if (proof.negativeProofKind !== null) {
      throw new Error("SUPPORTED cannot carry negativeProofKind");
    }
  }

  if (proof.state === "UNSUPPORTED") {
    if (EVIDENCE_RANK[proof.evidenceClass] < EVIDENCE_RANK.E2) {
      throw new Error("UNSUPPORTED requires E2 or stronger evidence");
    }
    if (proof.negativeProofKind === null) {
      throw new Error("UNSUPPORTED requires a Negative Proof Contract kind");
    }
    if (
      proof.schemaVersion === HOST_CAPABILITY_PROOF_SCHEMA_VERSION &&
      proof.negativeProofKind !== "adapter-contract-impossible"
    ) {
      throw new Error("PCCR 1.0 UNSUPPORTED requires adapter-contract-impossible negative proof");
    }
    if (
      (proof.negativeProofKind === "active-probe-recognized-unsupported" ||
        proof.negativeProofKind === "complete-enumeration-exclusion") &&
      EVIDENCE_RANK[proof.evidenceClass] < EVIDENCE_RANK.E3
    ) {
      throw new Error("active/enumeration UNSUPPORTED requires E3 or stronger evidence");
    }
    assertDigest(proof.validityBasis.adapterContractDigest, "adapterContractDigest");
  } else if (proof.negativeProofKind !== null) {
    throw new Error("negativeProofKind is only valid for UNSUPPORTED");
  }
}

function unsignedProof(
  proof: HostCapabilityProofRecord,
): Omit<HostCapabilityProofRecord, "proofDigest"> {
  const { proofDigest: _proofDigest, ...unsigned } = proof;
  return unsigned;
}

function compileHostCapabilityProofForVersion(
  input: HostCapabilityProofInput,
  schemaVersion:
    | typeof HOST_CAPABILITY_PROOF_SCHEMA_VERSION
    | typeof HOST_CAPABILITY_PROOF_SCHEMA_VERSION_V11,
  schemaRoot?: string,
): HostCapabilityProofRecord {
  const unsigned: Omit<HostCapabilityProofRecord, "proofDigest"> = {
    ...input,
    schema: HOST_CAPABILITY_PROOF_SCHEMA,
    schemaVersion,
  };
  assertProofPrivacy(unsigned);
  assertProofSemantics(unsigned);
  const proof: HostCapabilityProofRecord = {
    ...unsigned,
    proofDigest: computeHostCapabilityProofDigest(unsigned),
  };
  assertSchema("host-capability-proof.schema.json", proof, schemaRoot);
  return normalizeHostCapabilityProof(proof, schemaRoot);
}

export function compileHostCapabilityProof(
  input: HostCapabilityProofInput,
  schemaRoot?: string,
): HostCapabilityProofRecord {
  return compileHostCapabilityProofForVersion(
    input,
    HOST_CAPABILITY_PROOF_SCHEMA_VERSION,
    schemaRoot,
  );
}

export function compileHostCapabilityProofV11(
  input: HostCapabilityProofInput,
  schemaRoot?: string,
): HostCapabilityProofRecord {
  return compileHostCapabilityProofForVersion(
    input,
    HOST_CAPABILITY_PROOF_SCHEMA_VERSION_V11,
    schemaRoot,
  );
}

export function normalizeHostCapabilityProof(
  raw: unknown,
  schemaRoot?: string,
): HostCapabilityProofRecord {
  assertSchema("host-capability-proof.schema.json", raw, schemaRoot);
  const proof = raw as HostCapabilityProofRecord;
  const unsigned = unsignedProof(proof);
  assertProofPrivacy(unsigned);
  assertProofSemantics(unsigned);
  const expected = computeHostCapabilityProofDigest(unsigned);
  if (proof.proofDigest !== expected) {
    throw new Error("host capability proof digest mismatch");
  }
  return proof;
}

function basisMismatchReasons(
  proof: HostCapabilityProofRecord,
  current: HostCapabilityCurrentBasis,
): string[] {
  const reasons: string[] = [];
  if (proof.subjectDigest !== current.subjectDigest) reasons.push("SUBJECT_DIGEST_MISMATCH");
  if (proof.adapterId !== current.adapterId) reasons.push("ADAPTER_ID_MISMATCH");
  if (proof.runtimeVersion !== current.runtimeVersion) reasons.push("RUNTIME_VERSION_MISMATCH");
  if (proof.validityBasis.adapterContractDigest !== current.validityBasis.adapterContractDigest) {
    reasons.push("ADAPTER_CONTRACT_DIGEST_MISMATCH");
  }
  if (proof.validityBasis.probeDefinitionDigest !== current.validityBasis.probeDefinitionDigest) {
    reasons.push("PROBE_DEFINITION_DIGEST_MISMATCH");
  }
  if (proof.validityBasis.policyDigest !== current.validityBasis.policyDigest) {
    reasons.push("POLICY_DIGEST_MISMATCH");
  }
  if (proof.validityBasis.configurationDigest !== current.validityBasis.configurationDigest) {
    reasons.push("CONFIGURATION_DIGEST_MISMATCH");
  }
  return reasons;
}

export function evaluateHostCapabilityProof(
  raw: unknown,
  current: HostCapabilityCurrentBasis,
  options: { now?: string; schemaRoot?: string } = {},
): HostCapabilityProofEvaluation {
  const proof = normalizeHostCapabilityProof(raw, options.schemaRoot);
  const reasons = basisMismatchReasons(proof, current);
  const nowText = options.now ?? new Date().toISOString();
  const now = assertTimestamp(nowText, "now");
  const observedAt = assertTimestamp(proof.observedAt, "observedAt");

  if (now < observedAt) {
    reasons.push("CLOCK_REGRESSION");
  }
  if (proof.validityClass === "LEASED" && proof.validUntil !== null) {
    const validUntil = assertTimestamp(proof.validUntil, "validUntil");
    if (now > validUntil) {
      reasons.push("LEASE_EXPIRED");
    }
  }
  if (proof.state === "STALE") {
    reasons.push("PROOF_RECORDED_STALE");
  }

  if (reasons.length > 0) {
    return {
      proof,
      effectiveState: "STALE",
      current: false,
      reasonCodes: [...new Set(reasons)],
    };
  }

  return {
    proof,
    effectiveState: proof.state,
    current: proof.state !== "STALE",
    reasonCodes: [],
  };
}

export function hostCapabilityProofPath(
  paths: UadsPaths,
  subjectDigest: string,
  capabilityId: ModelCapability,
): string {
  assertDigest(subjectDigest, "subjectDigest");
  assertCapabilityId(capabilityId);
  const subjectDirectory = path.join(paths.runtimeCapabilities, "proofs", subjectDigest);
  return sidecarJsonPath(subjectDirectory, capabilityId);
}

export function readHostCapabilityProof(
  paths: UadsPaths,
  subjectDigest: string,
  capabilityId: ModelCapability,
  schemaRoot?: string,
): HostCapabilityProofRead {
  const target = hostCapabilityProofPath(paths, subjectDigest, capabilityId);
  if (!fs.existsSync(target)) {
    return { status: "MISSING", proof: null, error: null };
  }
  const parsed = readJsonIfValid<unknown>(target);
  if (!parsed.ok) {
    return { status: "REJECTED", proof: null, error: safeErrorMessage(parsed.error) };
  }
  try {
    const proof = normalizeHostCapabilityProof(parsed.value, schemaRoot);
    if (proof.subjectDigest !== subjectDigest) {
      throw new Error("host capability proof subject binding mismatch");
    }
    if (proof.capabilityId !== capabilityId) {
      throw new Error("host capability proof capability binding mismatch");
    }
    return {
      status: "VALID",
      proof,
      error: null,
    };
  } catch (error) {
    return { status: "REJECTED", proof: null, error: safeErrorMessage(error) };
  }
}

export function persistHostCapabilityProof(
  paths: UadsPaths,
  raw: unknown,
  options: {
    schemaRoot?: string;
    telemetry?: HostCapabilityTelemetryContext;
  } = {},
): HostCapabilityProofPersistence {
  const proof = normalizeHostCapabilityProof(raw, options.schemaRoot);
  const target = hostCapabilityProofPath(paths, proof.subjectDigest, proof.capabilityId);
  atomicWriteJson(target, proof);

  if (!options.telemetry) {
    return {
      proof,
      telemetry: { status: "SKIPPED", eventId: null, error: null },
    };
  }

  try {
    const event = persistOperationalEvent(
      paths,
      {
        projectId: options.telemetry.projectId,
        correlationId: options.telemetry.correlationId,
        workOrderId: options.telemetry.workOrderId ?? null,
        executionRunId: options.telemetry.executionRunId ?? null,
        reviewId: options.telemetry.reviewId ?? null,
        eventType: "evidence.lifecycle",
        sourceComponent: "m03.host-capability",
        severity: "info",
        operationalState: null,
        occurredAt: options.telemetry.occurredAt ?? new Date().toISOString(),
        message: "Host capability proof persisted.",
        payload: {
          capabilityId: proof.capabilityId,
          state: proof.state,
          evidenceClass: proof.evidenceClass,
          subjectDigest: proof.subjectDigest,
          evidenceDigest: proof.evidenceDigest,
          proofDigest: proof.proofDigest,
        },
      },
      { schemaRoot: options.schemaRoot },
    );
    return {
      proof,
      telemetry: { status: "EMITTED", eventId: event.eventId, error: null },
    };
  } catch (error) {
    return {
      proof,
      telemetry: { status: "FAILED", eventId: null, error: safeErrorMessage(error) },
    };
  }
}

export function projectHostCapabilityProofsToLegacySnapshot(input: {
  legacy: RuntimeCapabilitySnapshot;
  proofs?: Partial<Record<ModelCapability, unknown>>;
  currentBasis?: Partial<Record<ModelCapability, HostCapabilityCurrentBasis>>;
  now?: string;
  schemaRoot?: string;
}): RuntimeCapabilitySnapshot {
  const legacy = normalizeRuntimeCapabilitySnapshot(input.legacy);
  const capabilities = Object.fromEntries(
    RUNTIME_CAPABILITY_KEYS.map((capabilityId) => [capabilityId, "unknown"]),
  ) as RuntimeCapabilities;

  for (const capabilityId of RUNTIME_CAPABILITY_KEYS) {
    const proof = input.proofs?.[capabilityId];
    const current = input.currentBasis?.[capabilityId];
    if (proof === undefined || current === undefined) {
      continue;
    }
    try {
      const evaluated = evaluateHostCapabilityProof(proof, current, {
        now: input.now,
        schemaRoot: input.schemaRoot,
      });
      if (evaluated.proof.capabilityId !== capabilityId) {
        capabilities[capabilityId] = "unknown";
        continue;
      }
      if (evaluated.effectiveState === "SUPPORTED") {
        capabilities[capabilityId] = true;
      } else if (evaluated.effectiveState === "UNSUPPORTED") {
        capabilities[capabilityId] = false;
      }
    } catch {
      capabilities[capabilityId] = "unknown";
    }
  }

  const unsigned: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    schema: legacy.schema,
    schemaVersion: legacy.schemaVersion,
    runtimeId: legacy.runtimeId,
    adapterId: legacy.adapterId,
    adapterVersion: legacy.adapterVersion,
    runtimeVersion: legacy.runtimeVersion,
    capabilities,
    provenance: {
      source: legacy.provenance.source,
      confidence: "unknown",
    },
  };
  const projected = {
    ...unsigned,
    identityDigest: computeRuntimeIdentityDigest(unsigned),
  };
  return normalizeRuntimeCapabilitySnapshot(projected);
}

export function projectStoredHostCapabilityProofsToLegacySnapshot(input: {
  paths: UadsPaths;
  subjectDigest: string;
  legacy: RuntimeCapabilitySnapshot;
  currentBasis: Partial<Record<ModelCapability, HostCapabilityCurrentBasis>>;
  now?: string;
  schemaRoot?: string;
}): RuntimeCapabilitySnapshot {
  const proofs: Partial<Record<ModelCapability, unknown>> = {};
  for (const capabilityId of RUNTIME_CAPABILITY_KEYS) {
    const read = readHostCapabilityProof(
      input.paths,
      input.subjectDigest,
      capabilityId,
      input.schemaRoot,
    );
    if (read.status === "VALID") {
      proofs[capabilityId] = read.proof;
    }
  }
  return projectHostCapabilityProofsToLegacySnapshot({
    legacy: input.legacy,
    proofs,
    currentBasis: input.currentBasis,
    now: input.now,
    schemaRoot: input.schemaRoot,
  });
}
