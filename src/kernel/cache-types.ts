export const CACHE_SCHEMA_VERSION = "0.6.0";

export type CacheDecisionKind = "HIT" | "MISS" | "STALE" | "NOT_REUSABLE" | "BLOCKED";
export type CacheRecordStatus = "reusable" | "stale" | "historical" | "not-reusable";
export type ReuseClass = "eligible" | "not-reusable";

export type EvidenceCacheRecord = {
  schema: "uads.evidence-cache-record";
  schemaVersion: "0.6.0";
  cacheRecordId: string;
  projectId: string;
  originatingWorkOrderId: string;
  originatingExecutionRunId: string;
  gateId: string;
  evidenceId: string;
  evidenceStatus: "PASS";
  evidenceKind: "command" | "file" | "invariant";
  originatingChangeDigest: string;
  command: string | null;
  gateReuseContractIdentity: string;
  reuseProofDigest: string;
  toolIdentity: Record<string, string>;
  environmentIdentity: string | null;
  validityBasisPaths: string[];
  validityBasisDigests: Record<string, string>;
  manifestDigests: Record<string, string>;
  indexDigest: string;
  policyIdentity: string;
  outputDigest: string | null;
  fileDigest: string | null;
  createdAt: string;
  reuseClass: ReuseClass;
  reusable: boolean;
  status: CacheRecordStatus;
  invalidationReason: string | null;
};

export type CacheDecision = {
  schema: "uads.cache-decision";
  schemaVersion: "0.6.0";
  cacheDecisionId: string;
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  gateId: string;
  candidateCacheRecordId: string | null;
  decision: CacheDecisionKind;
  reasonCodes: string[];
  changedValidityInputs: string[];
  executionRequired: boolean;
  maySatisfyGate: boolean;
  liveChangeDigest: string | null;
  indexDigest: string | null;
  gateReuseContractIdentity?: string | null;
  reuseProofDigest?: string | null;
  createdAt: string;
};

export type EvidenceCacheIndex = {
  schema: "uads.evidence-cache-index";
  schemaVersion: "0.6.0";
  projectId: string;
  updatedAt: string;
  records: Array<{
    cacheRecordId: string;
    gateId: string;
    reusable: boolean;
    status: CacheRecordStatus;
  }>;
};
