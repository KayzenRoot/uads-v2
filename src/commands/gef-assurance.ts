import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson } from "../lib/atomic-write.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import { getUadsPaths } from "../lib/workspace.js";
import { gefProjectDirectory } from "../gef/storage.js";
import { assertSafeTaskId } from "../gef/upir.js";
import { collectDiffFacts, type DiffFacts } from "../gef/git-facts.js";
import { assessImpactGraph, buildImpactGraph, readImpactGraph, writeImpactGraph, type ImpactGraph } from "../gef/impact-graph.js";
import { computeTestImpact, validateImpactResult, type ImpactResult } from "../gef/test-impact.js";
import { planAssurance, runAssurancePlan, verifyAssurancePlan, type AssurancePlan } from "../gef/assurance-planner.js";
import { verifyProofDelta, type ProofDelta } from "../gef/proof-delta.js";
import { inspectProofStore, loadProofRecord, pruneProofStore } from "../gef/proof-store.js";
import { verifyProofRecord } from "../gef/proof-record.js";
import { resolveWorkIdentity } from "../gef/work-plane.js";

type AssuranceOptions = { cwd?: string; json?: boolean; baseSha?: string; dryRun?: boolean; maxEntries?: number };

function identity(cwd: string): ReturnType<typeof resolveWorkIdentity> & { paths: ReturnType<typeof getUadsPaths> } {
  const resolved = resolveWorkIdentity(cwd);
  return { ...resolved, paths: getUadsPaths(resolved.projectId) };
}

function assuranceDirectory(paths: ReturnType<typeof getUadsPaths>, projectId: string): string {
  return path.join(gefProjectDirectory(paths, projectId), "assurance");
}

function assuranceFile(paths: ReturnType<typeof getUadsPaths>, projectId: string, taskId: string, kind: string): string {
  assertSafeTaskId(taskId);
  const directory = assuranceDirectory(paths, projectId);
  fs.mkdirSync(directory, { recursive: true });
  const target = path.resolve(directory, `${taskId}-${kind}.json`);
  if (!target.startsWith(path.resolve(directory))) throw new Error("W3_PATH_TRAVERSAL_REJECTED");
  return target;
}

function readJsonDocument<T>(target: string, code: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(target, "utf8")) as T;
  } catch {
    throw new Error(code);
  }
  return raw as T;
}

export function readPersistedImpact(paths: ReturnType<typeof getUadsPaths>, projectId: string, taskId: string): ImpactResult {
  const raw = readJsonDocument<unknown>(assuranceFile(paths, projectId, taskId, "impact"), "W3_IMPACT_MISSING");
  const errors = validateImpactResult(raw);
  if (errors.length > 0) throw new Error(`W3_IMPACT_CORRUPT:${errors[0] ?? "unknown"}`);
  return raw as ImpactResult;
}

export function readPersistedPlan(paths: ReturnType<typeof getUadsPaths>, projectId: string, taskId: string): AssurancePlan {
  const raw = readJsonDocument<unknown>(assuranceFile(paths, projectId, taskId, "plan"), "W3_PLAN_MISSING");
  const verified = verifyAssurancePlan(raw, raw && typeof raw === "object" ? (raw as AssurancePlan).projectFingerprint : undefined);
  if (!verified.ok) throw new Error(`W3_PLAN_CORRUPT:${verified.reason}`);
  return verified.plan;
}

export function readPersistedDelta(paths: ReturnType<typeof getUadsPaths>, projectId: string, taskId: string): ProofDelta {
  const raw = readJsonDocument<unknown>(assuranceFile(paths, projectId, taskId, "delta"), "W3_DELTA_MISSING");
  const verified = verifyProofDelta(raw, raw && typeof raw === "object" ? (raw as ProofDelta).projectFingerprint : undefined);
  if (!verified.ok) throw new Error(`W3_DELTA_CORRUPT:${verified.reason}`);
  return verified.delta;
}

