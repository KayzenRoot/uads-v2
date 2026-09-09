import fs from "node:fs";
import path from "node:path";
import { readGitSummary } from "../lib/git.js";
import { findPackageRoot } from "../lib/version.js";
import type { UadsPaths } from "../lib/workspace.js";
import { listChangedRelativePaths } from "./change-digest.js";
import { buildContextPack } from "./context-pack.js";
import { analyzeImpact } from "./impact.js";
import { persistImpactReport } from "./intelligence-persist.js";
import { currentOrRefreshIndex } from "./intelligence.js";
import { IndexIncompleteError } from "./intelligence-types.js";
import type { IndexBundle } from "./intelligence-types.js";
import { newPrefixedId } from "./ids.js";
import { normalizeFailureText } from "./failure-normalize.js";
import { computeFailureAttemptDigest, assertLiveMatchesExecutionDigest } from "./failure-binding.js";
import {
  persistDiagnosisReport,
  persistDiagnosticPack,
  persistFailureRecord,
  findLatestDiagnosis,
  readFailureMemory,
  readFailureRecord,
} from "./failure-persist.js";
import { evaluateMemoryMatch, noteDiagnosisAttempt, upsertFailureOccurrence } from "./failure-memory.js";
import { incrementCostCounters, noteGovernorEvent } from "./cost-governor.js";
import { computeFailureSignature } from "./failure-signature.js";
import type {
  DiagnosisReport,
  DiagnosisStatus,
  FailureRecord,
  FailureSource,
  HypothesisConfidence,
  LoopState,
  RankedCandidate,
} from "./failure-types.js";
import { FailureStateError, LOOP_THRESHOLD } from "./failure-types.js";
import type { ContextRadius } from "./types.js";

export { assertSafeEvidenceInput } from "./failure-binding.js";

const WEIGHTS = {
  stack: 0.4,
  "failing-test": 0.3,
  "tested-by": 0.25,
  "related-changed": 0.2,
  "dep-neighbor": 0.12,
  interface: 0.1,
  "local-module": 0.08,
  "reusable-memory": 0.06,
  "shared-utility": 0.18,
} as const;

const CODE_DEPS = new Set(["imports", "requires", "dynamic-import"]);
const RADIUS_ORDER: ContextRadius[] = ["C0", "C1", "C2", "C3", "C4", "C5"];

function nowIso(): string {
  return new Date().toISOString();
}

function dirOf(filePath: string): string {
  return filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
}

function topFolder(filePath: string): string {
  return filePath.split("/")[0] ?? filePath;
}

function clampScore(value: number): number {
  return Math.min(1, Number(value.toFixed(4)));
}

