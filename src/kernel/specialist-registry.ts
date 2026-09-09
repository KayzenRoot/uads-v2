import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { isPathInside, sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import { DOMAIN_IDS } from "./domains.js";
import { BUILTIN_SPECIALIST_PROFILES } from "./specialist-catalog.js";
import {
  SPECIALIST_POLICY_VERSION,
  SPECIALIST_SCHEMA_VERSION,
  type SpecialistActivation,
  type SpecialistFunction,
  type SpecialistIndependenceClass,
  type SpecialistProfile,
  type SpecialistRegistry,
  type SpecialistSource,
  type SpecialistStatus,
} from "./specialist-types.js";

export const MAX_SPECIALIST_PROFILES = 64;
export const MAX_SPECIALIST_ARRAY_ITEMS = 32;

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]+$/;
const SPECIALIST_KINDS = ["core", "domain", "assurance"] as const;
const SPECIALIST_STATUSES: SpecialistStatus[] = ["enabled", "disabled", "experimental"];
const SPECIALIST_SOURCES: SpecialistSource[] = ["builtin", "user-config", "adapter"];
const INDEPENDENCE_CLASSES: SpecialistIndependenceClass[] = ["implementation", "support", "independent-review", "assurance"];
const FUNCTIONS: SpecialistFunction[] = [
  "inspect", "requirements", "architecture", "planning", "implementation", "testing", "independent-review",
  "security-assurance", "performance-assurance", "reliability-assurance", "checkpoint", "frontend", "backend-api",
  "database", "mobile", "platform-cloud", "data-ai", "web3-contract", "finance-math", "game-systems",
  "documentation", "release", "quality",
];
const PROFILE_KEYS = [
  "schema", "schemaVersion", "specialistId", "kind", "status", "purpose", "coveredDomains", "functions",
  "mayImplement", "reviewOnly", "independenceClass", "activation", "requiredInputs", "producesEvidence",
  "incompatibleWith", "priority", "source", "notes", "profileDigest",
] as const;
const ACTIVATION_KEYS = ["scopeClasses", "minRisk", "domainAny", "riskSignalsAny", "gatesAny", "affectedAreaAny"] as const;
const RISKS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const SCOPES = ["trivial", "local", "cross-cutting", "architectural"] as const;

export class SpecialistRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecialistRegistryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new SpecialistRegistryError(`${label} contains unsupported fields: ${unknown.sort().join(", ")}`);
  }
}

function isAbsoluteLike(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value) || /^file:\/\//i.test(value);
}

function safeString(value: unknown, label: string, maxLength: number, required = true): string | null {
  if (value === undefined || value === null) {
    if (!required) return null;
    throw new SpecialistRegistryError(`${label} is required`);
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || !SAFE_TEXT.test(value)) {
    throw new SpecialistRegistryError(`${label} must be a bounded safe string`);
  }
  const trimmed = value.trim();
  if (isAbsoluteLike(trimmed) || containsUnredactedSecret(trimmed) || containsAbsoluteHostPath(trimmed) || /(^|\b)(command|commands|hook|hooks|exec|curl|powershell|bash)(\b|[:/])/i.test(trimmed)) {
    throw new SpecialistRegistryError(`${label} contains secret-like or host-path data`);
  }
  return trimmed;
}

function safeStringArray(value: unknown, label: string, maxLength: number, required = true): string[] {
  if (value === undefined || value === null) {
    if (!required) return [];
    throw new SpecialistRegistryError(`${label} is required`);
  }
  if (!Array.isArray(value) || value.length > MAX_SPECIALIST_ARRAY_ITEMS) {
    throw new SpecialistRegistryError(`${label} must be a bounded array`);
  }
  const values = value.map((item, index) => safeString(item, `${label}[${index}]`, maxLength) as string);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string, fallback?: T): T {
  const selected = value === undefined ? fallback : value;
  if (typeof selected !== "string" || !allowed.includes(selected as T)) {
    throw new SpecialistRegistryError(`${label} has an unsupported value`);
  }
  return selected as T;
}

function safeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new SpecialistRegistryError(`${label} must be a bounded non-negative integer`);
  }
  return value;
}

function normalizeActivation(value: unknown): SpecialistActivation {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new SpecialistRegistryError("activation must be an object");
  assertOnlyKeys(value, ACTIVATION_KEYS, "activation");
  const scopeClasses = value.scopeClasses === undefined ? undefined : safeStringArray(value.scopeClasses, "activation.scopeClasses", 32).map((item) => enumValue(item, SCOPES, "activation.scopeClasses"));
  const domainAny = value.domainAny === undefined ? undefined : safeStringArray(value.domainAny, "activation.domainAny", 64).map((item) => enumValue(item, DOMAIN_IDS, "activation.domainAny"));
  const minRisk = value.minRisk === undefined ? undefined : enumValue(value.minRisk, RISKS, "activation.minRisk");
  const riskSignalsAny = value.riskSignalsAny === undefined ? undefined : safeStringArray(value.riskSignalsAny, "activation.riskSignalsAny", 96);
  const gatesAny = value.gatesAny === undefined ? undefined : safeStringArray(value.gatesAny, "activation.gatesAny", 96);
  const affectedAreaAny = value.affectedAreaAny === undefined ? undefined : safeStringArray(value.affectedAreaAny, "activation.affectedAreaAny", 96);
  return { scopeClasses, minRisk, domainAny, riskSignalsAny, gatesAny, affectedAreaAny };
}

function profilePayload(profile: Omit<SpecialistProfile, "profileDigest">): string {
  return JSON.stringify({
    schema: profile.schema,
    schemaVersion: profile.schemaVersion,
    specialistId: profile.specialistId,
    kind: profile.kind,
    status: profile.status,
    purpose: profile.purpose,
    coveredDomains: profile.coveredDomains,
    functions: profile.functions,
    mayImplement: profile.mayImplement,
    reviewOnly: profile.reviewOnly,
    independenceClass: profile.independenceClass,
    activation: profile.activation,
    requiredInputs: profile.requiredInputs,
    producesEvidence: profile.producesEvidence,
    incompatibleWith: profile.incompatibleWith,
    priority: profile.priority,
    source: profile.source,
    notes: profile.notes,
  });
}

export function computeSpecialistProfileDigest(profile: Omit<SpecialistProfile, "profileDigest">): string {
  return sha256Hex(profilePayload(profile));
}

