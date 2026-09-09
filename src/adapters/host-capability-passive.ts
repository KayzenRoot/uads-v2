import { sha256Hex } from "../lib/hash.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  compileHostCapabilityProof,
  persistHostCapabilityProof,
  projectHostCapabilityProofsToLegacySnapshot,
  type HostCapabilityCurrentBasis,
  type HostCapabilityProofPersistence,
  type HostCapabilityProofRecord,
  type HostCapabilityTelemetryContext,
} from "../kernel/host-capability-proof.js";
import {
  canonicalHostCapabilityJson,
  compileHostCapabilitySubject,
  computeHostAdapterContractDigest,
  type HostCapabilitySubject,
} from "../kernel/host-capability-subject.js";
import {
  RUNTIME_CAPABILITY_KEYS,
  computeRuntimeIdentityDigest,
} from "../kernel/model-runtime.js";
import {
  MODEL_ROUTING_SCHEMA_VERSION,
  type CapabilityValue,
  type ModelCapability,
  type RuntimeCapabilities,
  type RuntimeCapabilitySnapshot,
} from "../kernel/model-types.js";
import {
  detectHostAdapter,
  resolveHostTarget,
} from "./host-adapter-detect.js";
import {
  builtinHostAdapterRegistry,
  getHostAdapterDefinition,
  normalizeHostAdapterDefinition,
} from "./host-adapter-registry.js";
import {
  HOST_TARGET_ROOT_BINDING_VERSION,
  HOST_TARGET_ROOT_DOMAIN,
} from "./host-adapter-root.js";
import {
  HOST_ADAPTER_CONTRACT_VERSION,
  type HostAdapterDetection,
  type HostAdapterDetectionInput,
  type HostAdapterId,
  type HostAdapterRegistry,
} from "./host-adapter-types.js";

export const PASSIVE_HOST_CAPABILITY_PROBE_ID = "passive.adapter-contract.v1" as const;
export const PASSIVE_HOST_CAPABILITY_PROBE_DEFINITION_DIGEST = sha256Hex(
  "uads-m03-passive-adapter-contract-probe-v1",
);
export const PASSIVE_HOST_CAPABILITY_POLICY_DIGEST = sha256Hex(
  "uads-m03-passive-adapter-contract-policy-v1:no-passive-supported:e1-nonenabling:e2-fixed-false-only",
);

export type PassiveHostCapabilityDetectionSummary = {
  adapterId: HostAdapterId;
  status: HostAdapterDetection["status"];
  version: string | null;
  reasonCodes: string[];
};

export type PassiveHostCapabilityBridgeResult = {
  subject: HostCapabilitySubject;
  detection: PassiveHostCapabilityDetectionSummary;
  adapterContractDigest: string;
  passiveStateDigest: string;
  proofs: Record<ModelCapability, HostCapabilityProofRecord>;
  currentBasis: Record<ModelCapability, HostCapabilityCurrentBasis>;
  projectedRuntime: RuntimeCapabilitySnapshot;
  persistence: Record<ModelCapability, HostCapabilityProofPersistence["telemetry"]> | null;
};

export type PassiveHostCapabilityBridgeInput = {
  adapterId: HostAdapterId;
  detectionInput?: HostAdapterDetectionInput;
  registry?: HostAdapterRegistry;
  paths?: UadsPaths;
  persist?: boolean;
  telemetry?: HostCapabilityTelemetryContext;
  observedAt?: string;
  now?: string;
  schemaRoot?: string;
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function unknownCapabilities(): RuntimeCapabilities {
  return Object.fromEntries(
    RUNTIME_CAPABILITY_KEYS.map((capabilityId) => [capabilityId, "unknown"]),
  ) as RuntimeCapabilities;
}

function conservativeLegacySnapshot(
  adapterId: HostAdapterId,
  runtimeVersion: string | null,
): RuntimeCapabilitySnapshot {
  const unsigned: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    schema: "uads.runtime-capability-snapshot",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    runtimeId: `host-${adapterId}`,
    adapterId,
    adapterVersion: HOST_ADAPTER_CONTRACT_VERSION,
    runtimeVersion,
    capabilities: unknownCapabilities(),
    provenance: {
      source: "adapter",
      confidence: "unknown",
    },
  };
  return {
    ...unsigned,
    identityDigest: computeRuntimeIdentityDigest(unsigned),
  };
}

