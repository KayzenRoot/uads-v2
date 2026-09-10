import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, sidecarJsonPath } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { redactHostPaths } from "../lib/secrets.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  OPERATIONAL_EVENT_SCHEMA,
  OPERATIONAL_EVENT_SCHEMA_VERSION,
  type B001AnalysisMetrics,
  type OperationalEvent,
  type OperationalEventInput,
  type OperationalEventRead,
  type OperationalHealth,
  type OperationalState,
} from "./operational-event-types.js";

export const MAX_OPERATIONAL_EVENT_BYTES = 64 * 1024;
export const DEFAULT_OPERATIONAL_EVENT_LIMIT = 50;
export const MAX_OPERATIONAL_EVENT_LIMIT = 200;
export const DEFAULT_OPERATIONAL_EVENT_RETENTION = 1000;
export const MAX_OPERATIONAL_EVENT_SCAN = DEFAULT_OPERATIONAL_EVENT_RETENTION + 100;
export const MAX_OPERATIONAL_EVENT_PAYLOAD_KEYS = 32;

/**
 * Frozen M30 storage-pressure labels used for operator-visible degradation.
 *
 * M30 S03 defines the storage-pressure ladder HEALTHY -> PRESSURED ->
 * SHEDDING_OPTIONAL -> DEGRADED -> WRITE_UNAVAILABLE. This module owns the
 * write-side terminal label; cockpit/dashboard surfaces stay read-only and
 * project it through the existing storage source and bounded reason codes.
 */
export const OPERATIONAL_STORAGE_REASON_CODES = {
  unavailable: "OBSERVABILITY_STORAGE_UNAVAILABLE",
  writeUnavailable: "WRITE_UNAVAILABLE",
  writeDenied: "STORAGE_WRITE_DENIED",
  capacityExhausted: "STORAGE_CAPACITY_EXHAUSTED",
  writeError: "STORAGE_WRITE_ERROR",
  pressureEvidenceInvalid: "STORAGE_PRESSURE_EVIDENCE_INVALID",
} as const;

export const MAX_OBSERVABILITY_REASON_CODES = 16;

const STORAGE_PRESSURE_SCHEMA = "uads.observability-storage-pressure" as const;
const STORAGE_PRESSURE_SCHEMA_VERSION = "1.0.0" as const;
const STORAGE_PRESSURE_FILE_NAME = "storage-pressure.json";

type OperationalStorageFailureClass = "WRITE_DENIED" | "CAPACITY_EXHAUSTED" | "WRITE_ERROR";

/**
 * Closed errno classification for real storage-write failures. Codes outside
 * this map are not storage faults (for example an immutable-record EEXIST
 * rejection) and never produce pressure evidence.
 */
const STORAGE_FAILURE_CLASS_BY_ERRNO: Record<string, OperationalStorageFailureClass> = {
  EACCES: "WRITE_DENIED",
  EPERM: "WRITE_DENIED",
  EROFS: "WRITE_DENIED",
  ENOSPC: "CAPACITY_EXHAUSTED",
  EDQUOT: "CAPACITY_EXHAUSTED",
  EIO: "WRITE_ERROR",
};

const STORAGE_FAILURE_CLASS_REASON_CODES: Record<OperationalStorageFailureClass, string> = {
  WRITE_DENIED: OPERATIONAL_STORAGE_REASON_CODES.writeDenied,
  CAPACITY_EXHAUSTED: OPERATIONAL_STORAGE_REASON_CODES.capacityExhausted,
  WRITE_ERROR: OPERATIONAL_STORAGE_REASON_CODES.writeError,
};

/** Fault classes and injection points accepted by the test-only seam. */
export type OperationalStorageFaultClass = "WRITE_DENIED" | "CAPACITY_EXHAUSTED";
export type OperationalStorageFaultCode = "EACCES" | "EROFS" | "ENOSPC";
export type OperationalStorageFaultPoint = "storage-directory" | "event-file" | "event-commit";

