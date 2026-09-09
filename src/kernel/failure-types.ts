export const FAILURE_SCHEMA_VERSION = "0.5.0";
export const LOOP_THRESHOLD = 3;

export type FailureSource = "test" | "lint" | "typecheck" | "build" | "runtime" | "gate" | "manual-evidence";
export type FailureClass = "assertion" | "exception" | "compile" | "type" | "lint" | "command" | "timeout" | "unknown";
export type FailureRecordStatus = "recorded" | "diagnosed" | "loop" | "resolved";
export type DiagnosisStatus = "localized" | "ambiguous" | "needs-evidence" | "blocked";
export type HypothesisConfidence = "high" | "medium" | "low";
export type MemoryOutcome = "open" | "loop" | "historical" | "resolved" | "disproved-candidate";
export type MemoryMatchKind = "reusable" | "historical";

export type StackFrame = {
  path: string | null;
  line: number | null;
  column: number | null;
  functionName: string | null;
  inRepo: boolean;
};

export type FailingTest = {
  id: string;
  file: string | null;
  title: string | null;
};

export type FailureSanitization = {
  redacted: boolean;
  kinds: string[];
};

export type FailureRecord = {
  schema: "uads.failure-record";
  schemaVersion: "0.5.0";
  failureRecordId: string;
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  createdAt: string;
  source: FailureSource;
  command: string | null;
  exitCode: number | null;
  status: FailureRecordStatus;
  failureClass: FailureClass;
  messageSummary: string;
  stackFrames: StackFrame[];
  failingTests: FailingTest[];
  relatedEvidenceRefs: string[];
  changeDigest: string | null;
  repositoryIndexDigest: string | null;
  repositoryHead: string | null;
  dirtyDigest: string | null;
  signature: string;
  sanitization: FailureSanitization;
};

export type RankedCandidate = {
  path: string;
  score: number;
  confidence: HypothesisConfidence;
  signals: string[];
  reason: string;
};

export type MemoryMatch = {
  failureSignature: string;
  kind: MemoryMatchKind;
  reason: string;
};

export type LoopState = {
  detected: boolean;
  occurrences: number;
  sameChangeDigest: boolean;
  recommendedAction: string;
};

export type DiagnosisReport = {
  schema: "uads.diagnosis-report";
  schemaVersion: "0.5.0";
  diagnosisId: string;
  failureRecordId: string;
  projectId: string;
  workOrderId: string | null;
  executionRunId: string | null;
  createdAt: string;
  failureSignature: string;
  indexDigest: string;
  changeDigest: string | null;
  initialRadius: "C0" | "C1" | "C2" | "C3" | "C4" | "C5";
  recommendedRadius: "C0" | "C1" | "C2" | "C3" | "C4" | "C5";
  status: DiagnosisStatus;
  rankedCandidates: RankedCandidate[];
  evidenceUsed: string[];
  unresolved: string[];
  nextEvidence: string[];
  escalationReason: string | null;
  contextPackRef: string | null;
  memoryMatches: MemoryMatch[];
  loopState: LoopState;
};

export type FailureMemoryEntry = {
  failureSignature: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  lastRepositoryHead: string | null;
  lastChangeDigest: string | null;
  sameDigestStreak: number;
  candidatePaths: string[];
  candidateDigests: Record<string, string>;
  validityBasisPaths: string[];
  validityBasisDigests: Record<string, string>;
  verifiedRootCausePaths: string[];
  verifiedCorrectionPaths: string[];
  disprovedPaths: string[];
  resolutionSummary: string | null;
  resolutionEvidenceRefs: string[];
  resolutionExecutionRunId: string | null;
  resolutionChangeDigest: string | null;
  resolutionIndexDigest: string | null;
  lastFailureRecordId: string | null;
  lastOutcome: MemoryOutcome;
};

export type FailureMemory = {
  schema: "uads.failure-memory";
  schemaVersion: "0.5.0";
  projectId: string;
  updatedAt: string;
  entries: FailureMemoryEntry[];
};

export type FailureCursor = {
  failureRecordId: string | null;
  diagnosisId: string | null;
  updatedAt: string;
};

export class FailureStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FailureStateError";
  }
}
