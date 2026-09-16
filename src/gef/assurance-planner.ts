import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest } from "./upir.js";
import { getCommandContract, proofTypeForContract, type CommandContract } from "./command-contract.js";
import { computeEnvClass, resolveCommandEnv, resolveToolchainBasis } from "./command-runner.js";
import type { WorkReceipt } from "./command-receipt.js";
import { runWorkCommand } from "./work-plane.js";
import { IMPACT_GRAPH_VERSION } from "./impact-graph.js";
import type { ImpactResult, ImpactSelection } from "./test-impact.js";
import type { DiffFacts } from "./git-facts.js";
import {
  buildProofRecord,
  computeProofValidityFingerprint,
  digestRepoFiles,
  proofBasisForContract,
  reissueReusedProof,
  type ProofRecord,
  type ProofType,
  type ProofValidityBasis,
} from "./proof-record.js";
import { loadProofRecord, lookupProof, priorEntriesForProducer, storeProofRecord, type ProofIndexContext } from "./proof-store.js";
import { basisClassDigests, invalidationReasonFor, type InvalidationReasonCode } from "./proof-dependency.js";
import { buildProofDelta, type ProofDelta, type ProofDeltaEntry } from "./proof-delta.js";

export const ASSURANCE_PLAN_SCHEMA_VERSION = "0.1.0" as const;
export const ASSURANCE_PLAN_SCHEMA_FILE = "gef-assurance-plan.schema.json" as const;
export const ASSURANCE_PLANNER_VERSION = "gef-assurance-planner/1.0.0" as const;

export type AssuranceAction = "REUSE" | "EXECUTE";
export type AssuranceLevel = "A0" | "A1" | "A2" | "A3" | "A4";

export type PlanEntry = {
  proof: string;
  proofKey: string;
  commandId: string;
  proofType: ProofType;
  action: AssuranceAction;
  reason: string;
  proofDigest?: string | null;
  validityFingerprint?: string | null;
  dependencyProofDigests?: string[];
};

export type AssurancePlan = {
  schemaVersion: typeof ASSURANCE_PLAN_SCHEMA_VERSION;
  projectFingerprint: string;
  taskId: string;
  candidateDigest: string | null;
  graphDigest: string | null;
  graphState: ImpactResult["graphState"];
  required: PlanEntry[];
  invalidated: Array<{ proofKey: string; reasonCode: string; via?: string[] }>;
  uncertainty: string[];
  minimumAssurance: AssuranceLevel;
  reusePolicy: { passReuse: "EXACT_BASIS"; failReuse: "DISABLED"; transientReuse: "NEVER" };
  limitations: string[];
  metrics: { selectedProofs: number; reuseCandidates: number; executeRequired: number; planningDurationMs: number };
  planDigest: string;
};

export type PreparedProof = { entry: PlanEntry; contract: CommandContract; basis: ProofValidityBasis; indexContext: ProofIndexContext };

export type PlanAssuranceInput = {
  taskId: string;
  projectFingerprint: string;
  repoRoot: string;
  impact: ImpactResult;
  graphVersion?: string;
  uadsHome?: string;
};

export function planDigestMaterial(plan: Omit<AssurancePlan, "planDigest">): Omit<AssurancePlan, "planDigest"> {
  // Planning duration is observation, not authority: an identical candidate,
  // graph and proof store must always produce the same plan digest. The digest
  // field itself is always excluded so a stored plan verifies against the same
  // material it was sealed with.
  const { planDigest: _omitted, ...rest } = plan as AssurancePlan;
  void _omitted;
  return { ...rest, metrics: { ...rest.metrics, planningDurationMs: 0 } };
}

// The proof scope is exactly the change surface that justified selecting the
// proof: the paths the impact engine reported plus the proof's own target. An
// unchanged scope reproduces the same fingerprint, which is what makes reuse a
// comparison of bytes rather than of intent.
function scopePathsFor(entry: ImpactSelection, contract: CommandContract): string[] {
  const target = proofTypeForContract(contract.id) === "TEST" || proofTypeForContract(contract.id) === "EVAL" ? contract.args[contract.args.length - 1] ?? "" : "";
  return [...new Set([...(entry.via ?? []), ...(target.length > 0 ? [target] : [])])].sort();
}

