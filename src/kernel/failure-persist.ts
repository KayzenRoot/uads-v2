import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import type { ProjectProfile } from "../lib/workspace.js";
import type { ContextPack } from "./intelligence-types.js";
import type { DiagnosisReport, FailureCursor, FailureMemory, FailureRecord } from "./failure-types.js";
import { FailureStateError } from "./failure-types.js";

export type FailureStatusFields = {
  activeFailureId: string | null;
  failureSignaturePrefix: string | null;
  diagnosisStatus: DiagnosisReport["status"] | null;
  loopDetected: boolean;
  recommendedDiagnosticRadius: DiagnosisReport["recommendedRadius"] | null;
};

export function failurePaths(paths: UadsPaths): {
  root: string;
  records: string;
  diagnoses: string;
  memory: string;
  current: string;
  diagnosticPacks: string;
} {
  return {
    root: path.join(paths.workspace, "failures"),
    records: path.join(paths.workspace, "failures", "records"),
    diagnoses: path.join(paths.workspace, "failures", "diagnoses"),
    memory: path.join(paths.workspace, "failures", "memory.json"),
    current: path.join(paths.workspace, "failures", "current.json"),
    diagnosticPacks: path.join(paths.context, "diagnostic-packs"),
  };
}

export function ensureFailureLayout(paths: UadsPaths): ReturnType<typeof failurePaths> {
  const locs = failurePaths(paths);
  fs.mkdirSync(locs.records, { recursive: true });
  fs.mkdirSync(locs.diagnoses, { recursive: true });
  fs.mkdirSync(locs.diagnosticPacks, { recursive: true });
  return locs;
}

export function persistFailureRecord(
  paths: UadsPaths,
  record: FailureRecord,
  schemaRoot?: string,
  options: { updateCursor?: boolean } = {},
): FailureRecord {
  const sanitized = sanitizeOperationalValue(record);
  assertSchema("failure-record.schema.json", sanitized, schemaRoot);
  const locs = ensureFailureLayout(paths);
  atomicWriteJson(sidecarJsonPath(locs.records, sanitized.failureRecordId), sanitized);
  if (options.updateCursor !== false) {
    atomicWriteJson(locs.current, {
      failureRecordId: sanitized.failureRecordId,
      diagnosisId: null,
      updatedAt: sanitized.createdAt,
    } satisfies FailureCursor);
  }
  return sanitized;
}

export function persistDiagnosisReport(paths: UadsPaths, report: DiagnosisReport, schemaRoot?: string): DiagnosisReport {
  const sanitized = sanitizeOperationalValue(report);
  assertSchema("diagnosis-report.schema.json", sanitized, schemaRoot);
  const locs = ensureFailureLayout(paths);
  atomicWriteJson(sidecarJsonPath(locs.diagnoses, sanitized.diagnosisId), sanitized);
  atomicWriteJson(locs.current, {
    failureRecordId: sanitized.failureRecordId,
    diagnosisId: sanitized.diagnosisId,
    updatedAt: sanitized.createdAt,
  } satisfies FailureCursor);
  return sanitized;
}

export function persistFailureMemory(paths: UadsPaths, memory: FailureMemory, schemaRoot?: string): FailureMemory {
  const sanitized = sanitizeOperationalValue(memory);
  assertSchema("failure-memory.schema.json", sanitized, schemaRoot);
  const locs = ensureFailureLayout(paths);
  atomicWriteJson(locs.memory, sanitized);
  return sanitized;
}

export function persistDiagnosticPack(paths: UadsPaths, pack: ContextPack, schemaRoot?: string): ContextPack {
  const sanitized = sanitizeOperationalValue(pack);
  assertSchema("context-pack.schema.json", sanitized, schemaRoot);
  const locs = ensureFailureLayout(paths);
  atomicWriteJson(sidecarJsonPath(locs.diagnosticPacks, sanitized.contextPackId), sanitized);
  return sanitized;
}

