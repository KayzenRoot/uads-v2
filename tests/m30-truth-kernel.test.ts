import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLOCK_SKEW_TOLERANCE_MS,
  DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS,
  OPERATIONAL_STATE_ENVELOPE_VERSION,
  createOperationalStateEnvelope,
  evaluateOperationalTruth,
  isAuthoritativeTruthClass,
} from "../src/kernel/operational-truth.js";
import {
  evaluateOperationalContinuity,
  type OperationalContinuityEvidence,
} from "../src/kernel/operational-continuity.js";
import {
  BACKPRESSURE_REASON_CODES,
  DEFAULT_OBSERVABILITY_LIMITS,
  boundedAttributeCounts,
  evaluateObservabilityBudget,
  evaluateStreamBackpressure,
} from "../src/kernel/operational-budget.js";
import {
  MAX_CORRELATION_ID_LENGTH,
  buildOpaqueCorrelationId,
  sanitizeCorrelationLabel,
  sanitizeDisplayLabel,
} from "../src/kernel/operational-correlation.js";

const NOW = "2026-09-10T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const FAKE_GITHUB_TOKEN = `ghp_${"a1b2c3d4e5".repeat(4)}`;

function isoAgo(ageMs: number): string {
  return new Date(NOW_MS - ageMs).toISOString();
}

function continuityEvidence(
  overrides: Partial<OperationalContinuityEvidence> = {},
): OperationalContinuityEvidence {
  return {
    observedEventCount: 4,
    rejectedRecordCount: 0,
    scanSaturated: false,
    replayActive: false,
    baselineEstablished: true,
    ...overrides,
  };
}

describe("UADS2-WO-020 T1 OTCL truth/freshness (OP-001, OP-003)", () => {
  it("renders CURRENT only for fresh, intact source evidence", () => {
    const evaluation = evaluateOperationalTruth({
      observedAt: isoAgo(30_000),
      evaluatedAt: NOW,
      freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS,
      integrityValid: true,
    });

    expect(evaluation.truthState).toBe("CURRENT");
    expect(evaluation.reasonCode).toBe("FRESHNESS_LEASE_VALID");
    expect(evaluation.ageMs).toBe(30_000);
    expect(evaluation.leaseExpiresAt).toBe(
      new Date(NOW_MS - 30_000 + DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS).toISOString(),
    );
  });

  it("expires deterministically to STALE when the freshness lease elapses", () => {
    const expired = evaluateOperationalTruth({
      observedAt: isoAgo(DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS + 1_000),
      evaluatedAt: NOW,
      freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS,
      integrityValid: true,
    });
    expect(expired.truthState).toBe("STALE");
    expect(expired.reasonCode).toBe("FRESHNESS_LEASE_EXPIRED");

    const atBoundary = evaluateOperationalTruth({
      observedAt: isoAgo(DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS),
      evaluatedAt: NOW,
      freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS,
      integrityValid: true,
    });
    expect(atBoundary.truthState).toBe("CURRENT");

    const reEvaluated = evaluateOperationalTruth({
      observedAt: isoAgo(DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS + 1_000),
      evaluatedAt: NOW,
      freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS,
      integrityValid: true,
    });
    expect(reEvaluated).toEqual(expired);
  });

  it("never renders CURRENT for missing, invalid or corrupt evidence", () => {
    const cases = [
      {
        name: "no evidence",
        input: { observedAt: null, evaluatedAt: NOW, freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS, integrityValid: true },
        state: "UNAVAILABLE",
        reason: "NO_SOURCE_EVIDENCE",
      },
      {
        name: "invalid timestamp",
        input: { observedAt: "not-a-timestamp", evaluatedAt: NOW, freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS, integrityValid: true },
        state: "DEGRADED",
        reason: "INVALID_TIMESTAMP",
      },
      {
        name: "invalid lease",
        input: { observedAt: isoAgo(1_000), evaluatedAt: NOW, freshnessLeaseMs: 0, integrityValid: true },
        state: "DEGRADED",
        reason: "INVALID_FRESHNESS_LEASE",
      },
      {
        name: "integrity defect",
        input: { observedAt: isoAgo(1_000), evaluatedAt: NOW, freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS, integrityValid: false },
        state: "DEGRADED",
        reason: "INTEGRITY_DEFECT",
      },
      {
        name: "clock skew",
        input: {
          observedAt: new Date(NOW_MS + DEFAULT_CLOCK_SKEW_TOLERANCE_MS + 60_000).toISOString(),
          evaluatedAt: NOW,
          freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS,
          integrityValid: true,
        },
        state: "DEGRADED",
        reason: "CLOCK_SKEW_EXCEEDED",
      },
    ] as const;

    for (const scenario of cases) {
      const evaluation = evaluateOperationalTruth(scenario.input);
      expect(evaluation.truthState, scenario.name).toBe(scenario.state);
      expect(evaluation.truthState, scenario.name).not.toBe("CURRENT");
      expect(evaluation.reasonCode, scenario.name).toBe(scenario.reason);
    }
  });

  it("keeps SOURCE, DERIVED and INFERRED distinguishable in the state envelope", () => {
    const correlationIds = ["corr-0123456789abcdef0123456789abcdef"];
    const envelope = createOperationalStateEnvelope({
      sourceId: "m30.operational-events",
      sourceOwnerModule: "M30",
      sourceSchemaVersion: "1.0.0",
      subjectId: "project-1",
      truthClass: "SOURCE",
      truthState: "CURRENT",
      continuityState: "CONTIGUOUS",
      reasonCode: "FRESHNESS_LEASE_VALID",
      observedAt: isoAgo(1_000),
      evaluatedAt: NOW,
      freshnessLeaseMs: DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS,
      correlationIds,
      lineageRefs: ["event:one"],
      evidenceRefs: ["event:one"],
      value: { events: 1 },
    });

    const requiredFields = [
      "stateEnvelopeVersion",
      "sourceId",
      "sourceOwnerModule",
      "sourceSchemaVersion",
      "subjectId",
      "observedAt",
      "evaluatedAt",
      "freshnessLeaseMs",
      "truthClass",
      "truthState",
      "continuityState",
      "reasonCode",
      "correlationIds",
      "lineageRefs",
      "evidenceRefs",
      "value",
    ];
    for (const field of requiredFields) {
      expect(Object.keys(envelope), `missing ${field}`).toContain(field);
    }
    expect(envelope.stateEnvelopeVersion).toBe(OPERATIONAL_STATE_ENVELOPE_VERSION);
    expect(envelope.truthClass).toBe("SOURCE");
    expect(envelope.continuityState).toBe("CONTIGUOUS");

    correlationIds.push("corr-mutated");
    expect(envelope.correlationIds).toEqual(["corr-0123456789abcdef0123456789abcdef"]);

    expect(isAuthoritativeTruthClass("SOURCE")).toBe(true);
    expect(isAuthoritativeTruthClass("DERIVED")).toBe(false);
    expect(isAuthoritativeTruthClass("INFERRED")).toBe(false);
  });
});

