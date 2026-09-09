import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/lib/hash.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import {
  compileHostCapabilityProof,
  computeHostCapabilityProofDigest,
  evaluateHostCapabilityProof,
  hostCapabilityProofPath,
  persistHostCapabilityProof,
  projectHostCapabilityProofsToLegacySnapshot,
  projectStoredHostCapabilityProofsToLegacySnapshot,
  readHostCapabilityProof,
  type HostCapabilityCurrentBasis,
  type HostCapabilityProofInput,
  type HostCapabilityProofRecord,
} from "../src/kernel/host-capability-proof.js";
import {
  conservativeRuntimeCapabilitySnapshot,
  computeRuntimeIdentityDigest,
} from "../src/kernel/model-runtime.js";
import type { ModelCapability, RuntimeCapabilitySnapshot } from "../src/kernel/model-types.js";

const D = {
  subject: "1".repeat(64),
  subjectOther: "2".repeat(64),
  adapter: "3".repeat(64),
  adapterOther: "4".repeat(64),
  probe: "5".repeat(64),
  probeOther: "6".repeat(64),
  policy: "7".repeat(64),
  policyOther: "8".repeat(64),
  config: "9".repeat(64),
  configOther: "a".repeat(64),
  evidence: "b".repeat(64),
  evidenceOther: "c".repeat(64),
} as const;

function home(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-m03-pccr-"));
}

function legacy(
  overrides: Partial<RuntimeCapabilitySnapshot["capabilities"]> = {},
  confidence: RuntimeCapabilitySnapshot["provenance"]["confidence"] = "proven",
): RuntimeCapabilitySnapshot {
  const base = conservativeRuntimeCapabilitySnapshot({
    runtimeId: "fixture-runtime",
    adapterId: "fixture-adapter",
    adapterVersion: "0.8.0",
    runtimeVersion: "1.2.3",
  });
  const unsigned = {
    schema: base.schema,
    schemaVersion: base.schemaVersion,
    runtimeId: base.runtimeId,
    adapterId: base.adapterId,
    adapterVersion: base.adapterVersion,
    runtimeVersion: base.runtimeVersion,
    capabilities: { ...base.capabilities, ...overrides },
    provenance: { source: "test-fixture" as const, confidence },
  };
  return { ...unsigned, identityDigest: computeRuntimeIdentityDigest(unsigned) };
}

function input(
  overrides: Partial<HostCapabilityProofInput> = {},
): HostCapabilityProofInput {
  return {
    capabilityId: "toolCalling",
    state: "SUPPORTED",
    evidenceClass: "E2",
    subjectDigest: D.subject,
    adapterId: "fixture-adapter",
    runtimeVersion: "1.2.3",
    probeId: "passive.adapter-contract",
    validityBasis: {
      adapterContractDigest: D.adapter,
      probeDefinitionDigest: D.probe,
      policyDigest: D.policy,
      configurationDigest: D.config,
    },
    observedAt: "2026-09-09T12:00:00.000Z",
    validUntil: null,
    validityClass: "IDENTITY_BOUND",
    evidenceDigest: D.evidence,
    negativeProofKind: null,
    reasonCodes: ["FIXTURE_PROOF"],
    ...overrides,
  };
}

function basis(
  overrides: Partial<HostCapabilityCurrentBasis> = {},
): HostCapabilityCurrentBasis {
  return {
    subjectDigest: D.subject,
    adapterId: "fixture-adapter",
    runtimeVersion: "1.2.3",
    validityBasis: {
      adapterContractDigest: D.adapter,
      probeDefinitionDigest: D.probe,
      policyDigest: D.policy,
      configurationDigest: D.config,
    },
    ...overrides,
  };
}

function proof(
  overrides: Partial<HostCapabilityProofInput> = {},
): HostCapabilityProofRecord {
  return compileHostCapabilityProof(input(overrides));
}

