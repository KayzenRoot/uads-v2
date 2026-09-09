import path from "node:path";
import { isSensitiveDataFile } from "../lib/exclusions.js";
import { toPosix } from "../lib/hash.js";
import type { ContextPlan, WorkOrder } from "./types.js";
import type { ScopeClassification } from "./execution-types.js";

const TEST_DIR = /(^|\/)(tests?|__tests__|spec)(\/|$)/i;
const TEST_FILE = /\.(test|spec)\.[A-Za-z0-9]+$/i;
const DOC_FILE = /(^|\/)(docs?|README(\.[A-Za-z0-9]+)?$)/i;
const MIGRATION_DIR = /(^|\/)(migrations?|prisma\/migrations)(\/|$)/i;

function prefixes(workOrder: WorkOrder, contextPlan: ContextPlan | null): string[] {
  return [
    ...workOrder.affectedAreas,
    ...workOrder.includedScope.filter((item) => !item.includes(" ") && item.length < 80),
    ...(contextPlan?.candidateAreas ?? []),
  ]
    .map((item) => toPosix(item).replace(/\/$/, ""))
    .filter(Boolean);
}

function matchesPrefix(relative: string, area: string): boolean {
  const posix = toPosix(relative).replace(/\\/g, "/");
  const needle = toPosix(area).replace(/\\/g, "/").replace(/\/$/, "");
  if (!needle || needle.includes(" ")) {
    return false;
  }
  return posix === needle || posix.startsWith(`${needle}/`) || needle === posix.split("/")[0];
}

export function isProjectOperationalPath(relativePath: string): boolean {
  const posix = toPosix(relativePath);
  const parts = posix.split("/").filter(Boolean);
  return parts[0] === ".uads" || posix === ".uads" || parts.includes(".uads");
}

export function classifyChangedPath(
  relativePath: string,
  workOrder: WorkOrder,
  contextPlan: ContextPlan | null,
): { classification: ScopeClassification; reason: string } {
  const posix = toPosix(relativePath).replace(/\\/g, "/");
  const base = path.posix.basename(posix);
  const root = posix.split("/")[0] ?? "";

  if (isSensitiveDataFile(posix) || /\.(pem|key|p12|pfx)$/i.test(base)) {
    return { classification: "sensitive", reason: "credential or secret-bearing path" };
  }
  if (isProjectOperationalPath(posix)) {
    return { classification: "sensitive", reason: "project-local UADS operational path" };
  }

  const areas = prefixes(workOrder, contextPlan);
  if (areas.some((area) => matchesPrefix(posix, area))) {
    return { classification: "in-scope", reason: "matches planned affected area or context candidate" };
  }
  if (
    (workOrder.scopeClass === "trivial" || workOrder.scopeClass === "local") &&
    ["src", "frontend", "ui", "app", "lib"].includes(root)
  ) {
    return { classification: "in-scope", reason: "default source root for local/trivial work" };
  }

  const selected = new Set(workOrder.qualityGates);
  if ((TEST_DIR.test(posix) || TEST_FILE.test(posix)) && (selected.has("unit-test") || selected.has("integration-test") || areas.length > 0)) {
    return { classification: "supporting", reason: "focused test for the planned change" };
  }
  if (
    (posix === "package.json" || posix === "package-lock.json") &&
    (selected.has("dependency-audit") || selected.has("build"))
  ) {
    return { classification: "supporting", reason: "project manifest for a selected dependency/build gate" };
  }
  if (DOC_FILE.test(posix) && (workOrder.domains.includes("documentation") || workOrder.acceptanceCriteria.some((item) => /doc/i.test(item)))) {
    return { classification: "supporting", reason: "documentation required by acceptance criteria" };
  }
  if (MIGRATION_DIR.test(posix) && (selected.has("database-migration") || workOrder.domains.includes("database"))) {
    return { classification: "supporting", reason: "migration file for a selected database gate" };
  }

  return { classification: "out-of-scope", reason: "path is outside planned areas and is not a supporting artifact" };
}
