import { sha256Hex } from "../lib/hash.js";
import type { UadsPaths } from "../lib/workspace.js";
import { canonicalHostCapabilityJson } from "../kernel/host-capability-subject.js";
import {
  resolveHostCapabilityProofs,
  type ActiveEvidenceCurrentContext,
} from "../kernel/host-capability-resolver.js";
import { conservativeRuntimeCapabilitySnapshot } from "../kernel/model-runtime.js";
import type { RuntimeCapabilitySnapshot } from "../kernel/model-types.js";
import {
  buildPassiveHostCapabilityBridge,
  type PassiveHostCapabilityBridgeInput,
} from "./host-capability-passive.js";
import { HostAdapterRootError } from "./host-adapter-root.js";
import type { HostAdapterDetection, HostAdapterId } from "./host-adapter-types.js";

/**
 * Canonical M03 capability surface for production consumers.
 *
 * Consumers MUST depend on this boundary rather than adapter declarations or
 * runtimeSnapshotFromHostDetection(). The implementation resolves current,
 * basis-bound stored PCCR evidence when a sidecar `paths` input is supplied and
 * falls back to the passive projection otherwise; consumers never learn PCCR
 * storage/probe internals. This read API never writes proof state.
 */
export type HostCapabilityConsumerProjection = {
  runtime: RuntimeCapabilitySnapshot;
  subjectDigest: string;
  adapterContractDigest: string;
  detection: Pick<HostAdapterDetection, "adapterId" | "status" | "version" | "reasonCodes">;
};

export type HostCapabilityConsumerInput = Omit<
  PassiveHostCapabilityBridgeInput,
  "persist" | "paths" | "telemetry"
> & {
  /** Enables stored-proof resolution against the current basis; never written by this read API. */
  paths?: UadsPaths;
  /**
   * Current host context used to derive the current basis of registered active-evidence
   * contracts. Optional: when absent, stored active proofs stay UNKNOWN and non-enabling.
   */
  activeEvidenceCurrent?: ActiveEvidenceCurrentContext | null;
};

function blockedProjection(
  adapterId: HostAdapterId,
  error: unknown,
): HostCapabilityConsumerProjection {
  const reasonCodes = [
    ...new Set(
      error instanceof HostAdapterRootError
        ? [...error.reasonCodes]
        : ["HOST_CAPABILITY_PROJECTION_UNAVAILABLE"],
    ),
  ].sort();
  return {
    runtime: conservativeRuntimeCapabilitySnapshot({
      runtimeId: `host-${adapterId}`,
      adapterId,
    }),
    subjectDigest: sha256Hex(
      canonicalHostCapabilityJson({
        domain: "uads-m03-blocked-host-capability-subject-v1",
        adapterId,
        reasonCodes,
      }),
    ),
    adapterContractDigest: sha256Hex(
      canonicalHostCapabilityJson({
        domain: "uads-m03-blocked-host-capability-contract-v1",
        adapterId,
      }),
    ),
    detection: { adapterId, status: "BLOCKED", version: null, reasonCodes },
  };
}

export function readHostCapabilityProjection(
  input: HostCapabilityConsumerInput,
): HostCapabilityConsumerProjection {
  let bridge: ReturnType<typeof buildPassiveHostCapabilityBridge>;
  try {
    bridge = buildPassiveHostCapabilityBridge({
      adapterId: input.adapterId,
      detectionInput: input.detectionInput,
      registry: input.registry,
      observedAt: input.observedAt,
      now: input.now,
      schemaRoot: input.schemaRoot,
      persist: false,
    });
  } catch (error) {
    return blockedProjection(input.adapterId, error);
  }

  const runtime = input.paths
    ? resolveHostCapabilityProofs({
        paths: input.paths,
        passive: {
          currentBasis: bridge.currentBasis,
          projectedRuntime: bridge.projectedRuntime,
        },
        activeEvidenceCurrent: input.activeEvidenceCurrent ?? null,
        now: input.now,
        schemaRoot: input.schemaRoot,
      }).runtime
    : bridge.projectedRuntime;

  return {
    runtime,
    subjectDigest: bridge.subject.subjectDigest,
    adapterContractDigest: bridge.adapterContractDigest,
    detection: bridge.detection,
  };
}