describe("UADS2-WO-020 T2 TCL continuity (OP-002)", () => {
  it("treats silence without an established baseline as UNAVAILABLE, never contiguous", () => {
    const evaluation = evaluateOperationalContinuity(
      continuityEvidence({ observedEventCount: 0, baselineEstablished: false }),
    );
    expect(evaluation.state).toBe("UNAVAILABLE");
    expect(evaluation.reasonCode).toBe("NO_CONTINUITY_EVIDENCE");
    expect(evaluation.unresolvedGap).toBe(false);

    const silentWithBaseline = evaluateOperationalContinuity(
      continuityEvidence({ observedEventCount: 0, baselineEstablished: true }),
    );
    expect(silentWithBaseline.state).toBe("UNAVAILABLE");
    expect(silentWithBaseline.state).not.toBe("CONTIGUOUS");
    expect(silentWithBaseline.unresolvedGap).toBe(true);
  });

  it("reports CONTIGUOUS only inside an accounted evidence window", () => {
    const evaluation = evaluateOperationalContinuity(continuityEvidence());
    expect(evaluation.state).toBe("CONTIGUOUS");
    expect(evaluation.reasonCode).toBe("CONTINUOUS_EVIDENCE_WINDOW");
    expect(evaluation.unresolvedGap).toBe(false);
    expect(evaluation.knownGapCount).toBe(0);
  });

  it("keeps known, unknown and replayed gaps visible", () => {
    const known = evaluateOperationalContinuity(continuityEvidence({ rejectedRecordCount: 3 }));
    expect(known.state).toBe("GAP_KNOWN");
    expect(known.reasonCode).toBe("REJECTED_RECORDS_OBSERVED");
    expect(known.knownGapCount).toBe(3);
    expect(known.unresolvedGap).toBe(true);

    const unknown = evaluateOperationalContinuity(continuityEvidence({ scanSaturated: true }));
    expect(unknown.state).toBe("GAP_UNKNOWN");
    expect(unknown.reasonCode).toBe("CONTINUITY_RANGE_UNBOUNDED");
    expect(unknown.unresolvedGap).toBe(true);

    const replayed = evaluateOperationalContinuity(
      continuityEvidence({ replayActive: true, rejectedRecordCount: 2 }),
    );
    expect(replayed.state).toBe("REPLAYING");
    expect(replayed.reasonCode).toBe("REPLAY_IN_PROGRESS");
    expect(replayed.unresolvedGap).toBe(true);
    expect(replayed.knownGapCount).toBe(2);
    expect(replayed.replayActive).toBe(true);
  });

  it("bounds malformed counters and stays deterministic", () => {
    const malformed = evaluateOperationalContinuity(
      continuityEvidence({ observedEventCount: Number.NaN, rejectedRecordCount: -7 }),
    );
    expect(malformed.knownGapCount).toBe(0);
    expect(malformed.state).toBe("UNAVAILABLE");

    const first = evaluateOperationalContinuity(continuityEvidence({ rejectedRecordCount: 1 }));
    const second = evaluateOperationalContinuity(continuityEvidence({ rejectedRecordCount: 1 }));
    expect(first).toEqual(second);
  });
});

