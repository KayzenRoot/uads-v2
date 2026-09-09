import { sha256Hex } from "../lib/hash.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import type { HostAdapterDefinition, HostAdapterId } from "../adapters/host-adapter-types.js";
import type { HostRootKind, HostRootSourceClass } from "../adapters/host-adapter-root.js";
import type { RuntimeCapabilities } from "./model-types.js";

export const HOST_CAPABILITY_SUBJECT_SCHEMA = "uads.host-capability-subject" as const;
export const HOST_CAPABILITY_SUBJECT_SCHEMA_VERSION = "1.0.0" as const;
export const HOST_CAPABILITY_SUBJECT_DOMAIN = "uads-host-capability-subject-v1" as const;
export const HOST_ADAPTER_CONTRACT_DIGEST_DOMAIN = "uads-host-adapter-contract-v1" as const;

export type HostCapabilitySubject = {
  schema: typeof HOST_CAPABILITY_SUBJECT_SCHEMA;
  schemaVersion: typeof HOST_CAPABILITY_SUBJECT_SCHEMA_VERSION;
  domain: typeof HOST_CAPABILITY_SUBJECT_DOMAIN;
  adapterId: HostAdapterId;
  adapterContractVersion: string;
  adapterContractDigest: string;
  rootBindingVersion: string;
  rootBindingDomain: string;
  rootIdentityDigest: string;
  targetRootDigest: string;
  rootKind: HostRootKind;
  sourceClass: HostRootSourceClass;
  runtimeVersion: string | null;
  subjectDigest: string;
};

export type HostCapabilitySubjectInput = Omit<HostCapabilitySubject, "schema" | "schemaVersion" | "domain" | "subjectDigest">;

const DIGEST = /^[a-f0-9]{64}$/;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
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

export function canonicalHostCapabilityJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function assertSafeText(value: string, label: string, maxLength = 160): void {
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

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) throw new Error(`${label} must be a sha256 hex digest`);
}

function normalizedCapabilities(capabilities: RuntimeCapabilities): RuntimeCapabilities {
  return {
    modelSelection: capabilities.modelSelection,
    toolCalling: capabilities.toolCalling,
    structuredOutput: capabilities.structuredOutput,
    promptCache: capabilities.promptCache,
    explicitCache: capabilities.explicitCache,
    persistentContext: capabilities.persistentContext,
    subagents: capabilities.subagents,
    parallelAgents: capabilities.parallelAgents,
    usageTelemetry: capabilities.usageTelemetry,
    visionInput: capabilities.visionInput,
  };
}

export function computeHostAdapterContractDigest(
  definition: HostAdapterDefinition,
  contractVersion: string,
): string {
  assertSafeText(contractVersion, "adapterContractVersion", 64);
  const payload = {
    domain: HOST_ADAPTER_CONTRACT_DIGEST_DOMAIN,
    contractVersion,
    definition: {
      adapterId: definition.adapterId,
      resourceKind: definition.resourceKind,
      targetLabel: definition.targetLabel,
      manifestRelativeTarget: definition.manifestRelativeTarget,
      sourceRoot: definition.sourceRoot,
      targetRelativeRoot: definition.targetRelativeRoot,
      capabilities: normalizedCapabilities(definition.capabilities),
    },
  };
  return sha256Hex(canonicalHostCapabilityJson(payload));
}

export function computeHostCapabilitySubjectDigest(
  subject: Omit<HostCapabilitySubject, "subjectDigest">,
): string {
  return sha256Hex(canonicalHostCapabilityJson(subject));
}

export function compileHostCapabilitySubject(input: HostCapabilitySubjectInput): HostCapabilitySubject {
  assertSafeText(input.adapterId, "adapterId", 64);
  assertSafeText(input.adapterContractVersion, "adapterContractVersion", 64);
  assertDigest(input.adapterContractDigest, "adapterContractDigest");
  assertSafeText(input.rootBindingVersion, "rootBindingVersion", 32);
  assertSafeText(input.rootBindingDomain, "rootBindingDomain", 96);
  assertDigest(input.rootIdentityDigest, "rootIdentityDigest");
  assertDigest(input.targetRootDigest, "targetRootDigest");
  assertSafeText(input.rootKind, "rootKind", 64);
  assertSafeText(input.sourceClass, "sourceClass", 64);
  if (input.runtimeVersion !== null) assertSafeText(input.runtimeVersion, "runtimeVersion", 128);

  const unsigned: Omit<HostCapabilitySubject, "subjectDigest"> = {
    schema: HOST_CAPABILITY_SUBJECT_SCHEMA,
    schemaVersion: HOST_CAPABILITY_SUBJECT_SCHEMA_VERSION,
    domain: HOST_CAPABILITY_SUBJECT_DOMAIN,
    ...input,
  };
  return {
    ...unsigned,
    subjectDigest: computeHostCapabilitySubjectDigest(unsigned),
  };
}
