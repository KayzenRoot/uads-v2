import fs from "node:fs";
import path from "node:path";
import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { findPackageRoot, readUadsVersion } from "../lib/version.js";
import { getUadsPaths, resolveUadsHome } from "../lib/workspace.js";
import { checkGefSource } from "../gef/source-drift.js";
import { adoptGefProject, readGefProject } from "../gef/registry.js";
import { readGefRegistry } from "../gef/storage.js";
import { gefProjectDirectory } from "../gef/storage.js";
import { atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import { buildUpir, assertSafeTaskId, type Upir } from "../gef/upir.js";
import { classifyTask } from "../gef/task-classifier.js";
import { compileContext, CONTEXT_PRODUCER_VERSION, CONTEXT_TOOLCHAIN_BASIS, type ContextSlice } from "../gef/context-compiler.js";
import { contextCasGet, contextCasKey, contextCasPut, sliceContentDigest } from "../gef/context-cas.js";
import { assertDecisionCapsule, type DecisionCapsule } from "../gef/decision-capsule.js";
import { assertPatchRecipe, type PatchRecipe } from "../gef/patch-recipe.js";
import { compilePrompt, type PromptExecutor, type PromptMode } from "../gef/prompt-compiler.js";
import { buildExecutionPack } from "../gef/execution-pack.js";

type GefOptions = { cwd?: string; json?: boolean };

function identity(cwd: string): { git: ReturnType<typeof readGitSummary>; projectId: string; fingerprint: string; paths: ReturnType<typeof getUadsPaths> } {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? path.resolve(cwd);
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  return { git, projectId: fingerprint.projectId, fingerprint: fingerprint.fingerprint, paths: getUadsPaths(fingerprint.projectId) };
}

export function runGefStatus(options: GefOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const project = readGefProject(cwd);
  const source = project.baseline ? checkGefSource(cwd, project.baseline) : checkGefSource(cwd);
  let registry: ReturnType<typeof readGefRegistry> | null = null;
  let registryError: string | null = null;
  if (fs.existsSync(current.paths.gefRegistry)) {
    try {
      registry = readGefRegistry(current.paths, findPackageRoot());
    } catch (error) {
      registryError = error instanceof Error ? error.message : String(error);
    }
  }
  const result = {
    version: readUadsVersion(),
    gefVersion: "0.1.0",
    projectId: current.projectId,
    fingerprint: current.fingerprint,
    branch: current.git.branch,
    headSha: current.git.head,
    adoption: project.status === "VALID" ? { status: project.current?.status ?? "CORRUPT", mode: project.profile?.adoptionMode ?? null, projectClass: project.profile?.projectClass ?? null } : { status: project.status, mode: null, projectClass: null },
    globalRoot: path.join(resolveUadsHome(), "gef"),
    zeroProjectFootprint: true,
    registeredProjects: registry?.entries.length ?? null,
    registryStatus: registryError ? "CORRUPT" : registry ? "VALID" : "NOT_INITIALIZED",
    sourceCheck: source.status,
    sourceReasons: source.reasons,
  };
  if (options.json) return `${JSON.stringify(result, null, 2)}\n`;
  return [
    `UADS GEF status v${result.gefVersion}`,
    `projectId: ${result.projectId}`,
    `fingerprint: ${result.fingerprint}`,
    `branch: ${result.branch ?? "(none)"}`,
    `head: ${result.headSha ?? "(none)"}`,
    `adoption: ${result.adoption.status}`,
    `mode: ${result.adoption.mode ?? "(none)"}`,
    `globalRoot: ${result.globalRoot}`,
    `zeroProjectFootprint: ${result.zeroProjectFootprint}`,
    `registeredProjects: ${result.registeredProjects}`,
    `sourceCheck: ${result.sourceCheck}`,
    `sourceReasons: ${result.sourceReasons.join(", ") || "(none)"}`,
    "",
  ].join("\n");
}

export function runGefAdopt(options: { cwd?: string; json?: boolean; shadow?: boolean } = {}): string {
  const result = adoptGefProject(options.cwd ?? process.cwd(), "SHADOW");
  const output = { status: "ADOPTED", projectId: result.profile.projectId, fingerprint: result.profile.fingerprint, projectClass: result.profile.projectClass, adoptionMode: result.profile.adoptionMode, profilePath: path.relative(resolveUadsHome(), path.join(result.paths.gefProjects, result.profile.projectId, "profile.json")), currentPath: path.relative(resolveUadsHome(), path.join(result.paths.gefProjects, result.profile.projectId, "current.json")) };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `UADS GEF adopt\nstatus: ADOPTED\nprojectId: ${output.projectId}\nprojectClass: ${output.projectClass}\nadoptionMode: ${output.adoptionMode}\n`;
}

export function runGefProfileShow(options: GefOptions = {}): string {
  const project = readGefProject(options.cwd ?? process.cwd());
  const output = project.status === "VALID" ? project.profile : { status: project.status, reasonCode: project.reasonCode, projectId: identity(options.cwd ?? process.cwd()).projectId };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `${JSON.stringify(output, null, 2)}\n`;
}

export function runGefDoctor(options: GefOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const project = readGefProject(cwd);
  const source = project.baseline ? checkGefSource(cwd, project.baseline) : checkGefSource(cwd);
  const checks = [
    { name: "global-gef-layout", ok: [current.paths.gef, current.paths.gefProjects, current.paths.gefReceipts, current.paths.gefTelemetry].every((item) => fs.existsSync(item)) },
    { name: "project-fingerprint", ok: /^[a-f0-9]{64}$/.test(current.fingerprint) },
    { name: "project-state", ok: project.status === "VALID" },
    { name: "source-check", ok: source.status === "MATCH" },
  ];
  const output = { status: checks.every((check) => check.ok) ? "PASS" : "BLOCKED", checks, projectId: current.projectId, sourceStatus: source.status, sourceReasons: source.reasons, projectReasonCode: project.reasonCode, zeroProjectFootprint: true };
  if (options.json) return `${JSON.stringify(output, null, 2)}\n`;
  return [`UADS GEF doctor`, ...checks.map((check) => `${check.ok ? "ok  " : "FAIL"} ${check.name}`), "", `status: ${output.status}`, ""].join("\n");
}

type W1Manifest = {
  taskId: string;
  workOrder?: string;
  goal?: string;
  targetSymbols?: string[];
  frozenInvariants?: string[];
  stopConditions?: string[];
  requiredProofs?: string[];
  acceptedFindings?: string[];
  openFindings?: string[];
  taskClass?: Upir["taskClass"];
  contextRadius?: Upir["contextRadius"];
  baseSha?: string;
  budgets?: Upir["budgets"];
  mode?: PromptMode;
  decisionCapsule?: DecisionCapsule;
  patchRecipe?: PatchRecipe;
};

const DEFAULT_W1_BUDGETS: Upir["budgets"] = {
  maxRepositorySearches: 12,
  maxExtraFilesOpened: 16,
  maxSourceFilesChanged: 8,
  maxTestFilesChanged: 4,
  maxSemanticLOC: 800,
  retryBudget: 1,
  targetInputTokens: null,
  targetOutputTokens: null,
  targetActiveSeconds: null,
};

const DEFAULT_W1_STOP = ["STOP at COMPLETE_CANDIDATE, SOURCE_CONFLICT, NEEDS_ARCHITECTURE, SCOPE_EXPANSION_REQUIRED or BLOCKED_EVIDENCE."];

function w1TaskPaths(projectId: string, paths: ReturnType<typeof getUadsPaths>): { tasks: string; slices: string; decisions: string; recipes: string; packs: string } {
  const base = gefProjectDirectory(paths, projectId);
  return {
    tasks: path.join(base, "w1-tasks"),
    slices: path.join(base, "w1-slices"),
    decisions: path.join(base, "w1-decisions"),
    recipes: path.join(base, "w1-recipes"),
    packs: path.join(base, "w1-packs"),
  };
}

function readW1Json<T>(directory: string, taskId: string, executor?: string): T {
  assertSafeTaskId(taskId);
  const file = executor ? path.join(directory, `${taskId}.${executor}.json`) : path.join(directory, `${taskId}.json`);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(directory))) throw new Error("W1_PATH_TRAVERSAL_REJECTED");
  const parsed = readJsonIfValid<T>(resolved);
  if (!parsed.ok) throw new Error(parsed.error === "missing" ? "W1_TASK_MISSING" : "W1_TASK_CORRUPT");
  return parsed.value;
}

