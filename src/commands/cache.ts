import { evaluateCache, readCacheStatusCompact } from "../kernel/cache-engine.js";
import { isCacheEligibleGate, reuseClassForGate } from "../kernel/cache-policy.js";
import { currentOrRefreshIndex } from "../kernel/intelligence.js";
import { readCurrentExecutionRun } from "../kernel/execution-persist.js";
import { readCurrentCheckpoint, readWorkOrder } from "../kernel/persist.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runCacheStatusCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
  const cache = readCacheStatusCompact(ctx.paths, ctx.projectId);
  const checkpoint = (() => {
    try {
      return readCurrentCheckpoint(ctx.paths);
    } catch {
      return null;
    }
  })();
  const workOrder = checkpoint?.workOrderId
    ? (() => {
        try {
          return readWorkOrder(ctx.paths, checkpoint.workOrderId);
        } catch {
          return null;
        }
      })()
    : null;
  const payload = {
    projectId: ctx.projectId,
    reusableRecords: cache.reusableRecords,
    staleRecords: cache.staleRecords,
    notReusableRecords: cache.notReusableRecords,
    indexedRecords: cache.indexedRecords,
    indexCorrupt: cache.indexCorrupt,
    eligibleGates: (workOrder?.qualityGates ?? []).filter((gate) => isCacheEligibleGate(gate)),
    notReusableGates: (workOrder?.qualityGates ?? []).filter((gate) => !isCacheEligibleGate(gate)),
  };
  if (input.json) {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }
  return [
    "UADS cache status",
    `projectId: ${payload.projectId}`,
    `reusableRecords: ${payload.reusableRecords}`,
    `staleRecords: ${payload.staleRecords}`,
    `indexedRecords: ${payload.indexedRecords}`,
    `eligibleGates: ${payload.eligibleGates.join(", ") || "(none)"}`,
    `notReusableGates: ${payload.notReusableGates.join(", ") || "(none)"}`,
    "",
  ].join("\n");
}

export function runCacheExplainCommand(input: {
  cwd?: string;
  uadsHome?: string;
  gateId: string;
  json?: boolean;
}): string {
  try {
    const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
    const run = (() => {
      try {
        return readCurrentExecutionRun(ctx.paths);
      } catch {
        return null;
      }
    })();
    let bundle = null;
    try {
      bundle = currentOrRefreshIndex({
        repoRoot: ctx.repoRoot,
        projectId: ctx.projectId,
        paths: ctx.paths,
      });
    } catch {
      bundle = null;
    }
    const decision = evaluateCache({
      paths: ctx.paths,
      projectId: ctx.projectId,
      gateId: input.gateId,
      workOrderId: run?.workOrderId ?? null,
      executionRunId: run?.executionRunId ?? null,
      liveChangeDigest: run?.currentChangeDigest ?? null,
      bundle,
      repoRoot: ctx.repoRoot,
    });
    const payload = {
      gateId: input.gateId,
      reuseClass: reuseClassForGate(input.gateId),
      decision: decision.decision,
      reasonCodes: decision.reasonCodes,
      changedValidityInputs: decision.changedValidityInputs,
      candidateCacheRecordId: decision.candidateCacheRecordId,
      executionRequired: decision.executionRequired,
      maySatisfyGate: decision.maySatisfyGate,
    };
    if (input.json) {
      return `${JSON.stringify(payload, null, 2)}\n`;
    }
    return [
      "UADS cache explain",
      `gateId: ${payload.gateId}`,
      `decision: ${payload.decision}`,
      `reasonCodes: ${payload.reasonCodes.join(", ") || "(none)"}`,
      `changedValidityInputs: ${payload.changedValidityInputs.join(", ") || "(none)"}`,
      `candidateCacheRecordId: ${payload.candidateCacheRecordId ?? "(none)"}`,
      `executionRequired: ${payload.executionRequired}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
