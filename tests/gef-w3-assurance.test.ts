import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../src/gef/upir.js";
import { listCommandContracts } from "../src/gef/command-contract.js";
import { collectDiffFacts } from "../src/gef/git-facts.js";
import { validateImpactResult, type ImpactResult, type ImpactSelection } from "../src/gef/test-impact.js";
import { planAssurance, runAssurancePlan, verifyAssurancePlan } from "../src/gef/assurance-planner.js";
import { verifyProofDelta } from "../src/gef/proof-delta.js";
import { lookupProof, priorEntriesForProducer, storeProofRecord } from "../src/gef/proof-store.js";
import { buildProofRecord, type ProofRecord } from "../src/gef/proof-record.js";
import { buildWorkReceipt } from "../src/gef/command-receipt.js";
import { getCommandContract } from "../src/gef/command-contract.js";
import type { RunnerResult } from "../src/gef/command-runner.js";

const FINGERPRINT = "a".repeat(64);
const GIT_FACTS = "gef.work.git.facts";

type Fixture = { repo: string; home: string };

function commit(repo: string, message: string): void {
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", message], { cwd: repo });
}

function tempGitRepo(): Fixture {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w3-assurance-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w3-assurance.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "package.json"), `{\n  "name": "w3-assurance-fixture",\n  "version": "1.0.0"\n}\n`);
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "a.ts"), `export const a = 1;\n`);
  fs.writeFileSync(path.join(repo, "src", "b.ts"), `export const b = 1;\n`);
  commit(repo, "fixture");
  return { repo, home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w3-assurance-home-")) };
}

function selection(commandId: string, via: string[] = []): ImpactSelection {
  const contract = listCommandContracts(false).find((entry) => entry.id === commandId);
  if (!contract) throw new Error(`fixture contract missing: ${commandId}`);
  return { proofKey: commandId, commandId, proofType: commandId.includes(".test.") ? "TEST" : commandId.includes(".typecheck") ? "TYPECHECK" : commandId.includes(".build") ? "BUILD" : "STATIC", reason: "DIRECT_SOURCE_CHANGE", via };
}

function impactFor(input: {
  selected: ImpactSelection[];
  candidateDigest?: string | null;
  skipped?: Array<{ proofKey: string; reason: string }>;
  uncertainty?: string[];
  expansionState?: "NONE" | "IMPACT_EXPANSION_REQUIRED";
  minimumAssurance?: "A0" | "A1" | "A2";
}): ImpactResult {
  const withoutDigest = {
    schemaVersion: "0.1.0" as const,
    projectFingerprint: FINGERPRINT,
    taskId: "w3-assurance",
    candidateDigest: input.candidateDigest ?? "1".repeat(64),
    graphDigest: "2".repeat(64),
    graphState: "CURRENT" as const,
    changedPaths: ["src/a.ts"],
    impactedNodes: ["CHANGED:src/a.ts"],
    selected: input.selected,
    skipped: input.skipped ?? [],
    uncertainty: input.uncertainty ?? [],
    expansionState: input.expansionState ?? ("NONE" as const),
    minimumAssurance: input.minimumAssurance ?? ("A1" as const),
    limitations: ["REGISTERED_CONTRACTS_ONLY"],
  };
  const result: ImpactResult = { ...withoutDigest, impactDigest: canonicalDigest(withoutDigest) };
  expect(validateImpactResult(result)).toEqual([]);
  return result;
}

function planFor(fixture: Fixture, impact: ImpactResult) {
  return planAssurance({ taskId: "w3-assurance", projectFingerprint: FINGERPRINT, repoRoot: fixture.repo, impact, uadsHome: fixture.home });
}

function runFor(fixture: Fixture, impact: ImpactResult) {
  const { plan, prepared } = planFor(fixture, impact);
  return {
    plan,
    ...runAssurancePlan({
      plan,
      prepared,
      repoRoot: fixture.repo,
      projectFingerprint: FINGERPRINT,
      taskId: "w3-assurance",
      facts: collectDiffFacts(fixture.repo, FINGERPRINT),
      impact,
      uadsHome: fixture.home,
    }),
  };
}

