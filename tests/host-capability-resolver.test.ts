import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readHostCapabilityProjection } from "../src/adapters/host-capability-consumer.js";
import { buildPassiveHostCapabilityBridge } from "../src/adapters/host-capability-passive.js";
import { sha256Hex } from "../src/lib/hash.js";
import { ensureWorkspace, type UadsPaths } from "../src/lib/workspace.js";
import {
  compileHostCapabilityProof,
  hostCapabilityProofPath,
  persistHostCapabilityProof,
  type HostCapabilityProofInput,
} from "../src/kernel/host-capability-proof.js";
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
});