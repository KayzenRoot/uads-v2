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
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${randomUUID()}`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, contents, "utf8");
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
  writeImmutableEvent(target, `${JSON.stringify(event, null, 2)}\n`);
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
  if (!fs.existsSync(paths.observabilityEvents)) {
    return { events: [], health: invalidHealth(["OBSERVABILITY_STORAGE_UNAVAILABLE"]) };
  }
  let files: string[];
  try {
    files = eventFiles(paths);
  } catch {
    return { events: [], health: invalidHealth(["OBSERVABILITY_STORAGE_UNAVAILABLE"]) };
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
  const invalidCount = reasons.length + (files.length >= MAX_OPERATIONAL_EVENT_SCAN ? 1 : 0);
  const status: OperationalState = invalidCount > 0 ? "DEGRADED" : events.length > 0 ? "HEALTHY" : "UNAVAILABLE";
  const health: OperationalHealth = {
    status,
    validEventCount: events.length,
    invalidEventCount: invalidCount,
    lastEventAt: events[0]?.recordedAt ?? null,
    reasonCodes: [...new Set(reasons.length > 0 ? reasons : events.length > 0 ? [] : ["NO_OPERATIONAL_EVENTS"])],
    updatedAt: new Date().toISOString(),
  };
  return { events: selected, health };
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
