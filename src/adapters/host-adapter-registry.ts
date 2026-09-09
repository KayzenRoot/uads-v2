import { sha256Hex } from "../lib/hash.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import {
  HOST_ADAPTER_CONTRACT_VERSION,
  HOST_ADAPTER_IDS,
  HOST_ADAPTER_SCHEMA_VERSION,
  type HostAdapterDefinition,
  type HostAdapterId,
  type HostAdapterRegistry,
} from "./host-adapter-types.js";
import type { RuntimeCapabilities } from "../kernel/model-types.js";

export class HostAdapterRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostAdapterRegistryError";
  }
}

function unknownCapabilities(overrides: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities {
  return {
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
    ...overrides,
  };
}

export const BUILTIN_HOST_ADAPTER_DEFINITIONS: readonly HostAdapterDefinition[] = Object.freeze([
  {
    adapterId: "codex",
    resourceKind: "agents",
    targetLabel: "codex-user-home",
    manifestRelativeTarget: "uads-managed-agents.json",
    sourceRoot: "agents",
    targetRelativeRoot: "agents",
    capabilities: unknownCapabilities(),
  },
  {
    adapterId: "cursor",
    resourceKind: "agents",
    targetLabel: "cursor-user-home",
    manifestRelativeTarget: "agents/uads-managed-agents.json",
    sourceRoot: "agents",
    targetRelativeRoot: "agents",
    capabilities: unknownCapabilities(),
  },
  {
    adapterId: "generic-agent-skills",
    resourceKind: "agent-skill",
    targetLabel: "generic-agent-skills-home",
    manifestRelativeTarget: "skills/uads-managed-skill.json",
    sourceRoot: "skills/uads-orchestrator",
    targetRelativeRoot: "skills",
    capabilities: unknownCapabilities({ subagents: false, parallelAgents: false }),
  },
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new HostAdapterRegistryError(`${label} contains unsupported fields: ${unknown.sort().join(", ")}`);
  }
}

function safeText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HostAdapterRegistryError(`${label} must be a bounded safe string`);
  }
  const text = value.trim();
  if (containsUnredactedSecret(text) || containsAbsoluteHostPath(text) || text.includes("..")) {
    throw new HostAdapterRegistryError(`${label} contains unsafe data`);
  }
  return text;
}

function normalizeCapabilities(value: unknown): RuntimeCapabilities {
  if (!isRecord(value)) throw new HostAdapterRegistryError("capabilities must be an object");
  const allowed = [
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
  ] as const;
  assertOnlyKeys(value, allowed, "capabilities");
  return Object.fromEntries(
    allowed.map((key) => {
      const capability = value[key];
      if (capability !== true && capability !== false && capability !== "unknown") {
        throw new HostAdapterRegistryError(`capabilities.${key} must be boolean or unknown`);
      }
      return [key, capability];
    }),
  ) as RuntimeCapabilities;
}

