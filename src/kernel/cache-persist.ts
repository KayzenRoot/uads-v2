import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import type { CacheDecision, EvidenceCacheIndex, EvidenceCacheRecord } from "./cache-types.js";
import { CACHE_SCHEMA_VERSION } from "./cache-types.js";

export function cachePaths(paths: UadsPaths): {
  root: string;
  index: string;
  evidence: string;
  decisions: string;
} {
  const root = path.join(paths.workspace, "cache");
  return {
    root,
    index: path.join(root, "evidence-index.json"),
    evidence: path.join(root, "evidence"),
    decisions: path.join(root, "decisions"),
  };
}

function ensureCacheDirs(paths: UadsPaths): ReturnType<typeof cachePaths> {
  const locs = cachePaths(paths);
  fs.mkdirSync(locs.evidence, { recursive: true });
  fs.mkdirSync(locs.decisions, { recursive: true });
  return locs;
}

function emptyIndex(projectId: string): EvidenceCacheIndex {
  return {
    schema: "uads.evidence-cache-index",
    schemaVersion: CACHE_SCHEMA_VERSION,
    projectId,
    updatedAt: new Date().toISOString(),
    records: [],
  };
}

export function readEvidenceCacheIndex(paths: UadsPaths, projectId: string): EvidenceCacheIndex | null {
  const parsed = readJsonIfValid<EvidenceCacheIndex>(cachePaths(paths).index);
  if (!parsed.ok) {
    return fs.existsSync(cachePaths(paths).index) ? null : emptyIndex(projectId);
  }
  const value = parsed.value;
  if (
    value.schema !== "uads.evidence-cache-index" ||
    value.schemaVersion !== CACHE_SCHEMA_VERSION ||
    value.projectId !== projectId ||
    !Array.isArray(value.records)
  ) {
    return null;
  }
  return value;
}

export function persistEvidenceCacheRecord(
  paths: UadsPaths,
  record: EvidenceCacheRecord,
  schemaRoot?: string,
): EvidenceCacheRecord {
  const sanitized = sanitizeOperationalValue(record);
  assertSchema("evidence-cache-record.schema.json", sanitized, schemaRoot);
  const locs = ensureCacheDirs(paths);
  atomicWriteJson(sidecarJsonPath(locs.evidence, sanitized.cacheRecordId), sanitized);
  const existingIndex = readEvidenceCacheIndex(paths, sanitized.projectId);
  if (existingIndex === null && fs.existsSync(locs.index)) {
    throw new Error("cross-project or corrupt cache persist rejected");
  }
  const index = existingIndex ?? emptyIndex(sanitized.projectId);
  if (index.projectId !== sanitized.projectId) {
    throw new Error("cross-project cache persist rejected");
  }
  const next: EvidenceCacheIndex = {
    ...index,
    projectId: sanitized.projectId,
    updatedAt: sanitized.createdAt,
    records: [
      ...index.records.filter((item) => item.cacheRecordId !== sanitized.cacheRecordId),
      {
        cacheRecordId: sanitized.cacheRecordId,
        gateId: sanitized.gateId,
        reusable: sanitized.reusable,
        status: sanitized.status,
      },
    ].sort((a, b) => a.cacheRecordId.localeCompare(b.cacheRecordId)),
  };
  atomicWriteJson(locs.index, sanitizeOperationalValue(next));
  return sanitized;
}

export function persistCacheDecision(
  paths: UadsPaths,
  decision: CacheDecision,
  schemaRoot?: string,
): CacheDecision {
  const sanitized = sanitizeOperationalValue(decision);
  assertSchema("cache-decision.schema.json", sanitized, schemaRoot);
  const locs = ensureCacheDirs(paths);
  atomicWriteJson(sidecarJsonPath(locs.decisions, sanitized.cacheDecisionId), sanitized);
  return sanitized;
}

export function readCacheDecision(
  paths: UadsPaths,
  cacheDecisionId: string,
  schemaRoot?: string,
): CacheDecision | null {
  let target: string;
  try {
    target = sidecarJsonPath(cachePaths(paths).decisions, cacheDecisionId);
  } catch {
    return null;
  }
  const parsed = readJsonIfValid<CacheDecision>(target);
  if (!parsed.ok) {
    return null;
  }
  try {
    assertSchema("cache-decision.schema.json", parsed.value, schemaRoot);
    return parsed.value;
  } catch {
    return null;
  }
}

export function readEvidenceCacheRecord(
  paths: UadsPaths,
  cacheRecordId: string,
  schemaRoot?: string,
): EvidenceCacheRecord | null {
  let target: string;
  try {
    target = sidecarJsonPath(cachePaths(paths).evidence, cacheRecordId);
  } catch {
    return null;
  }
  const parsed = readJsonIfValid<EvidenceCacheRecord>(target);
  if (!parsed.ok) {
    return null;
  }
  try {
    assertSchema("evidence-cache-record.schema.json", parsed.value, schemaRoot);
    return parsed.value;
  } catch {
    return null;
  }
}

export function listCacheRecordIdsForGate(
  paths: UadsPaths,
  projectId: string,
  gateId: string,
): string[] {
  const index = readEvidenceCacheIndex(paths, projectId);
  if (!index) {
    return [];
  }
  return index.records.filter((item) => item.gateId === gateId).map((item) => item.cacheRecordId);
}

export function markCacheRecordStatus(
  paths: UadsPaths,
  cacheRecordId: string,
  status: EvidenceCacheRecord["status"],
  reason: string,
  schemaRoot?: string,
): void {
  const record = readEvidenceCacheRecord(paths, cacheRecordId, schemaRoot);
  if (!record) {
    return;
  }
  persistEvidenceCacheRecord(
    paths,
    {
      ...record,
      status,
      reusable: status === "reusable" ? record.reusable : false,
      invalidationReason: reason,
    },
    schemaRoot,
  );
}