export function normalizeSpecialistProfile(raw: unknown, sourceOverride?: SpecialistSource): SpecialistProfile {
  if (!isRecord(raw)) throw new SpecialistRegistryError("specialist profile must be a JSON object");
  assertOnlyKeys(raw, PROFILE_KEYS, "specialist profile");
  const specialistId = safeString(raw.specialistId, "specialistId", 96) as string;
  if (!SAFE_ID.test(specialistId) || ["__proto__", "constructor", "prototype"].includes(specialistId)) {
    throw new SpecialistRegistryError("specialistId is unsafe");
  }
  const schema = raw.schema === undefined ? "uads.specialist-profile" : raw.schema;
  const schemaVersion = raw.schemaVersion === undefined ? SPECIALIST_SCHEMA_VERSION : raw.schemaVersion;
  if (schema !== "uads.specialist-profile" || schemaVersion !== SPECIALIST_SCHEMA_VERSION) {
    throw new SpecialistRegistryError("specialist profile schema/version mismatch");
  }
  const coveredDomains = safeStringArray(raw.coveredDomains, "coveredDomains", 64).map((item) => enumValue(item, DOMAIN_IDS, "coveredDomains"));
  const functions = safeStringArray(raw.functions, "functions", 64).map((item) => enumValue(item, FUNCTIONS, "functions"));
  const mayImplement = raw.mayImplement;
  const reviewOnly = raw.reviewOnly;
  if (typeof mayImplement !== "boolean" || typeof reviewOnly !== "boolean") throw new SpecialistRegistryError("mayImplement and reviewOnly must be boolean");
  const independenceClass = enumValue(raw.independenceClass, INDEPENDENCE_CLASSES, "independenceClass");
  if (mayImplement && reviewOnly) throw new SpecialistRegistryError("reviewOnly=true and mayImplement=true is invalid");
  if (independenceClass === "independent-review" && mayImplement) throw new SpecialistRegistryError("independent-review profiles cannot implement");
  if (mayImplement && independenceClass !== "implementation") throw new SpecialistRegistryError("implementing profiles must use independenceClass=implementation");
  if (reviewOnly && independenceClass === "implementation") throw new SpecialistRegistryError("implementation class cannot be reviewOnly");
  const incompatibleWith = safeStringArray(raw.incompatibleWith, "incompatibleWith", 96);
  for (const item of incompatibleWith) {
    if (!SAFE_ID.test(item)) throw new SpecialistRegistryError("incompatibleWith contains an unsafe specialist ID");
  }
  const profile: Omit<SpecialistProfile, "profileDigest"> = {
    schema: "uads.specialist-profile",
    schemaVersion: SPECIALIST_SCHEMA_VERSION,
    specialistId,
    kind: enumValue(raw.kind, SPECIALIST_KINDS, "kind"),
    status: enumValue(raw.status, SPECIALIST_STATUSES, "status", "enabled"),
    purpose: safeString(raw.purpose, "purpose", 240) as string,
    coveredDomains,
    functions,
    mayImplement,
    reviewOnly,
    independenceClass,
    activation: normalizeActivation(raw.activation),
    requiredInputs: safeStringArray(raw.requiredInputs, "requiredInputs", 160),
    producesEvidence: safeStringArray(raw.producesEvidence, "producesEvidence", 160),
    incompatibleWith,
    priority: safeInteger(raw.priority, "priority"),
    source: sourceOverride ?? enumValue(raw.source, SPECIALIST_SOURCES, "source", "user-config"),
    notes: raw.notes === undefined || raw.notes === null ? null : safeString(raw.notes, "notes", 1000),
  };
  const profileDigest = computeSpecialistProfileDigest(profile);
  if (raw.profileDigest !== undefined && raw.profileDigest !== profileDigest) {
    throw new SpecialistRegistryError(`profileDigest mismatch for ${specialistId}`);
  }
  const normalized = { ...profile, profileDigest };
  return normalized;
}

function registryPayload(profiles: SpecialistProfile[]): string {
  return JSON.stringify({
    schema: "uads.specialist-registry",
    schemaVersion: SPECIALIST_SCHEMA_VERSION,
    policyVersion: SPECIALIST_POLICY_VERSION,
    profiles: profiles.slice().sort((a, b) => a.specialistId.localeCompare(b.specialistId)),
  });
}

export function computeSpecialistRegistryDigest(profiles: SpecialistProfile[]): string {
  return sha256Hex(registryPayload(profiles));
}

export function createSpecialistRegistry(profiles: SpecialistProfile[] = []): SpecialistRegistry {
  if (profiles.length > MAX_SPECIALIST_PROFILES) throw new SpecialistRegistryError("specialist registry exceeds maximum profile count");
  const normalized = profiles.map((item) => normalizeSpecialistProfile(item));
  normalized.sort((a, b) => a.specialistId.localeCompare(b.specialistId));
  const ids = new Set<string>();
  for (const profile of normalized) {
    if (ids.has(profile.specialistId)) throw new SpecialistRegistryError(`duplicate specialist ID: ${profile.specialistId}`);
    ids.add(profile.specialistId);
  }
  return {
    schema: "uads.specialist-registry",
    schemaVersion: SPECIALIST_SCHEMA_VERSION,
    profiles: normalized,
    registryDigest: computeSpecialistRegistryDigest(normalized),
    policyVersion: SPECIALIST_POLICY_VERSION,
  };
}

function assertNoSymlinkEscape(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isPathInside(resolvedRoot, resolvedTarget)) throw new SpecialistRegistryError("specialist sidecar path escape rejected");
  let current = resolvedRoot;
  const relative = path.relative(resolvedRoot, resolvedTarget);
  for (const segment of relative.split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new SpecialistRegistryError("specialist sidecar symlink escape rejected");
  }
}

