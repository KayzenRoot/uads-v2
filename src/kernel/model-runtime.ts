import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  MODEL_ROUTING_SCHEMA_VERSION,
  type CapabilityValue,
  type ModelCapability,
  type ModelProfile,
  type RuntimeCapabilities,
  type RuntimeCapabilitySnapshot,
} from "./model-types.js";

export const RUNTIME_CAPABILITY_KEYS: readonly ModelCapability[] = [
  "modelSelection",
  "toolCalling",
  "structuredOutput",
  "promptCache",
  "explicitCache",
  "persistentContext",
  "subagents",
  "parallelAgents",
  "usageTelemetry",
  "visionInput",
];

/** Capabilities supplied by the host/runtime rather than by an individual model. */
export const HOST_RUNTIME_ONLY_CAPABILITIES = ["subagents", "parallelAgents"] as const;
/** Capabilities that are usable only when both the model and runtime prove support. */
export const MODEL_RUNTIME_INTERSECTION_CAPABILITIES = [
  "toolCalling",
  "structuredOutput",
  "promptCache",
  "explicitCache",
  "persistentContext",
  "usageTelemetry",
  "visionInput",
] as const;
/** Capabilities controlled by the router/runtime boundary. */
export const ROUTER_RUNTIME_CONTROL_CAPABILITIES = ["modelSelection"] as const;

export type CapabilityOwnership = "host-runtime" | "model-runtime-intersection" | "router-runtime-control";

export function capabilityOwnership(capabilityName: ModelCapability): CapabilityOwnership {
  if ((HOST_RUNTIME_ONLY_CAPABILITIES as readonly string[]).includes(capabilityName)) return "host-runtime";
  if ((ROUTER_RUNTIME_CONTROL_CAPABILITIES as readonly string[]).includes(capabilityName)) return "router-runtime-control";
  return "model-runtime-intersection";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) throw new Error(`${label} contains unsupported fields: ${unknown.sort().join(", ")}`);
}

