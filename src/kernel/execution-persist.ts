import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { assertSafeSidecarId } from "../lib/atomic-write.js";
import { isPathInside } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import type {
  EvidenceRecord,
  ExecutionPacket,
  ExecutionRun,
  ReviewPacket,
  ReviewRecord,
} from "./execution-types.js";
import { InvalidOrchestrationStateError } from "./persist.js";

export type ExecutionRunPaths = {
  root: string;
  run: string;
  packet: string;
  evidence: string;
  reviews: string;
  reviewPacket: string;
};

export function currentExecutionPointerPath(paths: UadsPaths): string {
  return path.join(paths.state, "current-execution.json");
}

export function executionRunPaths(paths: UadsPaths, executionRunId: string): ExecutionRunPaths {
  assertSafeSidecarId(executionRunId);
  const root = path.resolve(paths.executionRuns, executionRunId);
  if (!isPathInside(paths.executionRuns, root)) {
    throw new Error("execution-run path escape rejected");
  }
  return {
    root,
    run: path.join(root, "run.json"),
    packet: path.join(root, "packet.json"),
    evidence: path.join(root, "evidence"),
    reviews: path.join(root, "reviews"),
    reviewPacket: path.join(root, "reviews", "packet.json"),
  };
}

export function ensureExecutionRunDirs(paths: UadsPaths, executionRunId: string): ExecutionRunPaths {
  const runPaths = executionRunPaths(paths, executionRunId);
  for (const dir of [runPaths.root, runPaths.evidence, runPaths.reviews]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return runPaths;
}

export function persistExecutionRun(input: {
  paths: UadsPaths;
  run: ExecutionRun;
  packet?: ExecutionPacket;
  schemaRoot?: string;
}): ExecutionRun {
  const run = sanitizeOperationalValue(input.run);
  assertSchema("execution-run.schema.json", run, input.schemaRoot);
  const runPaths = ensureExecutionRunDirs(input.paths, run.executionRunId);
  atomicWriteJson(runPaths.run, run);
  if (input.packet) {
    const packet = sanitizeOperationalValue(input.packet);
    assertSchema("execution-packet.schema.json", packet, input.schemaRoot);
    atomicWriteJson(runPaths.packet, packet);
  }
  atomicWriteJson(currentExecutionPointerPath(input.paths), {
    schema: "uads.current-execution",
    schemaVersion: "0.3.0",
    executionRunId: run.executionRunId,
    updatedAt: run.updatedAt,
  });
  return run;
}

export function persistExecutionPacket(
  paths: UadsPaths,
  packet: ExecutionPacket,
  schemaRoot?: string,
): ExecutionPacket {
  const sanitized = sanitizeOperationalValue(packet);
  assertSchema("execution-packet.schema.json", sanitized, schemaRoot);
  const runPaths = ensureExecutionRunDirs(paths, sanitized.executionRunId);
  atomicWriteJson(runPaths.packet, sanitized);
  return sanitized;
}

export function persistEvidenceRecord(input: {
  paths: UadsPaths;
  record: EvidenceRecord;
  schemaRoot?: string;
}): EvidenceRecord {
  const record = sanitizeOperationalValue(input.record);
  assertSchema("evidence-record.schema.json", record, input.schemaRoot);
  const runPaths = ensureExecutionRunDirs(input.paths, record.executionRunId);
  atomicWriteJson(path.join(runPaths.evidence, `${record.evidenceId}.json`), record);
  return record;
}

export function persistReviewRecord(input: {
  paths: UadsPaths;
  record: ReviewRecord;
  schemaRoot?: string;
}): ReviewRecord {
  const record = sanitizeOperationalValue(input.record);
  assertSchema("review-record.schema.json", record, input.schemaRoot);
  const runPaths = ensureExecutionRunDirs(input.paths, record.executionRunId);
  atomicWriteJson(path.join(runPaths.reviews, `${record.reviewId}.json`), record);
  return record;
}

export function persistReviewPacket(paths: UadsPaths, packet: ReviewPacket, schemaRoot?: string): ReviewPacket {
  const sanitized = sanitizeOperationalValue(packet);
  assertSchema("review-packet.schema.json", sanitized, schemaRoot);
  const runPaths = ensureExecutionRunDirs(paths, sanitized.executionRunId);
  atomicWriteJson(runPaths.reviewPacket, sanitized);
  return sanitized;
}

export function readExecutionRun(paths: UadsPaths, executionRunId: string, schemaRoot?: string): ExecutionRun {
  const runPaths = executionRunPaths(paths, executionRunId);
  const parsed = readJsonIfValid<ExecutionRun>(runPaths.run);
  if (!parsed.ok) {
    throw new InvalidOrchestrationStateError(`execution run unreadable: ${parsed.error}`);
  }
  try {
    assertSchema("execution-run.schema.json", parsed.value, schemaRoot);
  } catch (error) {
    throw new InvalidOrchestrationStateError(
      `corrupt execution run rejected: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parsed.value;
}

export function readExecutionPacket(
  paths: UadsPaths,
  executionRunId: string,
  schemaRoot?: string,
): ExecutionPacket | null {
  const runPaths = executionRunPaths(paths, executionRunId);
  if (!fs.existsSync(runPaths.packet)) {
    return null;
  }
  const parsed = readJsonIfValid<ExecutionPacket>(runPaths.packet);
  if (!parsed.ok) {
    throw new InvalidOrchestrationStateError(`execution packet unreadable: ${parsed.error}`);
  }
  try {
    assertSchema("execution-packet.schema.json", parsed.value, schemaRoot);
    return parsed.value;
  } catch (error) {
    throw new InvalidOrchestrationStateError(
      `corrupt execution packet rejected: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function readRequiredExecutionPacket(
  paths: UadsPaths,
  executionRunId: string,
  schemaRoot?: string,
): ExecutionPacket {
  const packet = readExecutionPacket(paths, executionRunId, schemaRoot);
  if (!packet) {
    throw new InvalidOrchestrationStateError("execution packet missing for active run");
  }
  return packet;
}

export function readCurrentExecutionRunId(paths: UadsPaths): string | null {
  const parsed = readJsonIfValid<{ executionRunId?: string }>(currentExecutionPointerPath(paths));
  if (!parsed.ok || !parsed.value.executionRunId) {
    return null;
  }
  try {
    assertSafeSidecarId(parsed.value.executionRunId);
    return parsed.value.executionRunId;
  } catch {
    return null;
  }
}

export function readCurrentExecutionRun(paths: UadsPaths, schemaRoot?: string): ExecutionRun | null {
  const id = readCurrentExecutionRunId(paths);
  if (!id) {
    return null;
  }
  const runPaths = executionRunPaths(paths, id);
  if (!fs.existsSync(runPaths.run)) {
    return null;
  }
  return readExecutionRun(paths, id, schemaRoot);
}

export function listEvidenceRecords(
  paths: UadsPaths,
  executionRunId: string,
  schemaRoot?: string,
): EvidenceRecord[] {
  const runPaths = executionRunPaths(paths, executionRunId);
  if (!fs.existsSync(runPaths.evidence)) {
    return [];
  }
  const records: EvidenceRecord[] = [];
  for (const name of fs.readdirSync(runPaths.evidence).filter((file) => file.endsWith(".json")).sort()) {
    const parsed = readJsonIfValid<EvidenceRecord>(path.join(runPaths.evidence, name));
    if (!parsed.ok) {
      throw new InvalidOrchestrationStateError(`corrupt evidence record ${name}: ${parsed.error}`);
    }
    try {
      assertSchema("evidence-record.schema.json", parsed.value, schemaRoot);
      records.push(parsed.value);
    } catch (error) {
      throw new InvalidOrchestrationStateError(
        `corrupt evidence record ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return records;
}

export function listReviewRecords(
  paths: UadsPaths,
  executionRunId: string,
  schemaRoot?: string,
): ReviewRecord[] {
  const runPaths = executionRunPaths(paths, executionRunId);
  if (!fs.existsSync(runPaths.reviews)) {
    return [];
  }
  const records: ReviewRecord[] = [];
  for (const name of fs
    .readdirSync(runPaths.reviews)
    .filter((file) => file.endsWith(".json") && file !== "packet.json")
    .sort()) {
    const parsed = readJsonIfValid<ReviewRecord>(path.join(runPaths.reviews, name));
    if (!parsed.ok) {
      throw new InvalidOrchestrationStateError(`corrupt review record ${name}: ${parsed.error}`);
    }
    try {
      assertSchema("review-record.schema.json", parsed.value, schemaRoot);
      records.push(parsed.value);
    } catch (error) {
      throw new InvalidOrchestrationStateError(
        `corrupt review record ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return records;
}
