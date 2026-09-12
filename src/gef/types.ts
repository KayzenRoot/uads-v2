export const GEF_SCHEMA_VERSION = "0.1.0" as const;
export const GEF_VERSION = "0.1.0" as const;

export type GefAdoptionMode = "SHADOW" | "ACTIVE";
export type GefProjectClass = "NEW_PROJECT" | "EXISTING_PROJECT" | "PARTIALLY_GOVERNED";
export type GefStatus = "NOT_ADOPTED" | "ADOPTED" | "CORRUPT" | "SOURCE_CONFLICT";

export type GefProjectProfile = {
  schema: "uads.gef-project-profile";
  schemaVersion: typeof GEF_SCHEMA_VERSION;
  projectId: string;
  fingerprint: string;
  repositoryIdentity: string;
  repositoryGeneration: string;
  defaultBranch: string;
  packageManager: string | null;
  buildSystem: string | null;
  commands: {
    build: string | null;
    test: string | null;
    typecheck: string | null;
    lint: string | null;
  };
  governancePaths: string[];
  evidencePaths: string[];
  hostedGateNames: string[];
  supportedExecutorAdapters: string[];
  currentGefVersion: typeof GEF_VERSION;
  adoptionMode: GefAdoptionMode;
  projectClass: GefProjectClass;
  createdAt: string;
  updatedAt: string;
};

export type GefCurrent = {
  schema: "uads.gef-current";
  schemaVersion: typeof GEF_SCHEMA_VERSION;
  projectId: string;
  fingerprint: string;
  adoptionMode: GefAdoptionMode;
  status: GefStatus;
  branch: string | null;
  headSha: string | null;
  profileDigest: string;
  updatedAt: string;
};

export type GefRegistryEntry = {
  projectId: string;
  fingerprint: string;
  repositoryIdentity: string;
  defaultBranch: string;
  adoptionMode: GefAdoptionMode;
  projectClass: GefProjectClass;
  profileDigest: string;
  updatedAt: string;
};

export type GefRegistry = {
  schema: "uads.gef-registry";
  schemaVersion: typeof GEF_SCHEMA_VERSION;
  entries: GefRegistryEntry[];
  updatedAt: string;
};

export type GefSourceSnapshot = {
  schema: "uads.gef-source-snapshot";
  schemaVersion: typeof GEF_SCHEMA_VERSION;
  projectId: string;
  fingerprint: string;
  branch: string | null;
  headSha: string | null;
  policyDigest: string;
  capturedAt: string;
};

export type GefSourceCheck = {
  status: "MATCH" | "SOURCE_CONFLICT";
  reasons: string[];
  snapshot: GefSourceSnapshot;
};

export type GefCommandReceipt = {
  schema: "uads.gef-command-receipt";
  schemaVersion: typeof GEF_SCHEMA_VERSION;
  receiptId: string;
  projectId: string;
  fingerprint: string;
  command: string;
  validityDigest: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "NOT_RUN";
  exitCode: number | null;
  durationMs: number | null;
  outputSummary: string;
  createdAt: string;
};

export type GefTelemetryEvent = {
  schema: "uads.gef-telemetry-event";
  schemaVersion: typeof GEF_SCHEMA_VERSION;
  eventId: string;
  projectId: string | null;
  fingerprint: string | null;
  workOrder: string | null;
  taskClass: "T0" | "T1" | "T2" | "T3" | null;
  event: "adoption" | "source-check" | "receipt" | "status";
  executorRequested: string | null;
  executorApplied: string | null;
  filesOpened: number | null;
  filesChanged: number | null;
  activeExecutorSeconds: number | null;
  focusedTestSeconds: number | null;
  cacheHits: number;
  cacheMisses: number;
  sourceConflictCount: number;
  budgetExpansionCount: number;
  finalVerdict: string | null;
  createdAt: string;
};
