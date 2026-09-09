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
  payload?: Record<string, string | number | boolean | null>;
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
  invalidEventCount: number;
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