export function computePassiveAdapterContractDigest(
  definition: ReturnType<typeof getHostAdapterDefinition>,
): string {
  const normalized = normalizeHostAdapterDefinition(definition);
  return computeHostAdapterContractDigest(normalized, HOST_ADAPTER_CONTRACT_VERSION);
}

export function computePassiveHostStateDigest(input: {
  detection: Pick<HostAdapterDetection, "status" | "version" | "reasonCodes">;
  rootIdentityDigest: string;
  targetRootDigest: string;
  adapterContractDigest: string;
}): string {
  return sha256Hex(
    canonicalHostCapabilityJson({
      domain: "uads-m03-passive-host-state-v1",
      status: input.detection.status,
      reasonCodes: sortedUnique(input.detection.reasonCodes),
      rootIdentityDigest: input.rootIdentityDigest,
      targetRootDigest: input.targetRootDigest,
      runtimeVersion: input.detection.version,
      adapterContractDigest: input.adapterContractDigest,
    }),
  );
}

function passiveReasonCodes(
  detection: HostAdapterDetection,
  declared: CapabilityValue,
  state: HostCapabilityProofRecord["state"],
): string[] {
  const reasons = [...detection.reasonCodes];
  if (detection.status === "BLOCKED") reasons.push("PASSIVE_HOST_BLOCKED");
  if (detection.status === "UNAVAILABLE") reasons.push("PASSIVE_HOST_UNAVAILABLE");
  if (detection.status === "UNPROVEN") reasons.push("PASSIVE_HOST_UNPROVEN");
  if (detection.status === "SUPPORTED" && declared === true) {
    reasons.push("ADAPTER_DECLARATION_TRUE_NOT_PROOF");
  } else if (detection.status === "SUPPORTED" && declared === "unknown") {
    reasons.push("ADAPTER_DECLARATION_UNKNOWN");
  } else if (detection.status === "SUPPORTED" && declared === false && state === "UNSUPPORTED") {
    reasons.push("ADAPTER_CONTRACT_IMPOSSIBLE");
  } else if (detection.status !== "SUPPORTED" && declared === false) {
    reasons.push("ADAPTER_DECLARATION_FALSE_NOT_CURRENT_PROOF");
  }
  return sortedUnique(reasons);
}

function passiveMapping(
  detection: HostAdapterDetection,
  declared: CapabilityValue,
): Pick<HostCapabilityProofRecord, "state" | "evidenceClass" | "negativeProofKind"> {
  if (detection.status === "BLOCKED") {
    return { state: "BLOCKED", evidenceClass: "E1", negativeProofKind: null };
  }
  if (detection.status !== "SUPPORTED") {
    return { state: "UNKNOWN", evidenceClass: "E1", negativeProofKind: null };
  }
  if (declared === false) {
    return {
      state: "UNSUPPORTED",
      evidenceClass: "E2",
      negativeProofKind: "adapter-contract-impossible",
    };
  }
  return { state: "UNKNOWN", evidenceClass: "E1", negativeProofKind: null };
}

