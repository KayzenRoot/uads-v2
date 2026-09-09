import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  MODEL_ROUTING_SCHEMA_VERSION,
  type ModelProfile,
  type ModelProfileRegistry,
  type ModelProfileSource,
  type ModelStatus,
  type ModelSupports,
  type ReasoningClass,
  type RelativeCostClass,
  type RelativeLatencyClass,
} from "./model-types.js";

export const MAX_MODEL_PROFILES = 256;
const SAFE_PROFILE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const MODEL_STATUSES: ModelStatus[] = ["enabled", "disabled", "experimental"];
const REASONING_CLASSES: ReasoningClass[] = ["basic", "standard", "advanced", "deep"];
const COST_CLASSES: RelativeCostClass[] = ["very-low", "low", "medium", "high", "very-high", "unknown"];
const LATENCY_CLASSES: RelativeLatencyClass[] = ["very-low", "low", "medium", "high", "very-high", "unknown"];
const PROFILE_SOURCES: ModelProfileSource[] = ["builtin-fixture", "user-config", "adapter", "imported"];
const SUPPORT_KEYS = [
  "toolCalling",
  "structuredOutput",
  "vision",
  "promptCache",
  "explicitCache",
  "persistentContext",
  "usageTelemetry",
] as const;
const PROFILE_KEYS = [
  "schema",
  "schemaVersion",
  "profileId",
  "providerId",
  "modelId",
  "status",
  "capabilityClass",
  "reasoningClass",
  "contextWindowTokens",
  "maxOutputTokens",
  "relativeCostClass",
  "relativeLatencyClass",
  "supports",
  "constraints",
  "notes",
  "source",
  "adapterId",
  "adapterVersion",
  "profileDigest",
] as const;

export class ModelRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRegistryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new ModelRegistryError(`${label} contains unsupported fields: ${unknown.sort().join(", ")}`);
  }
}

function stringValue(value: unknown, label: string, maxLength: number, required = true): string | null {
  if (value === undefined || value === null) {
    if (!required) return null;
    throw new ModelRegistryError(`${label} is required`);
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ModelRegistryError(`${label} must be a bounded safe string`);
  }
  const trimmed = value.trim();
  if (containsUnredactedSecret(trimmed) || containsAbsoluteHostPath(trimmed)) {
    throw new ModelRegistryError(`${label} contains secret-like or host-path data`);
  }
  return trimmed;
}

function integerValue(value: unknown, label: string, required = false): number | null {
  if (value === undefined || value === null) {
    if (!required) return null;
    throw new ModelRegistryError(`${label} is required`);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ModelRegistryError(`${label} must be a positive integer`);
  }
  return value;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string, fallback?: T): T {
  const selected = value === undefined ? fallback : value;
  if (typeof selected !== "string" || !values.includes(selected as T)) {
    throw new ModelRegistryError(`${label} has an unsupported value`);
  }
  return selected as T;
}

function normalizeSupports(value: unknown): ModelSupports {
  if (!isRecord(value)) throw new ModelRegistryError("supports must be an object");
  assertOnlyKeys(value, SUPPORT_KEYS, "supports");
  const result = {} as ModelSupports;
  for (const key of SUPPORT_KEYS) {
    if (typeof value[key] !== "boolean") {
      throw new ModelRegistryError(`supports.${key} must be boolean`);
    }
    result[key] = value[key] as boolean;
  }
  return result;
}

function normalizedProfilePayload(profile: Omit<ModelProfile, "profileDigest">): string {
  return JSON.stringify({
    schema: profile.schema,
    schemaVersion: profile.schemaVersion,
    profileId: profile.profileId,
    providerId: profile.providerId,
    modelId: profile.modelId,
    status: profile.status,
    capabilityClass: profile.capabilityClass,
    reasoningClass: profile.reasoningClass,
    contextWindowTokens: profile.contextWindowTokens,
    maxOutputTokens: profile.maxOutputTokens,
    relativeCostClass: profile.relativeCostClass,
    relativeLatencyClass: profile.relativeLatencyClass,
    supports: profile.supports,
    constraints: { maxConcurrency: profile.constraints.maxConcurrency ?? null },
    notes: profile.notes,
    source: profile.source,
    adapterId: profile.adapterId,
    adapterVersion: profile.adapterVersion,
  });
}

