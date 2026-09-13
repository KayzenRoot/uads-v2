import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import type { UpirBudgets } from "./upir.js";

export const BUDGET_GOVERNOR_VERSION = "1.0.0" as const;
export const BUDGET_SCHEMA_FILE = "gef-budget.schema.json" as const;

export type BudgetStatus =
  | "OK"
  | "SEARCH_BUDGET_EXPANSION_REQUIRED"
  | "PATCH_BUDGET_EXPANSION_REQUIRED"
  | "RETRY_BUDGET_EXHAUSTED"
  | "TOKEN_BUDGET_EXPANSION_REQUIRED";

export type BudgetUsage = {
  searches: number;
  extraFilesOpened: number;
  sourceFilesChanged: number;
  testFilesChanged: number;
  semanticLOC: number;
  retries: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  activeSeconds?: number | null;
};

export type BudgetCheck = {
  schemaVersion: "0.1.0";
  budgets: UpirBudgets;
  usage: BudgetUsage;
  status: BudgetStatus;
  reasons: string[];
};

export function checkBudget(budgets: UpirBudgets, usage: BudgetUsage, schemaRoot?: string): BudgetCheck {
  const reasons: string[] = [];
  let status: BudgetStatus = "OK";
  if (usage.searches > budgets.maxRepositorySearches) {
    status = "SEARCH_BUDGET_EXPANSION_REQUIRED";
    reasons.push(`SEARCH_LIMIT_CROSSED:${usage.searches}>${budgets.maxRepositorySearches}`);
  }
  const patchOver =
    usage.extraFilesOpened > budgets.maxExtraFilesOpened ||
    usage.sourceFilesChanged > budgets.maxSourceFilesChanged ||
    usage.testFilesChanged > budgets.maxTestFilesChanged ||
    usage.semanticLOC > budgets.maxSemanticLOC;
  if (patchOver) {
    status = status === "OK" ? "PATCH_BUDGET_EXPANSION_REQUIRED" : status;
    reasons.push(
      `PATCH_LIMIT_CROSSED:files(${usage.extraFilesOpened}/${budgets.maxExtraFilesOpened}) sources(${usage.sourceFilesChanged}/${budgets.maxSourceFilesChanged}) tests(${usage.testFilesChanged}/${budgets.maxTestFilesChanged}) loc(${usage.semanticLOC}/${budgets.maxSemanticLOC})`,
    );
  }
  if (usage.retries > budgets.retryBudget) {
    status = "RETRY_BUDGET_EXHAUSTED";
    reasons.push(`RETRY_LIMIT_CROSSED:${usage.retries}>${budgets.retryBudget}`);
  }
  const tokenOver =
    (budgets.targetInputTokens != null && (usage.inputTokens ?? 0) > budgets.targetInputTokens) ||
    (budgets.targetOutputTokens != null && (usage.outputTokens ?? 0) > budgets.targetOutputTokens) ||
    (budgets.targetActiveSeconds != null && (usage.activeSeconds ?? 0) > budgets.targetActiveSeconds);
  if (tokenOver && status === "OK") {
    status = "TOKEN_BUDGET_EXPANSION_REQUIRED";
    reasons.push("TOKEN_TIME_TARGET_CROSSED");
  }
  const check: BudgetCheck = { schemaVersion: "0.1.0", budgets, usage, status, reasons };
  assertSchema(BUDGET_SCHEMA_FILE, check, schemaRoot ?? findPackageRoot());
  return check;
}

export function validateBudgetCheck(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(BUDGET_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}