function writeW1Json(directory: string, taskId: string, value: unknown, schemaFile: string, executor?: string): string {
  assertSafeTaskId(taskId);
  fs.mkdirSync(directory, { recursive: true });
  const file = executor ? path.join(directory, `${taskId}.${executor}.json`) : path.join(directory, `${taskId}.json`);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(directory))) throw new Error("W1_PATH_TRAVERSAL_REJECTED");
  assertSchema(schemaFile, value, findPackageRoot());
  atomicWriteJson(resolved, value);
  return resolved;
}

export function runGefTaskCompile(manifestPath: string, options: GefOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const repoRoot = current.git.repoRoot ?? path.resolve(cwd);
  const raw = JSON.parse(fs.readFileSync(path.resolve(cwd, manifestPath), "utf8")) as W1Manifest;
  assertSafeTaskId(raw.taskId);
  const sourceCheck = checkGefSource(cwd, readGefProject(cwd).baseline ?? {});
  const hasConflict = sourceCheck.status === "SOURCE_CONFLICT";
  const classification = raw.taskClass
    ? { taskClass: raw.taskClass, reasonCodes: [] as string[], rationale: "operator-provided" }
    : classifyTask({ sourceFilesChanged: (raw.targetSymbols ?? []).length > 1 ? 2 : 1, targetSymbols: (raw.targetSymbols ?? []).length, hasSourceConflict: hasConflict, openFindings: (raw.openFindings ?? []).length });
  const upir = buildUpir({
    schemaVersion: "0.1.0",
    taskId: raw.taskId,
    projectFingerprint: current.fingerprint,
    workOrder: raw.workOrder ?? "GEF-W1",
    taskClass: raw.taskClass ?? (classification.taskClass as Upir["taskClass"]),
    contextRadius: raw.contextRadius ?? "C2",
    baseSha: raw.baseSha ?? current.git.head ?? "0".repeat(40),
    reviewedHeadSha: null,
    goal: raw.goal ?? `Compile bounded execution pack for ${raw.taskId}`,
    acceptedFindings: raw.acceptedFindings ?? [],
    openFindings: raw.openFindings ?? [],
    targetSymbols: raw.targetSymbols ?? [],
    frozenInvariants: raw.frozenInvariants ?? ["Global-first / zero-project-footprint is mandatory."],
    requiredProofs: raw.requiredProofs ?? ["focused W1 unit/integration tests"],
    budgets: raw.budgets ?? DEFAULT_W1_BUDGETS,
    stopConditions: raw.stopConditions ?? DEFAULT_W1_STOP,
  });
  const dirs = w1TaskPaths(current.projectId, current.paths);
  const stored = path.relative(current.paths.home, writeW1Json(dirs.tasks, upir.taskId, upir, "gef-upir.schema.json"));
  if (raw.decisionCapsule) {
    assertDecisionCapsule(raw.decisionCapsule);
    writeW1Json(dirs.decisions, upir.taskId, raw.decisionCapsule, "gef-decision-capsule.schema.json");
  }
  if (raw.patchRecipe) {
    assertPatchRecipe(raw.patchRecipe);
    writeW1Json(dirs.recipes, upir.taskId, raw.patchRecipe, "gef-patch-recipe.schema.json");
  }
  const output = { ...upir, storagePath: stored, zeroProjectFootprint: true, sourceCheck: sourceCheck.status };
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `GEF W1 task compiled\ntaskId: ${upir.taskId}\ndigest: ${upir.digest}\n`;
}