export function computeModelProfileDigest(profile: Omit<ModelProfile, "profileDigest">): string {
  return sha256Hex(normalizedProfilePayload(profile));
}

export function normalizeModelProfile(raw: unknown, sourceOverride?: ModelProfileSource): ModelProfile {
  if (!isRecord(raw)) throw new ModelRegistryError("model profile must be a JSON object");
  assertOnlyKeys(raw, PROFILE_KEYS, "model profile");
  const profileId = stringValue(raw.profileId, "profileId", 128) as string;
  if (!SAFE_PROFILE_ID.test(profileId) || profileId.includes("..") || ["__proto__", "constructor", "prototype"].includes(profileId)) {
    throw new ModelRegistryError("profileId is unsafe");
  }
  const schema = raw.schema === undefined ? "uads.model-profile" : raw.schema;
  const schemaVersion = raw.schemaVersion === undefined ? MODEL_ROUTING_SCHEMA_VERSION : raw.schemaVersion;
  if (schema !== "uads.model-profile" || schemaVersion !== MODEL_ROUTING_SCHEMA_VERSION) {
    throw new ModelRegistryError("model profile schema/version mismatch");
  }
  const providerId = stringValue(raw.providerId, "providerId", 128) as string;
  const modelId = stringValue(raw.modelId, "modelId", 256) as string;
  const contextWindowTokens = integerValue(raw.contextWindowTokens, "contextWindowTokens");
  const maxOutputTokens = integerValue(raw.maxOutputTokens, "maxOutputTokens");
  const constraintsRaw = raw.constraints === undefined ? {} : raw.constraints;
  if (!isRecord(constraintsRaw)) throw new ModelRegistryError("constraints must be an object");
  assertOnlyKeys(constraintsRaw, ["maxConcurrency"], "constraints");
  const maxConcurrency = integerValue(constraintsRaw.maxConcurrency, "constraints.maxConcurrency");
  const notes = raw.notes === undefined || raw.notes === null ? null : stringValue(raw.notes, "notes", 2000);
  if (sourceOverride && raw.source !== undefined && !PROFILE_SOURCES.includes(raw.source as ModelProfileSource)) {
    throw new ModelRegistryError("source has an unsupported value");
  }
  const profile: Omit<ModelProfile, "profileDigest"> = {
    schema: "uads.model-profile",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    profileId,
    providerId,
    modelId,
    status: enumValue(raw.status, MODEL_STATUSES, "status", "enabled"),
    capabilityClass: enumValue(raw.capabilityClass, ["economy", "balanced", "strong", "critical"], "capabilityClass"),
    reasoningClass: enumValue(raw.reasoningClass, REASONING_CLASSES, "reasoningClass"),
    contextWindowTokens,
    maxOutputTokens,
    relativeCostClass: enumValue(raw.relativeCostClass, COST_CLASSES, "relativeCostClass", "unknown"),
    relativeLatencyClass: enumValue(raw.relativeLatencyClass, LATENCY_CLASSES, "relativeLatencyClass", "unknown"),
    supports: normalizeSupports(raw.supports),
    constraints: { maxConcurrency },
    notes,
    source: sourceOverride ?? enumValue(raw.source, PROFILE_SOURCES, "source", "user-config"),
    adapterId: raw.adapterId === undefined || raw.adapterId === null ? null : stringValue(raw.adapterId, "adapterId", 128),
    adapterVersion:
      raw.adapterVersion === undefined || raw.adapterVersion === null
        ? null
        : stringValue(raw.adapterVersion, "adapterVersion", 64),
  };
  const profileDigest = computeModelProfileDigest(profile);
  if (raw.profileDigest !== undefined && raw.profileDigest !== profileDigest) {
    throw new ModelRegistryError(`profileDigest mismatch for ${profileId}`);
  }
  const normalized = { ...profile, profileDigest };
  assertSchema("model-profile.schema.json", normalized);
  return normalized;
}

function registryPayload(profiles: ModelProfile[]): string {
  return JSON.stringify({
    schema: "uads.model-profile-registry",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    profiles: profiles
      .slice()
      .sort((a, b) => a.profileId.localeCompare(b.profileId))
      .map((profile) => ({ ...profile })),
  });
}