export type OperationalStorageFault = {
  faultClass: OperationalStorageFaultClass;
  code: OperationalStorageFaultCode;
  point: OperationalStorageFaultPoint;
};

const STORAGE_FAULT_CODES: Record<OperationalStorageFaultClass, readonly OperationalStorageFaultCode[]> = {
  WRITE_DENIED: ["EACCES", "EROFS"],
  CAPACITY_EXHAUSTED: ["ENOSPC"],
};

const STORAGE_FAULT_POINTS: Record<OperationalStorageFaultClass, readonly OperationalStorageFaultPoint[]> = {
  WRITE_DENIED: ["storage-directory", "event-file"],
  CAPACITY_EXHAUSTED: ["event-commit"],
};

const STORAGE_FAULT_ERRNO: Record<OperationalStorageFaultCode, number> = { EACCES: 13, EROFS: 30, ENOSPC: 28 };

/** Bounded: at most a handful of sidecar event directories may be armed. */
export const MAX_ARMED_OPERATIONAL_STORAGE_FAULTS = 4;

const armedStorageFaults = new Map<string, OperationalStorageFault>();

/**
 * Arms one deterministic storage-write failure for an M30 observability events
 * sidecar directory and returns the explicit release function.
 *
 * Test-only and explicit by construction: it refuses to arm outside
 * `NODE_ENV=test`, refuses any path that is not an `observability/events`
 * sidecar directory, is bounded by class/point/code and by
 * `MAX_ARMED_OPERATIONAL_STORAGE_FAULTS`, and is never reachable from an
 * environment variable, CLI flag or production code path. When nothing is armed
 * the persistence path performs no additional filesystem work.
 */
export function armOperationalStorageFaultForTests(
  eventsDirectory: string,
  fault: OperationalStorageFault,
): () => void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("operational storage fault injection is test-only");
  }
  const resolved = path.resolve(eventsDirectory);
  if (path.basename(resolved) !== "events" || path.basename(path.dirname(resolved)) !== "observability") {
    throw new Error("operational storage fault injection is restricted to an M30 observability events directory");
  }
  if (!STORAGE_FAULT_CODES[fault.faultClass].includes(fault.code)) {
    throw new Error(`storage fault code ${fault.code} is not valid for class ${fault.faultClass}`);
  }
  if (!STORAGE_FAULT_POINTS[fault.faultClass].includes(fault.point)) {
    throw new Error(`storage fault point ${fault.point} is not valid for class ${fault.faultClass}`);
  }
  if (armedStorageFaults.has(resolved) || armedStorageFaults.size >= MAX_ARMED_OPERATIONAL_STORAGE_FAULTS) {
    throw new Error("operational storage fault injection budget exceeded");
  }
  armedStorageFaults.set(resolved, fault);
  return () => {
    armedStorageFaults.delete(resolved);
  };
}

/** Armed-fault counter used to prove the seam stays bounded and self-releasing. */
export function armedOperationalStorageFaultCountForTests(): number {
  return armedStorageFaults.size;
}

function injectedStorageFault(directory: string, point: OperationalStorageFaultPoint): void {
  if (armedStorageFaults.size === 0) {
    return;
  }
  const resolved = path.resolve(directory);
  const fault = armedStorageFaults.get(resolved);
  if (!fault || fault.point !== point) {
    return;
  }
  const error = new Error(`injected ${fault.code}: ${fault.faultClass} storage fault at ${point}`) as NodeJS.ErrnoException;
  error.code = fault.code;
  error.errno = STORAGE_FAULT_ERRNO[fault.code];
  error.syscall = point === "storage-directory" ? "mkdir" : point === "event-file" ? "open" : "fsync";
  error.path = resolved;
  throw error;
}

function storagePressurePath(paths: UadsPaths): string {
  return path.join(paths.observability, STORAGE_PRESSURE_FILE_NAME);
}

