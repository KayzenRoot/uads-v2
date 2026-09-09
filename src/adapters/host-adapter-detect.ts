import fs from "node:fs";
import path from "node:path";
import { computeRuntimeIdentityDigest } from "../kernel/model-runtime.js";
import { MODEL_ROUTING_SCHEMA_VERSION, type RuntimeCapabilitySnapshot } from "../kernel/model-types.js";
import {
  builtinHostAdapterRegistry,
  getHostAdapterDefinition,
} from "./host-adapter-registry.js";
import {
  computeRootIdentityDigest,
  computeTargetRootDigest,
  HostAdapterRootError,
  resolveHostRootInput,
} from "./host-adapter-root.js";
import type {
  HostAdapterDefinition,
  HostAdapterDetection,
  HostAdapterDetectionInput,
  HostAdapterId,
  HostAdapterRegistry,
} from "./host-adapter-types.js";
import { HOST_ADAPTER_CONTRACT_VERSION } from "./host-adapter-types.js";
import type { HostRootKind, HostRootSourceClass } from "./host-adapter-root.js";

export type ResolvedHostTargetSource = "default" | "explicit-override" | "environment";

export type ResolvedHostTarget = {
  definition: HostAdapterDefinition;
  hostHome: string;
  targetRoot: string;
  resourceRoot: string;
  manifestPath: string;
  source: ResolvedHostTargetSource;
  rootKind: HostRootKind;
  sourceClass: HostRootSourceClass;
  sourceLabel: string;
  rootIdentityDigest: string;
  targetRootDigest: string;
  rootLabel: string;
  canCreateAdapterRoot: boolean;
  isLegacyV010Target?: boolean;
};

function hasSymlinkSegment(target: string): boolean {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

export function resolveHostTarget(
  definition: HostAdapterDefinition,
  input: HostAdapterDetectionInput = {},
): ResolvedHostTarget {
  const resolved = resolveHostRootInput(definition, input);
  const resourceRoot = path.join(resolved.targetRoot, definition.targetRelativeRoot);
  const manifestPath = path.join(resolved.targetRoot, definition.manifestRelativeTarget);
  const rootIdentityDigest = computeRootIdentityDigest({
    adapterId: definition.adapterId,
    rootKind: resolved.rootKind,
    sourceClass: resolved.sourceClass,
    sourceLabel: resolved.sourceLabel,
  });
  const targetRootDigest = computeTargetRootDigest(definition.adapterId, resolved.targetRoot);
  return {
    definition,
    hostHome: resolved.hostHome,
    targetRoot: resolved.targetRoot,
    resourceRoot,
    manifestPath,
    source: resolved.source,
    rootKind: resolved.rootKind,
    sourceClass: resolved.sourceClass,
    sourceLabel: resolved.sourceLabel,
    rootIdentityDigest,
    targetRootDigest,
    rootLabel: definition.targetLabel,
    canCreateAdapterRoot: resolved.rootKind !== "system-user-home",
  };
}

function detectionStatus(target: ResolvedHostTarget): {
  status: HostAdapterDetection["status"];
  reasonCodes: string[];
} {
  if (hasSymlinkSegment(target.targetRoot)) {
    return { status: "BLOCKED", reasonCodes: ["HOST_TARGET_SYMLINK"] };
  }
  if (fs.existsSync(target.targetRoot) && !fs.statSync(target.targetRoot).isDirectory()) {
    return { status: "BLOCKED", reasonCodes: ["HOST_TARGET_NOT_DIRECTORY"] };
  }
  if (!fs.existsSync(target.targetRoot)) {
    return {
      status: target.canCreateAdapterRoot ? "UNPROVEN" : "UNAVAILABLE",
      reasonCodes: [target.canCreateAdapterRoot ? "EXPLICIT_TARGET_NOT_PRESENT" : "HOST_NOT_PRESENT"],
    };
  }
  if (fs.existsSync(target.resourceRoot)) {
    if (hasSymlinkSegment(target.resourceRoot) || !fs.statSync(target.resourceRoot).isDirectory()) {
      return { status: "BLOCKED", reasonCodes: ["HOST_RESOURCE_ROOT_INVALID"] };
    }
  }
  return { status: "SUPPORTED", reasonCodes: ["HOST_TARGET_PRESENT", "VERSION_UNPROVEN"] };
}

function blockedDetection(
  adapterId: HostAdapterId,
  definition: HostAdapterDefinition,
  reasonCodes: readonly string[],
): HostAdapterDetection {
  return {
    adapterId,
    status: "BLOCKED",
    version: null,
    detectionMethod: "host-root-resolution",
    targetLabel: definition.targetLabel,
    provenCapabilities: { ...definition.capabilities },
    reasonCodes: [...reasonCodes],
    detectedAt: new Date().toISOString(),
  };
}

export function detectHostAdapter(
  adapterId: HostAdapterId,
  input: HostAdapterDetectionInput = {},
  registry = builtinHostAdapterRegistry(),
): HostAdapterDetection {
  const definition = getHostAdapterDefinition(adapterId, registry);
  let target: ResolvedHostTarget;
  try {
    target = resolveHostTarget(definition, input);
  } catch (error) {
    if (error instanceof HostAdapterRootError) {
      return blockedDetection(adapterId, definition, error.reasonCodes);
    }
    throw error;
  }
  const detected = detectionStatus(target);
  return {
    adapterId,
    status: detected.status,
    version: null,
    detectionMethod:
      target.source === "default"
        ? "known-user-home-structure"
        : target.source === "environment"
          ? "environment-override"
          : "explicit-home-override",
    targetLabel: definition.targetLabel,
    provenCapabilities: { ...definition.capabilities },
    reasonCodes: detected.reasonCodes,
    detectedAt: new Date().toISOString(),
  };
}

export function detectAllHostAdapters(
  input: HostAdapterDetectionInput = {},
  registry = builtinHostAdapterRegistry(),
): HostAdapterDetection[] {
  return registry.adapters
    .slice()
    .sort((a, b) => a.adapterId.localeCompare(b.adapterId))
    .map((definition) => detectHostAdapter(definition.adapterId, input, registry));
}

export function runtimeSnapshotFromHostDetection(
  detection: HostAdapterDetection,
): RuntimeCapabilitySnapshot {
  const base: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    schema: "uads.runtime-capability-snapshot",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    runtimeId: `host-${detection.adapterId}`,
    adapterId: detection.adapterId,
    adapterVersion: HOST_ADAPTER_CONTRACT_VERSION,
    runtimeVersion: detection.version,
    capabilities: { ...detection.provenCapabilities },
    provenance: {
      source: "adapter",
      confidence: detection.status === "SUPPORTED" ? "proven" : "unknown",
    },
  };
  return { ...base, identityDigest: computeRuntimeIdentityDigest(base) };
}