function dependencyCheck(input: { record: ProofRecord; projectFingerprint: string; uadsHome?: string }): { ok: true } | { ok: false; reason: InvalidationReasonCode } {
  for (const dependency of input.record.dependsOn) {
    let dependencyRecord: ProofRecord;
    try {
      dependencyRecord = loadProofRecord(dependency, input.uadsHome);
    } catch {
      return { ok: false, reason: "DEPENDENCY_MISSING" };
    }
    if (dependencyRecord.projectFingerprint !== input.projectFingerprint) return { ok: false, reason: "DEPENDENCY_MISSING" };
    if (dependencyRecord.outcome !== "PASS") return { ok: false, reason: "UPSTREAM_PROOF_INVALID" };
  }
  return { ok: true };
}

export function planAssurance(input: PlanAssuranceInput): { plan: AssurancePlan; prepared: PreparedProof[] } {
  const started = Date.now();
  const graphVersion = input.graphVersion ?? IMPACT_GRAPH_VERSION;
  const prepared: PreparedProof[] = [];
  const required: PlanEntry[] = [];
  const invalidated: Array<{ proofKey: string; reasonCode: string; via?: string[] }> = [];
  const uncertainty = new Set<string>(input.impact.uncertainty);
  const limitations = new Set<string>([...input.impact.limitations, "A3_HOSTED_AND_A4_HEDS_EXTERNAL"]);

  for (const selection of input.impact.selected) {
    let contract: CommandContract;
    try {
      contract = getCommandContract(selection.commandId);
    } catch {
      uncertainty.add("PLANNED_PROOF_WITHOUT_REGISTERED_CONTRACT");
      continue;
    }
    const proofType = proofTypeForContract(contract.id);
    const sourceDigests = digestRepoFiles(input.repoRoot, scopePathsFor(selection, contract));
    const configDigests = digestRepoFiles(input.repoRoot, contract.relevantFiles);
    const envClass = computeEnvClass(resolveCommandEnv(contract).semantic);
    const toolchain = resolveToolchainBasis(contract);
    const dependencyProofDigests: string[] = [];
    const basis = proofBasisForContract({
      projectFingerprint: input.projectFingerprint,
      commandId: contract.id,
      proofType,
      proofVersion: contract.version,
      contractDigest: contract.contractDigest,
      sourceDigests,
      configDigests,
      toolchain,
      envClass,
      graphVersion,
      dependencyProofDigests,
    });
    const validityFingerprint = computeProofValidityFingerprint(basis);
    const classes = basisClassDigests({ sourceDigests, configDigests });
    const indexContext: ProofIndexContext = {
      producerId: contract.id,
      sourceBasis: classes.sourceBasis,
      configBasis: classes.configBasis,
      toolchain,
      platform: process.platform,
      envClass,
      graphVersion,
    };

    const lookup = lookupProof({ proofType, validityFingerprint, projectFingerprint: input.projectFingerprint, uadsHome: input.uadsHome });
    let action: AssuranceAction = "EXECUTE";
    let reason = "NO_PRIOR_PROOF";
    let proofDigest: string | null = null;

    if (lookup.status === "HIT") {
      const prior = lookup.record;
      if (prior.outcome === "PASS") {
        const dependencies = dependencyCheck({ record: prior, projectFingerprint: input.projectFingerprint, uadsHome: input.uadsHome });
        if (dependencies.ok) {
          action = "REUSE";
          reason = "VALIDITY_EXACT";
          proofDigest = prior.proofDigest;
        } else {
          reason = dependencies.reason;
          invalidated.push({ proofKey: selection.proofKey, reasonCode: dependencies.reason, via: [prior.proofDigest] });
        }
      } else if (prior.outcome === "FAIL") {
        reason = "PRIOR_FAIL_NOT_REUSABLE";
        invalidated.push({ proofKey: selection.proofKey, reasonCode: "PRIOR_FAIL_NOT_REUSABLE", via: [prior.proofDigest] });
      } else {
        reason = "PRIOR_TRANSIENT_NOT_REUSABLE";
        invalidated.push({ proofKey: selection.proofKey, reasonCode: "PRIOR_TRANSIENT_NOT_REUSABLE", via: [prior.proofDigest] });
      }
    } else {
      const priorEntry = priorEntriesForProducer({ producerId: contract.id, projectFingerprint: input.projectFingerprint, uadsHome: input.uadsHome })[0];
      if (priorEntry) {
        const reasonCode = invalidationReasonFor({
          expected: { ...classes, toolchain, platform: process.platform, envClass, graphVersion },
          prior: {
            sourceBasis: priorEntry.sourceBasis ?? "",
            configBasis: priorEntry.configBasis ?? "",
            toolchain: priorEntry.toolchain ?? "",
            platform: priorEntry.platform ?? "",
            envClass: priorEntry.envClass ?? "",
            graphVersion: priorEntry.graphVersion ?? "",
          },
        });
        reason = reasonCode;
        invalidated.push({ proofKey: selection.proofKey, reasonCode, via: [priorEntry.proofDigest] });
      } else {
        reason = lookup.reason;
        if (lookup.reason !== "PROOF_INDEX_MISS" && lookup.reason !== "NO_PRIOR_PROOF") uncertainty.add(`PROOF_STORE_${lookup.reason}`);
      }
    }

    const entry: PlanEntry = {
      proof: contract.id,
      proofKey: selection.proofKey,
      commandId: contract.id,
      proofType,
      action,
      reason,
      proofDigest,
      validityFingerprint,
      dependencyProofDigests,
    };
    required.push(entry);
    prepared.push({ entry, contract, basis, indexContext });
  }

  required.sort((left, right) => (left.proofKey < right.proofKey ? -1 : left.proofKey > right.proofKey ? 1 : 0));
  const expansionRequired = input.impact.expansionState === "IMPACT_EXPANSION_REQUIRED";
  if (expansionRequired) uncertainty.add("IMPACT_EXPANSION_REQUIRED");
  const minimumAssurance: AssuranceLevel = uncertainty.size > 0 || invalidated.length > 0 ? "A2" : input.impact.minimumAssurance;
  const withoutDigest = {
    schemaVersion: ASSURANCE_PLAN_SCHEMA_VERSION,
    projectFingerprint: input.projectFingerprint,
    taskId: input.taskId,
    candidateDigest: input.impact.candidateDigest,
    graphDigest: input.impact.graphDigest,
    graphState: input.impact.graphState,
    required,
    invalidated: invalidated.sort((left, right) => (left.proofKey < right.proofKey ? -1 : 1)),
    uncertainty: [...uncertainty].sort(),
    minimumAssurance,
    reusePolicy: { passReuse: "EXACT_BASIS" as const, failReuse: "DISABLED" as const, transientReuse: "NEVER" as const },
    limitations: [...limitations].sort(),
    metrics: {
      selectedProofs: required.length,
      reuseCandidates: required.filter((entry) => entry.action === "REUSE").length,
      executeRequired: required.filter((entry) => entry.action === "EXECUTE").length,
      planningDurationMs: 0,
    },
  };
  const withDuration = { ...withoutDigest, metrics: { ...withoutDigest.metrics, planningDurationMs: Date.now() - started } };
  const plan: AssurancePlan = { ...withDuration, planDigest: canonicalDigest(planDigestMaterial(withDuration)) };
  assertSchema(ASSURANCE_PLAN_SCHEMA_FILE, plan, findPackageRoot());
  return { plan, prepared };
}

