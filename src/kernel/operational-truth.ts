import type { OperationalPayloadValue } from "./operational-event-types.js";

export const OPERATIONAL_STATE_ENVELOPE_VERSION = "1.0.0" as const;
export const DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS = 15 * 60_000;
export const DEFAULT_CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;

export type OperationalTruthClass = "SOURCE" | "DERIVED" | "INFERRED";
export type OperationalTruthState = "CURRENT" | "STALE" | "DEGRADED" | "UNAVAILABLE";
/**
 * Projection-level availability state.
 *
 * The Operational State Envelope truthState stays the frozen four-value S02
 * contract. Projection surfaces that depend on a source which does not exist at
 * all (for example M07/M24 economic truth) must render UNKNOWN instead of a
 * fabricated CURRENT/zero, so absence is a first-class visible state.
 */
export type OperationalAvailabilityState = OperationalTruthState | "UNKNOWN";
export type OperationalContinuityState =
  | "CONTIGUOUS"
  | "GAP_KNOWN"
  | "GAP_UNKNOWN"
  | "REPLAYING"
  | "UNAVAILABLE";

export const TRUTH_REASON_CODES = {
  fresh: "FRESHNESS_LEASE_VALID",
  leaseExpired: "FRESHNESS_LEASE_EXPIRED",
  invalidLease: "INVALID_FRESHNESS_LEASE",
  noEvidence: "NO_SOURCE_EVIDENCE",
  integrityDefect: "INTEGRITY_DEFECT",
  invalidTimestamp: "INVALID_TIMESTAMP",
  clockSkew: "CLOCK_SKEW_EXCEEDED",
} as const;

export type OperationalStateEnvelope = {
  stateEnvelopeVersion: typeof OPERATIONAL_STATE_ENVELOPE_VERSION;
  sourceId: string;
  sourceOwnerModule: string;
  sourceSchemaVersion: string;
  subjectId: string;
  observedAt: string | null;
  evaluatedAt: string;
  freshnessLeaseMs: number;
  truthClass: OperationalTruthClass;
  truthState: OperationalTruthState;
  continuityState: OperationalContinuityState;
  reasonCode: string;
  correlationIds: string[];
  lineageRefs: string[];
  evidenceRefs: string[];
  value: OperationalPayloadValue | null;
};

export type TruthEvaluationInput = {
  observedAt: string | null;
  evaluatedAt: string;
  freshnessLeaseMs: number;
  integrityValid: boolean;
  clockSkewToleranceMs?: number;
};

export type TruthEvaluation = {
  truthState: OperationalTruthState;
  reasonCode: string;
  ageMs: number | null;
  leaseExpiresAt: string | null;
};

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Deterministic OTCL evaluation.
 *
 * Precedence is fixed so that a corrupt or ambiguous source can never be
 * rendered CURRENT even when its timestamps are fresh:
 * 1. integrity defect -> DEGRADED (corruption outranks absence, so a corrupt
 *    store is never reported as merely UNAVAILABLE);
 * 2. no evidence -> UNAVAILABLE;
 * 3. invalid timestamps/lease -> DEGRADED;
 * 4. future clock skew beyond tolerance -> DEGRADED;
 * 5. expired freshness lease -> STALE;
 * 6. otherwise -> CURRENT.
 *
 * The evaluator never throws for malformed input and never invents a value.
 */
export function evaluateOperationalTruth(input: TruthEvaluationInput): TruthEvaluation {
  const lease = Number.isFinite(input.freshnessLeaseMs) && input.freshnessLeaseMs > 0 ? Math.floor(input.freshnessLeaseMs) : null;
  const evaluatedMs = parseTimestamp(input.evaluatedAt);
  const observedMs = parseTimestamp(input.observedAt);

  if (!input.integrityValid) {
    const ageMs = observedMs === null || evaluatedMs === null ? null : evaluatedMs - observedMs;
    const leaseExpiresAt = observedMs === null || lease === null ? null : new Date(observedMs + lease).toISOString();
    return { truthState: "DEGRADED", reasonCode: TRUTH_REASON_CODES.integrityDefect, ageMs, leaseExpiresAt };
  }
  if (!input.observedAt) {
    return { truthState: "UNAVAILABLE", reasonCode: TRUTH_REASON_CODES.noEvidence, ageMs: null, leaseExpiresAt: null };
  }
  if (observedMs === null || evaluatedMs === null) {
    return { truthState: "DEGRADED", reasonCode: TRUTH_REASON_CODES.invalidTimestamp, ageMs: null, leaseExpiresAt: null };
  }
  if (lease === null) {
    return { truthState: "DEGRADED", reasonCode: TRUTH_REASON_CODES.invalidLease, ageMs: null, leaseExpiresAt: null };
  }
  const ageMs = evaluatedMs - observedMs;
  const leaseExpiresAt = new Date(observedMs + lease).toISOString();
  const skewTolerance = Number.isFinite(input.clockSkewToleranceMs)
    ? Math.max(0, Math.floor(input.clockSkewToleranceMs as number))
    : DEFAULT_CLOCK_SKEW_TOLERANCE_MS;
  if (ageMs < -skewTolerance) {
    return { truthState: "DEGRADED", reasonCode: TRUTH_REASON_CODES.clockSkew, ageMs, leaseExpiresAt };
  }
  if (ageMs > lease) {
    return { truthState: "STALE", reasonCode: TRUTH_REASON_CODES.leaseExpired, ageMs, leaseExpiresAt };
  }
  return { truthState: "CURRENT", reasonCode: TRUTH_REASON_CODES.fresh, ageMs, leaseExpiresAt };
}

export type StateEnvelopeInput = {
  sourceId: string;
  sourceOwnerModule: string;
  sourceSchemaVersion: string;
  subjectId: string;
  truthClass: OperationalTruthClass;
  truthState: OperationalTruthState;
  continuityState: OperationalContinuityState;
  reasonCode: string;
  observedAt: string | null;
  evaluatedAt: string;
  freshnessLeaseMs: number;
  correlationIds?: string[];
  lineageRefs?: string[];
  evidenceRefs?: string[];
  value?: OperationalPayloadValue | null;
};

export function createOperationalStateEnvelope(input: StateEnvelopeInput): OperationalStateEnvelope {
  return {
    stateEnvelopeVersion: OPERATIONAL_STATE_ENVELOPE_VERSION,
    sourceId: input.sourceId,
    sourceOwnerModule: input.sourceOwnerModule,
    sourceSchemaVersion: input.sourceSchemaVersion,
    subjectId: input.subjectId,
    observedAt: input.observedAt,
    evaluatedAt: input.evaluatedAt,
    freshnessLeaseMs: input.freshnessLeaseMs,
    truthClass: input.truthClass,
    truthState: input.truthState,
    continuityState: input.continuityState,
    reasonCode: input.reasonCode,
    correlationIds: [...(input.correlationIds ?? [])],
    lineageRefs: [...(input.lineageRefs ?? [])],
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    value: input.value ?? null,
  };
}

/** A projection may cite SOURCE evidence but may never re-label it as its own truth. */
export function isAuthoritativeTruthClass(truthClass: OperationalTruthClass): boolean {
  return truthClass === "SOURCE";
}