export function readFailureRecord(paths: UadsPaths, failureRecordId: string, schemaRoot?: string): FailureRecord {
  const parsed = readJsonIfValid<FailureRecord>(sidecarJsonPath(failurePaths(paths).records, failureRecordId));
  if (!parsed.ok) {
    throw new FailureStateError("failure record missing or corrupt");
  }
  try {
    assertSchema("failure-record.schema.json", parsed.value, schemaRoot);
  } catch {
    throw new FailureStateError("failure record failed schema validation");
  }
  return parsed.value;
}

export function readDiagnosisReport(paths: UadsPaths, diagnosisId: string, schemaRoot?: string): DiagnosisReport {
  const parsed = readJsonIfValid<DiagnosisReport>(sidecarJsonPath(failurePaths(paths).diagnoses, diagnosisId));
  if (!parsed.ok) {
    throw new FailureStateError("diagnosis report missing or corrupt");
  }
  try {
    assertSchema("diagnosis-report.schema.json", parsed.value, schemaRoot);
  } catch {
    throw new FailureStateError("diagnosis report failed schema validation");
  }
  return parsed.value;
}

export function readFailureMemory(paths: UadsPaths, projectId: string, schemaRoot?: string): FailureMemory {
  const locs = failurePaths(paths);
  if (!fs.existsSync(locs.memory)) {
    return {
      schema: "uads.failure-memory",
      schemaVersion: "0.5.0",
      projectId,
      updatedAt: new Date(0).toISOString(),
      entries: [],
    };
  }
  const parsed = readJsonIfValid<FailureMemory>(locs.memory);
  if (!parsed.ok) {
    throw new FailureStateError("failure memory missing or corrupt");
  }
  try {
    assertSchema("failure-memory.schema.json", parsed.value, schemaRoot);
  } catch {
    throw new FailureStateError("failure memory failed schema validation");
  }
  if (parsed.value.projectId !== projectId) {
    throw new FailureStateError("cross-project failure memory rejected");
  }
  return parsed.value;
}

export function readFailureCursor(paths: UadsPaths): FailureCursor | null {
  const locs = failurePaths(paths);
  if (!fs.existsSync(locs.current)) return null;
  const parsed = readJsonIfValid<FailureCursor>(locs.current);
  if (!parsed.ok) {
    throw new FailureStateError("failure cursor missing or corrupt");
  }
  return parsed.value;
}

export function listFailureRecords(paths: UadsPaths, schemaRoot?: string): FailureRecord[] {
  const dir = failurePaths(paths).records;
  if (!fs.existsSync(dir)) return [];
  const out: FailureRecord[] = [];
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort()) {
    out.push(readFailureRecord(paths, name.replace(/\.json$/, ""), schemaRoot));
  }
  return out;
}

export function findLatestDiagnosis(paths: UadsPaths, failureRecordId: string, schemaRoot?: string): DiagnosisReport | null {
  const dir = failurePaths(paths).diagnoses;
  if (!fs.existsSync(dir)) return null;
  const matches: DiagnosisReport[] = [];
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    const report = readDiagnosisReport(paths, name.replace(/\.json$/, ""), schemaRoot);
    if (report.failureRecordId === failureRecordId) matches.push(report);
  }
  matches.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return matches.at(-1) ?? null;
}

export function readFailureStatusFields(paths: UadsPaths, schemaRoot?: string): FailureStatusFields {
  const empty: FailureStatusFields = {
    activeFailureId: null,
    failureSignaturePrefix: null,
    diagnosisStatus: null,
    loopDetected: false,
    recommendedDiagnosticRadius: null,
  };
  const cursor = readFailureCursor(paths);
  if (!cursor?.failureRecordId) return empty;
  const record = readFailureRecord(paths, cursor.failureRecordId, schemaRoot);
  const diagnosis = cursor.diagnosisId
    ? readDiagnosisReport(paths, cursor.diagnosisId, schemaRoot)
    : findLatestDiagnosis(paths, record.failureRecordId, schemaRoot);
  return {
    activeFailureId: record.failureRecordId,
    failureSignaturePrefix: record.signature.slice(0, 12),
    diagnosisStatus: diagnosis?.status ?? null,
    loopDetected: diagnosis?.loopState.detected ?? false,
    recommendedDiagnosticRadius: diagnosis?.recommendedRadius ?? null,
  };
}

