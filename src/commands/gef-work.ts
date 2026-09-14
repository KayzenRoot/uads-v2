import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson } from "../lib/atomic-write.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import { getUadsPaths } from "../lib/workspace.js";
import { gefProjectDirectory } from "../gef/storage.js";
import { assertSafeTaskId } from "../gef/upir.js";
import { collectDiffFacts } from "../gef/git-facts.js";
import { getCommandContract, listCommandContracts } from "../gef/command-contract.js";
import { loadWorkReceipt, persistWorkReceipt } from "../gef/command-receipt.js";
import { inspectCommandCache, pruneCommandCache } from "../gef/command-cache.js";
import { buildMachineEvidence, type CheckState, type MachineEvidence } from "../gef/machine-evidence.js";
import { renderEvidenceReport } from "../gef/evidence-report.js";
import { resolveWorkIdentity, runWorkCommand, runWorkPlane } from "../gef/work-plane.js";
import { recordGefTelemetry } from "../gef/telemetry.js";

type WorkOptions = { cwd?: string; json?: boolean };

function identity(cwd: string): ReturnType<typeof resolveWorkIdentity> & { paths: ReturnType<typeof getUadsPaths> } {
  const resolved = resolveWorkIdentity(cwd);
  return { ...resolved, paths: getUadsPaths(resolved.projectId) };
}

function evidenceFile(projectId: string, paths: ReturnType<typeof getUadsPaths>, taskId: string): string {
  assertSafeTaskId(taskId);
  const directory = path.join(gefProjectDirectory(paths, projectId), "w2-evidence");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.resolve(directory, `${taskId}.json`);
  if (!target.startsWith(path.resolve(directory))) throw new Error("W2_PATH_TRAVERSAL_REJECTED");
  return target;
}

function readEvidence(projectId: string, paths: ReturnType<typeof getUadsPaths>, taskId: string): MachineEvidence {
  const raw = JSON.parse(fs.readFileSync(evidenceFile(projectId, paths, taskId), "utf8")) as MachineEvidence;
  if (!raw || raw.taskId !== taskId) throw new Error("W2_EVIDENCE_CORRUPT");
  return raw;
}

export function runGefWorkFacts(taskId: string | undefined, options: WorkOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  if (taskId !== undefined) assertSafeTaskId(taskId);
  const facts = collectDiffFacts(current.repoRoot, current.fingerprint);
  const output = { ...facts, taskId: taskId ?? null, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `GEF W2 facts\nhead: ${facts.headSha}\ndirty: ${facts.dirty}\nfiles: ${facts.stats.files}\n`;
}

export function runGefCommandList(options: WorkOptions = {}): string {
  const contracts = listCommandContracts(false).map((contract) => ({
    id: contract.id,
    version: contract.version,
    executable: contract.executable,
    args: contract.args,
    timeoutMs: contract.timeoutMs,
    contractDigest: contract.contractDigest,
  }));
  const output = { contracts, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `${contracts.map((contract) => `${contract.id}@${contract.version}`).join("\n")}\n`;
}

export function runGefCommandRun(commandId: string, taskId: string, options: WorkOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  assertSafeTaskId(taskId);
  const contract = getCommandContract(commandId);
  const facts = collectDiffFacts(current.repoRoot, current.fingerprint);
  const ran = runWorkCommand({ repoRoot: current.repoRoot, projectFingerprint: current.fingerprint, taskId, commandId: contract.id, facts });
  persistWorkReceipt(ran.receipt);
  const output = { ...ran.receipt, cacheStatus: ran.cacheStatus, cacheReason: ran.cacheReason, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `GEF W2 command\nid: ${contract.id}\noutcome: ${ran.receipt.outcome}\ncache: ${ran.cacheStatus}\n`;
}

export function runGefReceiptShow(receiptId: string, options: WorkOptions = {}): string {
  const receipt = loadWorkReceipt(receiptId);
  const output = { ...receipt, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `GEF W2 receipt\nid: ${receipt.receiptDigest}\noutcome: ${receipt.outcome}\nsource: ${receipt.source}\n`;
}

export function runGefEvidenceBuild(taskId: string, options: WorkOptions & { commands?: string; baseSha?: string; workOrder?: string } = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  assertSafeTaskId(taskId);
  const commandIds = (options.commands ?? "").split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  const result = runWorkPlane({
    taskId,
    workOrder: options.workOrder ?? "GEF-W2",
    commandIds,
    baseSha: options.baseSha,
    cwd,
    localValidation: Object.fromEntries(commandIds.map((id) => [id, "NOT_RUN" as CheckState])),
  });
  const validation: Record<string, CheckState> = {};
  for (const receipt of result.receipts) validation[receipt.commandId] = receipt.outcome;
  const evidence = buildMachineEvidence({
    projectFingerprint: current.fingerprint,
    taskId,
    workOrder: options.workOrder ?? "GEF-W2",
    facts: result.facts,
    receipts: result.receipts,
    localValidation: validation,
    knownDebt: [],
    terminalState: result.terminalState,
  });
  atomicWriteJson(evidenceFile(current.projectId, current.paths, taskId), evidence);
  recordGefTelemetry(current.paths, {
    projectId: current.projectId,
    fingerprint: current.fingerprint,
    workOrder: options.workOrder ?? "GEF-W2",
    taskClass: null,
    event: "receipt",
    executorRequested: null,
    executorApplied: null,
    filesOpened: null,
    filesChanged: 0,
    activeExecutorSeconds: null,
    focusedTestSeconds: null,
    cacheHits: evidence.telemetry.cacheHits,
    cacheMisses: evidence.telemetry.cacheMisses,
    sourceConflictCount: 0,
    budgetExpansionCount: 0,
    finalVerdict: evidence.terminalState,
  });
  const output = { ...evidence, zeroProjectFootprint: true, mergeAllowed: false };
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `GEF W2 evidence\ntaskId: ${taskId}\nstate: ${evidence.terminalState}\ndigest: ${evidence.evidenceDigest}\n`;
}

export function runGefEvidenceReport(taskId: string, options: WorkOptions & { format?: string } = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const evidence = readEvidence(current.projectId, current.paths, taskId);
  if ((options.format ?? "md") !== "md") throw new Error("EVIDENCE_FORMAT_UNSUPPORTED");
  return `${renderEvidenceReport(evidence)}`;
}

export function runGefCacheInspect(options: WorkOptions & { kind?: string } = {}): string {
  if ((options.kind ?? "command") !== "command") throw new Error("CACHE_KIND_UNSUPPORTED");
  const entries = inspectCommandCache();
  const output = { kind: "command", entries, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `GEF W2 cache\nentries: ${entries.length}\n`;
}

export function runGefCachePrune(options: WorkOptions & { kind?: string; dryRun?: boolean; maxEntries?: number } = {}): string {
  if ((options.kind ?? "command") !== "command") throw new Error("CACHE_KIND_UNSUPPORTED");
  const result = pruneCommandCache({ dryRun: options.dryRun ?? false, maxEntries: options.maxEntries });
  const output = { kind: "command", ...result, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `GEF W2 cache prune\npruned: ${result.pruned}\nkept: ${result.kept}\n`;
}