export function normalizeHostAdapterDefinition(raw: unknown): HostAdapterDefinition {
  if (!isRecord(raw)) throw new HostAdapterRegistryError("host adapter definition must be an object");
  assertOnlyKeys(
    raw,
    ["adapterId", "resourceKind", "targetLabel", "manifestRelativeTarget", "sourceRoot", "targetRelativeRoot", "capabilities"],
    "host adapter definition",
  );
  const adapterId = safeText(raw.adapterId, "adapterId", 64) as HostAdapterId;
  if (!(HOST_ADAPTER_IDS as readonly string[]).includes(adapterId)) {
    throw new HostAdapterRegistryError(`unknown host adapter ID: ${adapterId}`);
  }
  const resourceKind = raw.resourceKind;
  if (resourceKind !== "agents" && resourceKind !== "agent-skill") {
    throw new HostAdapterRegistryError(`unsupported resource kind for ${adapterId}`);
  }
  const targetRelativeRoot = raw.targetRelativeRoot;
  if (targetRelativeRoot !== "agents" && targetRelativeRoot !== "skills") {
    throw new HostAdapterRegistryError(`unsupported target root for ${adapterId}`);
  }
  const sourceRoot = raw.sourceRoot;
  if (sourceRoot !== "agents" && sourceRoot !== "skills/uads-orchestrator") {
    throw new HostAdapterRegistryError(`unsupported source root for ${adapterId}`);
  }
  const targetLabel = safeText(raw.targetLabel, "targetLabel", 96);
  const manifestRelativeTarget = safeText(raw.manifestRelativeTarget, "manifestRelativeTarget", 160);
  if (manifestRelativeTarget.startsWith("/") || /^[A-Za-z]:/.test(manifestRelativeTarget) || manifestRelativeTarget.includes("\\")) {
    throw new HostAdapterRegistryError(`unsafe manifest target for ${adapterId}`);
  }
  const fixed = BUILTIN_HOST_ADAPTER_DEFINITIONS.find((item) => item.adapterId === adapterId);
  if (
    fixed &&
    (resourceKind !== fixed.resourceKind ||
      targetLabel !== fixed.targetLabel ||
      manifestRelativeTarget !== fixed.manifestRelativeTarget ||
      sourceRoot !== fixed.sourceRoot ||
      targetRelativeRoot !== fixed.targetRelativeRoot ||
      JSON.stringify(normalizeCapabilities(raw.capabilities)) !== JSON.stringify(fixed.capabilities))
  ) {
    throw new HostAdapterRegistryError(`host adapter target/capability contract is not fixed: ${adapterId}`);
  }
  return {
    adapterId,
    resourceKind,
    targetLabel,
    manifestRelativeTarget,
    sourceRoot,
    targetRelativeRoot,
    capabilities: normalizeCapabilities(raw.capabilities),
  };
}

export function computeHostAdapterRegistryDigest(adapters: HostAdapterDefinition[]): string {
  return sha256Hex(
    JSON.stringify(
      adapters
        .slice()
        .sort((a, b) => a.adapterId.localeCompare(b.adapterId))
        .map((adapter) => ({ ...adapter })),
    ),
  );
}

export function createHostAdapterRegistry(
  definitions: HostAdapterDefinition[] = [...BUILTIN_HOST_ADAPTER_DEFINITIONS],
): HostAdapterRegistry {
  const normalized = definitions.map((definition) => normalizeHostAdapterDefinition(definition));
  if (normalized.length !== HOST_ADAPTER_IDS.length) {
    throw new HostAdapterRegistryError("host adapter registry must contain exactly the supported adapter IDs");
  }
  normalized.sort((a, b) => a.adapterId.localeCompare(b.adapterId));
  const ids = new Set<string>();
  for (const adapter of normalized) {
    if (ids.has(adapter.adapterId)) {
      throw new HostAdapterRegistryError(`duplicate host adapter ID: ${adapter.adapterId}`);
    }
    ids.add(adapter.adapterId);
  }
  if (ids.size !== HOST_ADAPTER_IDS.length || HOST_ADAPTER_IDS.some((id) => !ids.has(id))) {
    throw new HostAdapterRegistryError("host adapter registry is missing a supported adapter");
  }
  return {
    schema: "uads.host-adapter-registry",
    schemaVersion: HOST_ADAPTER_SCHEMA_VERSION,
    contractVersion: HOST_ADAPTER_CONTRACT_VERSION,
    adapters: normalized,
    registryDigest: computeHostAdapterRegistryDigest(normalized),
  };
}

export function builtinHostAdapterRegistry(): HostAdapterRegistry {
  return createHostAdapterRegistry();
}

export function getHostAdapterDefinition(
  adapterId: HostAdapterId,
  registry: HostAdapterRegistry = builtinHostAdapterRegistry(),
): HostAdapterDefinition {
  const definition = registry.adapters.find((adapter) => adapter.adapterId === adapterId);
  if (!definition) throw new HostAdapterRegistryError(`host adapter is not registered: ${adapterId}`);
  return definition;
}
