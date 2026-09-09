import fs from "node:fs";
import { assertSafeEvidenceInput, resolveFailureExecutionBinding } from "../kernel/failure-binding.js";
import { diagnoseFailure, recordFailure } from "../kernel/fault-localization.js";
import {
  findLatestDiagnosis,
  listFailureRecords,
  readFailureMemory,
  readFailureRecord,
} from "../kernel/failure-persist.js";
import { compactFailureRows, markVerifiedResolution } from "../kernel/failure-memory.js";
import { FailureStateError, type FailureSource } from "../kernel/failure-types.js";
import { IndexIncompleteError } from "../kernel/intelligence-types.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import { findPackageRoot } from "../lib/version.js";
import { safeErrorMessage } from "../lib/safe-persist.js";
import { readCurrentExecutionRun } from "../kernel/execution-persist.js";

const SOURCES: FailureSource[] = ["test", "lint", "typecheck", "build", "runtime", "gate", "manual-evidence"];

function asSource(value: string): FailureSource {
  if (!SOURCES.includes(value as FailureSource)) {
    throw new FailureStateError("unsupported failure source");
  }
  return value as FailureSource;
}

export function runFailureRecordCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  source: string;
  command?: string;
  exitCode?: string;
  inputPath: string;
  workOrder?: string;
  executionRun?: string;
}): string {
  try {
    const cwd = input.cwd ?? process.cwd();
    const ctx = resolveProjectContext(cwd, input.uadsHome);
    const schemaRoot = findPackageRoot();
    const abs = assertSafeEvidenceInput(input.inputPath, ctx.repoRoot, ctx.paths.workspace);
    const text = fs.readFileSync(abs, "utf8");
    const exitCode = input.exitCode === undefined ? null : Number(input.exitCode);
    if (input.exitCode !== undefined && !Number.isInteger(exitCode)) {
      throw new FailureStateError("exit-code must be an integer");
    }
    const binding = resolveFailureExecutionBinding({
      paths: ctx.paths,
      projectId: ctx.projectId,
      repoRoot: ctx.repoRoot,
      requestedWorkOrderId: input.workOrder,
      requestedExecutionRunId: input.executionRun,
      schemaRoot,
    });
    const record = recordFailure({
      cwd,
      uadsHome: input.uadsHome,
      repoRoot: ctx.repoRoot,
      projectId: ctx.projectId,
      paths: ctx.paths,
      source: asSource(input.source),
      command: input.command ?? null,
      exitCode,
      text,
      workOrderId: binding.workOrderId,
      executionRunId: binding.executionRunId,
      changeDigest: binding.standalone ? null : binding.changeDigest,
      schemaRoot,
    });
    const payload = {
      failureRecordId: record.failureRecordId,
      signature: record.signature,
      signaturePrefix: record.signature.slice(0, 12),
      source: record.source,
      failureClass: record.failureClass,
      status: record.status,
      executionRunId: record.executionRunId,
      workOrderId: record.workOrderId,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS failure record",
      `failureRecordId: ${payload.failureRecordId}`,
      `signaturePrefix: ${payload.signaturePrefix}`,
      `source: ${payload.source}`,
      `failureClass: ${payload.failureClass}`,
      `status: ${payload.status}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runDiagnoseCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  failureRecordId: string;
}): string {
  try {
    const cwd = input.cwd ?? process.cwd();
    const ctx = resolveProjectContext(cwd, input.uadsHome);
    const report = diagnoseFailure({
      repoRoot: ctx.repoRoot,
      projectId: ctx.projectId,
      paths: ctx.paths,
      failureRecordId: input.failureRecordId,
      schemaRoot: findPackageRoot(),
    });
    const payload = {
      diagnosisId: report.diagnosisId,
      failureRecordId: report.failureRecordId,
      status: report.status,
      initialRadius: report.initialRadius,
      recommendedRadius: report.recommendedRadius,
      loopDetected: report.loopState.detected,
      candidates: report.rankedCandidates.slice(0, 8).map((item) => ({
        path: item.path,
        score: item.score,
        confidence: item.confidence,
        signals: item.signals,
      })),
      nextEvidence: report.nextEvidence,
      contextPackRef: report.contextPackRef,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS diagnose",
      `diagnosisId: ${payload.diagnosisId}`,
      `status: ${payload.status}`,
      `recommendedRadius: ${payload.recommendedRadius}`,
      `loopDetected: ${payload.loopDetected}`,
      `topCandidate: ${payload.candidates[0]?.path ?? "(none)"}`,
      `nextEvidence: ${payload.nextEvidence.join("; ") || "(none)"}`,
      "",
    ].join("\n");
  } catch (error) {
    if (error instanceof IndexIncompleteError || error instanceof FailureStateError) {
      throw new Error(safeErrorMessage(error));
    }
    throw new Error(safeErrorMessage(error));
  }
}

export function runFailuresCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const cwd = input.cwd ?? process.cwd();
    const ctx = resolveProjectContext(cwd, input.uadsHome);
    const memory = readFailureMemory(ctx.paths, ctx.projectId, findPackageRoot());
    const rows = compactFailureRows(memory);
    if (input.json) return `${JSON.stringify({ projectId: ctx.projectId, entries: rows }, null, 2)}\n`;
    if (rows.length === 0) return "UADS failures\n(none)\n";
    return [
      "UADS failures",
      ...rows.map(
        (row) =>
          `${row.signaturePrefix}  occurrences=${row.occurrences}  outcome=${row.lastOutcome}  reusable=${row.reusable}  rootCauseVerified=${row.rootCauseVerified}  lastSeen=${row.lastSeenAt}`,
      ),
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runFailureShowCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  failureRecordId: string;
}): string {
  try {
    const cwd = input.cwd ?? process.cwd();
    const ctx = resolveProjectContext(cwd, input.uadsHome);
    const record = readFailureRecord(ctx.paths, input.failureRecordId, findPackageRoot());
    const diagnosis = findLatestDiagnosis(ctx.paths, record.failureRecordId, findPackageRoot());
    const payload = { record, diagnosis };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS failure show",
      `failureRecordId: ${record.failureRecordId}`,
      `signaturePrefix: ${record.signature.slice(0, 12)}`,
      `source: ${record.source}`,
      `status: ${record.status}`,
      `messageSummary: ${record.messageSummary}`,
      `diagnosisStatus: ${diagnosis?.status ?? "(none)"}`,
      `topCandidate: ${diagnosis?.rankedCandidates[0]?.path ?? "(none)"}`,
      `loopDetected: ${diagnosis?.loopState.detected ?? false}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runFailureResolveCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  failureRecordId: string;
}): string {
  try {
    const cwd = input.cwd ?? process.cwd();
    const ctx = resolveProjectContext(cwd, input.uadsHome);
    const schemaRoot = findPackageRoot();
    const run = readCurrentExecutionRun(ctx.paths, schemaRoot);
    if (!run) {
      throw new FailureStateError("verified resolution requires an authoritative completed execution run");
    }
    const memory = markVerifiedResolution({
      paths: ctx.paths,
      projectId: ctx.projectId,
      failureRecordId: input.failureRecordId,
      executionRunId: run.executionRunId,
      repoRoot: ctx.repoRoot,
      schemaRoot,
    });
    const payload = {
      failureRecordId: input.failureRecordId,
      lastOutcome: "resolved",
      rootCauseVerified: false,
      entries: compactFailureRows(memory),
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return ["UADS failure resolve", `failureRecordId: ${input.failureRecordId}`, "lastOutcome: resolved", ""].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runListFailureRecords(input: { cwd?: string; uadsHome?: string }): ReturnType<typeof listFailureRecords> {
  const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
  return listFailureRecords(ctx.paths, findPackageRoot());
}
