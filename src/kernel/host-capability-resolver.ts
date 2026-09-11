import type { UadsPaths } from "../lib/workspace.js";
import {
  activeEvidenceContractBlockReason,
  buildActiveEvidenceCurrentBasis,
  findRegisteredActiveEvidenceContract,
  type ActiveEvidenceCurrentContext,
} from "./host-capability-active-evidence.js";
import {
  evaluateHostCapabilityProof,
  readHostCapabilityProof,
  type HostCapabilityCurrentBasis,
  type HostCapabilityProofRecord,
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

export type { ActiveEvidenceCurrentContext } from "./host-capability-active-evidence.js";

/**
 * WO-026 M03 stored-proof resolution behind IF-001.
 *
 * Resolves current, basis-bound stored PCCR evidence on top of the passive
 * projection that supplies the current subject/adapter/basis and fills
 * capabilities without usable proof. Resolution is source-aware: a stored
 * proof bound to a registered active-evidence contract is evaluated against a
 * current basis derived from that contract plus the supplied current host
 * context (`activeEvidenceCurrent`, through the M03 active-evidence APIs);
 * every other stored proof is evaluated against the passive basis.
 * Unregistered probe sources, unusable contracts and a missing host context
 * stay UNKNOWN and non-enabling. Read-only: never writes proof state and never
 * throws for missing, rejected, stale, mismatched, expired or clock-regressed
 * evidence - those stay UNKNOWN and non-enabling.
 */
export type HostCapabilityProofSource = "passive-contract" | "active-evidence";

export type HostCapabilityProofContribution = {
  capabilityId: ModelCapability;
  origin: "stored-proof" | "passive";
  proofSource: HostCapabilityProofSource | null;
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
  /**
   * Current host context used to derive the current basis of registered
   * active-evidence contracts. Optional and non-enabling when absent: stored
   * active proofs are then left UNKNOWN instead of being trusted.
   */
  activeEvidenceCurrent?: ActiveEvidenceCurrentContext | null;
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

type ActiveEvidenceRouting =
  | { mode: "active"; basis: HostCapabilityCurrentBasis }
  | { mode: "non-enabling"; reasonCode: string }
  | null;

/**
 * Bounded proof-source discriminator: routes a stored proof to the current
 * basis of a registered active-evidence contract only when the probe, the
 * projected host adapter and the capability all match a registered contract,
 * the contract is usable in this environment and a current host context was
 * supplied. Everything else stays on the passive basis or non-enabling.
 */
function activeEvidenceRouting(input: {
  proof: HostCapabilityProofRecord;
  hostAdapterId: string;
  capabilityId: ModelCapability;
  current: ActiveEvidenceCurrentContext | null;
}): ActiveEvidenceRouting {
  const contract = findRegisteredActiveEvidenceContract({
    probeId: input.proof.probeId,
    adapterId: input.hostAdapterId,
    capabilityId: input.capabilityId,
  });
  if (contract === null) return null;
  if (input.current === null) {
    return { mode: "non-enabling", reasonCode: "ACTIVE_EVIDENCE_CONTEXT_MISSING" };
  }
  if (input.current.adapterId !== contract.adapterId) {
    return { mode: "non-enabling", reasonCode: "ACTIVE_CONTRACT_ADAPTER_MISMATCH" };
  }
  const blocked = activeEvidenceContractBlockReason(contract);
  if (blocked !== null) return { mode: "non-enabling", reasonCode: blocked };
  try {
    return {
      mode: "active",
      basis: buildActiveEvidenceCurrentBasis(contract.contractId, input.current),
    };
  } catch {
    return { mode: "non-enabling", reasonCode: "ACTIVE_CONTRACT_BASIS_UNAVAILABLE" };
  }
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
      proofSource: null,
      outcome: passiveOutcome(capabilities[capabilityId]),
      reasonCodes: codes,
    };
    for (const code of codes) {
      reasonCodes.push(`${code}:${capabilityId}`);
    }
  };

  for (const capabilityId of RUNTIME_CAPABILITY_KEYS) {
    const passiveBasis = input.passive.currentBasis[capabilityId];
    if (passiveBasis === undefined) {
      recordPassive(capabilityId, ["CURRENT_BASIS_UNAVAILABLE"]);
      continue;
    }
    const read = readHostCapabilityProof(
      input.paths,
      passiveBasis.subjectDigest,
      capabilityId,
      input.schemaRoot,
    );
    if (read.status !== "VALID") {
      recordPassive(capabilityId, [read.status === "REJECTED" ? "PROOF_REJECTED" : "PROOF_MISSING"]);
      continue;
    }
    const routing = activeEvidenceRouting({
      proof: read.proof,
      hostAdapterId: passiveBasis.adapterId,
      capabilityId,
      current: input.activeEvidenceCurrent ?? null,
    });
    if (routing !== null && routing.mode === "non-enabling") {
      recordPassive(capabilityId, [routing.reasonCode]);
      continue;
    }
    const basis = routing === null ? passiveBasis : routing.basis;
    const proofSource: HostCapabilityProofSource =
      routing === null ? "passive-contract" : "active-evidence";
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
        proofSource,
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
        proofSource,
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