export function persistSpecialistRegistry(paths: UadsPaths, registry: SpecialistRegistry, schemaRoot?: string): SpecialistRegistry {
  const normalized = createSpecialistRegistry(registry.profiles);
  if (registry.registryDigest !== normalized.registryDigest || registry.policyVersion !== SPECIALIST_POLICY_VERSION) {
    throw new SpecialistRegistryError("specialist registry digest or policy version mismatch");
  }
  assertSchema("specialist-registry.schema.json", normalized, schemaRoot);
  assertNoSymlinkEscape(paths.home, paths.specialistRegistry);
  fs.mkdirSync(path.dirname(paths.specialistRegistry), { recursive: true });
  atomicWriteJson(paths.specialistRegistry, sanitizeOperationalValue(normalized));
  const state = {
    schema: "uads.specialist-registry-state",
    schemaVersion: SPECIALIST_SCHEMA_VERSION,
    registryDigest: normalized.registryDigest,
    policyVersion: normalized.policyVersion,
    profileCount: normalized.profiles.length,
  };
  assertSchema("specialist-registry-state.schema.json", state, schemaRoot);
  atomicWriteJson(paths.specialistState, state);
  return normalized;
}

export function builtinSpecialistRegistry(schemaRoot?: string): SpecialistRegistry {
  const profiles = BUILTIN_SPECIALIST_PROFILES.map((item) => normalizeSpecialistProfile(item, "builtin"));
  const registry = createSpecialistRegistry(profiles);
  if (schemaRoot) assertSchema("specialist-registry.schema.json", registry, schemaRoot);
  return registry;
}

export function loadSpecialistRegistry(paths: UadsPaths, schemaRoot?: string): SpecialistRegistry {
  if (!fs.existsSync(paths.specialistRegistry)) {
    return persistSpecialistRegistry(paths, builtinSpecialistRegistry(schemaRoot), schemaRoot);
  }
  assertNoSymlinkEscape(paths.home, paths.specialistRegistry);
  const parsed = readJsonIfValid<SpecialistRegistry>(paths.specialistRegistry);
  if (!parsed.ok) throw new SpecialistRegistryError("specialist registry is missing or corrupt");
  try {
    assertSchema("specialist-registry.schema.json", parsed.value, schemaRoot);
  } catch (error) {
    throw new SpecialistRegistryError(`specialist registry failed schema validation: ${error instanceof Error ? error.message : String(error)}`);
  }
  const normalized = createSpecialistRegistry(parsed.value.profiles.map((profile) => normalizeSpecialistProfile(profile)));
  if (normalized.registryDigest !== parsed.value.registryDigest || parsed.value.policyVersion !== SPECIALIST_POLICY_VERSION) {
    throw new SpecialistRegistryError("specialist registry digest or policy version mismatch");
  }
  return normalized;
}

export function addSpecialistProfiles(paths: UadsPaths, raw: unknown, schemaRoot?: string): SpecialistRegistry {
  const profilesRaw = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.profiles)
      ? (assertOnlyKeys(raw, ["profiles"], "specialist profile import"), raw.profiles)
      : [raw];
  if (profilesRaw.length === 0 || profilesRaw.length > MAX_SPECIALIST_PROFILES) throw new SpecialistRegistryError("profile import count is outside the allowed range");
  const incoming = profilesRaw.map((item) => normalizeSpecialistProfile(item, "user-config"));
  const ids = new Set<string>();
  for (const profile of incoming) {
    if (ids.has(profile.specialistId)) throw new SpecialistRegistryError(`duplicate specialist ID: ${profile.specialistId}`);
    ids.add(profile.specialistId);
  }
  const current = loadSpecialistRegistry(paths, schemaRoot);
  const collision = incoming.find((profile) => current.profiles.some((item) => item.specialistId === profile.specialistId));
  if (collision) throw new SpecialistRegistryError(`specialist ID already registered: ${collision.specialistId}`);
  return persistSpecialistRegistry(paths, createSpecialistRegistry([...current.profiles, ...incoming]), schemaRoot);
}