function runnerResult(outcome: RunnerResult["outcome"]): RunnerResult {
  return {
    exitCode: outcome === "PASS" ? 0 : 1,
    signal: null,
    timedOut: outcome === "TIMEOUT",
    durationMs: 3,
    stdoutBytes: 1,
    stderrBytes: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    stdoutHead: "ok",
    stderrHead: "",
    outcome,
  };
}

// A record shaped exactly like the planner's expectation for gef.work.git.facts
// on this repo, used to plant prior outcomes (FAIL/TIMEOUT/dependencies).
function plantedRecord(fixture: Fixture, basis: ReturnType<typeof planFor>["prepared"][number]["basis"], outcome: RunnerResult["outcome"], dependsOn: string[] = []): ProofRecord {
  const contract = getCommandContract(GIT_FACTS);
  const receipt = buildWorkReceipt({
    projectFingerprint: FINGERPRINT,
    taskId: "w3-assurance",
    contract,
    validityFingerprint: "9".repeat(64),
    source: "EXECUTED",
    result: runnerResult(outcome),
  });
  void fixture;
  return buildProofRecord({
    projectFingerprint: FINGERPRINT,
    proofType: "STATIC",
    producerId: GIT_FACTS,
    basis,
    receipt,
    dependsOn,
    source: "EXECUTED",
    reasonCode: "EXECUTED_LOCAL",
  });
}

