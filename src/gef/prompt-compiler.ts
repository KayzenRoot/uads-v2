import { sha256Hex } from "../lib/hash.js";
import { containsUnredactedSecret, redactSecrets } from "../lib/secrets.js";
import { canonicalDigest } from "./upir.js";
import type { Upir } from "./upir.js";
import type { DecisionCapsule } from "./decision-capsule.js";
import type { ContextSlice } from "./context-compiler.js";
import type { PatchRecipe } from "./patch-recipe.js";

export const GENERIC_PROMPT_COMPILER_VERSION = "gef-prompt-generic/1.0.0" as const;
export const CODEX_PROMPT_COMPILER_VERSION = "gef-prompt-codex/1.0.0" as const;

export type PromptExecutor = "generic" | "codex";
export type PromptMode = "correction" | "feature";

export type CompiledPrompt = {
  prompt: string;
  compilerVersion: string;
  promptDigest: string;
  executor: PromptExecutor;
  mode: PromptMode;
};

export type CompilePromptInput = {
  upir: Upir;
  decisionCapsule?: DecisionCapsule | null;
  contextSlice?: ContextSlice | null;
  patchRecipe?: PatchRecipe | null;
  mode: PromptMode;
  executor: PromptExecutor;
};

function section(title: string, body: string): string {
  return `## ${title}\n${body.trim()}\n`;
}

function bulletList(items: string[], fallback: string): string {
  if (items.length === 0) return fallback;
  return items.map((item) => `- ${redactSecrets(item).text}`).join("\n");
}

function compilerVersionFor(executor: PromptExecutor): string {
  return executor === "codex" ? CODEX_PROMPT_COMPILER_VERSION : GENERIC_PROMPT_COMPILER_VERSION;
}

