import fs from "node:fs";
import path from "node:path";
import { isPathInside } from "../lib/hash.js";
import type { UadsPaths } from "../lib/workspace.js";
import { computeLiveChangeDigest, listChangedEntries, worktreeContentDigest } from "./change-digest.js";
import { readCurrentExecutionRun, readExecutionRun } from "./execution-persist.js";
import { FailureStateError } from "./failure-types.js";
import { sha256Hex } from "../lib/hash.js";
import { readWorkOrder, InvalidOrchestrationStateError } from "./persist.js";

export type FailureExecutionBinding = {
  workOrderId: string | null;
  executionRunId: string | null;
  changeDigest: string | null;
  standalone: boolean;
};

export function computeFailureAttemptDigest(input: {
  repoRoot: string;
  gitHead: string | null;
  indexDigest: string | null;
}): string {
  try {
    const entries = listChangedEntries(input.repoRoot);
    if (entries.length > 0) {
      return computeLiveChangeDigest(input.repoRoot, entries);
    }
  } catch {
    if (!input.indexDigest && !input.gitHead) {
      throw new FailureStateError("cannot establish failure attempt identity");
    }
    return sha256Hex(`head:${input.gitHead ?? "none"}:index:${input.indexDigest ?? "none"}:nogit`);
  }
  const worktree = worktreeContentDigest(input.repoRoot);
  if (!input.gitHead && !input.indexDigest) {
    throw new FailureStateError("cannot establish failure attempt identity");
  }
  return sha256Hex(`head:${input.gitHead ?? "none"}:index:${input.indexDigest ?? "none"}:worktree:${worktree}`);
}

export function assertSafeEvidenceInput(filePath: string, repoRoot: string, workspace: string): string {
  if (filePath.split(/[\\/]/).includes("..")) {
    throw new FailureStateError("path traversal rejected");
  }
  const abs = path.resolve(filePath);
  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(abs);
  } catch {
    throw new FailureStateError("failure input file not found");
  }
  if (lstat.isFIFO() || lstat.isSocket() || lstat.isCharacterDevice() || lstat.isBlockDevice()) {
    throw new FailureStateError("unsupported failure input file type");
  }
  const lexicalAllowed = isPathInside(repoRoot, abs) || isPathInside(workspace, abs);
  if (!lexicalAllowed) {
    throw new FailureStateError("failure input must be inside the repository or sidecar");
  }
  if (lstat.isSymbolicLink()) {
    let real: string;
    try {
      real = fs.realpathSync(abs);
    } catch {
      throw new FailureStateError("failure input symlink could not be resolved");
    }
    if (!isPathInside(repoRoot, real) && !isPathInside(workspace, real)) {
      throw new FailureStateError("failure input symlink escape rejected");
    }
    const realStat = fs.statSync(real);
    if (!realStat.isFile()) {
      throw new FailureStateError("unsupported failure input file type");
    }
    return real;
  }
  if (!lstat.isFile()) {
    throw new FailureStateError("unsupported failure input file type");
  }
  return abs;
}

export function assertLiveMatchesExecutionDigest(repoRoot: string, expectedDigest: string, kind: "record" | "resolve"): void {
  let live: string;
  try {
    live = computeLiveChangeDigest(repoRoot);
  } catch {
    throw new FailureStateError(
      kind === "record"
        ? "failure evidence rejected: live change digest differs from authoritative execution digest; run uads verify again"
        : "verified resolution refused: repository state no longer matches the verified corrective digest",
    );
  }
  if (live !== expectedDigest) {
    throw new FailureStateError(
      kind === "record"
        ? "failure evidence rejected: live change digest differs from authoritative execution digest; run uads verify again"
        : "verified resolution refused: repository state no longer matches the verified corrective digest",
    );
  }
}

export function resolveFailureExecutionBinding(input: {
  paths: UadsPaths;
  projectId: string;
  repoRoot?: string;
  requestedWorkOrderId?: string | null;
  requestedExecutionRunId?: string | null;
  schemaRoot?: string;
}): FailureExecutionBinding {
  const requestedRun = input.requestedExecutionRunId?.trim() || null;
  const requestedOrder = input.requestedWorkOrderId?.trim() || null;
  let current = null as ReturnType<typeof readCurrentExecutionRun>;
  try {
    current = readCurrentExecutionRun(input.paths, input.schemaRoot);
  } catch (error) {
    if (error instanceof InvalidOrchestrationStateError || error instanceof FailureStateError) {
      throw new FailureStateError("execution state missing or corrupt");
    }
    throw error;
  }

  function bind(result: FailureExecutionBinding): FailureExecutionBinding {
    if (input.repoRoot && result.executionRunId && result.changeDigest) {
      assertLiveMatchesExecutionDigest(input.repoRoot, result.changeDigest, "record");
    }
    return result;
  }

  if (requestedRun) {
    let run;
    try {
      run = readExecutionRun(input.paths, requestedRun, input.schemaRoot);
    } catch {
      throw new FailureStateError("supplied execution run missing or corrupt");
    }
    if (run.projectId !== input.projectId) {
      throw new FailureStateError("cross-project execution binding rejected");
    }
    if (current && current.executionRunId !== run.executionRunId) {
      throw new FailureStateError("supplied execution run does not match authoritative current run");
    }
    if (requestedOrder && requestedOrder !== run.workOrderId) {
      throw new FailureStateError("work-order does not match execution run");
    }
    return bind({
      workOrderId: run.workOrderId,
      executionRunId: run.executionRunId,
      changeDigest: run.currentChangeDigest,
      standalone: false,
    });
  }

  if (requestedOrder) {
    const order = readWorkOrder(input.paths, requestedOrder, input.schemaRoot);
    if (!order || order.projectId !== input.projectId) {
      throw new FailureStateError("supplied work order missing, corrupt, or cross-project");
    }
    if (current && current.workOrderId !== requestedOrder) {
      throw new FailureStateError("supplied work-order does not match authoritative current run");
    }
    if (current) {
      return bind({
        workOrderId: current.workOrderId,
        executionRunId: current.executionRunId,
        changeDigest: current.currentChangeDigest,
        standalone: false,
      });
    }
    return {
      workOrderId: requestedOrder,
      executionRunId: null,
      changeDigest: null,
      standalone: true,
    };
  }

  if (current && current.projectId === input.projectId) {
    return bind({
      workOrderId: current.workOrderId,
      executionRunId: current.executionRunId,
      changeDigest: current.currentChangeDigest,
      standalone: false,
    });
  }

  return { workOrderId: null, executionRunId: null, changeDigest: null, standalone: true };
}
