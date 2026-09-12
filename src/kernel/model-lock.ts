import fs from "node:fs";
import path from "node:path";
import { atomicWriteFile, atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  MODEL_ROUTING_STATE_SCHEMA_VERSION,
  type ModelRoutingMode,
} from "./model-types.js";

export const MODEL_ROUTING_STATE_SCHEMA = "uads.model-routing-state" as const;
export const MODEL_ROUTING_STATE_REVISION_SCHEMA = "uads.model-routing-state-revision" as const;
/** Absent routing state is the governed default mode; absence is never treated as MODEL_LOCK. */
export const DEFAULT_MODEL_ROUTING_MODE: ModelRoutingMode = "QUALITY_FLOOR_AUTOROUTE";

export const MODEL_ROUTING_STATE_REASON_CODES = {
  UNAVAILABLE: "ROUTING_STATE_UNAVAILABLE",
  CORRUPT: "ROUTING_STATE_CORRUPT",
  DIGEST_INVALID: "ROUTING_STATE_DIGEST_INVALID",
  PROJECT_MISMATCH: "ROUTING_STATE_PROJECT_MISMATCH",
  SCHEMA_MISMATCH: "ROUTING_STATE_SCHEMA_MISMATCH",
  UNSAFE_CONTENT: "ROUTING_STATE_UNSAFE_CONTENT",
} as const;

export class ModelLockStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelLockStateError";
  }
}

export type LockedModelIdentity = {
  profileId: string;
  providerId: string;
  modelId: string;
};

export type ModelRoutingState = {
  schema: typeof MODEL_ROUTING_STATE_SCHEMA;
  schemaVersion: typeof MODEL_ROUTING_STATE_SCHEMA_VERSION;
  projectId: string;
  mode: ModelRoutingMode;
  locked: LockedModelIdentity | null;
  lockRevision: number;
  updatedAt: string;
  registryDigest: string | null;
  stateDigest: string;
};

export type ModelRoutingStateRevisionAction = "SET_LOCK" | "SET_MODE" | "CLEAR_LOCK" | "OPERATOR_RECOVERY";

export type ModelRoutingStateRevision = {
  schema: typeof MODEL_ROUTING_STATE_REVISION_SCHEMA;
  schemaVersion: typeof MODEL_ROUTING_STATE_SCHEMA_VERSION;
  projectId: string;
  lockRevision: number;
  action: ModelRoutingStateRevisionAction;
  mode: ModelRoutingMode;
  locked: LockedModelIdentity | null;
  previousMode: ModelRoutingMode | null;
  previousRevision: number | null;
  previousStateDigest: string | null;
  registryDigest: string | null;
  updatedAt: string;
  stateDigest: string;
  recordDigest: string;
};

export type ModelRoutingStateRead =
  | { status: "CURRENT"; state: ModelRoutingState }
  | { status: "ABSENT" }
  | { status: "UNAVAILABLE"; reasonCodes: string[]; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deterministic canonical JSON with sorted keys so digests are byte-stable across hosts. */
export function canonicalModelRoutingStateJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalModelRoutingStateJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalModelRoutingStateJson(record[key])}`).join(",")}}`;
}

export function computeModelRoutingStateDigest(
  state: Omit<ModelRoutingState, "stateDigest">,
): string {
  return sha256Hex(canonicalModelRoutingStateJson({ domain: "uads-model-routing-state-v1", ...state }));
}

export function computeModelRoutingStateRevisionDigest(
  revision: Omit<ModelRoutingStateRevision, "recordDigest">,
): string {
  return sha256Hex(canonicalModelRoutingStateJson({ domain: "uads-model-routing-state-revision-v1", ...revision }));
}

function assertSafeRoutingState(value: unknown): void {
  const text = JSON.stringify(value);
  if (containsUnredactedSecret(text) || containsAbsoluteHostPath(text)) {
    throw new ModelLockStateError("routing state contains secret-like or host-path data");
  }
}

function normalizeLockedIdentity(raw: unknown): LockedModelIdentity {
  if (!isRecord(raw)) throw new ModelLockStateError("locked profile identity must be an object");
  const profileId = typeof raw.profileId === "string" ? raw.profileId.trim() : "";
  const providerId = typeof raw.providerId === "string" ? raw.providerId.trim() : "";
  const modelId = typeof raw.modelId === "string" ? raw.modelId.trim() : "";
  if (!profileId || !providerId || !modelId) throw new ModelLockStateError("locked profile identity is incomplete");
  const identity = { profileId, providerId, modelId };
  assertSafeRoutingState(identity);
  return identity;
}

