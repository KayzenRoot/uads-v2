import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest } from "./upir.js";
import type { Upir } from "./upir.js";
import { compilePrompt, type PromptExecutor, type PromptMode } from "./prompt-compiler.js";
import type { DecisionCapsule } from "./decision-capsule.js";
import type { ContextSlice } from "./context-compiler.js";
import type { PatchRecipe } from "./patch-recipe.js";

export const EXECUTION_PACK_VERSION = "0.1.0" as const;
export const EXECUTION_PACK_SCHEMA_FILE = "gef-execution-pack.schema.json" as const;

export type ExecutionPack = {
  schemaVersion: typeof EXECUTION_PACK_VERSION;
  taskId: string;
  executor: PromptExecutor | "cursor";
  compilerVersion: string;
  mode: PromptMode;
  upir: Upir;
  upirDigest: string;
  contextDigest: string | null;
  promptDigest: string;
  packDigest: string;
  prompt: string;
  stopConditions: string[];
  frozenInvariants: string[];
};

export type BuildPackInput = {
  upir: Upir;
  executor: PromptExecutor | "cursor";
  mode: PromptMode;
  decisionCapsule?: DecisionCapsule | null;
  contextSlice?: ContextSlice | null;
  patchRecipe?: PatchRecipe | null;
};

export function buildExecutionPack(input: BuildPackInput, schemaRoot?: string): ExecutionPack {
  const effectiveExecutor: PromptExecutor = input.executor === "cursor" ? "generic" : input.executor;
  const compiled = compilePrompt({ upir: input.upir, decisionCapsule: input.decisionCapsule ?? null, contextSlice: input.contextSlice ?? null, patchRecipe: input.patchRecipe ?? null, mode: input.mode, executor: effectiveExecutor });
  const contextDigest = input.contextSlice ? input.contextSlice.sliceDigest : null;
  const digestMaterial = {
    taskId: input.upir.taskId,
    executor: input.executor,
    mode: input.mode,
    compilerVersion: compiled.compilerVersion,
    upirDigest: input.upir.digest,
    contextDigest,
    promptDigest: compiled.promptDigest,
    stopConditions: input.upir.stopConditions,
    frozenInvariants: input.upir.frozenInvariants,
  };
  const packDigest = canonicalDigest(digestMaterial);
  const pack: ExecutionPack = {
    schemaVersion: EXECUTION_PACK_VERSION,
    taskId: input.upir.taskId,
    executor: input.executor,
    compilerVersion: compiled.compilerVersion,
    mode: input.mode,
    upir: input.upir,
    upirDigest: input.upir.digest,
    contextDigest,
    promptDigest: compiled.promptDigest,
    packDigest,
    prompt: compiled.prompt,
    stopConditions: [...input.upir.stopConditions],
    frozenInvariants: [...input.upir.frozenInvariants],
  };
  assertSchema(EXECUTION_PACK_SCHEMA_FILE, pack, schemaRoot ?? findPackageRoot());
  const errors = validateAgainstSchema(EXECUTION_PACK_SCHEMA_FILE, pack, schemaRoot ?? findPackageRoot());
  if (errors.length > 0) throw new Error(`EXECUTION_PACK_REJECTED: ${errors.join("; ")}`);
  return pack;
}

export function validateExecutionPack(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(EXECUTION_PACK_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}
