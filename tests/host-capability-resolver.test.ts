import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildActiveEvidenceCurrentBasis,
  compileActiveEvidenceToPccr,
  getHostCapabilityActiveEvidenceContract,
  type ActiveEvidenceCompileResult,
  type ActiveEvidenceCurrentContext,
} from "../src/kernel/host-capability-active-evidence.js";
import { readHostCapabilityProjection } from "../src/adapters/host-capability-consumer.js";
import { buildPassiveHostCapabilityBridge } from "../src/adapters/host-capability-passive.js";
import { sha256Hex } from "../src/lib/hash.js";
import { ensureWorkspace, type UadsPaths } from "../src/lib/workspace.js";
import {
  compileHostCapabilityProof,
  computeHostCapabilityProofDigest,
  evaluateHostCapabilityProof,
  hostCapabilityProofPath,
  persistHostCapabilityProof,
  type HostCapabilityProofInput,
  type HostCapabilityProofRecord,
} from "../src/kernel/host-capability-proof.js";
import { executeHostCapabilityProbe } from "../src/kernel/host-capability-probe.js";
import { resolveHostCapabilityProofs } from "../src/kernel/host-capability-resolver.js";
import {
  computeRuntimeIdentityDigest,
  conservativeRuntimeCapabilitySnapshot,
  persistRuntimeCapabilitySnapshot,
} from "../src/kernel/model-runtime.js";
import type {
  ModelCapability,
  RuntimeCapabilities,
  RuntimeCapabilitySnapshot,
} from "../src/kernel/model-types.js";

const ROOT = process.cwd();
const MINUTE_MS = 60_000;

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function isoAhead(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
const OTHER_POLICY_DIGEST = sha256Hex("uads2-wo026-resolver-other-policy-v1");

type AdapterId = "cursor" | "codex" | "generic-agent-skills";
type Bridge = ReturnType<typeof buildPassiveHostCapabilityBridge>;

function sidecar(): UadsPaths {
  return ensureWorkspace(
    "uads-wo026-resolver",
    fs.mkdtempSync(path.join(os.tmpdir(), "uads-wo026-home-")),
  );
}

function hostHome(segment = ".cursor"): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-wo026-host-"));
  fs.mkdirSync(path.join(home, segment), { recursive: true });
  return home;
}

function bridgeOf(host: string, adapterId: AdapterId = "cursor"): Bridge {
  return buildPassiveHostCapabilityBridge({
    adapterId,
    detectionInput: { hostHome: host },
    persist: false,
    schemaRoot: ROOT,
  });
}

function proofInput(
  fixture: Bridge,
  capabilityId: ModelCapability,
  overrides: Partial<HostCapabilityProofInput> = {},
): HostCapabilityProofInput {
  const basis = fixture.currentBasis[capabilityId];
  return {
    capabilityId,
    state: "SUPPORTED",
    evidenceClass: "E2",
    subjectDigest: fixture.subject.subjectDigest,
    adapterId: fixture.detection.adapterId,
    runtimeVersion: basis.runtimeVersion,
    probeId: "fixture.wo026.resolver.v1",
    validityBasis: { ...basis.validityBasis },
    observedAt: isoAgo(MINUTE_MS),
    validUntil: null,
    validityClass: "IDENTITY_BOUND",
    evidenceDigest: sha256Hex(`uads2-wo026-resolver-${capabilityId}-v1`),
    negativeProofKind: null,
    reasonCodes: ["WO026_RESOLVER_FIXTURE"],
    ...overrides,
  };
}

function seedProof(
  paths: UadsPaths,
  fixture: Bridge,
  capabilityId: ModelCapability,
  overrides: Partial<HostCapabilityProofInput> = {},
): void {
  const proof = compileHostCapabilityProof(proofInput(fixture, capabilityId, overrides), ROOT);
  persistHostCapabilityProof(paths, proof, { schemaRoot: ROOT });
}

function projection(
  paths: UadsPaths,
  host: string,
  adapterId: AdapterId = "cursor",
): ReturnType<typeof readHostCapabilityProjection> {
  return readHostCapabilityProjection({
    adapterId,
    detectionInput: { hostHome: host },
    paths,
    schemaRoot: ROOT,
  });
}