function normalizeRoutingState(raw: unknown): ModelRoutingState {
  if (!isRecord(raw)) throw new ModelLockStateError("routing state must be an object");
  const errors = validateAgainstSchema("model-routing-state.schema.json", raw);
  if (errors.length > 0) throw new ModelLockStateError(`routing state failed schema validation: ${errors.join("; ")}`);
  assertSafeRoutingState(raw);
  const unsigned: Omit<ModelRoutingState, "stateDigest"> = {
    schema: MODEL_ROUTING_STATE_SCHEMA,
    schemaVersion: MODEL_ROUTING_STATE_SCHEMA_VERSION,
    projectId: String(raw.projectId),
    mode: raw.mode as ModelRoutingMode,
    locked: raw.locked === null ? null : normalizeLockedIdentity(raw.locked),
    lockRevision: Number(raw.lockRevision),
    updatedAt: String(raw.updatedAt),
    registryDigest: raw.registryDigest === null ? null : String(raw.registryDigest),
  };
  const stateDigest = computeModelRoutingStateDigest(unsigned);
  if (raw.stateDigest !== stateDigest) throw new ModelLockStateError("routing state digest mismatch");
  return { ...unsigned, stateDigest };
}

/**
 * CR-02: single normalization/validation path for immutable revision-record reads.
 * Validates schema, safe content and bounded project/revision fields, then recomputes
 * recordDigest from the canonical unsigned revision payload. A digest mismatch means
 * the audit evidence is invalid and the record must not be trusted.
 */
function normalizeRoutingStateRevision(raw: unknown): ModelRoutingStateRevision {
  if (!isRecord(raw)) throw new ModelLockStateError("routing state revision must be an object");
  const errors = validateAgainstSchema("model-routing-state-revision.schema.json", raw);
  if (errors.length > 0) throw new ModelLockStateError(`routing state revision failed schema validation: ${errors.join("; ")}`);
  assertSafeRoutingState(raw);
  const projectId = typeof raw.projectId === "string" ? raw.projectId.trim() : "";
  if (!projectId) throw new ModelLockStateError("routing state revision project is missing");
  if (!Number.isInteger(raw.lockRevision) || (raw.lockRevision as number) < 1) {
    throw new ModelLockStateError("routing state revision number is out of bounds");
  }
  const unsigned: Omit<ModelRoutingStateRevision, "recordDigest"> = {
    schema: MODEL_ROUTING_STATE_REVISION_SCHEMA,
    schemaVersion: MODEL_ROUTING_STATE_SCHEMA_VERSION,
    projectId,
    lockRevision: raw.lockRevision as number,
    action: raw.action as ModelRoutingStateRevisionAction,
    mode: raw.mode as ModelRoutingMode,
    locked: raw.locked === null ? null : normalizeLockedIdentity(raw.locked),
    previousMode: (raw.previousMode as ModelRoutingMode | null) ?? null,
    previousRevision: typeof raw.previousRevision === "number" ? raw.previousRevision : null,
    previousStateDigest: typeof raw.previousStateDigest === "string" ? raw.previousStateDigest : null,
    registryDigest: raw.registryDigest === null ? null : String(raw.registryDigest),
    updatedAt: String(raw.updatedAt),
    stateDigest: String(raw.stateDigest),
  };
  const recordDigest = computeModelRoutingStateRevisionDigest(unsigned);
  if (raw.recordDigest !== recordDigest) throw new ModelLockStateError("routing state revision digest mismatch");
  return { ...unsigned, recordDigest };
}

function listRevisionRecords(paths: UadsPaths): ModelRoutingStateRevision[] {
  if (!fs.existsSync(paths.modelLockRevisions)) return [];
  const records: ModelRoutingStateRevision[] = [];
  for (const entry of fs.readdirSync(paths.modelLockRevisions).sort()) {
    if (!/^rev-\d{6}\.json$/.test(entry)) continue;
    const parsed = readJsonIfValid<unknown>(path.join(paths.modelLockRevisions, entry));
    if (!parsed.ok) continue;
    // CR-02: a revision file that fails validation (corrupt or digest-tampered) is never
    // surfaced as audit evidence and never drives revision authority. Ordinary reads do
    // not overwrite or repair it; explicit operator recovery owns that decision.
    try {
      records.push(normalizeRoutingStateRevision(parsed.value));
    } catch {
      continue;
    }
  }
  return records.sort((left, right) => left.lockRevision - right.lockRevision);
}

/**
 * CR-02: explicit invalid-evidence detector. Counts `rev-NNNNNN.json` files that exist
 * but fail revision validation, so callers can surface an audit UNAVAILABLE condition
 * instead of guessing. Never returns, trusts, or repairs the invalid records.
 */
