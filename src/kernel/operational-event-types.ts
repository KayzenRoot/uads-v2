export const OPERATIONAL_EVENT_SCHEMA = "uads.operational-event" as const;
export const OPERATIONAL_EVENT_SCHEMA_VERSION = "1.0.0" as const;

export type OperationalEventType =
  | "operation.activity"
  | "system.health"
  | "system.error"
  | "system.diagnostic"
  | "execution.lifecycle"
  | "review.lifecycle"
  | "review.analysis"
  | "evidence.lifecycle";

export type OperationalSeverity = "debug" | "info" | "warn" | "error" | "critical";
export type OperationalState = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
export type OperationalPayloadPrimitive = string | number | boolean | null;
export interface OperationalPayloadValueArray extends Array<OperationalPayloadPrimitive | OperationalPayload | OperationalPayloadValueArray> {}
export interface OperationalPayload {
  [key: string]: OperationalPayloadPrimitive | OperationalPayload | OperationalPayloadValueArray;
}
export type OperationalPayloadValue = OperationalPayloadPrimitive | OperationalPayload | OperationalPayloadValueArray;

export type OperationalEvent = {
  schema: typeof OPERATIONAL_EVENT_SCHEMA;
  schemaVersion: typeof OPERATIONAL_EVENT_SCHEMA_VERSION;
  eventId: string;
  eventHash: string;
  projectId: string;
  correlationId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  reviewId: string | null;
  eventType: OperationalEventType;
  sourceComponent: string;
  severity: OperationalSeverity;
  operationalState: OperationalState | null;
  occurredAt: string;
  recordedAt: string;
  message?: string;
  gate?: string;
  normalizedSubjectPath?: string;
  normalizedFindingCode?: string;
  evidenceDigest?: string;
  payload?: OperationalPayload;
};

export type OperationalEventInput = Omit<
  OperationalEvent,
  "schema" | "schemaVersion" | "eventId" | "eventHash" | "recordedAt"
> & {
  eventId?: string;
  recordedAt?: string;
};

export type OperationalHealth = {
  status: OperationalState;
  validEventCount: number;
  /**
   * Legacy aggregate: rejected/corrupt record count plus a +1 sentinel when the
   * bounded scan window saturated. Kept for backward compatibility; semantic
   * decisions must use rejectedEventCount and scanSaturated instead.
   */
  invalidEventCount: number;
  /** Actual rejected/corrupt/unsupported records observed in the bounded scan. */
  rejectedEventCount: number;
  /** True when the bounded scan window was fully consumed; older records may exist unread. */
  scanSaturated: boolean;
  lastEventAt: string | null;
  reasonCodes: string[];
  updatedAt: string;
};

export type OperationalEventRead = {
  events: OperationalEvent[];
  health: OperationalHealth;
};

export type B001AnalysisMetrics = {
  signature: "normalized-structured-analysis-signature-v1";
  numerator: number;
  denominator: number;
  rate: number | null;
  rawEventHashes: string[];
};
