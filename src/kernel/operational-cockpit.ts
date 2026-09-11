import type { OperationalEvent, OperationalHealth, OperationalPayloadValue } from "./operational-event-types.js";
import {
  DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS,
  createOperationalStateEnvelope,
  evaluateOperationalTruth,
  type OperationalStateEnvelope,
  type OperationalAvailabilityState,
  type OperationalTruthClass,
  type OperationalTruthState,
} from "./operational-truth.js";
import {
  evaluateOperationalContinuity,
  type OperationalContinuityEvaluation,
  type OperationalContinuityEvidence,
} from "./operational-continuity.js";
import {
  DEFAULT_OBSERVABILITY_LIMITS,
  boundedAttributeCounts,
  evaluateObservabilityBudget,
  type ObservabilityBudgetEvaluation,
} from "./operational-budget.js";
import { buildOpaqueCorrelationId, sanitizeCorrelationLabel, sanitizeDisplayLabel } from "./operational-correlation.js";

export const LIVING_COCKPIT_SCHEMA = "uads.living-cockpit" as const;
export const LIVING_COCKPIT_SCHEMA_VERSION = "1.0.0" as const;
export const LIVING_COCKPIT_PROJECTION_VERSION = "m30-s05.1.0" as const;
export const MAX_COCKPIT_EVIDENCE_REFS = 8;
export const MAX_COCKPIT_REASON_CODES = 8;

export type CockpitHealthSource = {
  sourceId: string;
  sourceOwnerModule: string;
  truthClass: OperationalTruthClass;
  truthState: OperationalTruthState;
  reasonCode: string;
};

export type CockpitGlobalHealth = {
  status: OperationalTruthState;
  reasonCodes: string[];
  sources: CockpitHealthSource[];
};

export type CockpitStreamState = {
  activeClients: number;
  maxClients: number;
  bufferLimitBytes: number;
  slowClientDrops: number;
  lastDropReasonCode: string | null;
  reconnects: number;
  replayActive: boolean;
  lastResumeState: string | null;
};

export type CockpitCapabilityAdapterTruth = {
  adapterId: string;
  status: string;
  truthState: OperationalAvailabilityState;
  reasonCodes: string[];
  subjectDigest: string;
  adapterContractDigest: string;
  observedAt: string;
};

export type CockpitCapabilityTruth =
  | {
      truthState: OperationalAvailabilityState;
      reasonCode: string;
      adapters: CockpitCapabilityAdapterTruth[];
    }
  | null;

export type CockpitEconomicTruth =
  | {
      truthState: OperationalAvailabilityState;
      reasonCode: string;
      sourceOwnerModule: string;
      observedAt: string | null;
      lineageRefs: string[];
      value: OperationalPayloadValue | null;
    }
  | null;

export type CockpitPressure = ObservabilityBudgetEvaluation & {
  eventTypeCounts: Record<string, number>;
  droppedSeries: number;
  boundedKeys: number;
};

export type LivingCockpitProjection = {
  schema: typeof LIVING_COCKPIT_SCHEMA;
  schemaVersion: typeof LIVING_COCKPIT_SCHEMA_VERSION;
  projectionVersion: typeof LIVING_COCKPIT_PROJECTION_VERSION;
  generatedAt: string;
  projectId: string;
  truthClass: "DERIVED";
  authorityNotice: "read-only projection over source-owned evidence; never a domain truth source";
  globalHealth: CockpitGlobalHealth;
  freshness: OperationalStateEnvelope;
  continuity: OperationalContinuityEvaluation & { lineageRefs: string[] };
  pressure: CockpitPressure;
  stream: CockpitStreamState;
  capability: { truthState: OperationalAvailabilityState; reasonCode: string; adapters: CockpitCapabilityAdapterTruth[] };
  economic: {
    truthState: OperationalAvailabilityState;
    reasonCode: string;
    sourceOwnerModules: string[];
    value: OperationalPayloadValue | null;
    lineageRefs: string[];
  };
  evidence: { refs: string[]; correlationId: string };
};

export type LivingCockpitInput = {
  projectId: string;
  health: OperationalHealth;
  observedEvents: OperationalEvent[];
  continuityEvidence: OperationalContinuityEvidence;
  generatedAt?: string;
  freshnessLeaseMs?: number;
  activeClients?: number;
  maxClients?: number;
  bufferLimitBytes?: number;
  slowClientDrops?: number;
  lastDropReasonCode?: string | null;
  reconnects?: number;
  replayActive?: boolean;
  lastResumeState?: string | null;
  capabilityTruth?: CockpitCapabilityTruth;
  economicTruth?: CockpitEconomicTruth;
};

const EVENTS_SOURCE_ID = "m30.operational-events";
const CONTINUITY_SOURCE_ID = "m30.continuity";
const STORAGE_SOURCE_ID = "m30.observability-storage";

/** Deterministic worst-state aggregation; higher severity always wins. */
const TRUTH_STATE_SEVERITY: Record<OperationalTruthState, number> = {
  CURRENT: 0,
  STALE: 1,
  DEGRADED: 2,
  UNAVAILABLE: 3,
};