describe("UADS2-WO-020 T4 AOBC/CBF boundedness (PF-001, PF-002)", () => {
  it("degrades optional detail before protected truth/health/audit classes", () => {
    const healthy = evaluateObservabilityBudget({
      observedEventCount: 20,
      maxObservedEvents: 200,
      distinctAttributeKeys: 2,
      maxCardinalityKeys: 64,
      activeClients: 0,
      maxClients: 8,
    });
    expect(healthy.state).toBe("HEALTHY");
    expect(healthy.shedClasses).toEqual([]);
    expect(healthy.retainedClasses).toEqual(["P0", "P1", "P2", "P3"]);

    const pressured = evaluateObservabilityBudget({
      observedEventCount: 160,
      maxObservedEvents: 200,
      distinctAttributeKeys: 2,
      maxCardinalityKeys: 64,
      activeClients: 0,
      maxClients: 8,
    });
    expect(pressured.state).toBe("PRESSURED");
    expect(pressured.shedClasses).toEqual([]);

    const shedding = evaluateObservabilityBudget({
      observedEventCount: 185,
      maxObservedEvents: 200,
      distinctAttributeKeys: 2,
      maxCardinalityKeys: 64,
      activeClients: 0,
      maxClients: 8,
    });
    expect(shedding.state).toBe("SHEDDING_OPTIONAL");
    expect(shedding.shedClasses).toEqual(["P3"]);
    expect(shedding.retainedClasses).toContain("P0");
    expect(shedding.retainedClasses).toContain("P1");
    expect(shedding.shedEvidence).toEqual([
      { priorityClass: "P3", reasonCode: "P3_OPTIONAL_DETAIL_SHED" },
    ]);

    const degraded = evaluateObservabilityBudget({
      observedEventCount: 260,
      maxObservedEvents: 200,
      distinctAttributeKeys: 2,
      maxCardinalityKeys: 64,
      activeClients: 0,
      maxClients: 8,
    });
    expect(degraded.state).toBe("DEGRADED");
    expect(degraded.shedClasses).toEqual(["P3", "P2"]);
    expect(degraded.shedClasses).not.toContain("P0");
    expect(degraded.shedClasses).not.toContain("P1");
    expect(degraded.shedEvidence.map((item) => item.reasonCode)).toEqual([
      "P3_OPTIONAL_DETAIL_SHED",
      "P2_AGGREGATE_DETAIL_SHED",
    ]);
  });

  it("bounds adversarial cardinality with visible dropped-series evidence", () => {
    const values = Array.from({ length: 500 }, (_, index) => `agent-${index}-${"x7q".repeat(20)}`);
    const bounded = boundedAttributeCounts(values, { maxKeys: 8 });

    expect(bounded.boundedKeys).toBeLessThanOrEqual(8);
    expect(Object.keys(bounded.counts).length).toBeLessThanOrEqual(8);
    expect(bounded.counts[bounded.overflowKey]).toBeGreaterThan(0);
    expect(bounded.droppedSeries).toBeGreaterThan(0);
    expect(bounded.overflowCount).toBe(bounded.droppedSeries);
    const totalCounted = Object.values(bounded.counts).reduce((sum, count) => sum + count, 0);
    expect(totalCounted).toBe(values.length);

    const pathological = boundedAttributeCounts(
      ["", " ", "\u0000\u0001", "a".repeat(50_000)],
      { maxKeys: 3 },
    );
    expect(pathological.boundedKeys).toBeLessThanOrEqual(3);
    expect(Object.keys(pathological.counts).length).toBeLessThanOrEqual(3);

    const repeated = boundedAttributeCounts(values, { maxKeys: 8 });
    expect(repeated).toEqual(bounded);
  });

  it("exposes a bounded per-client backpressure firewall", () => {
    const withinBudget = evaluateStreamBackpressure({ bufferedBytes: 100, limitBytes: 1_024 });
    expect(withinBudget.drop).toBe(false);
    expect(withinBudget.reasonCode).toBe(BACKPRESSURE_REASON_CODES.withinBudget);

    const exceeded = evaluateStreamBackpressure({ bufferedBytes: 2_048, limitBytes: 1_024 });
    expect(exceeded.drop).toBe(true);
    expect(exceeded.reasonCode).toBe(BACKPRESSURE_REASON_CODES.dropSlowClient);

    const malformed = evaluateStreamBackpressure({ bufferedBytes: Number.NaN, limitBytes: Number.NaN });
    expect(malformed.drop).toBe(false);
    expect(malformed.limitBytes).toBe(1);

    expect(DEFAULT_OBSERVABILITY_LIMITS.maxObservedEvents).toBe(200);
    expect(DEFAULT_OBSERVABILITY_LIMITS.maxSseClients).toBe(8);
    expect(DEFAULT_OBSERVABILITY_LIMITS.maxSseClientBufferBytes).toBe(1024 * 1024);
  });
});

