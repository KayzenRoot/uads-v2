import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import { type UadsPaths } from "../lib/workspace.js";
import {
  type GefCommandReceipt,
  type GefCurrent,
  type GefReadState,
  type GefProjectProfile,
  type GefRegistry,
  type GefSourceSnapshot,
  type GefTelemetryEvent,
} from "./types.js";

export function ensureGefLayout(paths: UadsPaths): void {
  for (const directory of [paths.gef, path.dirname(paths.gefRegistry), paths.gefProjects, paths.gefReceipts, paths.gefTelemetry]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

export function gefProjectDirectory(paths: UadsPaths, projectId: string): string {
  return path.join(paths.gefProjects, projectId);
}

export function gefProfilePath(paths: UadsPaths, projectId: string): string {
  return path.join(gefProjectDirectory(paths, projectId), "profile.json");
}

export function gefCurrentPath(paths: UadsPaths, projectId: string): string {
  return path.join(gefProjectDirectory(paths, projectId), "current.json");
}

export function gefBaselinePath(paths: UadsPaths, projectId: string): string {
  return path.join(gefProjectDirectory(paths, projectId), "baseline.json");
}

export function writeGefProfile(paths: UadsPaths, profile: GefProjectProfile, schemaRoot?: string): void {
  assertSchema("gef-project-profile.schema.json", profile, schemaRoot);
  atomicWriteJson(gefProfilePath(paths, profile.projectId), profile);
}

export function writeGefCurrent(paths: UadsPaths, current: GefCurrent, schemaRoot?: string): void {
  assertSchema("gef-current.schema.json", current, schemaRoot);
  atomicWriteJson(gefCurrentPath(paths, current.projectId), current);
}

export function writeGefBaseline(paths: UadsPaths, baseline: GefSourceSnapshot, schemaRoot?: string): void {
  assertSchema("gef-source-snapshot.schema.json", baseline, schemaRoot);
  atomicWriteJson(gefBaselinePath(paths, baseline.projectId), baseline);
}

function readGefDocument<T>(target: string, schemaFile: string, schemaRoot?: string): GefReadState<T> {
  if (!fs.existsSync(target)) return { status: "MISSING", value: null, reasonCode: null };
  let parsed: T;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8")) as T;
  } catch (error) {
    return { status: "CORRUPT", value: null, reasonCode: error instanceof SyntaxError ? "MALFORMED_JSON" : "READ_FAILED" };
  }
  try {
    assertSchema(schemaFile, parsed, schemaRoot);
  } catch {
    return { status: "CORRUPT", value: null, reasonCode: "SCHEMA_INVALID" };
  }
  return { status: "VALID", value: parsed, reasonCode: null };
}

export function readGefProfile(paths: UadsPaths, projectId: string, schemaRoot?: string): GefReadState<GefProjectProfile> {
  return readGefDocument(gefProfilePath(paths, projectId), "gef-project-profile.schema.json", schemaRoot);
}

export function readGefCurrent(paths: UadsPaths, projectId: string, schemaRoot?: string): GefReadState<GefCurrent> {
  return readGefDocument(gefCurrentPath(paths, projectId), "gef-current.schema.json", schemaRoot);
}

export function readGefBaseline(paths: UadsPaths, projectId: string, schemaRoot?: string): GefReadState<GefSourceSnapshot> {
  return readGefDocument(gefBaselinePath(paths, projectId), "gef-source-snapshot.schema.json", schemaRoot);
}

export function readGefRegistry(paths: UadsPaths, schemaRoot?: string): GefRegistry {
  if (!fs.existsSync(paths.gefRegistry)) {
    return { schema: "uads.gef-registry", schemaVersion: "0.1.0", entries: [], updatedAt: new Date(0).toISOString() };
  }
  const parsed = readJsonIfValid<GefRegistry>(paths.gefRegistry);
  if (!parsed.ok) throw new Error(`GEF registry unavailable: ${parsed.error}`);
  assertSchema("gef-registry.schema.json", parsed.value, schemaRoot);
  return parsed.value;
}

export function writeGefRegistry(paths: UadsPaths, registry: GefRegistry, schemaRoot?: string): void {
  const sanitized = sanitizeOperationalValue(registry);
  assertSchema("gef-registry.schema.json", sanitized, schemaRoot);
  atomicWriteJson(paths.gefRegistry, sanitized);
}

export function writeGefReceipt(paths: UadsPaths, receipt: GefCommandReceipt, schemaRoot?: string): void {
  const sanitized = sanitizeOperationalValue(receipt);
  assertSchema("gef-command-receipt.schema.json", sanitized, schemaRoot);
  atomicWriteJson(sidecarJsonPath(paths.gefReceipts, receipt.receiptId), sanitized);
}

export function writeGefTelemetry(paths: UadsPaths, event: GefTelemetryEvent, schemaRoot?: string): void {
  const sanitized = sanitizeOperationalValue(event);
  assertSchema("gef-telemetry-event.schema.json", sanitized, schemaRoot);
  atomicWriteJson(sidecarJsonPath(paths.gefTelemetry, event.eventId), sanitized);
}
