import type { OperationalContinuityState } from "./operational-truth.js";

export const CONTINUITY_REASON_CODES = {
  contiguous: "CONTINUOUS_EVIDENCE_WINDOW",
  noEvidence: "NO_CONTINUITY_EVIDENCE",
  rejectedRecords: "REJECTED_RECORDS_OBSERVED",
  unknownRange: "CONTINUITY_RANGE_UNBOUNDED",
  replaying: "REPLAY_IN_PROGRESS",
} as const;

export type OperationalContinuityEvidence = {
  observedEventCount: number;
  rejectedRecordCount: number;
  scanSaturated: boolean;
  replayActive: boolean;
  baselineEstablished: boolean;
};

export type OperationalContinuityEvaluation = {
  state: OperationalContinuityState;
  reasonCode: string;
  unresolvedGap: boolean;
  knownGapCount: number;
  replayActive: boolean;
};

function boundedCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

/**
 * Deterministic TCL evaluation.
 *
 * Silence is never proof of continuity: an empty evidence window without an
 * established baseline is UNAVAILABLE rather than CONTIGUOUS. Rejected records
 * are a known gap and outrank mere absence, so a corrupt store reports
 * GAP_KNOWN instead of UNAVAILABLE. Replay is reported as REPLAYING and never
 * erases an unresolved gap.
 */
export function evaluateOperationalContinuity(
  evidence: OperationalContinuityEvidence,
): OperationalContinuityEvaluation {
  const observed = boundedCount(evidence.observedEventCount);
  const rejected = boundedCount(evidence.rejectedRecordCount);
  const knownGapCount = rejected;

  if (evidence.replayActive) {
    return {
      state: "REPLAYING",
      reasonCode: CONTINUITY_REASON_CODES.replaying,
      unresolvedGap: knownGapCount > 0 || evidence.scanSaturated || !evidence.baselineEstablished,
      knownGapCount,
      replayActive: true,
    };
  }
  if (evidence.scanSaturated) {
    return {
      state: "GAP_UNKNOWN",
      reasonCode: CONTINUITY_REASON_CODES.unknownRange,
      unresolvedGap: true,
      knownGapCount,
      replayActive: false,
    };
  }
  if (knownGapCount > 0) {
    return {
      state: "GAP_KNOWN",
      reasonCode: CONTINUITY_REASON_CODES.rejectedRecords,
      unresolvedGap: true,
      knownGapCount,
      replayActive: false,
    };
  }
  if (observed === 0 && !evidence.baselineEstablished) {
    return {
      state: "UNAVAILABLE",
      reasonCode: CONTINUITY_REASON_CODES.noEvidence,
      unresolvedGap: false,
      knownGapCount: 0,
      replayActive: evidence.replayActive,
    };
  }
  if (observed === 0) {
    return {
      state: "UNAVAILABLE",
      reasonCode: CONTINUITY_REASON_CODES.noEvidence,
      unresolvedGap: true,
      knownGapCount: 0,
      replayActive: false,
    };
  }
  return {
    state: "CONTIGUOUS",
    reasonCode: CONTINUITY_REASON_CODES.contiguous,
    unresolvedGap: false,
    knownGapCount: 0,
    replayActive: false,
  };
}