export function computeImpactForRepo(input: {
  repoRoot: string;
  projectFingerprint: string;
  taskId: string;
  facts: DiffFacts;
  paths: ReturnType<typeof getUadsPaths>;
  projectId: string;
  limits?: { maxFiles?: number; maxEntities?: number };
}): { impact: ImpactResult; graph: ImpactGraph; graphFileCount: number } {
  // The stored snapshot is the incremental basis: assess the change against it,
  // then refresh it. The impact is computed from the snapshot, so dependents of
  // a renamed or deleted identity stay resolvable.
  const stored = readImpactGraph(input.paths, input.projectId, input.projectFingerprint);
  const assessment = assessImpactGraph({ repoRoot: input.repoRoot, graph: stored.graph, storeStatus: stored.status, changed: input.facts.changedFiles });
  const impact = computeTestImpact({
    taskId: input.taskId,
    projectFingerprint: input.projectFingerprint,
    facts: input.facts,
    graph: stored.graph,
    graphState: assessment.state,
    graphReasons: assessment.reasons,
  });
  const graph = buildImpactGraph(input.repoRoot, input.projectFingerprint, input.limits);
  const written = writeImpactGraph(input.paths, input.projectId, graph, graph.nodes.filter((node) => node.path !== null).length);
  void written;
  return { impact, graph, graphFileCount: graph.nodes.filter((node) => node.path !== null).length };
}

export function runGefImpactBuild(taskId: string, options: AssuranceOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  assertSafeTaskId(taskId);
  const facts = collectDiffFacts(current.repoRoot, current.fingerprint, options.baseSha);
  const { impact, graph } = computeImpactForRepo({
    repoRoot: current.repoRoot,
    projectFingerprint: current.fingerprint,
    taskId,
    facts,
    paths: current.paths,
    projectId: current.projectId,
  });
  atomicWriteJson(assuranceFile(current.paths, current.projectId, taskId, "impact"), impact);
  const output = { ...impact, graphNodeCount: graph.nodes.length, graphEdgeCount: graph.edges.length, zeroProjectFootprint: true };
  return options.json
    ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n`
    : `GEF W3 impact\ntaskId: ${taskId}\ngraphState: ${impact.graphState}\nselected: ${impact.selected.length}\nexpansion: ${impact.expansionState}\n`;
}

export function runGefImpactExplain(taskId: string, options: AssuranceOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  assertSafeTaskId(taskId);
  const impact = readPersistedImpact(current.paths, current.projectId, taskId);
  const byReason = new Map<string, string[]>();
  for (const entry of impact.selected) {
    const bucket = byReason.get(entry.reason) ?? [];
    bucket.push(entry.commandId);
    byReason.set(entry.reason, bucket);
  }
  const output = {
    taskId,
    impactDigest: impact.impactDigest,
    graphState: impact.graphState,
    expansionState: impact.expansionState,
    minimumAssurance: impact.minimumAssurance,
    reasons: [...byReason.entries()].sort(([left], [right]) => (left < right ? -1 : 1)).map(([reason, proofs]) => ({ reason, proofs: proofs.sort() })),
    uncertainty: impact.uncertainty,
    limitations: impact.limitations,
    zeroProjectFootprint: true,
  };
  return options.json
    ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n`
    : `GEF W3 impact explain\ntaskId: ${taskId}\n${output.reasons.map((item) => `${item.reason}: ${item.proofs.join(", ")}`).join("\n")}\n`;
}