function boundedReasonCodes(reasonCodes: readonly string[]): string[] {
  return [...new Set(reasonCodes.filter((code) => typeof code === "string" && code.length > 0))].slice(0, MAX_COCKPIT_REASON_CODES);
}

function truthStateFromHealth(status: OperationalHealth["status"]): OperationalTruthState {
  if (status === "HEALTHY") {
    return "CURRENT";
  }
  if (status === "DEGRADED") {
    return "DEGRADED";
  }
  return "UNAVAILABLE";
}

function continuitySourceState(continuity: OperationalContinuityEvaluation): OperationalTruthState {
  switch (continuity.state) {
    case "CONTIGUOUS":
      return "CURRENT";
    case "REPLAYING":
      return "DEGRADED";
    case "GAP_KNOWN":
    case "GAP_UNKNOWN":
      return "DEGRADED";
    default:
      return "UNAVAILABLE";
  }
}

function composeGlobalHealth(
  freshness: OperationalStateEnvelope,
  continuity: OperationalContinuityEvaluation,
  health: OperationalHealth,
): CockpitGlobalHealth {
  const storageState = truthStateFromHealth(health.status);
  const sources: CockpitHealthSource[] = [
    {
      sourceId: EVENTS_SOURCE_ID,
      sourceOwnerModule: "M30",
      truthClass: "SOURCE",
      truthState: freshness.truthState,
      reasonCode: freshness.reasonCode,
    },
    {
      sourceId: CONTINUITY_SOURCE_ID,
      sourceOwnerModule: "M30",
      truthClass: "DERIVED",
      truthState: continuitySourceState(continuity),
      reasonCode: continuity.reasonCode,
    },
    {
      sourceId: STORAGE_SOURCE_ID,
      sourceOwnerModule: "M30",
      truthClass: "SOURCE",
      truthState: storageState,
      reasonCode: health.reasonCodes[0] ?? "STORAGE_STATE_UNAVAILABLE",
    },
  ];
  const status: OperationalTruthState = sources
    .map((source) => source.truthState)
    .reduce<OperationalTruthState>((worst, current) =>
      TRUTH_STATE_SEVERITY[current] > TRUTH_STATE_SEVERITY[worst] ? current : worst,
    "CURRENT");
  const reasonCodes = boundedReasonCodes([
    ...(status === "CURRENT" ? [] : sources.filter((source) => source.truthState !== "CURRENT").map((source) => source.reasonCode)),
    ...health.reasonCodes,
  ]);
  return { status, reasonCodes, sources };
}

function capabilityProjection(capabilityTruth: CockpitCapabilityTruth): LivingCockpitProjection["capability"] {
  if (!capabilityTruth) {
    return {
      truthState: "UNAVAILABLE",
      reasonCode: "CAPABILITY_PROJECTION_UNAVAILABLE",
      adapters: [],
    };
  }
  const adapters = capabilityTruth.adapters.slice(0, 8).map((adapter) => ({
    adapterId: sanitizeCorrelationLabel(adapter.adapterId, 64).value,
    status: sanitizeCorrelationLabel(adapter.status, 32).value,
    truthState: adapter.truthState,
    reasonCodes: boundedReasonCodes(adapter.reasonCodes),
    subjectDigest: adapter.subjectDigest.slice(0, 16),
    adapterContractDigest: adapter.adapterContractDigest.slice(0, 16),
    observedAt: adapter.observedAt,
  }));
  return { truthState: capabilityTruth.truthState, reasonCode: capabilityTruth.reasonCode, adapters };
}

function economicProjection(economicTruth: CockpitEconomicTruth): LivingCockpitProjection["economic"] {
  if (!economicTruth) {
    return {
      truthState: "UNKNOWN",
      reasonCode: "NO_AUTHORITATIVE_ECONOMIC_SOURCE",
      sourceOwnerModules: ["M07", "M24"],
      value: null,
      lineageRefs: [],
    };
  }
  return {
    truthState: economicTruth.truthState,
    reasonCode: economicTruth.reasonCode,
    sourceOwnerModules: [economicTruth.sourceOwnerModule],
    value: economicTruth.value ?? null,
    lineageRefs: economicTruth.lineageRefs.slice(0, MAX_COCKPIT_EVIDENCE_REFS),
  };
}

/**
 * Builds the read-only Living Cockpit projection.
 *
 * The projection is DERIVED: it cites source-owned evidence, never writes domain
 * state, never fabricates CURRENT/LIVE or zero values, and always exposes
 * freshness, continuity, pressure and reason codes so that degradation is
 * visible instead of hidden.
 */