describe("GEF W3 assurance planner, execution and delta", () => {
  it("produces a deterministic plan and requires everything on a cold store", () => {
    const fixture = tempGitRepo();
    const impact = impactFor({ selected: [selection(GIT_FACTS, ["src/a.ts"])] });
    const first = planFor(fixture, impact);
    const second = planFor(fixture, impact);
    expect(first.plan.planDigest).toBe(second.plan.planDigest);
    expect(first.plan.required).toHaveLength(1);
    expect(first.plan.required[0]?.action).toBe("EXECUTE");
    expect(first.plan.required[0]?.reason).toBe("PROOF_INDEX_MISS");
    expect(first.plan.metrics.executeRequired).toBe(1);
    expect(first.plan.reusePolicy).toEqual({ passReuse: "EXACT_BASIS", failReuse: "DISABLED", transientReuse: "NEVER" });
    expect(verifyAssurancePlan(first.plan).ok).toBe(true);
  });

  it("executes once, then reuses the exact-compatible proof", () => {
    const fixture = tempGitRepo();
    const impact = impactFor({ selected: [selection(GIT_FACTS, ["src/a.ts"])] });
    const first = runFor(fixture, impact);
    expect(first.proofs).toHaveLength(1);
    expect(first.proofs[0]?.outcome).toBe("PASS");
    expect(first.proofs[0]?.source).toBe("EXECUTED");
    expect(first.delta.summary.new).toBe(1);

    const second = runFor(fixture, impact);
    expect(second.plan.required[0]?.action).toBe("REUSE");
    expect(second.plan.required[0]?.reason).toBe("VALIDITY_EXACT");
    expect(second.plan.required[0]?.proofDigest).toBe(first.proofs[0]?.proofDigest);
    expect(second.plan.required[0]?.validityFingerprint).toBe(first.proofs[0]?.validityFingerprint);
    expect(second.receipts).toHaveLength(0);
    expect(second.reused).toHaveLength(1);
    expect(second.reused[0]?.proofId).toBe(first.proofs[0]?.proofId);
    expect(second.reused[0]?.source).toBe("REUSED");
    expect(second.reused[0]?.proofDigest).not.toBe(first.proofs[0]?.proofDigest);
    expect(second.delta.summary.reused).toBe(1);
    // Reuse is attribution only: the executed record keeps its authority.
    expect(lookupProof({ proofType: "STATIC", validityFingerprint: first.proofs[0]?.validityFingerprint ?? "", projectFingerprint: FINGERPRINT, uadsHome: fixture.home }).status).toBe("HIT");
  });

  it("invalidates a prior proof when its scoped source bytes change", () => {
    const fixture = tempGitRepo();
    const impact = impactFor({ selected: [selection(GIT_FACTS, ["src/a.ts"])] });
    const first = runFor(fixture, impact);
    fs.writeFileSync(path.join(fixture.repo, "src", "a.ts"), `export const a = 2;\n`);
    const second = planFor(fixture, impact);
    expect(second.plan.required[0]?.action).toBe("EXECUTE");
    expect(second.plan.required[0]?.reason).toBe("SOURCE_DIGEST_CHANGED");
    expect(second.plan.invalidated).toEqual([{ proofKey: GIT_FACTS, reasonCode: "SOURCE_DIGEST_CHANGED", via: [first.proofs[0]?.proofDigest] }]);
    expect(second.plan.metrics.reuseCandidates).toBe(0);
    // The prior record is still intact and independently verifiable.
    expect(priorEntriesForProducer({ producerId: GIT_FACTS, projectFingerprint: FINGERPRINT, uadsHome: fixture.home })).toHaveLength(1);
  });

  it("does not invalidate an independent proof for an unrelated change", () => {
    const fixture = tempGitRepo();
    const impact = impactFor({ selected: [selection(GIT_FACTS, ["src/a.ts"])] });
    const first = runFor(fixture, impact);
    fs.writeFileSync(path.join(fixture.repo, "src", "b.ts"), `export const b = 2;\n`);
    const second = planFor(fixture, impact);
    expect(second.plan.required[0]?.action).toBe("REUSE");
    expect(second.plan.required[0]?.proofDigest).toBe(first.proofs[0]?.proofDigest);
    expect(second.plan.invalidated).toEqual([]);
  });

  it("keeps TIMEOUT and FAIL outcomes out of reuse", () => {
    const timeoutFixture = tempGitRepo();
    const timeoutImpact = impactFor({ selected: [selection(GIT_FACTS, ["src/a.ts"])] });
    const prepared = planFor(timeoutFixture, timeoutImpact).prepared[0];
    expect(prepared).toBeDefined();
    storeProofRecord(plantedRecord(timeoutFixture, prepared!.basis, "TIMEOUT"), prepared!.indexContext, timeoutFixture.home);
    const timeoutPlan = planFor(timeoutFixture, timeoutImpact);
    expect(timeoutPlan.plan.required[0]?.action).toBe("EXECUTE");
    expect(timeoutPlan.plan.required[0]?.reason).toBe("PRIOR_TRANSIENT_NOT_REUSABLE");

    const failFixture = tempGitRepo();
    const failPrepared = planFor(failFixture, timeoutImpact).prepared[0];
    storeProofRecord(plantedRecord(failFixture, failPrepared!.basis, "FAIL"), failPrepared!.indexContext, failFixture.home);
    const failPlan = planFor(failFixture, timeoutImpact);
    expect(failPlan.plan.required[0]?.action).toBe("EXECUTE");
    expect(failPlan.plan.required[0]?.reason).toBe("PRIOR_FAIL_NOT_REUSABLE");
    expect(failPlan.plan.reusePolicy.failReuse).toBe("DISABLED");
  });

  it("refuses reuse when a declared dependency proof is missing", () => {
    const fixture = tempGitRepo();
    const impact = impactFor({ selected: [selection(GIT_FACTS, ["src/a.ts"])] });
    const prepared = planFor(fixture, impact).prepared[0];
    storeProofRecord(plantedRecord(fixture, prepared!.basis, "PASS", ["d".repeat(64)]), prepared!.indexContext, fixture.home);
    const plan = planFor(fixture, impact);
    expect(plan.plan.required[0]?.action).toBe("EXECUTE");
    expect(plan.plan.required[0]?.reason).toBe("DEPENDENCY_MISSING");
    expect(plan.plan.invalidated[0]?.reasonCode).toBe("DEPENDENCY_MISSING");
  });

  it("never narrows assurance under uncertainty and drops unregistered proofs", () => {
    const fixture = tempGitRepo();
    const impact = impactFor({
      selected: [selection(GIT_FACTS, ["src/a.ts"]), { proofKey: "gef.work.unknown", commandId: "gef.work.unknown", proofType: "STATIC", reason: "DIRECT_SOURCE_CHANGE" }],
      uncertainty: ["GRAPH_EDGE_DRIFT"],
      expansionState: "IMPACT_EXPANSION_REQUIRED",
      minimumAssurance: "A0",
    });
    const { plan } = planFor(fixture, impact);
    expect(plan.required.map((entry) => entry.commandId)).toEqual([GIT_FACTS]);
    expect(plan.uncertainty).toContain("PLANNED_PROOF_WITHOUT_REGISTERED_CONTRACT");
    expect(plan.uncertainty).toContain("IMPACT_EXPANSION_REQUIRED");
    expect(plan.minimumAssurance).toBe("A2");
    expect(plan.limitations).toContain("A3_HOSTED_AND_A4_HEDS_EXTERNAL");
    for (const entry of plan.required) {
      expect(listCommandContracts(false).some((contract) => contract.id === entry.commandId)).toBe(true);
    }
  });

  it("records NEW, REUSED, INVALIDATED and NOT_APPLICABLE in one delta", () => {
    const fixture = tempGitRepo();
    const skipped = [{ proofKey: "gef.work.typecheck", reason: "NOT_IMPACTED" }];
    const impact = impactFor({ selected: [selection(GIT_FACTS, ["src/a.ts"])], skipped });
    const first = runFor(fixture, impact);
    expect(first.delta.entries.map((entry) => entry.status).sort()).toEqual(["NEW", "NOT_APPLICABLE"]);
    expect(verifyProofDelta(first.delta).ok).toBe(true);
    expect(first.delta.metrics.executedProofs).toBe(1);
    expect(first.delta.metrics.selectedProofs).toBe(1);

    const second = runFor(fixture, impact);
    expect(second.delta.entries.find((entry) => entry.proofKey === GIT_FACTS)?.status).toBe("REUSED");

    fs.writeFileSync(path.join(fixture.repo, "src", "a.ts"), `export const a = 3;\n`);
    const third = runFor(fixture, impact);
    const statuses = third.delta.entries.map((entry) => entry.status).sort();
    expect(statuses).toEqual(["INVALIDATED", "NEW", "NOT_APPLICABLE"]);
    expect(third.delta.summary).toMatchObject({ new: 1, reused: 0, invalidated: 1, notApplicable: 1 });
    expect(verifyProofDelta(third.delta).ok).toBe(true);
    // Duration is observation: the digest is stable for the same entries.
    const replay = verifyProofDelta({ ...third.delta, metrics: { ...third.delta.metrics, executionDurationMs: 999999 } });
    expect(replay.ok).toBe(true);
  });

  it("reports the reused proof only when its basis still matches", () => {
    const fixture = tempGitRepo();
    const impact = impactFor({ selected: [selection(GIT_FACTS, ["src/a.ts"])] });
    const first = runFor(fixture, impact);
    const record = first.proofs[0];
    expect(record).toBeDefined();
    const hit = lookupProof({ proofType: "STATIC", validityFingerprint: record!.validityFingerprint, projectFingerprint: FINGERPRINT, uadsHome: fixture.home });
    expect(hit.status).toBe("HIT");
    expect(hit.status === "HIT" ? hit.record.proofDigest : "").toBe(record!.proofDigest);
  });
});