export function runGefContextPrepare(taskId: string, options: GefOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const repoRoot = current.git.repoRoot ?? path.resolve(cwd);
  const dirs = w1TaskPaths(current.projectId, current.paths);
  const upir = readW1Json<Upir>(dirs.tasks, taskId);
  const slice = compileContext({ taskId, repoRoot, targetSymbols: upir.targetSymbols.length > 0 ? upir.targetSymbols : ["__gef_placeholder__"], radius: upir.contextRadius, invariants: upir.frozenInvariants });
  const key = contextCasKey({ contentDigest: sliceContentDigest(slice), producerVersion: slice.producerVersion, toolchainBasis: slice.toolchainBasis });
  const existing = contextCasGet(key);
  const casStatus = existing.status === "HIT" ? "HIT" : "MISS";
  if (existing.status === "MISS") contextCasPut(slice);
  const stored = path.relative(current.paths.home, writeW1Json(dirs.slices, taskId, slice, "gef-context-slice.schema.json"));
  const output = { ...slice, casStatus, casKey: key, storagePath: stored, zeroProjectFootprint: true };
  void CONTEXT_PRODUCER_VERSION;
  void CONTEXT_TOOLCHAIN_BASIS;
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `GEF W1 context prepared\ntaskId: ${taskId}\nentries: ${slice.entries.length}\ncas: ${casStatus}\n`;
}