export function runGefAssurancePlan(taskId: string, options: AssuranceOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  assertSafeTaskId(taskId);
  const impact = readPersistedImpact(current.paths, current.projectId, taskId);
  const { plan } = planAssurance({ taskId, projectFingerprint: current.fingerprint, repoRoot: current.repoRoot, impact });
  atomicWriteJson(assuranceFile(current.paths, current.projectId, taskId, "plan"), plan);
  const output = { ...plan, zeroProjectFootprint: true };
  return options.json
    ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n`
    : `GEF W3 assurance plan\ntaskId: ${taskId}\nrequired: ${plan.required.length}\nreuse: ${plan.metrics.reuseCandidates}\nminimumAssurance: ${plan.minimumAssurance}\ndigest: ${plan.planDigest}\n`;
}

export function runGefAssuranceRun(taskId: string, options: AssuranceOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  assertSafeTaskId(taskId);
  const impact = readPersistedImpact(current.paths, current.projectId, taskId);
  const facts = collectDiffFacts(current.repoRoot, current.fingerprint, options.baseSha);
  // One planning pass provides both the persisted plan and the exact bases the
  // execution must reproduce: re-planning for execution would risk executing
  // against a basis that no longer matches the published plan.
  const { plan, prepared } = planAssurance({ taskId, projectFingerprint: current.fingerprint, repoRoot: current.repoRoot, impact });
  const run = runAssurancePlan({
    plan,
    prepared,
    repoRoot: current.repoRoot,
    projectFingerprint: current.fingerprint,
    taskId,
    facts,
    impact,
  });
  atomicWriteJson(assuranceFile(current.paths, current.projectId, taskId, "plan"), plan);
  atomicWriteJson(assuranceFile(current.paths, current.projectId, taskId, "delta"), run.delta);
  const output = { planDigest: plan.planDigest, delta: run.delta, proofs: run.proofs, receipts: run.receipts, zeroProjectFootprint: true };
  return options.json
    ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n`
    : `GEF W3 assurance run\ntaskId: ${taskId}\nexecuted: ${run.delta.summary.new}\nreused: ${run.delta.summary.reused}\ninvalidated: ${run.delta.summary.invalidated}\n`;
}

export function runGefAssuranceDelta(taskId: string, options: AssuranceOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  assertSafeTaskId(taskId);
  // A delta's provenance is the plan it reports against: if that plan cannot be
  // verified, the delta cannot be presented as a trustworthy result.
  const plan = readPersistedPlan(current.paths, current.projectId, taskId);
  const delta = readPersistedDelta(current.paths, current.projectId, taskId);
  if (delta.planDigest !== plan.planDigest) throw new Error("W3_DELTA_PLAN_MISMATCH");
  const output = { ...delta, minimumAssurance: plan.minimumAssurance, zeroProjectFootprint: true };
  return options.json
    ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n`
    : `GEF W3 assurance delta\ntaskId: ${taskId}\nnew: ${delta.summary.new}\nreused: ${delta.summary.reused}\ninvalidated: ${delta.summary.invalidated}\nnotApplicable: ${delta.summary.notApplicable}\n`;
}

export function runGefProofList(options: AssuranceOptions = {}): string {
  const stats = inspectProofStore();
  const output = { ...stats, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `GEF W3 proof store\nrecords: ${stats.records}\nindexes: ${stats.indexes}\nreferenced: ${stats.referenced}\n`;
}

export function runGefProofShow(proofId: string, options: AssuranceOptions = {}): string {
  const record = loadProofRecord(proofId);
  const output = { ...record, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(sanitizeOperationalValue(output), null, 2)}\n` : `GEF W3 proof\nid: ${record.proofId}\ntype: ${record.proofType}\noutcome: ${record.outcome}\nsource: ${record.source}\n`;
}

export function runGefProofVerify(proofId: string, options: AssuranceOptions = {}): string {
  const record = loadProofRecord(proofId);
  const verified = verifyProofRecord(record, record.projectFingerprint);
  const output = {
    proofId: record.proofId,
    proofDigest: record.proofDigest,
    verified: verified.ok,
    reason: verified.ok ? "PROOF_VALID" : verified.reason,
    projectFingerprint: record.projectFingerprint,
    zeroProjectFootprint: true,
  };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `GEF W3 proof verify\nproofDigest: ${record.proofDigest}\nverified: ${verified.ok}\n`;
}

export function runGefProofPrune(options: AssuranceOptions = {}): string {
  const result = pruneProofStore({ dryRun: options.dryRun ?? false, maxEntries: options.maxEntries });
  const output = { ...result, zeroProjectFootprint: true };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `GEF W3 proof prune\npruned: ${result.pruned}\nkept: ${result.kept}\nretainedReferenced: ${result.retainedReferenced}\n`;
}
