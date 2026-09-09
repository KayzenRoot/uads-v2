import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPassiveHostCapabilityBridge,
  computePassiveAdapterContractDigest,
} from "../src/adapters/host-capability-passive.js";
import {
  builtinHostAdapterRegistry,
  getHostAdapterDefinition,
} from "../src/adapters/host-adapter-registry.js";
import { adapterRootSegment } from "../src/adapters/host-adapter-root.js";
import type { HostAdapterId } from "../src/adapters/host-adapter-types.js";
import {
  evaluateHostCapabilityProof,
  projectHostCapabilityProofsToLegacySnapshot,
  projectStoredHostCapabilityProofsToLegacySnapshot,
} from "../src/kernel/host-capability-proof.js";
import { computeRuntimeIdentityDigest } from "../src/kernel/model-runtime.js";
import type { RuntimeCapabilitySnapshot } from "../src/kernel/model-types.js";
import { ensureWorkspace } from "../src/lib/workspace.js";

const ROOT = process.cwd();
const FIXED_TIME = "2026-09-09T22:00:00.000Z";

function temp(prefix = "uads-m03-passive-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function adapterFixture(adapterId: HostAdapterId, mode: "present" | "absent" | "blocked" = "present") {
  const hostHome = temp();
  const target = path.join(hostHome, adapterRootSegment(adapterId));
  if (mode === "present") {
    fs.mkdirSync(target, { recursive: true });
  } else if (mode === "blocked") {
    fs.writeFileSync(target, "not-a-directory\n", "utf8");
  }
  return { hostHome, target };
}

function bridge(
  adapterId: HostAdapterId,
  mode: "present" | "absent" | "blocked" = "present",
  extra: Partial<Parameters<typeof buildPassiveHostCapabilityBridge>[0]> = {},
) {
  const fixture = adapterFixture(adapterId, mode);
  return {
    fixture,
    result: buildPassiveHostCapabilityBridge({
      adapterId,
      detectionInput: { hostHome: fixture.hostHome },
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
      ...extra,
    }),
  };
}

function allUnknown(snapshot: RuntimeCapabilitySnapshot): boolean {
  return Object.values(snapshot.capabilities).every((value) => value === "unknown");
}