function safeString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must be a bounded safe string`);
  }
  const trimmed = value.trim();
  if (containsUnredactedSecret(trimmed) || containsAbsoluteHostPath(trimmed)) {
    throw new Error(`${label} contains secret-like or host-path data`);
  }
  return trimmed;
}

function capability(value: unknown, label: string): CapabilityValue {
  if (value === undefined || value === null) return "unknown";
  if (value !== true && value !== false && value !== "unknown") throw new Error(`${label} must be boolean or unknown`);
  return value;
}

function identityPayload(snapshot: Omit<RuntimeCapabilitySnapshot, "identityDigest">): string {
  return JSON.stringify({
    schema: snapshot.schema,
    schemaVersion: snapshot.schemaVersion,
    runtimeId: snapshot.runtimeId,
    adapterId: snapshot.adapterId,
    adapterVersion: snapshot.adapterVersion,
    runtimeVersion: snapshot.runtimeVersion,
    capabilities: snapshot.capabilities,
    provenance: snapshot.provenance,
  });
}

export function computeRuntimeIdentityDigest(snapshot: Omit<RuntimeCapabilitySnapshot, "identityDigest">): string {
  return sha256Hex(identityPayload(snapshot));
}

export function conservativeRuntimeCapabilitySnapshot(input: {
  runtimeId?: string;
  adapterId?: string;
  adapterVersion?: string;
  runtimeVersion?: string | null;
} = {}): RuntimeCapabilitySnapshot {
  const base: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    schema: "uads.runtime-capability-snapshot",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    runtimeId: input.runtimeId ?? "generic-runtime",
    adapterId: input.adapterId ?? "host-managed",
    adapterVersion: input.adapterVersion ?? MODEL_ROUTING_SCHEMA_VERSION,
    runtimeVersion: input.runtimeVersion ?? process.versions.node,
    capabilities: {
      modelSelection: "unknown",
      toolCalling: "unknown",
      structuredOutput: "unknown",
      promptCache: "unknown",
      explicitCache: "unknown",
      persistentContext: "unknown",
      subagents: "unknown",
      parallelAgents: "unknown",
      usageTelemetry: "unknown",
      visionInput: "unknown",
    },
    provenance: { source: "adapter", confidence: "unknown" },
  };
  return { ...base, identityDigest: computeRuntimeIdentityDigest(base) };
}

export function normalizeRuntimeCapabilitySnapshot(raw: unknown): RuntimeCapabilitySnapshot {
  if (!isRecord(raw)) throw new Error("runtime capability snapshot must be an object");
  assertOnlyKeys(raw, ["schema", "schemaVersion", "runtimeId", "adapterId", "adapterVersion", "runtimeVersion", "capabilities", "provenance", "identityDigest"], "runtime snapshot");
  if (raw.schema !== "uads.runtime-capability-snapshot" || raw.schemaVersion !== MODEL_ROUTING_SCHEMA_VERSION) {
    throw new Error("runtime capability snapshot schema/version mismatch");
  }
  if (!isRecord(raw.capabilities) || !isRecord(raw.provenance)) throw new Error("runtime snapshot nested objects are required");
  assertOnlyKeys(raw.capabilities, RUNTIME_CAPABILITY_KEYS, "runtime capabilities");
  assertOnlyKeys(raw.provenance, ["source", "confidence"], "runtime provenance");
  const capabilities = {} as RuntimeCapabilities;
  for (const key of RUNTIME_CAPABILITY_KEYS) capabilities[key] = capability(raw.capabilities[key], `capabilities.${key}`);
  const source = raw.provenance.source;
  const confidence = raw.provenance.confidence;
  if (!["adapter", "explicit-config", "test-fixture"].includes(String(source))) throw new Error("runtime provenance source is invalid");
  if (!["proven", "declared", "unknown"].includes(String(confidence))) throw new Error("runtime provenance confidence is invalid");
  const base: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    schema: "uads.runtime-capability-snapshot",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    runtimeId: safeString(raw.runtimeId, "runtimeId", 128),
    adapterId: safeString(raw.adapterId, "adapterId", 128),
    adapterVersion: safeString(raw.adapterVersion, "adapterVersion", 64),
    runtimeVersion: raw.runtimeVersion === undefined || raw.runtimeVersion === null ? null : safeString(raw.runtimeVersion, "runtimeVersion", 128),
    capabilities,
    provenance: { source: source as RuntimeCapabilitySnapshot["provenance"]["source"], confidence: confidence as RuntimeCapabilitySnapshot["provenance"]["confidence"] },
  };
  const identityDigest = computeRuntimeIdentityDigest(base);
  if (raw.identityDigest !== identityDigest) throw new Error("runtime identity digest mismatch");
  const snapshot = { ...base, identityDigest };
  assertSchema("runtime-capability-snapshot.schema.json", snapshot);
  return snapshot;
}

export function persistRuntimeCapabilitySnapshot(paths: UadsPaths, snapshot: RuntimeCapabilitySnapshot, schemaRoot?: string): RuntimeCapabilitySnapshot {
  const normalized = normalizeRuntimeCapabilitySnapshot(snapshot);
  assertSchema("runtime-capability-snapshot.schema.json", normalized, schemaRoot);
  fs.mkdirSync(paths.runtimeCapabilities, { recursive: true });
  atomicWriteJson(sidecarJsonPath(paths.runtimeCapabilities, normalized.runtimeId), normalized);
  return normalized;
}

export function readRuntimeCapabilitySnapshot(paths: UadsPaths, runtimeId = "generic-runtime", schemaRoot?: string): RuntimeCapabilitySnapshot {
  const target = sidecarJsonPath(paths.runtimeCapabilities, runtimeId);
  if (!fs.existsSync(target)) {
    return persistRuntimeCapabilitySnapshot(paths, conservativeRuntimeCapabilitySnapshot({ runtimeId }), schemaRoot);
  }
  const parsed = readJsonIfValid<RuntimeCapabilitySnapshot>(target);
  if (!parsed.ok) throw new Error("runtime capability snapshot is missing or corrupt");
  try {
    return normalizeRuntimeCapabilitySnapshot(parsed.value);
  } catch (error) {
    throw new Error(`runtime capability snapshot rejected: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function modelSupports(profile: ModelProfile, capabilityName: ModelCapability): boolean {
  if (capabilityName === "modelSelection") return true;
  if (capabilityName === "visionInput") return profile.supports.vision;
  return profile.supports[capabilityName as keyof ModelProfile["supports"]] ?? false;
}

export function effectiveCapability(profile: ModelProfile, runtime: RuntimeCapabilitySnapshot, capabilityName: ModelCapability): boolean {
  const runtimeProves = runtime.capabilities[capabilityName] === true;
  if (capabilityOwnership(capabilityName) === "host-runtime") return runtimeProves;
  if (capabilityOwnership(capabilityName) === "router-runtime-control") return runtimeProves;
  return modelSupports(profile, capabilityName) && runtimeProves;
}

export function effectiveCapabilities(profile: ModelProfile, runtime: RuntimeCapabilitySnapshot): Record<ModelCapability, boolean> {
  return Object.fromEntries(RUNTIME_CAPABILITY_KEYS.map((key) => [key, effectiveCapability(profile, runtime, key)])) as Record<ModelCapability, boolean>;
}