export function computeModelRegistryDigest(profiles: ModelProfile[]): string {
  return sha256Hex(registryPayload(profiles));
}

export function createModelProfileRegistry(profiles: ModelProfile[] = []): ModelProfileRegistry {
  if (profiles.length > MAX_MODEL_PROFILES) throw new ModelRegistryError("model registry exceeds maximum profile count");
  const sorted = profiles.slice().sort((a, b) => a.profileId.localeCompare(b.profileId));
  const ids = new Set<string>();
  for (const profile of sorted) {
    if (ids.has(profile.profileId)) throw new ModelRegistryError(`duplicate profile ID: ${profile.profileId}`);
    ids.add(profile.profileId);
    normalizeModelProfile(profile);
  }
  return {
    schema: "uads.model-profile-registry",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    profiles: sorted,
    registryDigest: computeModelRegistryDigest(sorted),
  };
}

export function persistModelProfileRegistry(paths: UadsPaths, registry: ModelProfileRegistry, schemaRoot?: string): ModelProfileRegistry {
  const normalizedProfiles = registry.profiles.map((profile) => normalizeModelProfile(profile));
  const normalized = createModelProfileRegistry(normalizedProfiles);
  if (registry.registryDigest !== normalized.registryDigest) {
    throw new ModelRegistryError("registryDigest mismatch");
  }
  assertSchema("model-profile-registry.schema.json", normalized, schemaRoot);
  fs.mkdirSync(path.dirname(paths.modelRegistry), { recursive: true });
  atomicWriteJson(paths.modelRegistry, normalized);
  atomicWriteJson(paths.registryState, {
    schema: "uads.model-registry-state",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    registryDigest: normalized.registryDigest,
    profileCount: normalized.profiles.length,
  });
  return normalized;
}

export function loadModelProfileRegistry(paths: UadsPaths, schemaRoot?: string): ModelProfileRegistry {
  if (!fs.existsSync(paths.modelRegistry)) {
    return persistModelProfileRegistry(paths, createModelProfileRegistry(), schemaRoot);
  }
  const parsed = readJsonIfValid<ModelProfileRegistry>(paths.modelRegistry);
  if (!parsed.ok) throw new ModelRegistryError("model registry is missing or corrupt");
  try {
    assertSchema("model-profile-registry.schema.json", parsed.value, schemaRoot);
  } catch (error) {
    throw new ModelRegistryError(`model registry failed schema validation: ${error instanceof Error ? error.message : String(error)}`);
  }
  const normalized = createModelProfileRegistry(parsed.value.profiles.map((profile) => normalizeModelProfile(profile)));
  if (normalized.registryDigest !== parsed.value.registryDigest) {
    throw new ModelRegistryError("model registry digest mismatch");
  }
  return normalized;
}

export function addModelProfiles(paths: UadsPaths, raw: unknown, schemaRoot?: string): ModelProfileRegistry {
  if (isRecord(raw) && Array.isArray(raw.profiles)) {
    assertOnlyKeys(raw, ["profiles"], "model profile import");
  }
  const profilesRaw = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.profiles)
      ? raw.profiles
      : [raw];
  if (profilesRaw.length === 0 || profilesRaw.length > MAX_MODEL_PROFILES) {
    throw new ModelRegistryError("profile import count is outside the allowed range");
  }
  const incoming = profilesRaw.map((profile) => {
    const sourceProfile = normalizeModelProfile(profile);
    return normalizeModelProfile({ ...sourceProfile, source: "user-config", profileDigest: undefined }, "user-config");
  });
  const incomingIds = new Set<string>();
  for (const profile of incoming) {
    if (incomingIds.has(profile.profileId)) throw new ModelRegistryError(`duplicate profile ID: ${profile.profileId}`);
    incomingIds.add(profile.profileId);
  }
  const current = loadModelProfileRegistry(paths, schemaRoot);
  const collision = incoming.find((profile) => current.profiles.some((item) => item.profileId === profile.profileId));
  if (collision) throw new ModelRegistryError(`profile ID already registered: ${collision.profileId}`);
  const next = createModelProfileRegistry([...current.profiles, ...incoming]);
  return persistModelProfileRegistry(paths, next, schemaRoot);
}