function projectIdFromProfile(paths: UadsPaths): string | null {
  const parsed = readJsonIfValid<ProjectProfile>(paths.profile);
  return parsed.ok ? parsed.value.projectId : null;
}

export function collectFailureSnapshot(paths: UadsPaths): Array<{ name: string; content: string }> {
  const files: Array<{ name: string; content: string }> = [];
  try {
    const cursor = fs.existsSync(failurePaths(paths).current) ? readFailureCursor(paths) : null;
    const records = listFailureRecords(paths);
    const projectId = records[0]?.projectId ?? projectIdFromProfile(paths);
    const memory = projectId && fs.existsSync(failurePaths(paths).memory) ? readFailureMemory(paths, projectId) : null;
    const diagnoses: DiagnosisReport[] = [];
    const dir = failurePaths(paths).diagnoses;
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort()) {
        diagnoses.push(readDiagnosisReport(paths, name.replace(/\.json$/, "")));
      }
    }
    files.push({
      name: "failures/failure-summary.json",
      content: `${JSON.stringify(
        {
          schema: "uads.failure-summary",
          activeFailureId: cursor?.failureRecordId ?? null,
          records: records.map((record) => ({
            failureRecordId: record.failureRecordId,
            source: record.source,
            failureClass: record.failureClass,
            signaturePrefix: record.signature.slice(0, 12),
            status: record.status,
            createdAt: record.createdAt,
            stackPaths: record.stackFrames.map((frame) => frame.path).filter(Boolean),
            failingTests: record.failingTests.map((item) => item.file).filter(Boolean),
          })),
        },
        null,
        2,
      )}\n`,
    });
    files.push({
      name: "failures/diagnosis-summary.json",
      content: `${JSON.stringify(
        {
          schema: "uads.diagnosis-summary",
          reports: diagnoses.map((report) => ({
            diagnosisId: report.diagnosisId,
            failureRecordId: report.failureRecordId,
            status: report.status,
            recommendedRadius: report.recommendedRadius,
            loopDetected: report.loopState.detected,
            loopOccurrences: report.loopState.occurrences,
            candidates: report.rankedCandidates.slice(0, 8).map((item) => ({
              path: item.path,
              score: item.score,
              confidence: item.confidence,
              signals: item.signals,
            })),
          })),
        },
        null,
        2,
      )}\n`,
    });
    files.push({
      name: "failures/memory-summary.json",
      content: `${JSON.stringify(
        {
          schema: "uads.memory-summary",
          entries: (memory?.entries ?? []).map((entry) => ({
            signaturePrefix: entry.failureSignature.slice(0, 12),
            occurrences: entry.occurrences,
            lastOutcome: entry.lastOutcome,
            lastSeenAt: entry.lastSeenAt,
            loopStreak: entry.sameDigestStreak,
            candidateCount: entry.candidatePaths.length,
            validityBasisPathCount: entry.validityBasisPaths.length,
            verifiedCorrectionPathCount: entry.verifiedCorrectionPaths.length,
            rootCauseVerified: entry.verifiedRootCausePaths.length > 0,
            reusable: entry.lastOutcome === "resolved" && Object.keys(entry.validityBasisDigests).length > 0,
            resolutionExecutionRunId: entry.resolutionExecutionRunId,
          })),
        },
        null,
        2,
      )}\n`,
    });
  } catch {
    files.push({
      name: "failures/failure-summary.json",
      content: `${JSON.stringify({ schema: "uads.failure-summary", error: "unavailable-or-corrupt" }, null, 2)}\n`,
    });
  }
  return files;
}