export function validateAssurancePlan(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(ASSURANCE_PLAN_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}

export function verifyAssurancePlan(data: unknown, expectedProjectFingerprint?: string): { ok: true; plan: AssurancePlan } | { ok: false; reason: string } {
  const errors = validateAssurancePlan(data);
  if (errors.length > 0) return { ok: false, reason: `PLAN_SCHEMA_INVALID:${errors[0] ?? "unknown"}` };
  const plan = data as AssurancePlan;
  if (expectedProjectFingerprint !== undefined && plan.projectFingerprint !== expectedProjectFingerprint) {
    return { ok: false, reason: "PLAN_PROJECT_MISMATCH" };
  }
  if (canonicalDigest(planDigestMaterial(plan)) !== plan.planDigest) return { ok: false, reason: "PLAN_DIGEST_MISMATCH" };
  return { ok: true, plan };
}

export type AssuranceRunResult = {
  plan: AssurancePlan;
  proofs: ProofRecord[];
  reused: ProofRecord[];
  receipts: WorkReceipt[];
  delta: ProofDelta;
};

export function runAssurancePlan(input: {
  plan: AssurancePlan;
  prepared: PreparedProof[];
  repoRoot: string;
  projectFingerprint: string;
  taskId: string;
  facts: DiffFacts;
  impact: ImpactResult;
  uadsHome?: string;
}): AssuranceRunResult {
  const started = Date.now();
  const executed: ProofRecord[] = [];
  const reused: ProofRecord[] = [];
  const receipts: WorkReceipt[] = [];
  const entries: ProofDeltaEntry[] = [];

  for (const preparedProof of input.prepared) {
    const { entry, contract, basis, indexContext } = preparedProof;
    if (entry.action === "REUSE" && entry.proofDigest) {
      const stored = loadProofRecord(entry.proofDigest, input.uadsHome);
      const attribution = reissueReusedProof(stored, "REUSE_EXACT_BASIS");
      reused.push(attribution);
      entries.push({
        proof: entry.proof,
        proofKey: entry.proofKey,
        status: "REUSED",
        reasonCode: "VALIDITY_EXACT",
        proofDigest: attribution.proofDigest,
        priorProofDigest: stored.proofDigest,
      });
      continue;
    }
    const ran = runWorkCommand({
      repoRoot: input.repoRoot,
      projectFingerprint: input.projectFingerprint,
      taskId: input.taskId,
      commandId: contract.id,
      facts: input.facts,
      uadsHome: input.uadsHome,
    });
    receipts.push(ran.receipt);
    const fromCache = ran.receipt.source === "CACHE_HIT";
    const record = buildProofRecord({
      projectFingerprint: input.projectFingerprint,
      proofType: entry.proofType,
      producerId: contract.id,
      producerVersion: contract.version,
      basis,
      receipt: ran.receipt,
      dependsOn: basis.dependencyProofDigests,
      source: fromCache ? "REUSED" : "EXECUTED",
      reasonCode: fromCache ? "COMMAND_CACHE_HIT" : "EXECUTED_LOCAL",
    });
    storeProofRecord(record, indexContext, input.uadsHome);
    if (fromCache) reused.push(record);
    else executed.push(record);
    entries.push({
      proof: entry.proof,
      proofKey: entry.proofKey,
      status: fromCache ? "REUSED" : "NEW",
      reasonCode: record.reasonCode,
      proofDigest: record.proofDigest,
      priorProofDigest: null,
    });
  }

  for (const item of input.plan.invalidated) {
    entries.push({ proof: item.proofKey, proofKey: item.proofKey, status: "INVALIDATED", reasonCode: item.reasonCode, proofDigest: null, priorProofDigest: item.via?.[0] ?? null });
  }
  for (const skipped of input.impact.skipped) {
    entries.push({ proof: skipped.proofKey, proofKey: skipped.proofKey, status: "NOT_APPLICABLE", reasonCode: skipped.reason, proofDigest: null, priorProofDigest: null });
  }

  const delta = buildProofDelta({
    projectFingerprint: input.projectFingerprint,
    taskId: input.taskId,
    candidateDigest: input.plan.candidateDigest,
    planDigest: input.plan.planDigest,
    entries,
    metrics: {
      impactedNodes: input.impact.impactedNodes.length,
      selectedProofs: input.plan.required.length,
      reusedProofs: reused.length,
      invalidatedProofs: input.plan.invalidated.length,
      executedProofs: executed.length,
      planningDurationMs: input.plan.metrics.planningDurationMs,
      executionDurationMs: Date.now() - started,
    },
  });
  return { plan: input.plan, proofs: [...executed, ...reused], reused, receipts, delta };
}
