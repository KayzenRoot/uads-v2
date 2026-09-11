import type { UadsPaths } from "../lib/workspace.js";
import {
  evaluateHostCapabilityProof,
  readHostCapabilityProof,
  type HostCapabilityCurrentBasis,
} from "./host-capability-proof.js";
import { listProductionHostCapabilityProbeDescriptors } from "./host-capability-probe.js";
import {
  RUNTIME_CAPABILITY_KEYS,
  computeRuntimeIdentityDigest,
  normalizeRuntimeCapabilitySnapshot,
} from "./model-runtime.js";
import type {
  CapabilityValue,
  ModelCapability,
  RuntimeCapabilities,
  RuntimeCapabilitySnapshot,
} from "./model-types.js";

/**
 * WO-026 M03 stored-proof resolution behind IF-001.
 *
 * Resolves current, basis-bound stored PCCR evidence on top of the passive
 * projection that supplies the current subject/adapter/basis and fills
 * capabilities without usable proof. Read-only: never writes proof state and
 * never throws for missing, rejected, stale, mismatched, expired or
 * clock-regressed evidence - those stay UNKNOWN and non-enabling.
 */
export type HostCapabilityProofContribution = {
  capabilityId: ModelCapability;
  origin: "stored-proof" | "passive";
  outcome: "supported" | "unsupported" | "unknown";
  reasonCodes: string[];
};

export type HostCapabilityProofResolution = {
  runtime: RuntimeCapabilitySnapshot;
  proofBacked: boolean;
  contributions: Record<ModelCapability, HostCapabilityProofContribution>;
  reasonCodes: string[];
};

export type HostCapabilityProofResolutionInput = {
  paths: UadsPaths;
  passive: {
    currentBasis: Record<ModelCapability, HostCapabilityCurrentBasis>;
    projectedRuntime: RuntimeCapabilitySnapshot;
  };
  now?: string;
  schemaRoot?: string;
};

type PassiveOutcome = HostCapabilityProofContribution["outcome"];

function passiveOutcome(value: CapabilityValue): PassiveOutcome {
  if (value === true) return "supported";
  if (value === false) return "unsupported";
  return "unknown";
}

function productionProbeIds(): Set<string> {
  try {
    return new Set(
      listProductionHostCapabilityProbeDescriptors().map((descriptor) => descriptor.probeId),
    );
  } catch {
    return new Set();
  }
}

function projectionSource(
  contributingProbeIds: readonly string[],
  productionIds: ReadonlySet<string>,
): RuntimeCapabilitySnapshot["provenance"]["source"] {
  if (process.env.NODE_ENV === "test") return "test-fixture";
  if (contributingProbeIds.some((probeId) => !productionIds.has(probeId))) return "test-fixture";
  return "adapter";
}

export function resolveHostCapabilityProofs(
  input: HostCapabilityProofResolutionInput,
): HostCapabilityProofResolution {
  const passiveRuntime = input.passive.projectedRuntime;
  const capabilities: RuntimeCapabilities = { ...passiveRuntime.capabilities };
  const contributions = {} as Record<ModelCapability, HostCapabilityProofContribution>;
  const reasonCodes: string[] = [];
  const contributingProbeIds: string[] = [];
  let proofBacked = false;

  const recordPassive = (capabilityId: ModelCapability, codes: string[]): void => {
    contributions[capabilityId] = {
      capabilityId,
      origin: "passive",
      outcome: passiveOutcome(capabilities[capabilityId]),
      reasonCodes: codes,
    };
    for (const code of codes) {
      reasonCodes.push(`${code}:${capabilityId}`);
    }
  };

  for (const capabilityId of RUNTIME_CAPABILITY_KEYS) {
    const basis = input.passive.currentBasis[capabilityId];
    if (basis === undefined) {
      recordPassive(capabilityId, ["CURRENT_BASIS_UNAVAILABLE"]);
      continue;
    }
    const read = readHostCapabilityProof(
      input.paths,
      basis.subjectDigest,
      capabilityId,
      input.schemaRoot,
    );
    if (read.status !== "VALID") {
      recordPassive(capabilityId, [read.status === "REJECTED" ? "PROOF_REJECTED" : "PROOF_MISSING"]);
      continue;
    }
    let evaluated: ReturnType<typeof evaluateHostCapabilityProof>;
    try {
      evaluated = evaluateHostCapabilityProof(read.proof, basis, {
        now: input.now,
        schemaRoot: input.schemaRoot,
      });
    } catch {
      recordPassive(capabilityId, ["PROOF_REJECTED"]);
      continue;
    }
    if (!evaluated.current) {
      recordPassive(
        capabilityId,
        evaluated.reasonCodes.length > 0 ? [...evaluated.reasonCodes] : ["PROOF_NOT_CURRENT"],
      );
      continue;
    }
    if (evaluated.effectiveState === "SUPPORTED") {
      capabilities[capabilityId] = true;
      proofBacked = true;
      contributingProbeIds.push(read.proof.probeId);
      contributions[capabilityId] = {
        capabilityId,
        origin: "stored-proof",
        outcome: "supported",
        reasonCodes: [],
      };
      continue;
    }
    if (evaluated.effectiveState === "UNSUPPORTED") {
      capabilities[capabilityId] = false;
      proofBacked = true;
      contributingProbeIds.push(read.proof.probeId);
      contributions[capabilityId] = {
        capabilityId,
        origin: "stored-proof",
        outcome: "unsupported",
        reasonCodes: [],
      };
      continue;
    }
    recordPassive(capabilityId, ["PROOF_MAKES_NO_CLAIM"]);
  }

  const unsigned: Omit<RuntimeCapabilitySnapshot, "identityDigest"> = {
    schema: passiveRuntime.schema,
    schemaVersion: passiveRuntime.schemaVersion,
    runtimeId: passiveRuntime.runtimeId,
    adapterId: passiveRuntime.adapterId,
    adapterVersion: passiveRuntime.adapterVersion,
    runtimeVersion: passiveRuntime.runtimeVersion,
    capabilities,
    provenance: {
      source: proofBacked
        ? projectionSource(contributingProbeIds, productionProbeIds())
        : passiveRuntime.provenance.source,
      confidence: proofBacked ? "proven" : "unknown",
    },
  };

  return {
    runtime: normalizeRuntimeCapabilitySnapshot({
      ...unsigned,
      identityDigest: computeRuntimeIdentityDigest(unsigned),
    }),
    proofBacked,
    contributions,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
}