function resolution(
  paths: UadsPaths,
  host: string,
  adapterId: AdapterId = "cursor",
): ReturnType<typeof resolveHostCapabilityProofs> {
  const fixture = bridgeOf(host, adapterId);
  return resolveHostCapabilityProofs({
    paths,
    passive: {
      currentBasis: fixture.currentBasis,
      projectedRuntime: fixture.projectedRuntime,
    },
    schemaRoot: ROOT,
  });
}

const ACTIVE_CONTRACT_ID = "test.active.tool-supported.v1";

function otherDigest(label: string): string {
  return sha256Hex(`uads2-wo026-active-negative-${label}-v1`);
}

type ActiveFixture = {
  paths: UadsPaths;
  host: string;
  adapterId: "generic-agent-skills";
  current: ActiveEvidenceCurrentContext;
  proof: HostCapabilityProofRecord;
  compiled: ActiveEvidenceCompileResult;
};

function resignProof(
  proof: HostCapabilityProofRecord,
  patch: Partial<HostCapabilityProofRecord>,
): HostCapabilityProofRecord {
  const { proofDigest: _proofDigest, ...unsigned } = { ...proof, ...patch };
  return { ...unsigned, proofDigest: computeHostCapabilityProofDigest(unsigned) };
}

/** Registered TEST_ONLY contract: bounded receipt -> compileActiveEvidenceToPccr -> persistHostCapabilityProof. */
async function activeFixture(): Promise<ActiveFixture> {
  const paths = sidecar();
  const host = hostHome(".agents");
  const adapterId = "generic-agent-skills" as const;
  const fixture = bridgeOf(host, adapterId);
  const contract = getHostCapabilityActiveEvidenceContract(ACTIVE_CONTRACT_ID);
  const receipt = await executeHostCapabilityProbe(contract.probeId, fixture.subject.subjectDigest, {
    schemaRoot: ROOT,
  });
  if (receipt.status !== "SUCCEEDED" || receipt.executableIdentityAfter === null) {
    throw new Error(`active fixture receipt is not a bounded success: ${receipt.status}`);
  }
  const current: ActiveEvidenceCurrentContext = {
    subjectDigest: fixture.subject.subjectDigest,
    adapterId,
    runtimeVersion: fixture.currentBasis.toolCalling.runtimeVersion,
    adapterContractDigest: fixture.adapterContractDigest,
    configurationDigest: sha256Hex("uads2-wo026-active-host-configuration-v1"),
    executableIdentityDigest: receipt.executableIdentityAfter,
  };
  const compiled = compileActiveEvidenceToPccr({
    contractId: contract.contractId,
    current,
    receipt,
    schemaRoot: ROOT,
  });
  if (compiled.status !== "COMPILED" || compiled.proof === null) {
    throw new Error(`active fixture did not compile: ${compiled.status}`);
  }
  persistHostCapabilityProof(paths, compiled.proof, { schemaRoot: ROOT });
  return { paths, host, adapterId, current, proof: compiled.proof, compiled };
}

function persistActiveProof(fixture: ActiveFixture, proof: HostCapabilityProofRecord): void {
  persistHostCapabilityProof(fixture.paths, proof, { schemaRoot: ROOT });
}

function activeProjection(
  fixture: ActiveFixture,
  current: ActiveEvidenceCurrentContext | null,
): ReturnType<typeof readHostCapabilityProjection> {
  return readHostCapabilityProjection({
    adapterId: fixture.adapterId,
    detectionInput: { hostHome: fixture.host },
    paths: fixture.paths,
    activeEvidenceCurrent: current,
    schemaRoot: ROOT,
  });
}

function activeResolution(
  fixture: ActiveFixture,
  current: ActiveEvidenceCurrentContext | null,
): ReturnType<typeof resolveHostCapabilityProofs> {
  const bridge = bridgeOf(fixture.host, fixture.adapterId);
  return resolveHostCapabilityProofs({
    paths: fixture.paths,
    passive: {
      currentBasis: bridge.currentBasis,
      projectedRuntime: bridge.projectedRuntime,
    },
    activeEvidenceCurrent: current,
    schemaRoot: ROOT,
  });
}

