import { QPT_FORMULA, QPT_LIMITATIONS } from "../kernel/cost-governor.js";
import { readCostLedger, readCostStatusCompact, readQptSnapshot } from "../kernel/cost-persist.js";
import { readCurrentExecutionRun } from "../kernel/execution-persist.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runCostStatusCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
  const compact = readCostStatusCompact(ctx.paths, ctx.projectId);
  const ledger = readCostLedger(ctx.paths, ctx.projectId);
  const qpt = readQptSnapshot(ctx.paths);
  const payload = {
    projectId: ctx.projectId,
    budgetStatus: compact.budgetStatus,
    estimatedContextTokens: compact.estimatedContextTokens,
    tokenEstimateMethod: "byte-heuristic" as const,
    softBudget: ledger?.softBudget ?? null,
    hardBudget: ledger?.hardBudget ?? null,
    gateExecutions: ledger?.gateExecutions ?? 0,
    gateCacheHits: compact.gateCacheHits,
    gateCacheMisses: compact.gateCacheMisses,
    contextExpansions: compact.contextExpansions,
    fullRepositoryScans: compact.fullRepositoryScans,
    evidenceReuseCount: ledger?.evidenceReuseCount ?? 0,
    agentCallsReported: ledger?.agentCallsReported ?? null,
    qptRatio: compact.qptRatio,
    qptFormula: qpt?.qptFormula ?? QPT_FORMULA,
    limitations: qpt?.limitations ?? QPT_LIMITATIONS,
  };
  if (input.json) {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }
  return [
    "UADS cost status",
    `projectId: ${payload.projectId}`,
    `budgetStatus: ${payload.budgetStatus}`,
    `estimatedContextTokens: ${payload.estimatedContextTokens} (byte-heuristic)`,
    `gateCacheHits: ${payload.gateCacheHits}`,
    `gateCacheMisses: ${payload.gateCacheMisses}`,
    `contextExpansions: ${payload.contextExpansions}`,
    `qptRatio: ${payload.qptRatio ?? "(none)"}`,
    "",
  ].join("\n");
}

export function runCostExplainCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
    const ledger = readCostLedger(ctx.paths, ctx.projectId);
    const run = (() => {
      try {
        return readCurrentExecutionRun(ctx.paths);
      } catch {
        return null;
      }
    })();
    const outcome =
      ledger?.budgetStatus === "hard-blocked" ? "block" : ledger?.budgetStatus === "soft-warning" ? "warn" : "allow";
    const reasonCodes =
      outcome === "block"
        ? ["HARD_TOKEN_BUDGET", "BYTE_HEURISTIC_ESTIMATE"]
        : outcome === "warn"
          ? ["SOFT_TOKEN_BUDGET", "RECOMMEND_REUSE_OR_NARROWER_CONTEXT", "BYTE_HEURISTIC_ESTIMATE"]
          : ["BUDGET_OK", "BYTE_HEURISTIC_ESTIMATE"];
    const payload = {
      projectId: ctx.projectId,
      executionRunId: run?.executionRunId ?? ledger?.executionRunId ?? null,
      outcome,
      reasonCodes,
      budgetStatus: ledger?.budgetStatus ?? "ok",
      estimatedContextTokens: ledger?.estimatedContextTokens ?? 0,
      tokenEstimateMethod: "byte-heuristic",
      softBudget: ledger?.softBudget ?? null,
      hardBudget: ledger?.hardBudget ?? null,
      qptFormula: QPT_FORMULA,
      limitations: QPT_LIMITATIONS,
    };
    if (input.json) {
      return `${JSON.stringify(payload, null, 2)}\n`;
    }
    return [
      "UADS cost explain",
      `outcome: ${payload.outcome}`,
      `reasonCodes: ${payload.reasonCodes.join(", ")}`,
      `budgetStatus: ${payload.budgetStatus}`,
      `estimatedContextTokens: ${payload.estimatedContextTokens} (byte-heuristic)`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