type OperationalStoragePressure = { reasonCodes: string[] };

function storageFailureClassFor(error: unknown): OperationalStorageFailureClass | null {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (typeof code !== "string") {
    return null;
  }
  return STORAGE_FAILURE_CLASS_BY_ERRNO[code] ?? null;
}

/**
 * Records bounded WRITE_UNAVAILABLE evidence beside the event store so the read
 * side and cockpit cannot keep reporting the last readable state as healthy
 * after a write failed. Best effort: the caller always rethrows the original
 * storage failure.
 */
function recordOperationalStoragePressure(paths: UadsPaths, error: unknown): void {
  const failureClass = storageFailureClassFor(error);
  if (!failureClass) {
    return;
  }
  const code = (error as NodeJS.ErrnoException).code ?? null;
  try {
    atomicWriteJson(storagePressurePath(paths), {
      schema: STORAGE_PRESSURE_SCHEMA,
      schemaVersion: STORAGE_PRESSURE_SCHEMA_VERSION,
      state: OPERATIONAL_STORAGE_REASON_CODES.writeUnavailable,
      failureClass,
      errnoCode: typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : null,
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // The original write failure is still reported to the caller.
  }
}

function clearOperationalStoragePressure(paths: UadsPaths): void {
  try {
    const target = storagePressurePath(paths);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  } catch {
    // A surviving marker is re-validated on read and cleared by the next successful write.
  }
}

function readOperationalStoragePressure(paths: UadsPaths): OperationalStoragePressure | null {
  const target = storagePressurePath(paths);
  if (!fs.existsSync(target)) {
    return null;
  }
  const invalid: OperationalStoragePressure = {
    reasonCodes: [
      OPERATIONAL_STORAGE_REASON_CODES.writeUnavailable,
      OPERATIONAL_STORAGE_REASON_CODES.pressureEvidenceInvalid,
    ],
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return invalid;
  }
  const candidate = parsed as { schema?: unknown; state?: unknown; failureClass?: unknown };
  if (
    candidate?.schema !== STORAGE_PRESSURE_SCHEMA ||
    candidate.state !== OPERATIONAL_STORAGE_REASON_CODES.writeUnavailable
  ) {
    return invalid;
  }
  const failureClass = candidate.failureClass as OperationalStorageFailureClass;
  return {
    reasonCodes: [
      OPERATIONAL_STORAGE_REASON_CODES.writeUnavailable,
      STORAGE_FAILURE_CLASS_REASON_CODES[failureClass] ?? OPERATIONAL_STORAGE_REASON_CODES.writeError,
    ],
  };
}

const OPERATIONAL_STATE_SEVERITY: Record<OperationalState, number> = { HEALTHY: 0, DEGRADED: 1, UNAVAILABLE: 2 };

/** Degradation can only be preserved or raised here, never cleared. */
function applyStoragePressure(
  health: OperationalHealth,
  pressure: OperationalStoragePressure | null,
): OperationalHealth {
  if (!pressure) {
    return health;
  }
  const status: OperationalState =
    OPERATIONAL_STATE_SEVERITY[health.status] >= OPERATIONAL_STATE_SEVERITY.DEGRADED ? health.status : "DEGRADED";
  return {
    ...health,
    status,
    reasonCodes: [...new Set([...health.reasonCodes, ...pressure.reasonCodes])].slice(0, MAX_OBSERVABILITY_REASON_CODES),
  };
}

type EventHub = EventEmitter & { emit(event: "event", value: OperationalEvent): boolean };
const hubs = new Map<string, EventHub>();

function hubFor(paths: UadsPaths): EventHub {
  const key = path.resolve(paths.observabilityEvents);
  const existing = hubs.get(key);
  if (existing) {
    return existing;
  }
  const hub = new EventEmitter() as EventHub;
  hubs.set(key, hub);
  return hub;
}

/** Compare JavaScript strings by UTF-16 code units, without locale-dependent rules. */
export function compareCanonicalKeys(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

export function subscribeOperationalEvents(
  paths: UadsPaths,
  listener: (event: OperationalEvent) => void,
): () => void {
  const hub = hubFor(paths);
  hub.on("event", listener);
  return () => hub.off("event", listener);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => compareCanonicalKeys(left, right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

export function canonicalOperationalEvent(event: Omit<OperationalEvent, "eventHash">): string {
  return JSON.stringify(canonicalValue(event));
}

export function computeOperationalEventHash(event: Omit<OperationalEvent, "eventHash">): string {
  return sha256Hex(canonicalOperationalEvent(event));
}

function sanitizeEventValue<T>(value: T): T {
  const sanitized = sanitizeOperationalValue(value);
  if (typeof sanitized === "string") {
    return redactHostPaths(sanitized) as T;
  }
  if (Array.isArray(sanitized)) {
    return sanitized.map((item) => sanitizeEventValue(item)) as T;
  }
  if (sanitized && typeof sanitized === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(sanitized as Record<string, unknown>)) {
      output[key] = sanitizeEventValue(nested);
    }
    return output as T;
  }
  return sanitized;
}

function assertEventSize(event: OperationalEvent): void {
  const bytes = Buffer.byteLength(`${JSON.stringify(event, null, 2)}\n`, "utf8");
  if (bytes > MAX_OPERATIONAL_EVENT_BYTES) {
    throw new Error(`operational event exceeds ${MAX_OPERATIONAL_EVENT_BYTES} byte limit`);
  }
  if (event.payload && Object.keys(event.payload).length > MAX_OPERATIONAL_EVENT_PAYLOAD_KEYS) {
    throw new Error(`operational event payload exceeds ${MAX_OPERATIONAL_EVENT_PAYLOAD_KEYS} key limit`);
  }
}

export function createOperationalEvent(
  input: OperationalEventInput,
  schemaRoot?: string,
): OperationalEvent {
  const sanitized = sanitizeEventValue(input);
  const withoutIdentity = {
    ...sanitized,
    schema: OPERATIONAL_EVENT_SCHEMA,
    schemaVersion: OPERATIONAL_EVENT_SCHEMA_VERSION,
    eventId: sanitized.eventId ?? randomUUID(),
    recordedAt: sanitized.recordedAt ?? new Date().toISOString(),
  } as Omit<OperationalEvent, "eventHash">;
  const event = {
    ...withoutIdentity,
    eventHash: computeOperationalEventHash(withoutIdentity),
  } as OperationalEvent;
  assertSchema("operational-event.schema.json", event, schemaRoot);
  assertEventSize(event);
  return event;
}

function eventFiles(paths: UadsPaths): string[] {
  if (!fs.existsSync(paths.observabilityEvents)) {
    return [];
  }
  return fs
    .readdirSync(paths.observabilityEvents, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .slice(0, MAX_OPERATIONAL_EVENT_SCAN)
    .map((name) => path.join(paths.observabilityEvents, name));
}

function writeImmutableEvent(target: string, contents: string): void {
  const directory = path.dirname(target);
  injectedStorageFault(directory, "storage-directory");
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(target)}.tmp-${randomUUID()}`);
  let descriptor: number | undefined;
  try {
    injectedStorageFault(directory, "event-file");
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, contents, "utf8");
    // Capacity exhaustion is modelled at the commit point: the temporary file
    // already holds data and the descriptor is flushed to the filesystem next.
    injectedStorageFault(directory, "event-commit");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    // A hard-link creates the final name without replacing an existing record.
    fs.linkSync(temporary, target);
    fs.unlinkSync(temporary);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      if (fs.existsSync(temporary)) {
        fs.unlinkSync(temporary);
      }
    } catch {
      // A failed cleanup is reported by the original operation.
    }
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("operational event id already exists; immutable record preserved");
    }
    throw error;
  }
}

export function enforceOperationalRetention(
  paths: UadsPaths,
  retention = DEFAULT_OPERATIONAL_EVENT_RETENTION,
): { removed: number; errors: string[] } {
  const boundedRetention = Math.max(1, Math.min(MAX_OPERATIONAL_EVENT_SCAN, Math.floor(retention)));
  const files = eventFiles(paths);
  if (files.length <= boundedRetention) {
    return { removed: 0, errors: [] };
  }
  const ordered = files
    .map((file) => {
      try {
        return { file, mtime: fs.statSync(file).mtimeMs };
      } catch {
        return { file, mtime: 0 };
      }
    })
    .sort((left, right) => left.mtime - right.mtime || compareCanonicalKeys(left.file, right.file));
  let removed = 0;
  const errors: string[] = [];
  for (const item of ordered.slice(0, files.length - boundedRetention)) {
    try {
      fs.unlinkSync(item.file);
      removed += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { removed, errors };
}

export function persistOperationalEvent(
  paths: UadsPaths,
  eventOrInput: OperationalEvent | OperationalEventInput,
  options: { schemaRoot?: string; retention?: number } = {},
): OperationalEvent {
  const event = "eventHash" in eventOrInput ? sanitizeEventValue(eventOrInput) : createOperationalEvent(eventOrInput, options.schemaRoot);
  assertSchema("operational-event.schema.json", event, options.schemaRoot);
  assertEventSize(event);
  const withoutHash = { ...event } as Omit<OperationalEvent, "eventHash">;
  delete (withoutHash as Partial<OperationalEvent>).eventHash;
  if (computeOperationalEventHash(withoutHash) !== event.eventHash) {
    throw new Error("operational event hash does not match canonical content");
  }
  if (event.projectId !== path.basename(paths.workspace)) {
    throw new Error("operational event project attribution does not match sidecar workspace");
  }
  const target = sidecarJsonPath(paths.observabilityEvents, event.eventId);
  try {
    writeImmutableEvent(target, `${JSON.stringify(event, null, 2)}\n`);
  } catch (error) {
    recordOperationalStoragePressure(paths, error);
    throw error;
  }
  clearOperationalStoragePressure(paths);
  const retention = enforceOperationalRetention(paths, options.retention);
  const projection = readOperationalEvents(paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT });
  const health = retention.errors.length > 0
    ? { ...projection.health, status: "DEGRADED" as const, reasonCodes: [...projection.health.reasonCodes, "RETENTION_CLEANUP_FAILED"] }
    : projection.health;
  try {
    atomicWriteJson(paths.observabilityHealth, health);
  } catch {
    // The event itself remains durable; readers derive UNAVAILABLE/DEGRADED from the event directory.
  }
  hubFor(paths).emit("event", event);
  return event;
}

function invalidHealth(reasonCodes: string[], validEventCount = 0, invalidEventCount = 0): OperationalHealth {
  return {
    status: "UNAVAILABLE",
    validEventCount,
    invalidEventCount,
    rejectedEventCount: invalidEventCount,
    scanSaturated: false,
    lastEventAt: null,
    reasonCodes: [...new Set(reasonCodes)],
    updatedAt: new Date().toISOString(),
  };
}

function validateLoadedEvent(value: unknown, expectedProjectId: string, schemaRoot?: string): { event: OperationalEvent | null; reason: string | null } {
  try {
    assertSchema("operational-event.schema.json", value, schemaRoot);
  } catch {
    const candidate = value as { schemaVersion?: unknown };
    return { event: null, reason: candidate?.schemaVersion !== OPERATIONAL_EVENT_SCHEMA_VERSION ? "UNSUPPORTED_EVENT_VERSION" : "INVALID_EVENT_RECORD" };
  }
  const event = value as OperationalEvent;
  if (event.projectId !== expectedProjectId) {
    return { event: null, reason: "PROJECT_ATTRIBUTION_MISMATCH" };
  }
  const withoutHash = { ...event } as Omit<OperationalEvent, "eventHash">;
  delete (withoutHash as Partial<OperationalEvent>).eventHash;
  if (computeOperationalEventHash(withoutHash) !== event.eventHash) {
    return { event: null, reason: "EVENT_HASH_MISMATCH" };
  }
  return { event, reason: null };
}

export function readOperationalEvents(
  paths: UadsPaths,
  options: { limit?: number; schemaRoot?: string } = {},
): OperationalEventRead {
  const limit = Math.max(1, Math.min(MAX_OPERATIONAL_EVENT_LIMIT, Math.floor(options.limit ?? DEFAULT_OPERATIONAL_EVENT_LIMIT)));
  const pressure = readOperationalStoragePressure(paths);
  if (!fs.existsSync(paths.observabilityEvents)) {
    return { events: [], health: applyStoragePressure(invalidHealth([OPERATIONAL_STORAGE_REASON_CODES.unavailable]), pressure) };
  }
  let files: string[];
  try {
    files = eventFiles(paths);
  } catch {
    return { events: [], health: applyStoragePressure(invalidHealth([OPERATIONAL_STORAGE_REASON_CODES.unavailable]), pressure) };
  }
  const events: OperationalEvent[] = [];
  const reasons: string[] = [];
  const expectedProjectId = path.basename(paths.workspace);
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      const validated = validateLoadedEvent(parsed, expectedProjectId, options.schemaRoot);
      if (validated.event) {
        events.push(validated.event);
      } else if (validated.reason) {
        reasons.push(validated.reason);
      }
    } catch {
      reasons.push("INVALID_EVENT_RECORD");
    }
  }
  events.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || right.eventId.localeCompare(left.eventId));
  const selected = events.slice(0, limit);
  const scanSaturated = files.length >= MAX_OPERATIONAL_EVENT_SCAN;
  const rejectedCount = reasons.length;
  const invalidCount = rejectedCount + (scanSaturated ? 1 : 0);
  const status: OperationalState = invalidCount > 0 ? "DEGRADED" : events.length > 0 ? "HEALTHY" : "UNAVAILABLE";
  const health: OperationalHealth = {
    status,
    validEventCount: events.length,
    invalidEventCount: invalidCount,
    rejectedEventCount: rejectedCount,
    scanSaturated,
    lastEventAt: events[0]?.recordedAt ?? null,
    reasonCodes: [...new Set(reasons.length > 0 ? reasons : events.length > 0 ? [] : ["NO_OPERATIONAL_EVENTS"])],
    updatedAt: new Date().toISOString(),
  };
  return { events: selected, health: applyStoragePressure(health, pressure) };
}

export function readOperationalHealth(paths: UadsPaths, schemaRoot?: string): OperationalHealth {
  const current = readOperationalEvents(paths, { limit: 1, schemaRoot }).health;
  return current;
}

export function b001AnalysisSignature(event: OperationalEvent): string {
  if (event.eventType !== "review.analysis" || !event.gate || !event.normalizedSubjectPath || !event.normalizedFindingCode || !event.evidenceDigest) {
    throw new Error("review.analysis event lacks canonical B-001 fields");
  }
  return [event.eventType, event.gate, event.normalizedSubjectPath, event.normalizedFindingCode, event.evidenceDigest].join(" | ");
}

export function computeB001AnalysisMetrics(events: OperationalEvent[]): B001AnalysisMetrics {
  const analysis = events.filter((event) => event.eventType === "review.analysis");
  const counts = new Map<string, number>();
  for (const event of analysis) {
    const signature = b001AnalysisSignature(event);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  const numerator = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const denominator = analysis.length;
  return {
    signature: "normalized-structured-analysis-signature-v1",
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : null,
    rawEventHashes: analysis.map((event) => event.eventHash).sort(),
  };
}