function projectionFor(
  p: HostCapabilityProofRecord | undefined,
  current: HostCapabilityCurrentBasis | undefined = basis(),
  capabilityId: ModelCapability = "toolCalling",
): RuntimeCapabilitySnapshot {
  return projectHostCapabilityProofsToLegacySnapshot({
    legacy: legacy({ [capabilityId]: true }),
    proofs: p ? { [capabilityId]: p } : {},
    currentBasis: current ? { [capabilityId]: current } : {},
    now: "2026-09-09T12:30:00.000Z",
  });
}

describe("M03 PCCR core - frozen S04 mapping", () => {
  it("M03-T001 valid E2/E3 SUPPORTED proof projects true", () => {
    expect(projectionFor(proof()).capabilities.toolCalling).toBe(true);
    expect(projectionFor(proof({ evidenceClass: "E3" })).capabilities.toolCalling).toBe(true);
  });

  it("M03-T002 valid NPC UNSUPPORTED proof projects false", () => {
    const unsupported = proof({
      state: "UNSUPPORTED",
      evidenceClass: "E2",
      negativeProofKind: "adapter-contract-impossible",
    });
    expect(projectionFor(unsupported).capabilities.toolCalling).toBe(false);
  });

  it("M03-T003 UNKNOWN projects unknown", () => {
    expect(projectionFor(proof({ state: "UNKNOWN", evidenceClass: "E1" })).capabilities.toolCalling).toBe("unknown");
  });

  it("M03-T004 BLOCKED projects unknown", () => {
    expect(projectionFor(proof({ state: "BLOCKED", evidenceClass: "E1" })).capabilities.toolCalling).toBe("unknown");
  });

  it("M03-T005 STALE projects unknown", () => {
    expect(projectionFor(proof({ state: "STALE", evidenceClass: "E2" })).capabilities.toolCalling).toBe("unknown");
  });

  it("M03-T006 E1 DECLARED can never produce SUPPORTED", () => {
    expect(() => proof({ state: "SUPPORTED", evidenceClass: "E1" })).toThrow(/E2 or stronger/);
  });

  it("M03-T007 legacy true cannot self-upgrade into PCCR SUPPORTED", () => {
    const projected = projectHostCapabilityProofsToLegacySnapshot({
      legacy: legacy({ toolCalling: true, subagents: true }),
    });
    expect(projected.capabilities.toolCalling).toBe("unknown");
    expect(projected.capabilities.subagents).toBe("unknown");
    expect(Object.values(projected.capabilities)).not.toContain(true);
  });

  it("M03-T008 same inputs produce the same proof digest", () => {
    expect(proof().proofDigest).toBe(proof().proofDigest);
  });

  it("M03-T009 changed evidence changes proof digest", () => {
    expect(proof({ evidenceDigest: D.evidenceOther }).proofDigest).not.toBe(proof().proofDigest);
  });

  it("M03-T010 malformed or unknown capability ID fails closed", () => {
    expect(() => compileHostCapabilityProof(input({ capabilityId: "futureCapability" as ModelCapability }))).toThrow();
    expect(() => compileHostCapabilityProof({ ...input(), unknownField: true } as never)).toThrow(/schema|additional/i);
  });

  it("M03-T018 static impossible-by-contract negative proof is accepted", () => {
    const p = proof({
      state: "UNSUPPORTED",
      evidenceClass: "E2",
      negativeProofKind: "adapter-contract-impossible",
    });
    expect(evaluateHostCapabilityProof(p, basis(), { now: "2026-09-09T12:30:00.000Z" }).effectiveState).toBe("UNSUPPORTED");
  });

  it("M03-T019 changed adapter contract invalidates prior negative proof", () => {
    const p = proof({
      state: "UNSUPPORTED",
      evidenceClass: "E2",
      negativeProofKind: "adapter-contract-impossible",
    });
    const evaluated = evaluateHostCapabilityProof(
      p,
      basis({ validityBasis: { ...basis().validityBasis, adapterContractDigest: D.adapterOther } }),
      { now: "2026-09-09T12:30:00.000Z" },
    );
    expect(evaluated.effectiveState).toBe("STALE");
    expect(evaluated.reasonCodes).toContain("ADAPTER_CONTRACT_DIGEST_MISMATCH");
  });

  it("M03-T020 partial or absent evidence cannot manufacture UNSUPPORTED", () => {
    expect(() => proof({ state: "UNSUPPORTED", evidenceClass: "E1", negativeProofKind: null })).toThrow();
    expect(() => proof({ state: "UNSUPPORTED", evidenceClass: "E2", negativeProofKind: null })).toThrow();
  });

  it("M03-T021 runtime version drift yields STALE", () => {
    const evaluated = evaluateHostCapabilityProof(
      proof(),
      basis({ runtimeVersion: "1.2.4" }),
      { now: "2026-09-09T12:30:00.000Z" },
    );
    expect(evaluated.effectiveState).toBe("STALE");
    expect(evaluated.reasonCodes).toContain("RUNTIME_VERSION_MISMATCH");
  });

  it("M03-T022 executable or subject identity drift yields STALE", () => {
    expect(
      evaluateHostCapabilityProof(proof(), basis({ subjectDigest: D.subjectOther }), { now: "2026-09-09T12:30:00.000Z" }).effectiveState,
    ).toBe("STALE");
  });

  it("M03-T023 target-root identity drift is represented by subject digest drift", () => {
    const evaluated = evaluateHostCapabilityProof(
      proof(),
      basis({ subjectDigest: D.subjectOther }),
      { now: "2026-09-09T12:30:00.000Z" },
    );
    expect(evaluated.reasonCodes).toContain("SUBJECT_DIGEST_MISMATCH");
  });

  it("M03-T024 adapter contract digest drift yields STALE", () => {
    expect(
      evaluateHostCapabilityProof(
        proof(),
        basis({ validityBasis: { ...basis().validityBasis, adapterContractDigest: D.adapterOther } }),
        { now: "2026-09-09T12:30:00.000Z" },
      ).effectiveState,
    ).toBe("STALE");
  });

  it("M03-T025 probe definition digest drift yields STALE", () => {
    expect(
      evaluateHostCapabilityProof(
        proof(),
        basis({ validityBasis: { ...basis().validityBasis, probeDefinitionDigest: D.probeOther } }),
        { now: "2026-09-09T12:30:00.000Z" },
      ).effectiveState,
    ).toBe("STALE");
  });

  it("M03-T026 policy digest drift yields STALE", () => {
    expect(
      evaluateHostCapabilityProof(
        proof(),
        basis({ validityBasis: { ...basis().validityBasis, policyDigest: D.policyOther } }),
        { now: "2026-09-09T12:30:00.000Z" },
      ).effectiveState,
    ).toBe("STALE");
  });

  it("M03-T027 evidence artifact digest tamper is rejected", () => {
    const p = proof();
    expect(() => evaluateHostCapabilityProof({ ...p, evidenceDigest: D.evidenceOther }, basis())).toThrow(/digest mismatch/);
  });

  it("M03-T028 finite lease expiry yields STALE", () => {
    const p = proof({
      validityClass: "LEASED",
      validUntil: "2026-09-09T12:10:00.000Z",
    });
    const evaluated = evaluateHostCapabilityProof(p, basis(), { now: "2026-09-09T12:30:00.000Z" });
    expect(evaluated.effectiveState).toBe("STALE");
    expect(evaluated.reasonCodes).toContain("LEASE_EXPIRED");
  });

  it("M03-T029 wall-clock regression fails closed", () => {
    const evaluated = evaluateHostCapabilityProof(proof(), basis(), { now: "2026-09-09T11:59:59.000Z" });
    expect(evaluated.effectiveState).toBe("STALE");
    expect(evaluated.reasonCodes).toContain("CLOCK_REGRESSION");
  });

  it("M03-T030 unchanged identity-bound proof remains reusable", () => {
    const evaluated = evaluateHostCapabilityProof(proof(), basis(), { now: "2027-09-09T12:30:00.000Z" });
    expect(evaluated.current).toBe(true);
    expect(evaluated.effectiveState).toBe("SUPPORTED");
  });

  it("M03-T045 cross-host proof replay is rejected by subject binding", () => {
    expect(
      projectionFor(proof(), basis({ subjectDigest: D.subjectOther })).capabilities.toolCalling,
    ).toBe("unknown");
  });

  it("M03-T046 cross-adapter proof replay is rejected", () => {
    const evaluated = evaluateHostCapabilityProof(
      proof(),
      basis({ adapterId: "other-adapter" }),
      { now: "2026-09-09T12:30:00.000Z" },
    );
    expect(evaluated.effectiveState).toBe("STALE");
    expect(evaluated.reasonCodes).toContain("ADAPTER_ID_MISMATCH");
  });

  it("M03-T047 cross-root proof replay is rejected", () => {
    const paths = ensureWorkspace("project-m03-replay", home());
    persistHostCapabilityProof(paths, proof());
    expect(readHostCapabilityProof(paths, D.subjectOther, "toolCalling").status).toBe("MISSING");
  });

  it("M03-T048 tampered proof digest is rejected", () => {
    const p = proof();
    expect(() => evaluateHostCapabilityProof({ ...p, proofDigest: "0".repeat(64) }, basis())).toThrow(/digest mismatch/);
  });

  it("M03-T049 control-character, secret-like and path-like evidence metadata is rejected", () => {
    expect(() => proof({ adapterId: "bad\u0000adapter" })).toThrow();
    expect(() => proof({ runtimeVersion: "C:\\Users\\example\\runtime" })).toThrow();
    expect(() => proof({ runtimeVersion: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD" })).toThrow();
  });

  it("M03-T050 durable proof record contains no absolute host path or raw evidence field", () => {
    const paths = ensureWorkspace("project-m03-privacy", home());
    const p = proof();
    persistHostCapabilityProof(paths, p);
    const target = hostCapabilityProofPath(paths, p.subjectDigest, p.capabilityId);
    const durable = fs.readFileSync(target, "utf8");
    expect(durable).not.toMatch(/[A-Za-z]:\\|\/Users\/|\/home\//);
    expect(durable).not.toMatch(/rawEvidence|stdout|stderr|environment/i);
  });

  it("M03-T051 forged state/evidence semantics are rejected", () => {
    expect(() => proof({ state: "SUPPORTED", negativeProofKind: "adapter-contract-impossible" })).toThrow();
    expect(() => proof({ state: "UNSUPPORTED", evidenceClass: "E0", negativeProofKind: "adapter-contract-impossible" })).toThrow();
  });

  it("M03-T052 old or unsupported proof schema cannot downgrade validation", () => {
    const p = proof();
    expect(() => evaluateHostCapabilityProof({ ...p, schemaVersion: "0.9.0" }, basis())).toThrow();
  });

  it("M03-T053 M04 model-side assumptions cannot make host proof true", () => {
    const projected = projectHostCapabilityProofsToLegacySnapshot({
      legacy: legacy({ toolCalling: true }),
      proofs: {},
      currentBasis: {},
    });
    expect(projected.capabilities.toolCalling).toBe("unknown");
  });

  it("M03-T054 M06 reasoning-effort policy cannot invent a host capability", () => {
    expect(() => compileHostCapabilityProof(input({ capabilityId: "reasoningEffortControl" as ModelCapability }))).toThrow();
  });

  it("M03-T055 peer or declared legacy truth cannot overwrite local proof truth", () => {
    const declared = legacy({ subagents: true }, "declared");
    const projected = projectHostCapabilityProofsToLegacySnapshot({ legacy: declared });
    expect(projected.capabilities.subagents).toBe("unknown");
    expect(projected.provenance.confidence).toBe("unknown");
  });

  it("M03-T056 parallelAgents proof exposes only a capability fact and no policy bypass field", () => {
    const p = proof({ capabilityId: "parallelAgents" });
    const projected = projectionFor(p, basis(), "parallelAgents");
    expect(projected.capabilities.parallelAgents).toBe(true);
    expect(projected).not.toHaveProperty("maxActiveSpecialistWorkers");
    expect(projected).not.toHaveProperty("parallelSpecialistFanout");
  });

  it("M03-T057 M30 telemetry failure does not mutate persisted truth", () => {
    const paths = ensureWorkspace("project-m03-telemetry", home());
    const p = proof();
    const result = persistHostCapabilityProof(paths, p, {
      telemetry: {
        projectId: "wrong-project",
        correlationId: "corr-m03",
        workOrderId: "UADS2-WO-006",
        occurredAt: "2026-09-09T12:00:00.000Z",
      },
    });
    expect(result.telemetry.status).toBe("FAILED");
    expect(result.proof.proofDigest).toBe(p.proofDigest);
    expect(readHostCapabilityProof(paths, p.subjectDigest, p.capabilityId).status).toBe("VALID");
  });

  it("M03-T058 SOLO persistence/read/projection requires no Hive service", () => {
    const paths = ensureWorkspace("project-m03-solo", home());
    const p = proof();
    persistHostCapabilityProof(paths, p);
    const projected = projectStoredHostCapabilityProofsToLegacySnapshot({
      paths,
      subjectDigest: D.subject,
      legacy: legacy(),
      currentBasis: { toolCalling: basis() },
      now: "2026-09-09T12:30:00.000Z",
    });
    expect(projected.capabilities.toolCalling).toBe(true);
  });

  it("M03-T059 rollback to conservative legacy behavior never increases enabled capability set", () => {
    const old = legacy({ toolCalling: true, subagents: true, modelSelection: true });
    const projected = projectHostCapabilityProofsToLegacySnapshot({ legacy: old });
    const oldTrue = Object.values(old.capabilities).filter((value) => value === true).length;
    const newTrue = Object.values(projected.capabilities).filter((value) => value === true).length;
    expect(newTrue).toBeLessThanOrEqual(oldTrue);
    expect(newTrue).toBe(0);
  });

  it("M03-T060 unknown future capability fails closed", () => {
    expect(() => compileHostCapabilityProof(input({ capabilityId: "modelEnumeration" as ModelCapability }))).toThrow();
  });

  it("persists and recovers from corrupt proof state without accepting corruption", () => {
    const paths = ensureWorkspace("project-m03-recovery", home());
    const p = proof();
    persistHostCapabilityProof(paths, p);
    const target = hostCapabilityProofPath(paths, p.subjectDigest, p.capabilityId);
    fs.writeFileSync(target, "{broken-json", "utf8");
    expect(readHostCapabilityProof(paths, p.subjectDigest, p.capabilityId).status).toBe("REJECTED");
    persistHostCapabilityProof(paths, p);
    expect(readHostCapabilityProof(paths, p.subjectDigest, p.capabilityId)).toMatchObject({
      status: "VALID",
      proof: { proofDigest: p.proofDigest },
    });
  });

  it("emits best-effort M30 evidence.lifecycle telemetry when context is valid", () => {
    const paths = ensureWorkspace("project-m03-events", home());
    const p = proof();
    const result = persistHostCapabilityProof(paths, p, {
      telemetry: {
        projectId: "project-m03-events",
        correlationId: "corr-m03",
        workOrderId: "UADS2-WO-006",
        occurredAt: "2026-09-09T12:00:00.000Z",
      },
    });
    expect(result.telemetry.status).toBe("EMITTED");
    expect(result.telemetry.eventId).toBeTruthy();
  });

  it("B1/B3/B4/B7 bounded benchmark evidence remains within Slice-1 targets", () => {
    const paths = ensureWorkspace("project-m03-benchmark", home());
    const capabilities: ModelCapability[] = [
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
    ];
    const proofs = capabilities.map((capabilityId, index) =>
      proof({
        capabilityId,
        evidenceDigest: sha256Hex(`benchmark-evidence-${index}`),
      }),
    );
    for (const p of proofs) persistHostCapabilityProof(paths, p);

    const samples: number[] = [];
    for (let index = 0; index < 500; index += 1) {
      const start = performance.now();
      evaluateHostCapabilityProof(proofs[index % proofs.length]!, basis(), {
        now: "2026-09-09T12:30:00.000Z",
      });
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const percentile = (q: number): number =>
      samples[Math.min(samples.length - 1, Math.floor(samples.length * q))] ?? 0;
    const p50 = percentile(0.50);
    const p95 = percentile(0.95);

    const proofRoot = path.join(paths.runtimeCapabilities, "proofs", D.subject);
    const bytes = fs
      .readdirSync(proofRoot)
      .filter((name) => name.endsWith(".json"))
      .reduce((sum, name) => sum + fs.statSync(path.join(proofRoot, name)).size, 0);

    let unsafeTrue = 0;
    let tamperReplayAccepted = 0;
    let driftMisses = 0;
    let absenceUnsupported = 0;

    const legacyTrue = legacy({ toolCalling: true });
    if (projectHostCapabilityProofsToLegacySnapshot({ legacy: legacyTrue }).capabilities.toolCalling === true) unsafeTrue += 1;
    try {
      evaluateHostCapabilityProof({ ...proofs[0], proofDigest: "0".repeat(64) }, basis());
      tamperReplayAccepted += 1;
    } catch {
      // expected
    }
    if (
      evaluateHostCapabilityProof(
        proofs[0]!,
        basis({ validityBasis: { ...basis().validityBasis, policyDigest: D.policyOther } }),
        { now: "2026-09-09T12:30:00.000Z" },
      ).effectiveState !== "STALE"
    ) driftMisses += 1;
    try {
      proof({ state: "UNSUPPORTED", evidenceClass: "E1", negativeProofKind: null });
      absenceUnsupported += 1;
    } catch {
      // expected
    }

    const recovery = proof({ capabilityId: "toolCalling" });
    const recoveryTarget = hostCapabilityProofPath(paths, recovery.subjectDigest, recovery.capabilityId);
    fs.writeFileSync(recoveryTarget, "{partial", "utf8");
    const corruptAccepted = readHostCapabilityProof(paths, recovery.subjectDigest, recovery.capabilityId).status === "VALID" ? 1 : 0;
    persistHostCapabilityProof(paths, recovery);
    const recovered = readHostCapabilityProof(paths, recovery.subjectDigest, recovery.capabilityId).status === "VALID";

    const metrics = {
      B1: { p50Ms: p50, p95Ms: p95, targetP95Ms: 50, pass: p95 <= 50 },
      B3: { bytesPerHost: bytes, targetBytes: 64 * 1024, pass: bytes <= 64 * 1024 },
      B4: { unsafeTrue, tamperReplayAccepted, driftMisses, absenceUnsupported },
      B7: { corruptAccepted, recovered },
    };
    console.log("UADS2_WO_006_BENCHMARK", JSON.stringify(metrics));

    expect(metrics.B1.pass).toBe(true);
    expect(metrics.B3.pass).toBe(true);
    expect(metrics.B4).toEqual({
      unsafeTrue: 0,
      tamperReplayAccepted: 0,
      driftMisses: 0,
      absenceUnsupported: 0,
    });
    expect(metrics.B7).toEqual({ corruptAccepted: 0, recovered: true });
  });

  it("canonical proof digest excludes proofDigest and is deterministic", () => {
    const p = proof();
    const { proofDigest: _proofDigest, ...unsigned } = p;
    expect(computeHostCapabilityProofDigest(unsigned)).toBe(p.proofDigest);
  });
});