export function buildLivingCockpitProjection(input: LivingCockpitInput): LivingCockpitProjection {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const freshnessLeaseMs =
    Number.isFinite(input.freshnessLeaseMs) && (input.freshnessLeaseMs as number) > 0
      ? Math.floor(input.freshnessLeaseMs as number)
      : DEFAULT_OPERATIONAL_FRESHNESS_LEASE_MS;

  const latestEvent = input.observedEvents[0] ?? null;
  const lineageRefs = input.observedEvents
    .slice(0, MAX_COCKPIT_EVIDENCE_REFS)
    .map((event) => `event:${event.eventId}`);
  const evidenceRefs = [`health:${input.health.updatedAt}`, ...lineageRefs].slice(0, MAX_COCKPIT_EVIDENCE_REFS);

  const continuity = evaluateOperationalContinuity({
    ...input.continuityEvidence,
    replayActive: input.replayActive ?? input.continuityEvidence.replayActive,
  });

  const evaluation = evaluateOperationalTruth({
    observedAt: input.health.lastEventAt,
    evaluatedAt: generatedAt,
    freshnessLeaseMs,
    integrityValid: input.health.rejectedEventCount === 0,
  });
  const freshness = createOperationalStateEnvelope({
    sourceId: EVENTS_SOURCE_ID,
    sourceOwnerModule: "M30",
    sourceSchemaVersion: "1.0.0",
    subjectId: input.projectId,
    truthClass: "SOURCE",
    truthState: evaluation.truthState,
    continuityState: continuity.state,
    reasonCode: evaluation.reasonCode,
    observedAt: input.health.lastEventAt,
    evaluatedAt: generatedAt,
    freshnessLeaseMs,
    correlationIds: [
      buildOpaqueCorrelationId([input.projectId, latestEvent?.workOrderId ?? null, latestEvent?.correlationId ?? null]),
    ],
    lineageRefs,
    evidenceRefs,
    value: evaluation.ageMs === null ? null : { ageMs: evaluation.ageMs, leaseExpiresAt: evaluation.leaseExpiresAt },
  });

  const eventTypes = boundedAttributeCounts(
    input.observedEvents.map((event) => event.eventType),
    { maxKeys: 32 },
  );
  const severityKeys = boundedAttributeCounts(
    input.observedEvents.map((event) => event.severity),
    { maxKeys: 16 },
  );
  const distinctAttributeKeys = Object.keys(severityKeys.counts).length + Object.keys(eventTypes.counts).length;
  const budget = evaluateObservabilityBudget({
    observedEventCount: input.health.validEventCount,
    maxObservedEvents: DEFAULT_OBSERVABILITY_LIMITS.maxObservedEvents,
    distinctAttributeKeys,
    maxCardinalityKeys: DEFAULT_OBSERVABILITY_LIMITS.maxCardinalityKeys,
    activeClients: input.activeClients ?? 0,
    maxClients: input.maxClients ?? DEFAULT_OBSERVABILITY_LIMITS.maxSseClients,
  });
  const pressure: CockpitPressure = {
    ...budget,
    eventTypeCounts: eventTypes.counts,
    droppedSeries: eventTypes.droppedSeries,
    boundedKeys: eventTypes.boundedKeys,
  };

  const globalHealth = composeGlobalHealth(freshness, continuity, input.health);
  return {
    schema: LIVING_COCKPIT_SCHEMA,
    schemaVersion: LIVING_COCKPIT_SCHEMA_VERSION,
    projectionVersion: LIVING_COCKPIT_PROJECTION_VERSION,
    generatedAt,
    projectId: input.projectId,
    truthClass: "DERIVED",
    authorityNotice: "read-only projection over source-owned evidence; never a domain truth source",
    globalHealth,
    freshness,
    continuity: { ...continuity, lineageRefs },
    pressure,
    stream: {
      activeClients: Math.max(0, Math.floor(input.activeClients ?? 0)),
      maxClients: Math.max(1, Math.floor(input.maxClients ?? DEFAULT_OBSERVABILITY_LIMITS.maxSseClients)),
      bufferLimitBytes: Math.max(
        1,
        Math.floor(input.bufferLimitBytes ?? DEFAULT_OBSERVABILITY_LIMITS.maxSseClientBufferBytes),
      ),
      slowClientDrops: Math.max(0, Math.floor(input.slowClientDrops ?? 0)),
      lastDropReasonCode: input.lastDropReasonCode ?? null,
      reconnects: Math.max(0, Math.floor(input.reconnects ?? 0)),
      replayActive: continuity.replayActive,
      lastResumeState: input.lastResumeState ?? null,
    },
    capability: capabilityProjection(input.capabilityTruth ?? null),
    economic: economicProjection(input.economicTruth ?? null),
    evidence: {
      refs: evidenceRefs,
      correlationId: buildOpaqueCorrelationId([input.projectId, input.health.updatedAt]),
    },
  };
}

/** Operator-facing one-line rendering inputs stay sanitized and bounded. */
export function summarizeCockpitReasons(projection: LivingCockpitProjection): string[] {
  return projection.globalHealth.reasonCodes
    .map((code) => sanitizeDisplayLabel(code, 64).value)
    .slice(0, MAX_COCKPIT_REASON_CODES);
}
