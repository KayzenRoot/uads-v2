import type { UadsPaths } from "../lib/workspace.js";
import type { RuntimeCapabilitySnapshot } from "../kernel/model-types.js";
import {
  buildPassiveHostCapabilityBridge,
  type PassiveHostCapabilityBridgeInput,
} from "./host-capability-passive.js";
import type { HostAdapterDetection } from "./host-adapter-types.js";

/**
 * Canonical M03 capability surface for production consumers.
 *
 * Consumers MUST depend on this boundary rather than adapter declarations or
 * runtimeSnapshotFromHostDetection(). The implementation is intentionally
 * compatibility-shaped today so M01/M04/M06/M23 can adopt it without learning
 * PCCR storage/probe internals. Future active/stored proof resolution can evolve
 * behind this contract without changing consumer semantics.
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
  /** Reserved for future stored-proof resolution; never written by this read API. */
  paths?: UadsPaths;
};

export function readHostCapabilityProjection(
  input: HostCapabilityConsumerInput,
): HostCapabilityConsumerProjection {
  const bridge = buildPassiveHostCapabilityBridge({
    adapterId: input.adapterId,
    detectionInput: input.detectionInput,
    registry: input.registry,
    observedAt: input.observedAt,
    now: input.now,
    schemaRoot: input.schemaRoot,
    persist: false,
  });

  return {
    runtime: bridge.projectedRuntime,
    subjectDigest: bridge.subject.subjectDigest,
    adapterContractDigest: bridge.adapterContractDigest,
    detection: bridge.detection,
  };
}
