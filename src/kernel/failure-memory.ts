import fs from "node:fs";
import {
  failurePaths,
  persistFailureMemory,
  persistFailureRecord,
  readFailureMemory,
  readFailureRecord,
} from "./failure-persist.js";
import type {
  FailureMemory,
  FailureMemoryEntry,
  FailureRecord,
  MemoryMatch,
  MemoryMatchKind,
  RankedCandidate,
} from "./failure-types.js";
import { FailureStateError, LOOP_THRESHOLD } from "./failure-types.js";
import type { IndexBundle } from "./intelligence-types.js";
import { currentOrRefreshIndex } from "./intelligence.js";
import type { UadsPaths } from "../lib/workspace.js";
import { listEvidenceRecords, listReviewRecords, readExecutionRun } from "./execution-persist.js";
import { isReviewGate } from "./gates.js";
import { INDEPENDENT_REVIEWER_ROLE } from "./types.js";
import { assertSafeRelativeProjectPath } from "./safe-path.js";
import { assertLiveMatchesExecutionDigest } from "./failure-binding.js";

const CODE_DEPS = new Set(["imports", "requires", "dynamic-import"]);

function nowIso(): string {
  return new Date().toISOString();
}

function emptyEntry(signature: string, at: string, record: FailureRecord): FailureMemoryEntry {
  return {
    failureSignature: signature,
    firstSeenAt: at,
    lastSeenAt: at,
    occurrences: 1,
    lastRepositoryHead: record.repositoryHead,
    lastChangeDigest: record.changeDigest,
    sameDigestStreak: 1,
    candidatePaths: [],
    candidateDigests: {},
    validityBasisPaths: [],
    validityBasisDigests: {},
    verifiedRootCausePaths: [],
    verifiedCorrectionPaths: [],
    disprovedPaths: [],
    resolutionSummary: null,
    resolutionEvidenceRefs: [],
    resolutionExecutionRunId: null,
    resolutionChangeDigest: null,
    resolutionIndexDigest: null,
    lastFailureRecordId: record.failureRecordId,
    lastOutcome: "open",
  };
}

function emptyMemory(projectId: string): FailureMemory {
  return {
    schema: "uads.failure-memory",
    schemaVersion: "0.5.0",
    projectId,
    updatedAt: nowIso(),
    entries: [],
  };
}

function loadMemory(paths: UadsPaths, projectId: string, schemaRoot?: string): FailureMemory {
  if (!fs.existsSync(failurePaths(paths).memory)) {
    return emptyMemory(projectId);
  }
  return readFailureMemory(paths, projectId, schemaRoot);
}

export function upsertFailureOccurrence(input: {
  paths: UadsPaths;
  projectId: string;
  record: FailureRecord;
  candidates?: RankedCandidate[];
  schemaRoot?: string;
}): FailureMemory {
  const memory = loadMemory(input.paths, input.projectId, input.schemaRoot);
  const existing = memory.entries.find((entry) => entry.failureSignature === input.record.signature);
  const at = input.record.createdAt;
  const candidatePaths = (input.candidates ?? []).map((item) => item.path);
  if (!existing) {
    const created = emptyEntry(input.record.signature, at, input.record);
    created.candidatePaths = candidatePaths;
    memory.entries.push(created);
  } else if (existing.lastFailureRecordId === input.record.failureRecordId) {
    existing.lastSeenAt = at;
    existing.lastRepositoryHead = input.record.repositoryHead;
    if (candidatePaths.length > 0) existing.candidatePaths = candidatePaths;
  } else {
    existing.lastSeenAt = at;
    existing.occurrences += 1;
    existing.lastRepositoryHead = input.record.repositoryHead;
    if (input.record.changeDigest && existing.lastChangeDigest === input.record.changeDigest) {
      existing.sameDigestStreak += 1;
    } else {
      existing.sameDigestStreak = 1;
    }
    existing.lastChangeDigest = input.record.changeDigest;
    existing.lastFailureRecordId = input.record.failureRecordId;
    if (candidatePaths.length > 0) existing.candidatePaths = candidatePaths;
    if (existing.sameDigestStreak >= LOOP_THRESHOLD) existing.lastOutcome = "loop";
  }
  memory.updatedAt = at;
  return persistFailureMemory(input.paths, memory, input.schemaRoot);
}

export function noteDiagnosisAttempt(input: {
  paths: UadsPaths;
  projectId: string;
  signature: string;
  changeDigest: string | null;
  candidates: RankedCandidate[];
  candidateDigests: Record<string, string>;
  memoryMatchKind?: MemoryMatchKind | null;
  schemaRoot?: string;
}): FailureMemoryEntry {
  const memory = loadMemory(input.paths, input.projectId, input.schemaRoot);
  const existing = memory.entries.find((entry) => entry.failureSignature === input.signature);
  if (!existing) {
    throw new FailureStateError("failure memory entry missing for diagnosis");
  }
  existing.candidatePaths = input.candidates.map((item) => item.path);
  existing.candidateDigests = input.candidateDigests;
  existing.lastSeenAt = nowIso();
  if (input.memoryMatchKind === "historical" && existing.lastOutcome === "resolved") {
    existing.lastOutcome = "historical";
  }
  if (existing.sameDigestStreak >= LOOP_THRESHOLD) existing.lastOutcome = "loop";
  memory.updatedAt = existing.lastSeenAt;
  persistFailureMemory(input.paths, memory, input.schemaRoot);
  return existing;
}