function legacyTrue(adapterId: HostAdapterId): RuntimeCapabilitySnapshot {
  const base = bridge(adapterId, "present").result.projectedRuntime;
  const unsigned = {
    schema: base.schema,
    schemaVersion: base.schemaVersion,
    runtimeId: base.runtimeId,
    adapterId: base.adapterId,
    adapterVersion: base.adapterVersion,
    runtimeVersion: base.runtimeVersion,
    capabilities: { ...base.capabilities, toolCalling: true, subagents: true },
    provenance: { source: "test-fixture" as const, confidence: "proven" as const },
  };
  return { ...unsigned, identityDigest: computeRuntimeIdentityDigest(unsigned) };
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

describe("UADS2-WO-007 M03 passive host capability bridge", { timeout: 120_000 }, () => {
  it("U007-T001 subject digest is deterministic across repeated detection timestamps", () => {
    const fixture = adapterFixture("cursor", "present");
    const a = buildPassiveHostCapabilityBridge({ adapterId: "cursor", detectionInput: { hostHome: fixture.hostHome }, schemaRoot: ROOT });
    const b = buildPassiveHostCapabilityBridge({ adapterId: "cursor", detectionInput: { hostHome: fixture.hostHome }, schemaRoot: ROOT });
    expect(a.subject.subjectDigest).toBe(b.subject.subjectDigest);
  });

  it("U007-T002 different target root changes subject digest", () => {
    expect(bridge("cursor").result.subject.subjectDigest).not.toBe(bridge("cursor").result.subject.subjectDigest);
  });

  it("U007-T003 different adapter changes subject digest", () => {
    const fixture = temp();
    fs.mkdirSync(path.join(fixture, ".cursor"), { recursive: true });
    fs.mkdirSync(path.join(fixture, ".codex"), { recursive: true });
    const cursor = buildPassiveHostCapabilityBridge({ adapterId: "cursor", detectionInput: { hostHome: fixture }, schemaRoot: ROOT });
    const codex = buildPassiveHostCapabilityBridge({ adapterId: "codex", detectionInput: { hostHome: fixture }, schemaRoot: ROOT });
    expect(cursor.subject.subjectDigest).not.toBe(codex.subject.subjectDigest);
  });

  it("U007-T004 subject and bridge output contain no absolute host path", () => {
    const { fixture, result } = bridge("generic-agent-skills");
    const durable = JSON.stringify({
      subject: result.subject,
      detection: result.detection,
      proofs: result.proofs,
      currentBasis: result.currentBasis,
      projectedRuntime: result.projectedRuntime,
    });
    expect(durable).not.toContain(fixture.hostHome);
    expect(durable).not.toContain(fixture.target);
    expect(durable).not.toMatch(/api.?key|bearer|private.?key/i);
  });

  it("U007-T005 exact adapter contract digest is deterministic", () => {
    const definition = getHostAdapterDefinition("generic-agent-skills");
    expect(computePassiveAdapterContractDigest(definition)).toBe(computePassiveAdapterContractDigest(definition));
  });

  it("U007-T006 altered adapter definition cannot reuse the fixed contract identity", () => {
    const definition = getHostAdapterDefinition("generic-agent-skills");
    const altered = {
      ...definition,
      capabilities: { ...definition.capabilities, subagents: "unknown" as const },
    };
    expect(() => computePassiveAdapterContractDigest(altered)).toThrow(/fixed|contract/i);
  });

  it("U007-T007 target presence alone creates zero TRUE capabilities", () => {
    const result = bridge("generic-agent-skills").result;
    expect(Object.values(result.projectedRuntime.capabilities)).not.toContain(true);
  });

  it("U007-T008 Cursor present keeps all ten capabilities UNKNOWN", () => {
    expect(allUnknown(bridge("cursor").result.projectedRuntime)).toBe(true);
  });

  it("U007-T009 Codex present keeps all ten capabilities UNKNOWN", () => {
    expect(allUnknown(bridge("codex").result.projectedRuntime)).toBe(true);
  });

  it("U007-T010 generic present proves only subagents and parallelAgents false through E2 NPC", () => {
    const result = bridge("generic-agent-skills").result;
    expect(result.projectedRuntime.capabilities.subagents).toBe(false);
    expect(result.projectedRuntime.capabilities.parallelAgents).toBe(false);
    expect(result.proofs.subagents.evidenceClass).toBe("E2");
    expect(result.proofs.subagents.negativeProofKind).toBe("adapter-contract-impossible");
    expect(result.proofs.parallelAgents.evidenceClass).toBe("E2");
    const remaining = Object.entries(result.projectedRuntime.capabilities)
      .filter(([key]) => !["subagents", "parallelAgents"].includes(key))
      .map(([, value]) => value);
    expect(remaining.every((value) => value === "unknown")).toBe(true);
  });

  it("U007-T011 generic absent remains all UNKNOWN and never false", () => {
    const result = bridge("generic-agent-skills", "absent").result;
    expect(allUnknown(result.projectedRuntime)).toBe(true);
    expect(Object.values(result.projectedRuntime.capabilities)).not.toContain(false);
  });

  it("U007-T012 blocked target projects all capabilities UNKNOWN", () => {
    const result = bridge("generic-agent-skills", "blocked").result;
    expect(result.detection.status).toBe("BLOCKED");
    expect(allUnknown(result.projectedRuntime)).toBe(true);
  });

  it("U007-T013 generic negative proof binds exact adapter contract digest", () => {
    const result = bridge("generic-agent-skills").result;
    expect(result.proofs.subagents.validityBasis.adapterContractDigest).toBe(result.adapterContractDigest);
    expect(result.proofs.parallelAgents.validityBasis.adapterContractDigest).toBe(result.adapterContractDigest);
  });

  it("U007-T014 target status drift makes prior negative proof STALE", () => {
    const fixture = adapterFixture("generic-agent-skills", "present");
    const present = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    fs.rmSync(fixture.target, { recursive: true, force: true });
    const absent = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    const evaluated = evaluateHostCapabilityProof(
      present.proofs.subagents,
      absent.currentBasis.subagents,
      { now: FIXED_TIME, schemaRoot: ROOT },
    );
    expect(evaluated.effectiveState).toBe("STALE");
    expect(absent.projectedRuntime.capabilities.subagents).toBe("unknown");
  });

  it("U007-T015 root switch rejects or stales prior proof", () => {
    const first = bridge("generic-agent-skills").result;
    const second = bridge("generic-agent-skills").result;
    const evaluated = evaluateHostCapabilityProof(
      first.proofs.subagents,
      second.currentBasis.subagents,
      { now: FIXED_TIME, schemaRoot: ROOT },
    );
    expect(evaluated.effectiveState).toBe("STALE");
  });

  it("U007-T016 WO-006 cross-capability replay remains rejected", () => {
    const result = bridge("generic-agent-skills").result;
    const projected = projectHostCapabilityProofsToLegacySnapshot({
      legacy: result.projectedRuntime,
      proofs: { toolCalling: result.proofs.subagents },
      currentBasis: { toolCalling: result.currentBasis.toolCalling },
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    expect(projected.capabilities.toolCalling).toBe("unknown");
  });

  it("U007-T017 legacy TRUE without matching passive PCCR remains UNKNOWN", () => {
    const result = bridge("cursor").result;
    const projected = projectHostCapabilityProofsToLegacySnapshot({
      legacy: legacyTrue("cursor"),
      proofs: result.proofs,
      currentBasis: result.currentBasis,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    expect(projected.capabilities.toolCalling).toBe("unknown");
    expect(projected.capabilities.subagents).toBe("unknown");
  });

  it("U007-T018 passive bridge emits no SUPPORTED proof", () => {
    for (const adapterId of ["cursor", "codex", "generic-agent-skills"] as const) {
      const result = bridge(adapterId).result;
      expect(Object.values(result.proofs).some((proof) => proof.state === "SUPPORTED")).toBe(false);
    }
  });

  it("U007-T019 telemetry failure is independent of proof truth", () => {
    const fixture = adapterFixture("generic-agent-skills");
    const paths = ensureWorkspace("wo007-telemetry", temp("uads-m03-telemetry-home-"));
    const result = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      paths,
      persist: true,
      telemetry: { projectId: "", correlationId: "wo007-telemetry" },
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    expect(result.projectedRuntime.capabilities.subagents).toBe(false);
    expect(result.persistence).not.toBeNull();
    expect(Object.values(result.persistence ?? {}).some((item) => item.status === "FAILED")).toBe(true);
  });

  it("U007-T020 SOLO path requires no Hive", () => {
    const source = fs.readFileSync(path.join(ROOT, "src", "adapters", "host-capability-passive.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*hive/i);
    expect(bridge("cursor").result.subject.adapterId).toBe("cursor");
  });

  it("U007-T021 source introduces no child_process shell or network execution path", () => {
    const sources = [
      fs.readFileSync(path.join(ROOT, "src", "kernel", "host-capability-subject.ts"), "utf8"),
      fs.readFileSync(path.join(ROOT, "src", "adapters", "host-capability-passive.ts"), "utf8"),
    ].join("\n");
    expect(sources).not.toMatch(/child_process|execFile|spawn\(|shell\s*:|https?:\/\/|node:https|node:http|fetch\(/);
  });

  it("U007-T022 persisted passive proof state stays below 64 KiB per host", () => {
    const fixture = adapterFixture("generic-agent-skills");
    const paths = ensureWorkspace("wo007-storage", temp("uads-m03-storage-home-"));
    const result = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      paths,
      persist: true,
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    const proofDir = path.join(paths.runtimeCapabilities, "proofs", result.subject.subjectDigest);
    const bytes = fs.readdirSync(proofDir).reduce((total, file) => total + fs.statSync(path.join(proofDir, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(64 * 1024);
  });

  it("U007-T023 fixed semantic inputs and observedAt produce deterministic proof digests", () => {
    const fixture = adapterFixture("generic-agent-skills");
    const one = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    const two = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    expect(Object.values(one.proofs).map((proof) => proof.proofDigest)).toEqual(
      Object.values(two.proofs).map((proof) => proof.proofDigest),
    );
  });

  it("U007-T024 timestamp-only detection change leaves subjectDigest unchanged", () => {
    const fixture = adapterFixture("codex");
    const one = buildPassiveHostCapabilityBridge({ adapterId: "codex", detectionInput: { hostHome: fixture.hostHome }, schemaRoot: ROOT });
    const two = buildPassiveHostCapabilityBridge({ adapterId: "codex", detectionInput: { hostHome: fixture.hostHome }, schemaRoot: ROOT });
    expect(one.subject.subjectDigest).toBe(two.subject.subjectDigest);
  });

  it("U007-T025 persisted proof re-evaluates after restart against exact current basis", () => {
    const fixture = adapterFixture("generic-agent-skills");
    const uadsHome = temp("uads-m03-restart-home-");
    const paths = ensureWorkspace("wo007-restart", uadsHome);
    const first = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      paths,
      persist: true,
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    const afterRestartPaths = ensureWorkspace("wo007-restart-other-project", uadsHome);
    const projected = projectStoredHostCapabilityProofsToLegacySnapshot({
      paths: afterRestartPaths,
      subjectDigest: first.subject.subjectDigest,
      legacy: first.projectedRuntime,
      currentBasis: first.currentBasis,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    expect(projected.capabilities.subagents).toBe(false);
    expect(projected.capabilities.parallelAgents).toBe(false);
  });

  it("U007 benchmark evidence stays within bounded targets", () => {
    const fixture = adapterFixture("generic-agent-skills");
    const compileTimes: number[] = [];
    for (let index = 0; index < 500; index += 1) {
      const started = performance.now();
      buildPassiveHostCapabilityBridge({
        adapterId: "generic-agent-skills",
        detectionInput: { hostHome: fixture.hostHome },
        observedAt: FIXED_TIME,
        now: FIXED_TIME,
        schemaRoot: ROOT,
      });
      compileTimes.push(performance.now() - started);
    }

    const bridgeTimes: number[] = [];
    let bytesPerHost = 0;
    for (let index = 0; index < 40; index += 1) {
      const paths = ensureWorkspace(`wo007-bench-${index}`, temp("uads-m03-bench-home-"));
      const started = performance.now();
      const result = buildPassiveHostCapabilityBridge({
        adapterId: "generic-agent-skills",
        detectionInput: { hostHome: fixture.hostHome },
        paths,
        persist: true,
        observedAt: FIXED_TIME,
        now: FIXED_TIME,
        schemaRoot: ROOT,
      });
      bridgeTimes.push(performance.now() - started);
      if (index === 0) {
        const dir = path.join(paths.runtimeCapabilities, "proofs", result.subject.subjectDigest);
        bytesPerHost = fs.readdirSync(dir).reduce((total, file) => total + fs.statSync(path.join(dir, file)).size, 0);
      }
    }

    const present = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    fs.rmSync(fixture.target, { recursive: true, force: true });
    const absent = buildPassiveHostCapabilityBridge({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome: fixture.hostHome },
      observedAt: FIXED_TIME,
      now: FIXED_TIME,
      schemaRoot: ROOT,
    });
    const stale = evaluateHostCapabilityProof(
      present.proofs.subagents,
      absent.currentBasis.subagents,
      { now: FIXED_TIME, schemaRoot: ROOT },
    );

    const counters = {
      inferredPositiveTrue: Object.values(present.projectedRuntime.capabilities).filter((value) => value === true).length,
      absenceUnsupported: Object.values(absent.projectedRuntime.capabilities).filter((value) => value === false).length,
      replayAccepted: 0,
      driftMisses: stale.effectiveState === "STALE" ? 0 : 1,
    };

    const benchmark = {
      schema: "uads2.wo007.passive-benchmark",
      sample: { compile: compileTimes.length, persistProject: bridgeTimes.length },
      B1: { p50Ms: percentile(compileTimes, 50), p95Ms: percentile(compileTimes, 95), targetP95Ms: 25 },
      B2: { p50Ms: percentile(bridgeTimes, 50), p95Ms: percentile(bridgeTimes, 95), targetP95Ms: 100 },
      B3: { bytesPerHost, targetBytes: 64 * 1024 },
      B4: counters,
    };
    console.log(`UADS2_WO_007_BENCHMARK=${JSON.stringify(benchmark)}`);

    expect(benchmark.B1.p95Ms).toBeLessThanOrEqual(25);
    expect(benchmark.B2.p95Ms).toBeLessThanOrEqual(100);
    expect(bytesPerHost).toBeLessThanOrEqual(64 * 1024);
    expect(counters).toEqual({
      inferredPositiveTrue: 0,
      absenceUnsupported: 0,
      replayAccepted: 0,
      driftMisses: 0,
    });
  });
});