describe("UADS2-WO-020 T5 PSCF privacy (OP-009)", () => {
  it("builds opaque bounded correlation identifiers", () => {
    const first = buildOpaqueCorrelationId(["project-1", "UADS2-WO-020", null, undefined]);
    const second = buildOpaqueCorrelationId(["project-1", "UADS2-WO-020"]);
    const other = buildOpaqueCorrelationId(["project-2", "UADS2-WO-020"]);

    expect(first).toMatch(/^corr-[a-f0-9]{32}$/);
    expect(first.length).toBeLessThanOrEqual(MAX_CORRELATION_ID_LENGTH);
    expect(first).toBe(second);
    expect(other).not.toBe(first);
    expect(first).not.toContain("project-1");
    expect(buildOpaqueCorrelationId([])).toMatch(/^corr-[a-f0-9]{32}$/);
  });

  it("rejects secrets, sensitive paths and free text from correlation labels", () => {
    const secret = sanitizeCorrelationLabel(FAKE_GITHUB_TOKEN);
    expect(secret.sanitized).toBe(true);
    expect(secret.value).toMatch(/^label-[a-f0-9]{12}$/);
    expect(secret.value).not.toContain("ghp_");

    const promptLike = sanitizeCorrelationLabel("summarize the private repository contents");
    expect(promptLike.value).toMatch(/^label-[a-f0-9]{12}$/);
    expect(promptLike.value).not.toContain("private repository");

    const hostPath = sanitizeCorrelationLabel("C:\\Users\\csn19\\Documents\\secret-plan.md");
    expect(hostPath.value).toMatch(/^label-[a-f0-9]{12}$/);
    expect(hostPath.value).not.toContain("csn19");

    expect(sanitizeCorrelationLabel("")).toMatchObject({
      value: "label-unknown",
      sanitized: true,
      reasonCode: "LABEL_MISSING",
    });

    const safe = sanitizeCorrelationLabel("work-order-UADS2-WO-020");
    expect(safe).toMatchObject({ value: "work-order-UADS2-WO-020", sanitized: false, reasonCode: null });

    const long = sanitizeCorrelationLabel(`safe-${"a".repeat(60)}`, 32);
    expect(long.sanitized).toBe(true);
    expect(long.reasonCode).toBe("LABEL_LENGTH_BOUNDED");
    expect(long.value.length).toBeLessThanOrEqual(32);
  });

  it("redacts display labels while keeping them bounded", () => {
    const secret = sanitizeDisplayLabel(`checked ${FAKE_GITHUB_TOKEN} for reuse`);
    expect(secret.value).toContain("[REDACTED:github-token]");
    expect(secret.value).not.toContain("ghp_");
    expect(secret.sanitized).toBe(true);

    const hostPath = sanitizeDisplayLabel("artifact C:\\Users\\csn19\\Documents\\report.md");
    expect(hostPath.value).not.toContain("csn19");

    const bounded = sanitizeDisplayLabel("d".repeat(1_000));
    expect(bounded.value.length).toBeLessThanOrEqual(161);
    expect(bounded.value.endsWith("\u2026")).toBe(true);

    expect(sanitizeDisplayLabel("")).toMatchObject({ value: "UNAVAILABLE", sanitized: true });
  });
});
