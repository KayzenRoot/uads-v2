export type ObservabilityPriorityClass = "P0" | "P1" | "P2" | "P3";
export type ObservabilityPressureState = "HEALTHY" | "PRESSURED" | "SHEDDING_OPTIONAL" | "DEGRADED";

export const AOBC_REASON_CODES = {
  healthy: "OBSERVABILITY_BUDGET_HEALTHY",
  pressured: "OBSERVABILITY_PRESSURE_RISING",
  shedding: "OPTIONAL_DETAIL_SHED",
  degraded: "OBSERVABILITY_BUDGET_EXCEEDED",
  shedP3: "P3_OPTIONAL_DETAIL_SHED",
  shedP2: "P2_AGGREGATE_DETAIL_SHED",
  cardinalityOverflow: "CARDINALITY_OVERFLOW_AGGREGATED",
} as const;

export const DEFAULT_OBSERVABILITY_LIMITS = {
  maxObservedEvents: 200,
  maxCardinalityKeys: 64,
  maxSseClients: 8,
  maxSseClientBufferBytes: 1024 * 1024,
} as const;

export const BACKPRESSURE_REASON_CODES = {
  withinBudget: "SSE_CLIENT_WITHIN_BUFFER_BUDGET",
  dropSlowClient: "SSE_CLIENT_BUFFER_EXCEEDED",
} as const;

export type StreamBackpressureEvaluation = {
  drop: boolean;
  reasonCode: string;
  bufferedBytes: number;
  limitBytes: number;
};

/**
 * Deterministic per-client backpressure firewall for bounded SSE fan-out.
 *
 * A client that cannot drain its socket buffer beyond the bounded budget is
 * dropped and counted instead of allowing unbounded buffered work to grow.
 */
export function evaluateStreamBackpressure(input: {
  bufferedBytes: number;
  limitBytes: number;
}): StreamBackpressureEvaluation {
  const limitBytes = Number.isFinite(input.limitBytes) && input.limitBytes > 0 ? Math.floor(input.limitBytes) : 1;
  const bufferedBytes = Number.isFinite(input.bufferedBytes) ? Math.max(0, Math.floor(input.bufferedBytes)) : 0;
  const drop = bufferedBytes > limitBytes;
  return {
    drop,
    reasonCode: drop ? BACKPRESSURE_REASON_CODES.dropSlowClient : BACKPRESSURE_REASON_CODES.withinBudget,
    bufferedBytes,
    limitBytes,
  };
}

export type ObservabilityBudgetInput = {
  observedEventCount: number;
  maxObservedEvents: number;
  distinctAttributeKeys: number;
  maxCardinalityKeys: number;
  activeClients: number;
  maxClients: number;
};

export type ObservabilityBudgetDriver = {
  resource: "events" | "cardinality" | "clients";
  utilization: number;
};

export type ObservabilityShedEvidence = {
  priorityClass: ObservabilityPriorityClass;
  reasonCode: string;
};

export type ObservabilityBudgetEvaluation = {
  state: ObservabilityPressureState;
  utilization: number;
  drivers: ObservabilityBudgetDriver[];
  retainedClasses: ObservabilityPriorityClass[];
  shedClasses: ObservabilityPriorityClass[];
  shedEvidence: ObservabilityShedEvidence[];
};

function ratio(value: number, limit: number): number {
  const boundedLimit = Number.isFinite(limit) && limit > 0 ? limit : 1;
  const boundedValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  return boundedValue / boundedLimit;
}

/**
 * Deterministic AOBC degradation ladder.
 *
 * P0 (truth/integrity/audit) and P1 (health/freshness/continuity) evidence are
 * protected: optional P3 and then P2 detail is shed first, and every shed step
 * emits visible bounded evidence.
 */
export function evaluateObservabilityBudget(input: ObservabilityBudgetInput): ObservabilityBudgetEvaluation {
  const drivers: ObservabilityBudgetDriver[] = [
    { resource: "events", utilization: ratio(input.observedEventCount, input.maxObservedEvents) },
    { resource: "cardinality", utilization: ratio(input.distinctAttributeKeys, input.maxCardinalityKeys) },
    { resource: "clients", utilization: ratio(input.activeClients, input.maxClients) },
  ];
  const utilization = Math.max(...drivers.map((driver) => driver.utilization));
  const state: ObservabilityPressureState =
    utilization > 1 ? "DEGRADED" : utilization >= 0.9 ? "SHEDDING_OPTIONAL" : utilization >= 0.75 ? "PRESSURED" : "HEALTHY";
  const shedClasses: ObservabilityPriorityClass[] =
    state === "DEGRADED"
      ? ["P3", "P2"]
      : state === "SHEDDING_OPTIONAL"
        ? ["P3"]
        : [];
  const shedEvidence: ObservabilityShedEvidence[] = shedClasses.map((priorityClass) => ({
    priorityClass,
    reasonCode: priorityClass === "P3" ? AOBC_REASON_CODES.shedP3 : AOBC_REASON_CODES.shedP2,
  }));
  const retainedClasses: ObservabilityPriorityClass[] = (["P0", "P1", "P2", "P3"] as const).filter(
    (priorityClass) => !shedClasses.includes(priorityClass),
  );
  return {
    state,
    utilization: Number(utilization.toFixed(6)),
    drivers,
    retainedClasses: [...retainedClasses],
    shedClasses: [...shedClasses],
    shedEvidence,
  };
}

export type BoundedAttributeCounts = {
  counts: Record<string, number>;
  overflowCount: number;
  droppedSeries: number;
  boundedKeys: number;
  overflowKey: string;
};

/**
 * CBF cardinality firewall: adversarial attribute values can never create
 * unbounded keys. At most `maxKeys` keys exist (including the overflow bucket);
 * distinct series beyond that budget are aggregated into the overflow bucket and
 * counted as visible dropped-series evidence.
 */
export function boundedAttributeCounts(
  values: readonly string[],
  options: { maxKeys: number; overflowKey?: string } = { maxKeys: DEFAULT_OBSERVABILITY_LIMITS.maxCardinalityKeys },
): BoundedAttributeCounts {
  const overflowKey = options.overflowKey ?? "other";
  const maxKeys = Number.isFinite(options.maxKeys) && options.maxKeys > 0 ? Math.floor(options.maxKeys) : 1;
  const realKeyBudget = Math.max(0, maxKeys - 1);
  const counts: Record<string, number> = {};
  let overflowCount = 0;
  let droppedSeries = 0;
  for (const raw of values) {
    const value = typeof raw === "string" && raw.length > 0 ? raw : "unknown";
    if (Object.prototype.hasOwnProperty.call(counts, value)) {
      counts[value] = (counts[value] ?? 0) + 1;
      continue;
    }
    const realKeys = Object.keys(counts).filter((key) => key !== overflowKey).length;
    if (realKeys < realKeyBudget) {
      counts[value] = 1;
      continue;
    }
    counts[overflowKey] = (counts[overflowKey] ?? 0) + 1;
    overflowCount += 1;
    droppedSeries += 1;
  }
  return { counts, overflowCount, droppedSeries, boundedKeys: Object.keys(counts).length, overflowKey };
}