function loadOptional<T>(directory: string, taskId: string): T | null {
  try {
    return readW1Json<T>(directory, taskId);
  } catch {
    return null;
  }
}

export function runGefPromptCompile(taskId: string, options: GefOptions & { executor?: string; mode?: string } = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const dirs = w1TaskPaths(current.projectId, current.paths);
  const upir = readW1Json<Upir>(dirs.tasks, taskId);
  const slice = loadOptional<ContextSlice>(dirs.slices, taskId);
  const decision = loadOptional<DecisionCapsule>(dirs.decisions, taskId);
  const recipe = loadOptional<PatchRecipe>(dirs.recipes, taskId);
  const executor = (options.executor ?? "codex") as PromptExecutor;
  if (executor !== "codex" && executor !== "generic") throw new Error("EXECUTOR_UNSUPPORTED");
  const mode = ((options.mode ?? "correction") as PromptMode) === "feature" ? "feature" : "correction";
  const compiled = compilePrompt({ upir, decisionCapsule: decision, contextSlice: slice, patchRecipe: recipe, mode, executor });
  const output = { ...compiled, taskId, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `${compiled.prompt}\n`;
}

export function runGefPackBuild(taskId: string, options: GefOptions & { executor?: string; mode?: string } = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const dirs = w1TaskPaths(current.projectId, current.paths);
  const upir = readW1Json<Upir>(dirs.tasks, taskId);
  const slice = loadOptional<ContextSlice>(dirs.slices, taskId);
  const decision = loadOptional<DecisionCapsule>(dirs.decisions, taskId);
  const recipe = loadOptional<PatchRecipe>(dirs.recipes, taskId);
  const rawExecutor = options.executor ?? "codex";
  if (rawExecutor !== "codex" && rawExecutor !== "generic" && rawExecutor !== "cursor") throw new Error("EXECUTOR_UNSUPPORTED");
  const mode = ((options.mode ?? "correction") as PromptMode) === "feature" ? "feature" : "correction";
  const pack = buildExecutionPack({ upir, executor: rawExecutor as "codex", mode, decisionCapsule: decision, contextSlice: slice, patchRecipe: recipe });
  const stored = path.relative(current.paths.home, writeW1Json(dirs.packs, taskId, { ...pack, upir: pack.upir }, "gef-execution-pack.schema.json", rawExecutor));
  const output = { ...pack, storagePath: stored, zeroProjectFootprint: true, mergeAllowed: false };
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `GEF W1 pack built\ntaskId: ${taskId}\npackDigest: ${pack.packDigest}\n`;
}