function expectNonEnabling(fixture: ActiveFixture, current: ActiveEvidenceCurrentContext): void {
  const projected = activeProjection(fixture, current);
  expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
  expect(projected.runtime.provenance.confidence).toBe("unknown");
}
function legacyTrueSnapshot(): RuntimeCapabilitySnapshot {
  const base = conservativeRuntimeCapabilitySnapshot({ runtimeId: "generic-runtime" });
  const capabilities = Object.fromEntries(
    Object.keys(base.capabilities).map((capabilityId) => [capabilityId, true]),
  ) as RuntimeCapabilities;
  const unsigned = {
    schema: base.schema,
    schemaVersion: base.schemaVersion,
    runtimeId: base.runtimeId,
    adapterId: base.adapterId,
    adapterVersion: base.adapterVersion,
    runtimeVersion: base.runtimeVersion,
    capabilities,
    provenance: { source: "test-fixture" as const, confidence: "proven" as const },
  };
  return { ...unsigned, identityDigest: computeRuntimeIdentityDigest(unsigned) };
}

describe("UADS2-WO-026 M03 proven capability resolution", { timeout: 120_000 }, () => {
  it("P1 projects TRUE only from a current valid SUPPORTED PCCR and marks provenance proven", () => {
    const paths = sidecar();
    const host = hostHome();
    const control = projection(paths, host);
    expect(control.runtime.capabilities.toolCalling).toBe("unknown");
    expect(control.runtime.provenance.confidence).toBe("unknown");

    seedProof(paths, bridgeOf(host), "toolCalling");

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe(true);
    expect(projected.runtime.capabilities.subagents).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("proven");
    expect(projected.runtime.provenance.source).toBe("test-fixture");

    const detailed = resolution(paths, host);
    expect(detailed.proofBacked).toBe(true);
    expect(detailed.contributions.toolCalling).toMatchObject({
      origin: "stored-proof",
      outcome: "supported",
    });
  });

  it("P1 never enables a passive declaration or legacy snapshot TRUE without PCCR evidence", () => {
    const paths = sidecar();
    const host = hostHome();
    const fixture = bridgeOf(host);
    expect(Object.values(fixture.proofs).some((proof) => proof.state === "SUPPORTED")).toBe(false);

    persistRuntimeCapabilitySnapshot(paths, legacyTrueSnapshot(), ROOT);

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");

    const detailed = resolution(paths, host);
    expect(detailed.proofBacked).toBe(false);
    expect(detailed.contributions.toolCalling).toMatchObject({ origin: "passive", outcome: "unknown" });
  });

  it("P2 keeps a missing proof UNKNOWN and non-proven", () => {
    const paths = sidecar();
    const host = hostHome();

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");

    const detailed = resolution(paths, host);
    expect(detailed.reasonCodes).toContain("PROOF_MISSING:toolCalling");
  });

  it("P2 rejects record-stale proofs as UNKNOWN", () => {
    const paths = sidecar();
    const host = hostHome();
    seedProof(paths, bridgeOf(host), "toolCalling", { state: "STALE", evidenceClass: "E1" });

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");
    expect(resolution(paths, host).reasonCodes).toContain("PROOF_RECORDED_STALE:toolCalling");
  });

  it("P2 rejects an expired lease as UNKNOWN", () => {
    const paths = sidecar();
    const host = hostHome();
    seedProof(paths, bridgeOf(host), "toolCalling", {
      observedAt: isoAgo(3_600_000),
      validityClass: "LEASED",
      validUntil: isoAgo(1_800_000),
    });

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");
    expect(resolution(paths, host).reasonCodes).toContain("LEASE_EXPIRED:toolCalling");
  });

  it("P2 rejects corrupt proof files without crashing consumers", () => {
    const paths = sidecar();
    const host = hostHome();
    const fixture = bridgeOf(host);
    const target = hostCapabilityProofPath(paths, fixture.subject.subjectDigest, "toolCalling");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "{not-json", "utf8");

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");
    expect(resolution(paths, host).reasonCodes).toContain("PROOF_REJECTED:toolCalling");
  });

  it("P2 rejects subject-mismatched proofs as UNKNOWN", () => {
    const paths = sidecar();
    const host = hostHome();
    const fixture = bridgeOf(host);
    const foreign = compileHostCapabilityProof(
      proofInput(fixture, "toolCalling", {
        subjectDigest: sha256Hex("uads2-wo026-resolver-foreign-subject-v1"),
      }),
      ROOT,
    );
    const target = hostCapabilityProofPath(paths, fixture.subject.subjectDigest, "toolCalling");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(foreign)}\n`, "utf8");

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");
    expect(resolution(paths, host).reasonCodes).toContain("PROOF_REJECTED:toolCalling");
  });

  it("P2 rejects basis mismatches (policy, runtime version) as UNKNOWN", () => {
    const paths = sidecar();
    const host = hostHome();
    const fixture = bridgeOf(host);
    seedProof(paths, fixture, "toolCalling", {
      validityBasis: {
        ...fixture.currentBasis.toolCalling.validityBasis,
        policyDigest: OTHER_POLICY_DIGEST,
      },
    });
    seedProof(paths, fixture, "structuredOutput", { runtimeVersion: "99.0.0" });

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.capabilities.structuredOutput).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");

    const detailed = resolution(paths, host);
    expect(detailed.reasonCodes).toContain("POLICY_DIGEST_MISMATCH:toolCalling");
    expect(detailed.reasonCodes).toContain("RUNTIME_VERSION_MISMATCH:structuredOutput");
  });

  it("P2 rejects clock-regressed proofs as UNKNOWN", () => {
    const paths = sidecar();
    const host = hostHome();
    seedProof(paths, bridgeOf(host), "toolCalling", { observedAt: isoAhead(3_600_000) });

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");
    expect(resolution(paths, host).reasonCodes).toContain("CLOCK_REGRESSION:toolCalling");
  });

  it("P3 projects FALSE from a current NPC-compliant UNSUPPORTED proof and never from invalid ones", () => {
    const paths = sidecar();
    const host = hostHome();
    const fixture = bridgeOf(host);
    seedProof(paths, fixture, "toolCalling", {
      state: "UNSUPPORTED",
      evidenceClass: "E2",
      negativeProofKind: "adapter-contract-impossible",
    });

    const projected = projection(paths, host);
    expect(projected.runtime.capabilities.toolCalling).toBe(false);
    expect(resolution(paths, host).contributions.toolCalling).toMatchObject({
      origin: "stored-proof",
      outcome: "unsupported",
    });

    expect(() =>
      compileHostCapabilityProof(
        proofInput(fixture, "toolCalling", {
          state: "UNSUPPORTED",
          evidenceClass: "E1",
          negativeProofKind: "adapter-contract-impossible",
        }),
        ROOT,
      ),
    ).toThrow(/requires E2 or stronger evidence/);
    expect(() =>
      compileHostCapabilityProof(
        proofInput(fixture, "toolCalling", {
          state: "UNSUPPORTED",
          evidenceClass: "E2",
          negativeProofKind: null,
        }),
        ROOT,
      ),
    ).toThrow(/Negative Proof Contract/);

    seedProof(paths, fixture, "subagents", {
      state: "UNSUPPORTED",
      evidenceClass: "E2",
      negativeProofKind: "adapter-contract-impossible",
      validityBasis: {
        ...fixture.currentBasis.subagents.validityBasis,
        policyDigest: OTHER_POLICY_DIGEST,
      },
    });
    expect(projection(paths, host).runtime.capabilities.subagents).toBe("unknown");
  });

  it("P4 keeps passive-only truth non-proven and per-capability independence", () => {
    const paths = sidecar();
    const host = hostHome(".agents");
    const fixture = bridgeOf(host, "generic-agent-skills");
    seedProof(paths, fixture, "toolCalling");

    const projected = projection(paths, host, "generic-agent-skills");
    expect(projected.runtime.capabilities.toolCalling).toBe(true);
    expect(projected.runtime.capabilities.subagents).toBe(false);
    expect(projected.runtime.capabilities.parallelAgents).toBe(false);
    expect(projected.runtime.capabilities.persistentContext).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("proven");

    const detailed = resolution(paths, host, "generic-agent-skills");
    expect(detailed.contributions.subagents).toMatchObject({ origin: "passive", outcome: "unsupported" });
    expect(detailed.contributions.subagents.reasonCodes).toContain("PROOF_MISSING");

    const passiveOnly = sidecar();
    const control = projection(passiveOnly, host, "generic-agent-skills");
    expect(control.runtime.capabilities.subagents).toBe(false);
    expect(control.runtime.provenance.confidence).toBe("unknown");
  });

  it("P9 keeps subject, basis and projection identity deterministic and path-safe", () => {
    const paths = sidecar();
    const host = hostHome();
    const left = bridgeOf(host);
    const right = bridgeOf(host);
    expect(left.subject.subjectDigest).toBe(right.subject.subjectDigest);
    expect(left.adapterContractDigest).toBe(right.adapterContractDigest);
    for (const capabilityId of Object.keys(left.currentBasis) as ModelCapability[]) {
      expect(left.currentBasis[capabilityId]).toEqual(right.currentBasis[capabilityId]);
    }

    seedProof(paths, left, "toolCalling");
    const first = projection(paths, host);
    const second = projection(paths, host);
    expect(first.runtime.identityDigest).toBe(second.runtime.identityDigest);
    expect(first.subjectDigest).toBe(second.subjectDigest);
    expect(first.runtime.identityDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first.runtime)).not.toContain(path.basename(host));
  });

  it("P1-ACTIVE proves TRUE through a registered active-evidence PCCR and the stored-proof pipeline", async () => {
    const fixture = await activeFixture();
    expect(fixture.proof.evidenceClass).toBe("E3");
    expect(fixture.proof.probeId).toBe(
      getHostCapabilityActiveEvidenceContract(ACTIVE_CONTRACT_ID).probeId,
    );
    expect(fixture.compiled.currentBasis).toEqual(
      buildActiveEvidenceCurrentBasis(ACTIVE_CONTRACT_ID, fixture.current),
    );

    const projected = activeProjection(fixture, fixture.current);
    expect(projected.runtime.capabilities.toolCalling).toBe(true);
    expect(projected.runtime.provenance.confidence).toBe("proven");

    const detailed = activeResolution(fixture, fixture.current);
    expect(detailed.proofBacked).toBe(true);
    expect(detailed.contributions.toolCalling).toMatchObject({
      origin: "stored-proof",
      proofSource: "active-evidence",
      outcome: "supported",
    });
    expect(detailed.contributions.subagents).toMatchObject({ origin: "passive", proofSource: null });

    const preCorrection = evaluateHostCapabilityProof(
      fixture.proof,
      bridgeOf(fixture.host, fixture.adapterId).currentBasis.toolCalling,
      { schemaRoot: ROOT },
    );
    expect(preCorrection.current).toBe(false);
    expect(preCorrection.reasonCodes).toContain("PROBE_DEFINITION_DIGEST_MISMATCH");
  });

  it("P1-ACTIVE keeps a stored active proof UNKNOWN and non-enabling without a current host context", async () => {
    const fixture = await activeFixture();

    const projected = activeProjection(fixture, null);
    expect(projected.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");

    const detailed = activeResolution(fixture, null);
    expect(detailed.proofBacked).toBe(false);
    expect(detailed.contributions.toolCalling).toMatchObject({
      origin: "passive",
      proofSource: null,
      outcome: "unknown",
    });
    expect(detailed.reasonCodes).toContain("ACTIVE_EVIDENCE_CONTEXT_MISSING:toolCalling");
  });

  it("P2-ACTIVE rejects an expired active lease as UNKNOWN", async () => {
    const fixture = await activeFixture();
    persistActiveProof(
      fixture,
      resignProof(fixture.proof, { observedAt: isoAgo(3_600_000), validUntil: isoAgo(1_800_000) }),
    );

    expectNonEnabling(fixture, fixture.current);
    expect(activeResolution(fixture, fixture.current).reasonCodes).toContain(
      "LEASE_EXPIRED:toolCalling",
    );
  });

  it("P2-ACTIVE rejects probe-definition and policy drift as UNKNOWN", async () => {
    const descriptorDrift = await activeFixture();
    persistActiveProof(
      descriptorDrift,
      resignProof(descriptorDrift.proof, {
        validityBasis: {
          ...descriptorDrift.proof.validityBasis,
          probeDefinitionDigest: otherDigest("probe-definition"),
        },
      }),
    );
    expectNonEnabling(descriptorDrift, descriptorDrift.current);
    expect(activeResolution(descriptorDrift, descriptorDrift.current).reasonCodes).toContain(
      "PROBE_DEFINITION_DIGEST_MISMATCH:toolCalling",
    );

    const policyDrift = await activeFixture();
    persistActiveProof(
      policyDrift,
      resignProof(policyDrift.proof, {
        validityBasis: {
          ...policyDrift.proof.validityBasis,
          policyDigest: otherDigest("policy"),
        },
      }),
    );
    expectNonEnabling(policyDrift, policyDrift.current);
    expect(activeResolution(policyDrift, policyDrift.current).reasonCodes).toContain(
      "POLICY_DIGEST_MISMATCH:toolCalling",
    );
  });

  it("P2-ACTIVE rejects configuration binding drift as UNKNOWN", async () => {
    const fixture = await activeFixture();
    const driftedContext: ActiveEvidenceCurrentContext = {
      ...fixture.current,
      configurationDigest: otherDigest("host-configuration"),
    };
    expectNonEnabling(fixture, driftedContext);
    expect(activeResolution(fixture, driftedContext).reasonCodes).toContain(
      "CONFIGURATION_DIGEST_MISMATCH:toolCalling",
    );

    persistActiveProof(
      fixture,
      resignProof(fixture.proof, {
        validityBasis: {
          ...fixture.proof.validityBasis,
          configurationDigest: otherDigest("proof-configuration"),
        },
      }),
    );
    expectNonEnabling(fixture, fixture.current);
    expect(activeResolution(fixture, fixture.current).reasonCodes).toContain(
      "CONFIGURATION_DIGEST_MISMATCH:toolCalling",
    );
  });

  it("P2-ACTIVE rejects subject and adapter drift as UNKNOWN", async () => {
    const subjectDrift = await activeFixture();
    const foreignSubject: ActiveEvidenceCurrentContext = {
      ...subjectDrift.current,
      subjectDigest: otherDigest("foreign-subject"),
    };
    expectNonEnabling(subjectDrift, foreignSubject);
    expect(activeResolution(subjectDrift, foreignSubject).reasonCodes).toContain(
      "SUBJECT_DIGEST_MISMATCH:toolCalling",
    );

    const proofAdapterDrift = await activeFixture();
    persistActiveProof(
      proofAdapterDrift,
      resignProof(proofAdapterDrift.proof, { adapterId: "cursor" }),
    );
    expectNonEnabling(proofAdapterDrift, proofAdapterDrift.current);
    expect(activeResolution(proofAdapterDrift, proofAdapterDrift.current).reasonCodes).toContain(
      "ADAPTER_ID_MISMATCH:toolCalling",
    );

    const contextAdapterDrift = await activeFixture();
    const foreignAdapter: ActiveEvidenceCurrentContext = {
      ...contextAdapterDrift.current,
      adapterId: "cursor",
    };
    expectNonEnabling(contextAdapterDrift, foreignAdapter);
    expect(activeResolution(contextAdapterDrift, foreignAdapter).reasonCodes).toContain(
      "ACTIVE_CONTRACT_ADAPTER_MISMATCH:toolCalling",
    );
  });

  it("P2-ACTIVE never grants active trust to an unregistered probe source", async () => {
    const fixture = await activeFixture();
    persistActiveProof(
      fixture,
      resignProof(fixture.proof, { probeId: "test.active-supported.unregistered.v1" }),
    );

    expectNonEnabling(fixture, fixture.current);
    const detailed = activeResolution(fixture, fixture.current);
    expect(detailed.proofBacked).toBe(false);
    expect(detailed.contributions.toolCalling).toMatchObject({
      origin: "passive",
      proofSource: null,
      outcome: "unknown",
    });
    expect(detailed.reasonCodes).toContain("PROBE_DEFINITION_DIGEST_MISMATCH:toolCalling");
  });
});