function pathDigest(bundle: IndexBundle, relative: string): string | null {
  return bundle.state.files.find((file) => file.path === relative)?.contentDigest ?? null;
}

export function buildValidityBasis(bundle: IndexBundle, seedPaths: string[]): {
  paths: string[];
  digests: Record<string, string>;
} {
  const paths = new Set<string>();
  for (const raw of seedPaths) {
    try {
      paths.add(assertSafeRelativeProjectPath(raw));
    } catch {
      // skip unsafe
    }
  }
  for (const seed of [...paths]) {
    for (const edge of bundle.graph.edges) {
      if (!CODE_DEPS.has(edge.type) && edge.type !== "interface-reference" && edge.type !== "test-of") continue;
      if (edge.source === seed) paths.add(edge.target);
      if (edge.target === seed) paths.add(edge.source);
    }
    for (const rel of bundle.tests.relations) {
      if (rel.source === seed) paths.add(rel.test);
      if (rel.test === seed) paths.add(rel.source);
    }
  }
  const ordered = [...paths].sort((a, b) => a.localeCompare(b));
  const digests: Record<string, string> = {};
  for (const filePath of ordered) {
    const digest = pathDigest(bundle, filePath);
    if (digest) digests[filePath] = digest;
  }
  return { paths: Object.keys(digests), digests };
}

export function evaluateMemoryMatch(input: {
  projectId: string;
  signature: string;
  memory: FailureMemory;
  bundle: IndexBundle;
}): MemoryMatch | null {
  if (input.memory.projectId !== input.projectId) return null;
  const entry = input.memory.entries.find((item) => item.failureSignature === input.signature);
  if (!entry) return null;
  const complete = input.bundle.state.complete && !input.bundle.state.truncated && !input.bundle.state.stale;
  const indexed = new Set(input.bundle.state.files.map((file) => file.path));
  const basisPaths =
    entry.lastOutcome === "resolved" && entry.validityBasisPaths.length > 0
      ? entry.validityBasisPaths
      : [];
  const basisDigests =
    entry.lastOutcome === "resolved" && Object.keys(entry.validityBasisDigests).length > 0
      ? entry.validityBasisDigests
      : null;

  if (entry.lastOutcome === "resolved" && basisDigests) {
    const stillPresent = basisPaths.length > 0 && basisPaths.every((item) => indexed.has(item));
    const digestsMatch =
      stillPresent &&
      basisPaths.every((item) => {
        const previous = basisDigests[item];
        const current = pathDigest(input.bundle, item);
        return Boolean(previous) && previous === current;
      });
    if (stillPresent && digestsMatch && complete) {
      return {
        failureSignature: entry.failureSignature,
        kind: "reusable",
        reason: "verified correction recurrence with compatible post-fix validity basis (advisory, not root-cause proof)",
      };
    }
    return {
      failureSignature: entry.failureSignature,
      kind: "historical",
      reason: !stillPresent
        ? "historical validity-basis path missing from current index"
        : !digestsMatch
          ? "candidate or dependency digest changed; memory is historical"
          : "index is not current; memory is historical",
    };
  }

  if (entry.occurrences <= 1 && Object.keys(entry.candidateDigests).length === 0) {
    return null;
  }
  return {
    failureSignature: entry.failureSignature,
    kind: "historical",
    reason: "prior observation without current verified validity",
  };
}

