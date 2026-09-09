import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import type { CostDecision, CostLedger, QptSnapshot } from "./cost-types.js";
import { COST_SCHEMA_VERSION } from "./cost-types.js";

export function costPaths(paths: UadsPaths): {
  root: string;
  ledger: string;
  qpt: string;
  decisions: string;
} {
  const root = path.join(paths.workspace, "cost");
  return {
    root,
    ledger: path.join(root, "ledger.json"),
    qpt: path.join(root, "qpt-current.json"),
    decisions: path.join(root, "decisions"),
  };
}

function ensureCostDirs(paths: UadsPaths): ReturnType<typeof costPaths> {
  const locs = costPaths(paths);
  fs.mkdirSync(locs.decisions, { recursive: true });
  return locs;
}

export function emptyCostLedger(projectId: string): CostLedger {
  return {
    schema: "uads.cost-ledger",
    schemaVersion: COST_SCHEMA_VERSION,
    projectId,
    workOrderId: null,
    executionRunId: null,
    estimatedContextTokens: 0,
    estimatedDiagnosticTokens: 0,
    contextExpansions: 0,
    c5Uses: 0,
    toolExecutions: 0,
    gateExecutions: 0,
    gateCacheHits: 0,
    gateCacheMisses: 0,
    evidenceReuseCount: 0,
    avoidedToolExecutions: 0,
    fullRepositoryScans: 0,
    agentCallsReported: null,
    modelCapabilityClass: null,
    softBudget: null,
    hardBudget: null,
    budgetStatus: "ok",
    tokenEstimateMethod: "byte-heuristic",
    updatedAt: new Date().toISOString(),
  };
}

export function readCostLedger(paths: UadsPaths, projectId: string, schemaRoot?: string): CostLedger | null {
  const parsed = readJsonIfValid<CostLedger>(costPaths(paths).ledger);
  if (!parsed.ok) {
    return fs.existsSync(costPaths(paths).ledger) ? null : emptyCostLedger(projectId);
  }
  try {
    assertSchema("cost-ledger.schema.json", parsed.value, schemaRoot);
    if (parsed.value.projectId !== projectId) {
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function persistCostLedger(paths: UadsPaths, ledger: CostLedger, schemaRoot?: string): CostLedger {
  const sanitized = sanitizeOperationalValue(ledger);
  assertSchema("cost-ledger.schema.json", sanitized, schemaRoot);
  const locs = ensureCostDirs(paths);
  atomicWriteJson(locs.ledger, sanitized);
  return sanitized;
}

export function persistCostDecision(paths: UadsPaths, decision: CostDecision, schemaRoot?: string): CostDecision {
  const sanitized = sanitizeOperationalValue(decision);
  assertSchema("cost-decision.schema.json", sanitized, schemaRoot);
  const locs = ensureCostDirs(paths);
  atomicWriteJson(sidecarJsonPath(locs.decisions, sanitized.costDecisionId), sanitized);
  return sanitized;
}

export function persistQptSnapshot(paths: UadsPaths, snapshot: QptSnapshot, schemaRoot?: string): QptSnapshot {
  const sanitized = sanitizeOperationalValue(snapshot);
  assertSchema("qpt-snapshot.schema.json", sanitized, schemaRoot);
  const locs = ensureCostDirs(paths);
  atomicWriteJson(locs.qpt, sanitized);
  return sanitized;
}

export function readQptSnapshot(paths: UadsPaths, schemaRoot?: string): QptSnapshot | null {
  const parsed = readJsonIfValid<QptSnapshot>(costPaths(paths).qpt);
  if (!parsed.ok) {
    return null;
  }
  try {
    assertSchema("qpt-snapshot.schema.json", parsed.value, schemaRoot);
    return parsed.value;
  } catch {
    return null;
  }
}

export function readCostStatusCompact(paths: UadsPaths, projectId: string): {
  budgetStatus: CostLedger["budgetStatus"] | "unavailable";
  estimatedContextTokens: number;
  gateCacheHits: number;
  gateCacheMisses: number;
  contextExpansions: number;
  fullRepositoryScans: number;
  qptRatio: number | null;
  tokenEstimateMethod: "byte-heuristic";
} {
  const ledger = readCostLedger(paths, projectId);
  const qpt = readQptSnapshot(paths);
  if (!ledger) {
    return {
      budgetStatus: "unavailable",
      estimatedContextTokens: 0,
      gateCacheHits: 0,
      gateCacheMisses: 0,
      contextExpansions: 0,
      fullRepositoryScans: 0,
      qptRatio: qpt?.qptRatio ?? null,
      tokenEstimateMethod: "byte-heuristic",
    };
  }
  return {
    budgetStatus: ledger.budgetStatus,
    estimatedContextTokens: ledger.estimatedContextTokens,
    gateCacheHits: ledger.gateCacheHits,
    gateCacheMisses: ledger.gateCacheMisses,
    contextExpansions: ledger.contextExpansions,
    fullRepositoryScans: ledger.fullRepositoryScans,
    qptRatio: qpt?.qptRatio ?? null,
    tokenEstimateMethod: "byte-heuristic",
  };
}