export function buildPassiveHostCapabilityBridge(
  input: PassiveHostCapabilityBridgeInput,
): PassiveHostCapabilityBridgeResult {
  const registry = input.registry ?? builtinHostAdapterRegistry();
  const definition = normalizeHostAdapterDefinition(
    getHostAdapterDefinition(input.adapterId, registry),
  );
  const target = resolveHostTarget(definition, input.detectionInput ?? {});
  const detection = detectHostAdapter(input.adapterId, input.detectionInput ?? {}, registry);
  const adapterContractDigest = computeHostAdapterContractDigest(
    definition,
    HOST_ADAPTER_CONTRACT_VERSION,
  );
  const passiveStateDigest = computePassiveHostStateDigest({
    detection,
    rootIdentityDigest: target.rootIdentityDigest,
    targetRootDigest: target.targetRootDigest,
    adapterContractDigest,
  });
  const subject = compileHostCapabilitySubject({
    adapterId: definition.adapterId,
    adapterContractVersion: HOST_ADAPTER_CONTRACT_VERSION,
    adapterContractDigest,
    rootBindingVersion: HOST_TARGET_ROOT_BINDING_VERSION,
    rootBindingDomain: HOST_TARGET_ROOT_DOMAIN,
    rootIdentityDigest: target.rootIdentityDigest,
    targetRootDigest: target.targetRootDigest,
    rootKind: target.rootKind,
    sourceClass: target.sourceClass,
    runtimeVersion: detection.version,
  });

  const observedAt = input.observedAt ?? detection.detectedAt;
  const proofs = {} as Record<ModelCapability, HostCapabilityProofRecord>;
  const currentBasis = {} as Record<ModelCapability, HostCapabilityCurrentBasis>;

  for (const capabilityId of RUNTIME_CAPABILITY_KEYS) {
    const declared = definition.capabilities[capabilityId];
    const mapping = passiveMapping(detection, declared);
    const reasonCodes = passiveReasonCodes(detection, declared, mapping.state);
    const evidenceDigest = sha256Hex(
      canonicalHostCapabilityJson({
        domain: "uads-m03-passive-capability-evidence-v1",
        subjectDigest: subject.subjectDigest,
        adapterContractDigest,
        capabilityId,
        declared,
        detectionStatus: detection.status,
        reasonCodes: sortedUnique(detection.reasonCodes),
        passiveStateDigest,
      }),
    );
    const basis: HostCapabilityCurrentBasis = {
      subjectDigest: subject.subjectDigest,
      adapterId: definition.adapterId,
      runtimeVersion: detection.version,
      validityBasis: {
        adapterContractDigest,
        probeDefinitionDigest: PASSIVE_HOST_CAPABILITY_PROBE_DEFINITION_DIGEST,
        policyDigest: PASSIVE_HOST_CAPABILITY_POLICY_DIGEST,
        configurationDigest: passiveStateDigest,
      },
    };
    currentBasis[capabilityId] = basis;
    proofs[capabilityId] = compileHostCapabilityProof(
      {
        capabilityId,
        state: mapping.state,
        evidenceClass: mapping.evidenceClass,
        subjectDigest: subject.subjectDigest,
        adapterId: definition.adapterId,
        runtimeVersion: detection.version,
        probeId: PASSIVE_HOST_CAPABILITY_PROBE_ID,
        validityBasis: { ...basis.validityBasis },
        observedAt,
        validUntil: null,
        validityClass: "IDENTITY_BOUND",
        evidenceDigest,
        negativeProofKind: mapping.negativeProofKind,
        reasonCodes,
      },
      input.schemaRoot,
    );
  }

  const shouldPersist = input.persist ?? Boolean(input.paths);
  if (shouldPersist && !input.paths) {
    throw new Error("paths are required when passive proof persistence is enabled");
  }
  let persistence: Record<ModelCapability, HostCapabilityProofPersistence["telemetry"]> | null = null;
  if (shouldPersist && input.paths) {
    persistence = {} as Record<ModelCapability, HostCapabilityProofPersistence["telemetry"]>;
    for (const capabilityId of RUNTIME_CAPABILITY_KEYS) {
      const persisted = persistHostCapabilityProof(
        input.paths,
        proofs[capabilityId],
        {
          schemaRoot: input.schemaRoot,
          telemetry: input.telemetry,
        },
      );
      persistence[capabilityId] = persisted.telemetry;
    }
  }

  const legacy = conservativeLegacySnapshot(definition.adapterId, detection.version);
  const projectedRuntime = projectHostCapabilityProofsToLegacySnapshot({
    legacy,
    proofs,
    currentBasis,
    now: input.now ?? observedAt,
    schemaRoot: input.schemaRoot,
  });

  return {
    subject,
    detection: {
      adapterId: detection.adapterId,
      status: detection.status,
      version: detection.version,
      reasonCodes: sortedUnique(detection.reasonCodes),
    },
    adapterContractDigest,
    passiveStateDigest,
    proofs,
    currentBasis,
    projectedRuntime,
    persistence,
  };
}