function confidenceFor(score: number): HypothesisConfidence {
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

function bumpRadius(radius: ContextRadius): ContextRadius {
  const index = RADIUS_ORDER.indexOf(radius);
  const next = RADIUS_ORDER[Math.min(index + 1, 4)];
  return next ?? "C4";
}

function relatedToSeeds(changed: string, seeds: string[], bundle: IndexBundle): boolean {
  if (seeds.includes(changed)) return true;
  if (seeds.some((seed) => dirOf(seed) === dirOf(changed))) return true;
  for (const edge of bundle.graph.edges) {
    if (
      (edge.source === changed && seeds.includes(edge.target)) ||
      (edge.target === changed && seeds.includes(edge.source))
    ) {
      return true;
    }
  }
  for (const rel of bundle.tests.relations) {
    if ((rel.test === changed && seeds.includes(rel.source)) || (rel.source === changed && seeds.includes(rel.test))) {
      return true;
    }
  }
  return false;
}

export function rankFaultCandidates(input: {
  record: FailureRecord;
  bundle: IndexBundle;
  changedFiles: string[];
  reusablePaths?: string[];
}): RankedCandidate[] {
  const indexed = new Set(input.bundle.state.files.map((file) => file.path));
  const stackPaths = input.record.stackFrames.map((frame) => frame.path).filter((item): item is string => Boolean(item));
  const testFiles = input.record.failingTests.map((item) => item.file).filter((item): item is string => Boolean(item));
  const testedSources = input.bundle.tests.relations
    .filter((rel) => testFiles.includes(rel.test))
    .map((rel) => rel.source);
  const seeds = [...new Set([...stackPaths, ...testFiles, ...testedSources])];
  const scores = new Map<string, { score: number; signals: string[]; reasons: string[] }>();

  const add = (filePath: string, weight: number, signal: string, reason: string): void => {
    if (!filePath) return;
    if (!indexed.has(filePath) && !seeds.includes(filePath)) return;
    const current = scores.get(filePath) ?? { score: 0, signals: [], reasons: [] };
    if (!current.signals.includes(signal)) {
      current.score += weight;
      current.signals.push(signal);
      current.reasons.push(reason);
    }
    scores.set(filePath, current);
  };

  for (const filePath of stackPaths) add(filePath, WEIGHTS.stack, "stack", "stack frame in repository");
  for (const filePath of testFiles) add(filePath, WEIGHTS["failing-test"], "failing-test", "failing test file");
  for (const filePath of testedSources) {
    add(filePath, WEIGHTS["tested-by"], "tested-by", "Test Map source of a failing test");
  }
  for (const changed of input.changedFiles) {
    if (!relatedToSeeds(changed, seeds, input.bundle)) continue;
    add(changed, WEIGHTS["related-changed"], "related-changed", "recent change related to failure evidence");
  }

  const seedSources = seeds.filter((item) => !item.includes(".test.") && !item.includes(".spec.") && !item.includes("/tests/"));
  const incoming = new Map<string, Set<string>>();
  for (const edge of input.bundle.graph.edges) {
    if (!CODE_DEPS.has(edge.type)) continue;
    if (seeds.includes(edge.source) && edge.target !== edge.source) {
      add(edge.target, WEIGHTS["dep-neighbor"], "dep-neighbor", "dependency of a failure seed");
      const owners = incoming.get(edge.target) ?? new Set<string>();
      if (seedSources.includes(edge.source)) owners.add(edge.source);
      incoming.set(edge.target, owners);
    }
    if (seeds.includes(edge.target) && edge.source !== edge.target) {
      add(edge.source, WEIGHTS["dep-neighbor"], "dep-neighbor", "dependent of a failure seed");
    }
  }
  for (const [util, owners] of incoming) {
    if (owners.size >= 2) {
      add(util, WEIGHTS["shared-utility"], "shared-utility", "shared utility imported by multiple failing modules");
    }
  }
  for (const edge of input.bundle.graph.edges) {
    if (edge.type !== "interface-reference") continue;
    if (seeds.includes(edge.source)) add(edge.target, WEIGHTS.interface, "interface", "Interface Map neighbor");
    if (seeds.includes(edge.target)) add(edge.source, WEIGHTS.interface, "interface", "Interface Map neighbor");
  }
  for (const seed of seeds) {
    for (const node of input.bundle.graph.nodes) {
      if (node.path === seed) continue;
      if (dirOf(node.path) === dirOf(seed) && (node.kind === "source" || node.kind === "test" || node.kind === "schema")) {
        add(node.path, WEIGHTS["local-module"], "local-module", "owning/local module neighbor");
      }
    }
  }
  for (const filePath of input.reusablePaths ?? []) {
    add(filePath, WEIGHTS["reusable-memory"], "reusable-memory", "reusable Failure Memory match (advisory)");
  }

  return [...scores.entries()]
    .map(([filePath, value]) => ({
      path: filePath,
      score: clampScore(value.score),
      confidence: confidenceFor(clampScore(value.score)),
      signals: value.signals,
      reason: value.reasons.join("; "),
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function diagnosisStatus(candidates: RankedCandidate[]): DiagnosisStatus {
  if (candidates.length === 0) return "needs-evidence";
  const top = candidates[0];
  const second = candidates[1];
  if (!top || top.score < 0.25) return "needs-evidence";
  if (second && second.score >= 0.25 && Math.abs(top.score - second.score) <= 0.02) return "ambiguous";
  return "localized";
}

function radiusFromSignals(candidates: RankedCandidate[]): ContextRadius {
  const focused = candidates.filter((item) => item.score >= 0.25).slice(0, 5);
  const signals = new Set(focused.flatMap((item) => item.signals));
  if (signals.has("shared-utility") || signals.has("dep-neighbor")) return "C3";
  if (signals.has("tested-by") || signals.has("local-module") || signals.has("interface")) return "C2";
  if (signals.has("stack") || signals.has("failing-test") || signals.has("related-changed")) return "C1";
  return "C1";
}

function nextEvidenceFor(status: DiagnosisStatus, candidates: RankedCandidate[]): string[] {
  if (status === "needs-evidence") {
    return ["record a stack frame, failing test, or command output bound to the current change digest"];
  }
  if (status === "ambiguous") {
    return ["collect a more specific stack or failing-test pointer to distinguish equivalent candidates"];
  }
  if (candidates[0] && candidates[0].confidence !== "high") {
    return ["inspect the top candidate and its focused test before expanding radius"];
  }
  return [];
}

export function recordFailure(input: {
  cwd?: string;
  uadsHome?: string;
  repoRoot: string;
  projectId: string;
  paths: UadsPaths;
  source: FailureSource;
  command?: string | null;
  exitCode?: number | null;
  text: string;
  workOrderId?: string | null;
  executionRunId?: string | null;
  changeDigest?: string | null;
  schemaRoot?: string;
}): FailureRecord {
  const schemaRoot = input.schemaRoot ?? findPackageRoot();
  let indexed = new Set<string>();
  let indexDigest: string | null = null;
  let gitHead: string | null = readGitSummary(input.repoRoot).head;
  let dirtyDigest: string | null = null;
  try {
    const bundle = currentOrRefreshIndex({
      repoRoot: input.repoRoot,
      projectId: input.projectId,
      paths: input.paths,
      schemaRoot,
    });
    indexed = new Set(bundle.state.files.map((file) => file.path));
    indexDigest = bundle.state.indexDigest;
    gitHead = bundle.state.gitHead;
    dirtyDigest = bundle.state.dirtyDigest;
  } catch {
    // Recording still proceeds from filesystem evidence; diagnose fails closed on incomplete index.
  }
  const normalized = normalizeFailureText({ repoRoot: input.repoRoot, text: input.text, source: input.source, indexed });
  const signature = computeFailureSignature({
    source: input.source,
    command: input.command ?? null,
    failureClass: normalized.failureClass,
    stackFrames: normalized.stackFrames,
    failingTests: normalized.failingTests,
    messageSummary: normalized.messageSummary,
  });
  if (input.executionRunId && input.changeDigest) {
    assertLiveMatchesExecutionDigest(input.repoRoot, input.changeDigest, "record");
  }
  const changeDigest = input.executionRunId
    ? input.changeDigest ?? computeFailureAttemptDigest({ repoRoot: input.repoRoot, gitHead, indexDigest })
    : computeFailureAttemptDigest({ repoRoot: input.repoRoot, gitHead, indexDigest });
  const createdAt = nowIso();
  const record = persistFailureRecord(
    input.paths,
    {
      schema: "uads.failure-record",
      schemaVersion: "0.5.0",
      failureRecordId: newPrefixedId("fail", `${input.projectId}:${signature}:${createdAt}`),
      projectId: input.projectId,
      workOrderId: input.workOrderId ?? null,
      executionRunId: input.executionRunId ?? null,
      createdAt,
      source: input.source,
      command: input.command ?? null,
      exitCode: input.exitCode ?? null,
      status: "recorded",
      failureClass: normalized.failureClass,
      messageSummary: normalized.messageSummary,
      stackFrames: normalized.stackFrames,
      failingTests: normalized.failingTests,
      relatedEvidenceRefs: [],
      changeDigest,
      repositoryIndexDigest: indexDigest,
      repositoryHead: gitHead,
      dirtyDigest,
      signature,
      sanitization: normalized.sanitization,
    },
    schemaRoot,
  );
  upsertFailureOccurrence({ paths: input.paths, projectId: input.projectId, record, schemaRoot });
  return record;
}

export function diagnoseFailure(input: {
  repoRoot: string;
  projectId: string;
  paths: UadsPaths;
  failureRecordId: string;
  schemaRoot?: string;
}): DiagnosisReport {
  const schemaRoot = input.schemaRoot ?? findPackageRoot();
  const record = readFailureRecord(input.paths, input.failureRecordId, schemaRoot);
  if (record.projectId !== input.projectId) {
    throw new FailureStateError("cross-project failure diagnosis rejected");
  }
  let bundle: IndexBundle;
  try {
    bundle = currentOrRefreshIndex({
      repoRoot: input.repoRoot,
      projectId: input.projectId,
      paths: input.paths,
      schemaRoot,
    });
  } catch (error) {
    if (error instanceof IndexIncompleteError) throw error;
    throw new FailureStateError("index missing or corrupt; diagnosis blocked");
  }
  if (bundle.state.complete === false || bundle.state.truncated) {
    throw new IndexIncompleteError(
      bundle.state.truncationReason ?? bundle.state.staleReason ?? "index is incomplete and cannot drive diagnosis",
    );
  }

  const latestDiagnosis = findLatestDiagnosis(input.paths, record.failureRecordId, schemaRoot);
  if (
    latestDiagnosis &&
    latestDiagnosis.indexDigest === bundle.state.indexDigest &&
    latestDiagnosis.changeDigest === record.changeDigest
  ) {
    noteGovernorEvent({
      paths: input.paths,
      projectId: input.projectId,
      workOrderId: record.workOrderId,
      executionRunId: record.executionRunId,
      outcome: "reuse",
      reasonCodes: ["DIAGNOSIS_REUSED", "IDENTICAL_FAILURE_INDEX_IDENTITY"],
      subject: "failure-diagnosis",
      patch: { avoidedToolExecutions: 1 },
      schemaRoot,
    });
    return latestDiagnosis;
  }

  const memory = readFailureMemory(input.paths, input.projectId, schemaRoot);
  const priorMatch = evaluateMemoryMatch({
    projectId: input.projectId,
    signature: record.signature,
    memory,
    bundle,
  });
  const reusablePaths =
    priorMatch?.kind === "reusable"
      ? memory.entries.find((entry) => entry.failureSignature === record.signature)?.verifiedCorrectionPaths ?? []
      : [];
  const changedFiles = listChangedRelativePaths(input.repoRoot);
  const ranked = rankFaultCandidates({
    record,
    bundle,
    changedFiles,
    reusablePaths,
  });
  const status = diagnosisStatus(ranked);
  const initialRadius = radiusFromSignals(ranked);
  const memoryEntry = noteDiagnosisAttempt({
    paths: input.paths,
    projectId: input.projectId,
    signature: record.signature,
    changeDigest: record.changeDigest,
    memoryMatchKind: priorMatch?.kind ?? null,
    candidates: ranked,
    candidateDigests: Object.fromEntries(
      ranked
        .slice(0, 8)
        .map((item) => [item.path, bundle.state.files.find((file) => file.path === item.path)?.contentDigest ?? ""]),
    ),
    schemaRoot,
  });
  const loopDetected = memoryEntry.sameDigestStreak >= LOOP_THRESHOLD;
  const recommendedRadius = loopDetected ? bumpRadius(initialRadius) : initialRadius;
  const loopState: LoopState = {
    detected: loopDetected,
    occurrences: memoryEntry.occurrences,
    sameChangeDigest: Boolean(record.changeDigest) && memoryEntry.lastChangeDigest === record.changeDigest,
    recommendedAction: loopDetected
      ? recommendedRadius === initialRadius
        ? "LOOP_DETECTED: change strategy; C5 remains exceptional and is not auto-expanded"
        : "LOOP_DETECTED: change strategy or expand one diagnostic radius step; do not repeat the same edit"
      : "continue with the ranked candidates; diagnosis is not verified root cause",
  };

  const seeds = [
    ...record.stackFrames.map((frame) => frame.path).filter((item): item is string => Boolean(item)),
    ...record.failingTests.map((item) => item.file).filter((item): item is string => Boolean(item)),
    ...ranked.filter((item) => item.score >= 0.25).slice(0, 5).map((item) => item.path),
  ];
  let contextPackRef: string | null = null;
  let escalationReason: string | null = null;
  if (seeds.length > 0 && status !== "needs-evidence") {
    const report = analyzeImpact({
      bundle,
      projectId: input.projectId,
      workOrderId: record.workOrderId,
      executionRunId: record.executionRunId,
      radius: recommendedRadius,
      requestedPaths: seeds,
      affectedAreas: [],
    });
    persistImpactReport(input.paths, report, schemaRoot);
    const pack = buildContextPack({
      bundle,
      report,
      projectId: input.projectId,
      workOrderId: record.workOrderId,
      executionRunId: record.executionRunId,
      radius: recommendedRadius,
      objective: "diagnostic localization pack (not a permission to edit unrelated areas)",
      expansionHistory:
        recommendedRadius !== initialRadius
          ? [
              {
                from: initialRadius,
                to: recommendedRadius,
                reason: "loop: one-step diagnostic expansion after repeated signature+digest",
                at: nowIso(),
              },
            ]
          : [],
    });
    persistDiagnosticPack(input.paths, pack, schemaRoot);
    contextPackRef = pack.contextPackId;
    incrementCostCounters(
      input.paths,
      input.projectId,
      { estimatedDiagnosticTokens: pack.estimatedTokens },
      {
        workOrderId: record.workOrderId,
        executionRunId: record.executionRunId,
      },
      schemaRoot,
    );
    const extraFolders = new Set(pack.items.map((item) => topFolder(item.path)));
    const seedFolders = new Set(seeds.map(topFolder));
    if ([...extraFolders].some((folder) => !seedFolders.has(folder)) && recommendedRadius === "C4") {
      escalationReason = "architectural neighbors entered the diagnostic pack at C4; C5 is not selected";
    }
  } else {
    escalationReason = "insufficient localizing evidence; do not expand to repository-wide reread";
  }

  const createdAt = nowIso();
  const diagnosis = persistDiagnosisReport(
    input.paths,
    {
      schema: "uads.diagnosis-report",
      schemaVersion: "0.5.0",
      diagnosisId: newPrefixedId("diag", `${record.failureRecordId}:${createdAt}`),
      failureRecordId: record.failureRecordId,
      projectId: input.projectId,
      workOrderId: record.workOrderId,
      executionRunId: record.executionRunId,
      createdAt,
      failureSignature: record.signature,
      indexDigest: bundle.state.indexDigest,
      changeDigest: record.changeDigest,
      initialRadius,
      recommendedRadius,
      status,
      rankedCandidates: ranked.slice(0, 12),
      evidenceUsed: [
        ...record.stackFrames.filter((frame) => frame.inRepo).map((frame) => `stack:${frame.path}`),
        ...record.failingTests.map((item) => `test:${item.id}`),
        ...changedFiles.filter((item) => relatedToSeeds(item, seeds, bundle)).map((item) => `changed:${item}`),
      ],
      unresolved: ranked.length === 0 ? ["no in-repo localizing evidence"] : [],
      nextEvidence: nextEvidenceFor(status, ranked),
      escalationReason,
      contextPackRef,
      memoryMatches: priorMatch ? [priorMatch] : [],
      loopState,
    },
    schemaRoot,
  );
  persistFailureRecord(
    input.paths,
    { ...record, status: loopDetected ? "loop" : "diagnosed" },
    schemaRoot,
    { updateCursor: false },
  );
  return diagnosis;
}