export function countInvalidRevisionRecords(paths: UadsPaths): number {
  if (!fs.existsSync(paths.modelLockRevisions)) return 0;
  let invalid = 0;
  for (const entry of fs.readdirSync(paths.modelLockRevisions).sort()) {
    if (!/^rev-\d{6}\.json$/.test(entry)) continue;
    const parsed = readJsonIfValid<unknown>(path.join(paths.modelLockRevisions, entry));
    if (!parsed.ok) {
      invalid += 1;
      continue;
    }
    try {
      normalizeRoutingStateRevision(parsed.value);
    } catch {
      invalid += 1;
    }
  }
  return invalid;
}

export function readModelRoutingStateRevisions(paths: UadsPaths): ModelRoutingStateRevision[] {
  return listRevisionRecords(paths);
}

/** Highest revision known from state plus immutable revision records; keeps revisions monotonic across recovery. */
export function highestKnownLockRevision(paths: UadsPaths, state: ModelRoutingState | null): number {
  const records = listRevisionRecords(paths);
  const last = records.length > 0 ? records[records.length - 1] : null;
  const recordMax = last ? last.lockRevision : 0;
  return Math.max(state?.lockRevision ?? 0, recordMax);
}

export function readModelRoutingState(
  paths: UadsPaths,
  projectId: string,
  schemaRoot?: string,
): ModelRoutingStateRead {
  void schemaRoot;
  if (!fs.existsSync(paths.modelLock)) return { status: "ABSENT" };
  const parsed = readJsonIfValid<unknown>(paths.modelLock);
  if (!parsed.ok) {
    return {
      status: "UNAVAILABLE",
      reasonCodes: [MODEL_ROUTING_STATE_REASON_CODES.UNAVAILABLE, MODEL_ROUTING_STATE_REASON_CODES.CORRUPT],
      message: `model routing state is unreadable: ${parsed.error}`,
    };
  }
  if (isRecord(parsed.value) && parsed.value.schemaVersion !== MODEL_ROUTING_STATE_SCHEMA_VERSION) {
    return {
      status: "UNAVAILABLE",
      reasonCodes: [MODEL_ROUTING_STATE_REASON_CODES.UNAVAILABLE, MODEL_ROUTING_STATE_REASON_CODES.SCHEMA_MISMATCH],
      message: "model routing state schema version is not supported",
    };
  }
  let state: ModelRoutingState;
  try {
    state = normalizeRoutingState(parsed.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reasonCodes: string[] = [MODEL_ROUTING_STATE_REASON_CODES.UNAVAILABLE];
    if (message.includes("digest mismatch")) reasonCodes.push(MODEL_ROUTING_STATE_REASON_CODES.DIGEST_INVALID);
    else if (message.includes("secret-like") || message.includes("host-path")) reasonCodes.push(MODEL_ROUTING_STATE_REASON_CODES.UNSAFE_CONTENT);
    else reasonCodes.push(MODEL_ROUTING_STATE_REASON_CODES.CORRUPT);
    return { status: "UNAVAILABLE", reasonCodes, message };
  }
  if (state.projectId !== projectId) {
    return {
      status: "UNAVAILABLE",
      reasonCodes: [MODEL_ROUTING_STATE_REASON_CODES.UNAVAILABLE, MODEL_ROUTING_STATE_REASON_CODES.PROJECT_MISMATCH],
      message: "model routing state belongs to a different project",
    };
  }
  return { status: "CURRENT", state };
}

function writeStateAndRevision(input: {
  paths: UadsPaths;
  projectId: string;
  mode: ModelRoutingMode;
  locked: LockedModelIdentity | null;
  registryDigest: string | null;
  action: ModelRoutingStateRevisionAction;
  schemaRoot?: string;
  now?: string;
  previous: ModelRoutingState | null;
}): ModelRoutingState {
  const revisionId = (revision: number): string => `rev-${String(revision).padStart(6, "0")}`;
  let allocated = highestKnownLockRevision(input.paths, input.previous) + 1;
  // CR-02: never overwrite an existing revision file — even one holding invalid evidence
  // that no longer drives revision authority. Allocation skips occupied slots instead.
  while (fs.existsSync(path.join(input.paths.modelLockRevisions, `${revisionId(allocated)}.json`))) {
    allocated += 1;
  }
  const revision = allocated;
  const updatedAt = input.now ?? new Date().toISOString();
  const unsigned: Omit<ModelRoutingState, "stateDigest"> = {
    schema: MODEL_ROUTING_STATE_SCHEMA,
    schemaVersion: MODEL_ROUTING_STATE_SCHEMA_VERSION,
    projectId: input.projectId,
    mode: input.mode,
    locked: input.locked,
    lockRevision: revision,
    updatedAt,
    registryDigest: input.registryDigest,
  };
  const state: ModelRoutingState = { ...unsigned, stateDigest: computeModelRoutingStateDigest(unsigned) };
  assertSafeRoutingState(state);
  const unsignedRevision: Omit<ModelRoutingStateRevision, "recordDigest"> = {
    schema: MODEL_ROUTING_STATE_REVISION_SCHEMA,
    schemaVersion: MODEL_ROUTING_STATE_SCHEMA_VERSION,
    projectId: input.projectId,
    lockRevision: revision,
    action: input.action,
    mode: input.mode,
    locked: input.locked,
    previousMode: input.previous?.mode ?? null,
    previousRevision: input.previous?.lockRevision ?? null,
    previousStateDigest: input.previous?.stateDigest ?? null,
    registryDigest: input.registryDigest,
    updatedAt,
    stateDigest: state.stateDigest,
  };
  const revisionRecord: ModelRoutingStateRevision = {
    ...unsignedRevision,
    recordDigest: computeModelRoutingStateRevisionDigest(unsignedRevision),
  };
  assertSchema("model-routing-state-revision.schema.json", revisionRecord, input.schemaRoot);
  assertSchema("model-routing-state.schema.json", state, input.schemaRoot);
  atomicWriteJson(sidecarJsonPath(input.paths.modelLockRevisions, revisionId(revision)), revisionRecord);
  atomicWriteJson(input.paths.modelLock, state);
  return state;
}

function requireUsableState(paths: UadsPaths, projectId: string, schemaRoot?: string): ModelRoutingState | null {
  const read = readModelRoutingState(paths, projectId, schemaRoot);
  if (read.status === "UNAVAILABLE") {
    throw new ModelLockStateError(
      `model routing state is unavailable (${read.reasonCodes.join(", ")}): run \u0060uads models lock recover\u0060 for explicit operator recovery`,
    );
  }
  return read.status === "CURRENT" ? read.state : null;
}

export function setModelLock(input: {
  paths: UadsPaths;
  projectId: string;
  profile: LockedModelIdentity;
  registryDigest?: string | null;
  schemaRoot?: string;
  now?: string;
}): ModelRoutingState {
  const previous = requireUsableState(input.paths, input.projectId, input.schemaRoot);
  return writeStateAndRevision({
    paths: input.paths,
    projectId: input.projectId,
    mode: "MODEL_LOCK",
    locked: normalizeLockedIdentity(input.profile),
    registryDigest: input.registryDigest ?? null,
    action: "SET_LOCK",
    schemaRoot: input.schemaRoot,
    now: input.now,
    previous,
  });
}

export function setModelRoutingMode(input: {
  paths: UadsPaths;
  projectId: string;
  mode: Exclude<ModelRoutingMode, "MODEL_LOCK">;
  registryDigest?: string | null;
  schemaRoot?: string;
  now?: string;
}): ModelRoutingState {
  const previous = requireUsableState(input.paths, input.projectId, input.schemaRoot);
  return writeStateAndRevision({
    paths: input.paths,
    projectId: input.projectId,
    mode: input.mode,
    locked: null,
    registryDigest: input.registryDigest ?? null,
    action: "SET_MODE",
    schemaRoot: input.schemaRoot,
    now: input.now,
    previous,
  });
}

export function clearModelLock(input: {
  paths: UadsPaths;
  projectId: string;
  registryDigest?: string | null;
  schemaRoot?: string;
  now?: string;
}): ModelRoutingState {
  const previous = requireUsableState(input.paths, input.projectId, input.schemaRoot);
  return writeStateAndRevision({
    paths: input.paths,
    projectId: input.projectId,
    mode: DEFAULT_MODEL_ROUTING_MODE,
    locked: null,
    registryDigest: input.registryDigest ?? null,
    action: "CLEAR_LOCK",
    schemaRoot: input.schemaRoot,
    now: input.now,
    previous,
  });
}

/**
 * Explicit operator recovery for corrupt/unreadable routing state.
 * The raw bytes are archived inside the workspace before any replacement is written,
 * and the revision counter stays monotonic via the immutable revision records.
 */
export function recoverModelRoutingState(input: {
  paths: UadsPaths;
  projectId: string;
  registryDigest?: string | null;
  schemaRoot?: string;
  now?: string;
}): ModelRoutingState {
  const read = readModelRoutingState(input.paths, input.projectId, input.schemaRoot);
  let previous: ModelRoutingState | null = null;
  if (read.status === "CURRENT") previous = read.state;
  if (read.status === "UNAVAILABLE") {
    const raw = fs.readFileSync(input.paths.modelLock, "utf8");
    const archiveTarget = path.join(input.paths.modelLockRevisions, `recovery-${Date.now()}.raw`);
    atomicWriteFile(archiveTarget, raw);
  }
  return writeStateAndRevision({
    paths: input.paths,
    projectId: input.projectId,
    mode: DEFAULT_MODEL_ROUTING_MODE,
    locked: null,
    registryDigest: input.registryDigest ?? null,
    action: "OPERATOR_RECOVERY",
    schemaRoot: input.schemaRoot,
    now: input.now,
    previous,
  });
}
