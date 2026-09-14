import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { assertSafeTaskId, normalizeRepoRelativePath } from "./upir.js";

export const PATCH_RECIPE_VERSION = "0.1.0" as const;
export const PATCH_RECIPE_SCHEMA_FILE = "gef-patch-recipe.schema.json" as const;

export type PatchPreconditionKind = "FILE_EXISTS" | "SYMBOL_EXISTS" | "CONTENT_DIGEST_MATCH" | "NO_SOURCE_CONFLICT";
export type PatchTransformKind = "EDIT_SYMBOL" | "ADD_SYMBOL" | "REMOVE_SYMBOL" | "EDIT_FILE";

export type PatchTarget = { path: string; symbol: string };
export type PatchPrecondition = {
  kind: PatchPreconditionKind;
  path: string;
  symbol?: string;
  expectedDigest?: string;
  description: string;
};
export type PatchTransform = {
  kind: PatchTransformKind;
  path: string;
  symbol?: string;
  operation?: string;
  description: string;
};

export type PatchRecipe = {
  schemaVersion: typeof PATCH_RECIPE_VERSION;
  taskId: string;
  targets: PatchTarget[];
  structuralAnchors: string[];
  preconditions: PatchPrecondition[];
  transforms: PatchTransform[];
  preserve: string[];
  prove: string[];
  expectedPatchBudget: { maxSourceFilesChanged: number; maxTestFilesChanged: number; maxSemanticLOC: number };
};

export type PreconditionCheck =
  | { status: "READY"; mismatches: string[] }
  | { status: "SOURCE_CONFLICT"; mismatches: string[] };

export function validatePatchRecipe(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(PATCH_RECIPE_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}

export function assertPatchRecipe(data: unknown, schemaRoot?: string): asserts data is PatchRecipe {
  assertSchema(PATCH_RECIPE_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
  assertSafeTaskId((data as PatchRecipe).taskId);
}

export function buildPatchRecipe(input: PatchRecipe, schemaRoot?: string): PatchRecipe {
  assertSafeTaskId(input.taskId);
  for (const target of input.targets) {
    normalizeRepoRelativePath(target.path);
  }
  for (const precondition of input.preconditions) {
    normalizeRepoRelativePath(precondition.path);
  }
  const errors = validatePatchRecipe(input, schemaRoot);
  if (errors.length > 0) throw new Error(`PATCH_RECIPE_REJECTED: ${errors.join("; ")}`);
  return input;
}

export function checkPatchPreconditions(recipe: PatchRecipe, repoRoot: string): PreconditionCheck {
  const mismatches: string[] = [];
  for (const precondition of recipe.preconditions) {
    const relative = normalizeRepoRelativePath(precondition.path);
    const absolute = path.join(repoRoot, ...relative.split("/"));
    if (precondition.kind === "FILE_EXISTS" || precondition.kind === "SYMBOL_EXISTS" || precondition.kind === "CONTENT_DIGEST_MATCH") {
      if (!fs.existsSync(absolute)) {
        mismatches.push(`MISSING_FILE:${relative}`);
        continue;
      }
    }
    if (precondition.kind === "SYMBOL_EXISTS" && precondition.symbol) {
      const content = fs.readFileSync(absolute, "utf8");
      if (!content.includes(precondition.symbol)) mismatches.push(`MISSING_SYMBOL:${precondition.symbol}@${relative}`);
    }
    if (precondition.kind === "CONTENT_DIGEST_MATCH" && precondition.expectedDigest) {
      const content = fs.readFileSync(absolute, "utf8");
      if (sha256Hex(content) !== precondition.expectedDigest) mismatches.push(`DIGEST_MISMATCH:${relative}`);
    }
    if (precondition.kind === "NO_SOURCE_CONFLICT" && mismatches.length > 0) {
      mismatches.push(`SOURCE_CONFLICT_GUARD:${relative}`);
    }
  }
  if (mismatches.length > 0) return { status: "SOURCE_CONFLICT", mismatches };
  return { status: "READY", mismatches: [] };
}