function assertCorrectiveExecution(input: {
  record: FailureRecord;
  executionRunId: string;
  paths: UadsPaths;
  schemaRoot?: string;
}): {
  changeDigest: string;
  evidenceRefs: string[];
  changedFiles: string[];
} {
  if (!input.record.executionRunId && !input.record.workOrderId) {
    throw new FailureStateError("standalone failure cannot claim verified resolution from an execution");
  }
  let run;
  try {
    run = readExecutionRun(input.paths, input.executionRunId, input.schemaRoot);
  } catch {
    throw new FailureStateError("corrective execution run missing or corrupt");
  }
  if (run.projectId !== input.record.projectId) {
    throw new FailureStateError("cross-project execution resolution rejected");
  }
  if (run.status !== "completed") {
    throw new FailureStateError("verified resolution requires a completed execution run");
  }
  if (!run.currentChangeDigest) {
    throw new FailureStateError("verified resolution requires a change digest");
  }
  if (input.record.executionRunId && input.record.executionRunId !== run.executionRunId) {
    throw new FailureStateError("corrective execution is not the failure's bound run");
  }
  if (input.record.workOrderId && input.record.workOrderId !== run.workOrderId) {
    throw new FailureStateError("corrective execution is not the failure's bound work order");
  }
  if (input.record.changeDigest && input.record.changeDigest === run.currentChangeDigest) {
    throw new FailureStateError("verified resolution requires a new change digest");
  }
  const evidence = listEvidenceRecords(input.paths, run.executionRunId, input.schemaRoot);
  const reviews = listReviewRecords(input.paths, run.executionRunId, input.schemaRoot);
  for (const gateId of run.selectedGates) {
    if (isReviewGate(gateId)) continue;
    const pass = evidence.some(
      (item) => item.gateId === gateId && item.changeDigest === run.currentChangeDigest && item.status === "PASS",
    );
    if (!pass) {
      throw new FailureStateError(`required gate ${gateId} is not PASS on the corrective digest`);
    }
  }
  const independent = reviews.find(
    (item) =>
      item.reviewerRole === INDEPENDENT_REVIEWER_ROLE &&
      item.changeDigest === run.currentChangeDigest &&
      item.verdict === "APPROVED",
  );
  if (!independent) {
    throw new FailureStateError("verified resolution requires independent assurance on the corrective digest");
  }
  const evidenceRefs = [
    `execution:${run.executionRunId}`,
    `digest:${run.currentChangeDigest}`,
    `review:${independent.reviewId}`,
    ...evidence
      .filter((item) => item.changeDigest === run.currentChangeDigest && item.status === "PASS")
      .map((item) => `evidence:${item.evidenceId}`),
  ];
  return { changeDigest: run.currentChangeDigest, evidenceRefs, changedFiles: run.changedFiles };
}

export function markVerifiedResolution(input: {
  paths: UadsPaths;
  projectId: string;
  failureRecordId: string;
  executionRunId: string;
  repoRoot: string;
  schemaRoot?: string;
}): FailureMemory {
  const record = readFailureRecord(input.paths, input.failureRecordId, input.schemaRoot);
  if (record.projectId !== input.projectId) {
    throw new FailureStateError("cross-project failure resolution rejected");
  }
  const corrective = assertCorrectiveExecution({
    record,
    executionRunId: input.executionRunId,
    paths: input.paths,
    schemaRoot: input.schemaRoot,
  });
  assertLiveMatchesExecutionDigest(input.repoRoot, corrective.changeDigest, "resolve");
  const bundle = currentOrRefreshIndex({
    repoRoot: input.repoRoot,
    projectId: input.projectId,
    paths: input.paths,
    schemaRoot: input.schemaRoot,
  });
  if (bundle.state.complete === false || bundle.state.truncated) {
    throw new FailureStateError("index is incomplete; cannot persist verified correction memory");
  }
  const correctionPaths = corrective.changedFiles.filter((item) => {
    try {
      return Boolean(assertSafeRelativeProjectPath(item));
    } catch {
      return false;
    }
  });
  const basis = buildValidityBasis(bundle, [...record.stackFrames.map((frame) => frame.path).filter((item): item is string => Boolean(item)), ...correctionPaths]);
  const memory = loadMemory(input.paths, input.projectId, input.schemaRoot);
  const entry = memory.entries.find((item) => item.failureSignature === record.signature);
  if (!entry) {
    throw new FailureStateError("failure memory entry missing for resolution");
  }
  entry.verifiedRootCausePaths = [];
  entry.verifiedCorrectionPaths = correctionPaths;
  entry.validityBasisPaths = basis.paths;
  entry.validityBasisDigests = basis.digests;
  entry.resolutionEvidenceRefs = corrective.evidenceRefs;
  entry.resolutionExecutionRunId = input.executionRunId;
  entry.resolutionChangeDigest = corrective.changeDigest;
  entry.resolutionIndexDigest = bundle.state.indexDigest;
  entry.resolutionSummary = "verified correction bound to completed execution; root cause remains unproven";
  entry.lastOutcome = "resolved";
  entry.lastChangeDigest = corrective.changeDigest;
  entry.lastSeenAt = nowIso();
  memory.updatedAt = entry.lastSeenAt;
  persistFailureMemory(input.paths, memory, input.schemaRoot);
  persistFailureRecord(input.paths, { ...record, status: "resolved" }, input.schemaRoot, { updateCursor: false });
  return memory;
}

export function compactFailureRows(memory: FailureMemory): Array<{
  signaturePrefix: string;
  occurrences: number;
  lastOutcome: string;
  lastSeenAt: string;
  reusable: boolean;
  rootCauseVerified: boolean;
}> {
  return memory.entries
    .slice()
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .map((entry) => ({
      signaturePrefix: entry.failureSignature.slice(0, 12),
      occurrences: entry.occurrences,
      lastOutcome: entry.lastOutcome,
      lastSeenAt: entry.lastSeenAt,
      reusable: entry.lastOutcome === "resolved" && Object.keys(entry.validityBasisDigests).length > 0,
      rootCauseVerified: entry.verifiedRootCausePaths.length > 0,
    }));
}
