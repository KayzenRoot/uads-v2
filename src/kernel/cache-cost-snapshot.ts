import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import type { UadsPaths } from "../lib/workspace.js";
import { readCacheStatusCompact } from "./cache-engine.js";
import { listCacheRecordIdsForGate, readEvidenceCacheIndex } from "./cache-persist.js";
import { readCostLedger, readQptSnapshot } from "./cost-persist.js";
import { readCurrentCheckpoint } from "./persist.js";
import { readWorkOrder } from "./persist.js";
import { isCacheEligibleGate } from "./cache-policy.js";

function assertSafeSummary(content: string): string {
  if (containsUnredactedSecret(content) || containsAbsoluteHostPath(content)) {
    return `${JSON.stringify({ schema: "uads.redacted-summary", reason: "unsafe-content" }, null, 2)}\n`;
  }
  return content;
}

export function collectCacheCostSnapshot(paths: UadsPaths): Array<{ name: string; content: string }> {
  const files: Array<{ name: string; content: string }> = [];
  const checkpoint = (() => {
    try {
      return readCurrentCheckpoint(paths);
    } catch {
      return null;
    }
  })();
  const workOrder =
    checkpoint?.workOrderId
      ? (() => {
          try {
            return readWorkOrder(paths, checkpoint.workOrderId);
          } catch {
            return null;
          }
        })()
      : null;
  const projectId = workOrder?.projectId ?? null;
  if (!projectId) {
    return files;
  }
  const cache = readCacheStatusCompact(paths, projectId);
  const index = readEvidenceCacheIndex(paths, projectId);
  const gates = workOrder?.qualityGates ?? [];
  const gateEligibility = gates.map((gateId) => ({
    gateId,
    eligible: isCacheEligibleGate(gateId),
    candidateCount: listCacheRecordIdsForGate(paths, projectId, gateId).length,
  }));
  files.push({
    name: "cache/cache-summary.json",
    content: assertSafeSummary(
      `${JSON.stringify(
        {
          schema: "uads.cache-summary",
          schemaVersion: "0.6.0",
          reusableRecords: cache.reusableRecords,
          staleRecords: cache.staleRecords,
          notReusableRecords: cache.notReusableRecords,
          indexedRecords: cache.indexedRecords,
          indexCorrupt: cache.indexCorrupt,
          gates: gateEligibility,
          recordPrefixes: (index?.records ?? []).map((item) => ({
            cacheRecordPrefix: item.cacheRecordId.slice(0, 12),
            gateId: item.gateId,
            status: item.status,
          })),
        },
        null,
        2,
      )}\n`,
    ),
  });
  const ledger = readCostLedger(paths, projectId);
  const qpt = readQptSnapshot(paths);
  files.push({
    name: "cost/cost-summary.json",
    content: assertSafeSummary(
      `${JSON.stringify(
        {
          schema: "uads.cost-summary",
          schemaVersion: "0.6.0",
          budgetStatus: ledger?.budgetStatus ?? "unavailable",
          estimatedContextTokens: ledger?.estimatedContextTokens ?? 0,
          tokenEstimateMethod: "byte-heuristic",
          gateCacheHits: ledger?.gateCacheHits ?? 0,
          gateCacheMisses: ledger?.gateCacheMisses ?? 0,
          contextExpansions: ledger?.contextExpansions ?? 0,
          fullRepositoryScans: ledger?.fullRepositoryScans ?? 0,
          avoidedToolExecutions: ledger?.avoidedToolExecutions ?? 0,
          agentCallsReported: ledger?.agentCallsReported ?? null,
          qptRatio: qpt?.qptRatio ?? null,
          qptFormula: qpt?.qptFormula ?? null,
          limitations: qpt?.limitations ?? [],
        },
        null,
        2,
      )}\n`,
    ),
  });
  return files;
}