export function compilePrompt(input: CompilePromptInput): CompiledPrompt {
  const compilerVersion = compilerVersionFor(input.executor);
  const upir = input.upir;
  const capsule = input.decisionCapsule ?? null;
  const slice = input.contextSlice ?? null;
  const recipe = input.patchRecipe ?? null;

  const header =
    input.executor === "codex"
      ? `GEF W1 Codex Execution Pack (${input.mode}). Deterministic. Follow PATCH_MAP exactly. Do not reread the whole project.`
      : `GEF W1 Generic Execution Pack (${input.mode}). Deterministic. Follow PATCH_MAP exactly.`;

  const accepted = [
    `taskId: ${upir.taskId}`,
    `taskClass: ${upir.taskClass} radius: ${upir.contextRadius}`,
    `baseSha: ${upir.baseSha}`,
    `acceptedFindings:\n${bulletList(upir.acceptedFindings, "- (none)")}`,
  ].join("\n");

  const openGoal = [`goal: ${redactSecrets(upir.goal).text}`, `openFindings:\n${bulletList(upir.openFindings, "- (none)")}`, `targets: ${(upir.targetSymbols.join(", ") || "(none)")}`].join("\n");

  const rootCause = capsule
    ? [`rootCause: ${redactSecrets(capsule.rootCause).text}`, `decision: ${redactSecrets(capsule.chosenDecision).text}`, `postconditions:\n${bulletList(capsule.expectedPostconditions, "- (none)")}`].join("\n")
    : "rootCause: (see OPEN_GOAL; no separate capsule)\ndecision: implement smallest safe change within radius";

  const patchMap = recipe
    ? [
        `targets:\n${recipe.targets.map((target) => `- ${target.path} :: ${target.symbol}`).join("\n")}`,
        `anchors:\n${bulletList(recipe.structuralAnchors, "- (none)")}`,
        `transforms:\n${recipe.transforms.map((transform) => `- [${transform.kind}] ${transform.path}${transform.symbol ? ` :: ${transform.symbol}` : ""}: ${redactSecrets(transform.description).text}`).join("\n") || "- (none)"}`,
        `preserve:\n${bulletList(recipe.preserve, "- (none)")}`,
      ].join("\n")
    : `targets: ${(upir.targetSymbols.join(", ") || "(none)")}\npreserve:\n${bulletList(upir.frozenInvariants.slice(0, 8), "- (none)")}`;

  const algorithm =
    input.mode === "correction"
      ? "1. Verify preconditions; on mismatch return SOURCE_CONFLICT and STOP.\n2. Apply PATCH_MAP transforms only.\n3. Preserve invariants.\n4. Run REQUIRED_TESTS.\n5. Emit MACHINE_OUTPUT JSON."
      : "1. Verify preconditions; on mismatch return SOURCE_CONFLICT and STOP.\n2. Implement minimal feature slice per PATCH_MAP.\n3. Preserve invariants.\n4. Add/extend REQUIRED_TESTS.\n5. Emit MACHINE_OUTPUT JSON.";

  const forbidden = capsule ? bulletList(capsule.forbiddenAlternatives.map((item) => `DO NOT: ${item}`), "- DO NOT expand radius without recorded reason\n- DO NOT execute arbitrary shell\n- DO NOT call paid models") : "- DO NOT expand radius without recorded reason\n- DO NOT execute arbitrary shell\n- DO NOT call paid models";

  const requiredTests = bulletList(upir.requiredProofs, "- focused W1 tests for touched symbols");
  const budgets = `search<=${upir.budgets.maxRepositorySearches} extraFiles<=${upir.budgets.maxExtraFilesOpened} sources<=${upir.budgets.maxSourceFilesChanged} tests<=${upir.budgets.maxTestFilesChanged} loc<=${upir.budgets.maxSemanticLOC} retries<=${upir.budgets.retryBudget}`;
  const assurance = "Local A0-A2: focused W1 tests + W0 regressions + lint/typecheck/build + validate:engineering/skills/actions.";
  const publication = "Do not merge. STOP at COMPLETE_CANDIDATE for independent HEDS.";
  const machineOutput = `MACHINE_OUTPUT: {"taskId":"${upir.taskId}","upirDigest":"${upir.digest}","verdict":"COMPLETE_CANDIDATE|SOURCE_CONFLICT|BLOCKED_EVIDENCE"}`;
  const stop = bulletList(
    upir.stopConditions.length > 0 ? upir.stopConditions : ["STOP at COMPLETE_CANDIDATE, SOURCE_CONFLICT, NEEDS_ARCHITECTURE, SCOPE_EXPANSION_REQUIRED or BLOCKED_EVIDENCE."],
    "STOP at COMPLETE_CANDIDATE.",
  );

  const frozen = bulletList(upir.frozenInvariants, "- (none)");
  const contextSummary = slice ? `context: radius=${slice.radius} entries=${slice.entries.length} digest=${slice.sliceDigest}` : "context: (none; use PATCH_MAP targets only)";

  const prompt = [
    section("HEADER", header),
    section("ACCEPTED_AND_FROZEN", `${accepted}\nfrozenInvariants:\n${frozen}\n${contextSummary}`),
    section("OPEN_GOAL", openGoal),
    section("ROOT_CAUSE/DECISION", rootCause),
    section("PATCH_MAP", patchMap),
    section("PRESCRIBED_ALGORITHM", algorithm),
    section("FORBIDDEN", forbidden),
    section("REQUIRED_TESTS", requiredTests),
    section("BUDGETS", budgets),
    section("LOCAL_ASSURANCE", assurance),
    section("PUBLICATION", publication),
    section("MACHINE_OUTPUT", machineOutput),
    section("STOP", stop),
  ].join("\n");

  if (containsUnredactedSecret(prompt)) throw new Error("PROMPT_SECRET_LEAK_REJECTED");
  for (const invariant of upir.frozenInvariants) {
    if (!prompt.includes(redactSecrets(invariant).text)) throw new Error("PROMPT_INVARIANT_MISSING");
  }
  for (const stopCondition of upir.stopConditions) {
    if (!prompt.includes(redactSecrets(stopCondition).text)) throw new Error("PROMPT_STOP_CONDITION_MISSING");
  }

  const promptDigest = sha256Hex(canonicalDigest({ prompt, compilerVersion, mode: input.mode, executor: input.executor }));
  return { prompt, compilerVersion, promptDigest, executor: input.executor, mode: input.mode };
}
