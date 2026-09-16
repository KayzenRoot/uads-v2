import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCommandContract } from "../src/gef/command-contract.js";
import { sha256Hex } from "../src/lib/hash.js";
import { buildWorkReceipt, computeValidityFingerprint } from "../src/gef/command-receipt.js";
import type { RunnerResult } from "../src/gef/command-runner.js";
import {
  buildProofRecord,
  computeProofDigest,
  computeProofId,
  computeProofValidityFingerprint,
  isPositiveProofOutcome,
  reissueReusedProof,
  verifyProofRecord,
  type ProofRecord,
  type ProofValidityBasis,
} from "../src/gef/proof-record.js";
import {
  inspectProofStore,
  listProofIndexEntries,
  loadProofRecord,
  lookupProof,
  priorEntriesForProducer,
  proofIndexPath,
  pruneProofStore,
  storeProofRecord,
  type ProofIndexContext,
} from "../src/gef/proof-store.js";
import { buildProofDependencyGraph, detectProofCycles, invalidationReasonFor, transitiveInvalidation } from "../src/gef/proof-dependency.js";

const FINGERPRINT = "b".repeat(64);
const OTHER_FINGERPRINT = "c".repeat(64);

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w3-proof-"));
}

function runnerResult(outcome: RunnerResult["outcome"]): RunnerResult {
  return {
    exitCode: outcome === "PASS" ? 0 : 1,
    signal: null,
    timedOut: outcome === "TIMEOUT",
    durationMs: 7,
    stdoutBytes: 2,
    stderrBytes: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    stdoutHead: "ok",
    stderrHead: "",
    outcome,
  };
}

function basis(overrides: Partial<ProofValidityBasis> = {}): ProofValidityBasis {
  return {
    projectFingerprint: FINGERPRINT,
    proofType: "TEST",
    proofVersion: "1.0.0",
    producerId: "gef.work.test.w3.proof",
    producerDigest: "d".repeat(64),
    sourceDigests: [{ path: "src/gef/proof-record.ts", digest: "e".repeat(64) }],
    configDigests: [{ path: "package.json", digest: "f".repeat(64) }],
    toolchain: "node@v24",
    platform: process.platform,
    envClass: "1".repeat(64),
    graphVersion: "1.0.0",
    producerVersion: "gef-assurance/1.0.0",
    dependencyProofDigests: [],
    ...overrides,
  };
}

function receiptFor(outcome: RunnerResult["outcome"], projectFingerprint = FINGERPRINT): ReturnType<typeof buildWorkReceipt> {
  const contract = getCommandContract("gef.work.git.facts");
  return buildWorkReceipt({
    projectFingerprint,
    taskId: "w3-proof",
    contract,
    validityFingerprint: computeValidityFingerprint({
      projectFingerprint,
      contractDigest: contract.contractDigest,
      worktreeDigest: "2".repeat(64),
      lockDigest: "3".repeat(64),
      toolchain: "node@v24",
      platform: process.platform,
      envClass: "4".repeat(64),
    }),
    source: "EXECUTED",
    result: runnerResult(outcome),
  });
}

// `tag` gives each fixture its own proof identity: two records with the same
// basis would share a proofId by construction, which is the property under test
// elsewhere but would collapse distinct proofs here.
function recordFor(input: {
  outcome?: RunnerResult["outcome"];
  source?: "EXECUTED" | "REUSED";
  basisOverrides?: Partial<ProofValidityBasis>;
  dependsOn?: string[];
  tag?: string;
} = {}): ProofRecord {
  const contract = getCommandContract("gef.work.git.facts");
  const validityBasis = basis({
    producerId: contract.id,
    producerDigest: contract.contractDigest,
    envClass: input.tag === undefined ? basis().envClass : sha256Hex(input.tag),
    ...(input.basisOverrides ?? {}),
  });
  return buildProofRecord({
    projectFingerprint: FINGERPRINT,
    proofType: validityBasis.proofType,
    producerId: contract.id,
    basis: validityBasis,
    receipt: receiptFor(input.outcome ?? "PASS"),
    dependsOn: input.dependsOn ?? [],
    source: input.source ?? "EXECUTED",
    reasonCode: "EXECUTED_LOCAL",
  });
}

function indexContext(record: ProofRecord, overrides: Partial<ProofIndexContext> = {}): ProofIndexContext {
  return {
    producerId: record.producerId,
    sourceBasis: "5".repeat(64),
    configBasis: "6".repeat(64),
    toolchain: "node@v24",
    platform: process.platform,
    envClass: "1".repeat(64),
    graphVersion: "1.0.0",
    ...overrides,
  };
}

describe("GEF W3 proof validity, store and dependency", () => {
  it("binds the validity fingerprint to every basis component", () => {
    const base = basis();
    expect(computeProofValidityFingerprint(base)).toBe(computeProofValidityFingerprint(basis()));
    const variants: Array<Partial<ProofValidityBasis>> = [
      { projectFingerprint: OTHER_FINGERPRINT },
      { proofType: "TYPECHECK" },
      { proofVersion: "2.0.0" },
      { producerId: "gef.work.typecheck" },
      { producerDigest: "9".repeat(64) },
      { sourceDigests: [{ path: "src/gef/proof-record.ts", digest: "8".repeat(64) }] },
      { configDigests: [{ path: "package.json", digest: "7".repeat(64) }] },
      { toolchain: "node@v22" },
      { platform: process.platform === "win32" ? "linux" : "win32" },
      { envClass: "0".repeat(64) },
      { graphVersion: "2.0.0" },
      { dependencyProofDigests: ["a".repeat(64)] },
    ];
    const reference = computeProofValidityFingerprint(base);
    for (const variant of variants) {
      expect(computeProofValidityFingerprint(basis(variant))).not.toBe(reference);
    }
  });

  it("verifies proof records by digest and refuses tampering", () => {
    const record = recordFor();
    expect(verifyProofRecord(record, FINGERPRINT).ok).toBe(true);
    expect(verifyProofRecord({ ...record, outcome: "FAIL" })).toEqual({ ok: false, reason: "PROOF_DIGEST_MISMATCH" });
    // A recomputed digest around a forged identity is still refused: the proofId
    // must be reproducible from its own binding.
    const { proofDigest: _dropped, ...rest } = record;
    void _dropped;
    const forged = { ...rest, proofId: "a".repeat(64) };
    expect(verifyProofRecord({ ...forged, proofDigest: computeProofDigest(forged) })).toEqual({ ok: false, reason: "PROOF_ID_MISMATCH" });
    expect(verifyProofRecord(record, OTHER_FINGERPRINT)).toEqual({ ok: false, reason: "PROOF_PROJECT_MISMATCH" });
    expect(verifyProofRecord({ ...record, proofType: "NOT_A_TYPE" }).ok).toBe(false);
    expect(computeProofId({ projectFingerprint: record.projectFingerprint, producerId: record.producerId, validityFingerprint: record.validityFingerprint })).toBe(record.proofId);
  });

  it("treats reuse as attribution instead of mutating the stored record", () => {
    const record = recordFor();
    const attribution = reissueReusedProof(record, "REUSE_EXACT_BASIS");
    expect(attribution.proofId).toBe(record.proofId);
    expect(attribution.validityFingerprint).toBe(record.validityFingerprint);
    expect(attribution.source).toBe("REUSED");
    expect(attribution.proofDigest).not.toBe(record.proofDigest);
    expect(record.source).toBe("EXECUTED");
    expect(verifyProofRecord(attribution).ok).toBe(true);
    expect(() => reissueReusedProof(attribution, "REUSE_EXACT_BASIS")).toThrow("PROOF_REUSE_SOURCE_REJECTED");
  });

  it("stores, indexes and reloads content-addressed proofs", () => {
    const home = tempHome();
    const record = recordFor();
    const { recordPath, indexPath } = storeProofRecord(record, indexContext(record), home);
    expect(fs.existsSync(recordPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(indexPath).toBe(path.join(home, "gef", "proof-index", record.proofType, `${record.validityFingerprint}.json`));
    expect(loadProofRecord(record.proofDigest, home).proofDigest).toBe(record.proofDigest);

    const hit = lookupProof({ proofType: record.proofType, validityFingerprint: record.validityFingerprint, projectFingerprint: FINGERPRINT, uadsHome: home });
    expect(hit.status).toBe("HIT");
    const miss = lookupProof({ proofType: record.proofType, validityFingerprint: "9".repeat(64), projectFingerprint: FINGERPRINT, uadsHome: home });
    expect(miss).toEqual({ status: "MISS", reason: "PROOF_INDEX_MISS" });
    expect(priorEntriesForProducer({ producerId: record.producerId, projectFingerprint: FINGERPRINT, uadsHome: home })).toHaveLength(1);
  });

  it("never grants authority from a corrupt index or record", () => {
    const home = tempHome();
    const record = recordFor();
    storeProofRecord(record, indexContext(record), home);
    const indexPath = proofIndexPath(record.proofType, record.validityFingerprint, home);

    fs.writeFileSync(indexPath, "{ not json\n");
    expect(lookupProof({ proofType: record.proofType, validityFingerprint: record.validityFingerprint, projectFingerprint: FINGERPRINT, uadsHome: home })).toEqual({
      status: "MISS",
      reason: "PROOF_INDEX_CORRUPT",
    });

    storeProofRecord(record, indexContext(record), home);
    fs.writeFileSync(path.join(home, "gef", "proofs", `${record.proofDigest}.json`), `${JSON.stringify({ ...record, outcome: "PASS", proofDigest: "0".repeat(64) })}\n`);
    const corruptRecord = lookupProof({ proofType: record.proofType, validityFingerprint: record.validityFingerprint, projectFingerprint: FINGERPRINT, uadsHome: home });
    expect(corruptRecord.status).toBe("MISS");
    expect(corruptRecord.status === "MISS" ? corruptRecord.reason : "").toMatch(/^PROOF_RECORD_INVALID/);
  });

  it("rejects cross-project proof replay", () => {
    const home = tempHome();
    const record = recordFor();
    storeProofRecord(record, indexContext(record), home);
    // A forged index that claims another project's fingerprint grants nothing.
    const indexPath = proofIndexPath(record.proofType, record.validityFingerprint, home);
    const entry = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(indexPath, `${JSON.stringify({ ...entry, projectFingerprint: OTHER_FINGERPRINT })}\n`);
    expect(lookupProof({ proofType: record.proofType, validityFingerprint: record.validityFingerprint, projectFingerprint: FINGERPRINT, uadsHome: home })).toEqual({
      status: "MISS",
      reason: "PROOF_PROJECT_MISMATCH",
    });
  });

  it("keeps transient outcomes out of positive assurance", () => {
    expect(isPositiveProofOutcome("PASS")).toBe(true);
    expect(isPositiveProofOutcome("FAIL")).toBe(true);
    expect(isPositiveProofOutcome("TIMEOUT")).toBe(false);
    expect(isPositiveProofOutcome("ERROR")).toBe(false);
    const timeout = recordFor({ outcome: "TIMEOUT" });
    expect(timeout.outcome).toBe("TIMEOUT");
    expect(verifyProofRecord(timeout).ok).toBe(true);
  });

  it("refuses a proof whose producer does not match its receipt", () => {
    const contract = getCommandContract("gef.work.git.facts");
    expect(() =>
      buildProofRecord({
        projectFingerprint: FINGERPRINT,
        proofType: "TEST",
        producerId: "gef.work.typecheck",
        basis: basis({ producerId: "gef.work.typecheck" }),
        receipt: receiptFor("PASS"),
        source: "EXECUTED",
        reasonCode: "EXECUTED_LOCAL",
      }),
    ).toThrow("PROOF_RECEIPT_PRODUCER_MISMATCH");
    void contract;
  });

  it("detects dependency cycles and collapses them conservatively", () => {
    const a = recordFor({ tag: "a" });
    const b = recordFor({ tag: "b", dependsOn: [a.proofId] });
    const cyclicA = recordFor({ tag: "a", dependsOn: [b.proofId] });
    expect(cyclicA.proofId).toBe(a.proofId);
    const graph = buildProofDependencyGraph([cyclicA, b]);
    expect(graph.cycles.length).toBe(1);
    expect(graph.collapsed.sort()).toEqual([cyclicA.proofId, b.proofId].sort());
    expect(detectProofCycles([cyclicA, b])[0]?.length).toBe(2);

    const outcomes = transitiveInvalidation({ records: [cyclicA, b], directlyInvalidated: new Map() }).outcomes;
    for (const outcome of outcomes) {
      expect(outcome.reusable).toBe(false);
      expect(outcome.reasonCode).toBe("PROOF_CYCLE_COLLAPSED");
    }
  });

  it("invalidates dependents transitively and fails closed on missing dependencies", () => {
    const upstream = recordFor({ tag: "u" });
    const middle = recordFor({ tag: "m", dependsOn: [upstream.proofId] });
    const leaf = recordFor({ tag: "l", dependsOn: [middle.proofId] });
    const orphan = recordFor({ tag: "o", dependsOn: ["d".repeat(64)] });

    const invalidated = transitiveInvalidation({
      records: [upstream, middle, leaf, orphan],
      directlyInvalidated: new Map([[upstream.proofId, { reasonCode: "SOURCE_DIGEST_CHANGED", via: ["src/gef/proof-record.ts"] }]]),
    });
    const byId = new Map(invalidated.outcomes.map((outcome) => [outcome.proofId, outcome]));
    expect(byId.get(upstream.proofId)?.reasonCode).toBe("SOURCE_DIGEST_CHANGED");
    expect(byId.get(middle.proofId)).toMatchObject({ reusable: false, reasonCode: "UPSTREAM_PROOF_INVALID" });
    expect(byId.get(leaf.proofId)).toMatchObject({ reusable: false, reasonCode: "UPSTREAM_PROOF_INVALID" });
    expect(byId.get(orphan.proofId)).toMatchObject({ reusable: false, reasonCode: "DEPENDENCY_MISSING" });
  });

  it("names the drifted basis class when a prior proof no longer matches", () => {
    const expected = { sourceBasis: "a".repeat(64), configBasis: "b".repeat(64), toolchain: "node@v24", platform: "win32", envClass: "c".repeat(64), graphVersion: "1.0.0" };
    expect(invalidationReasonFor({ expected, prior: { ...expected, sourceBasis: "z".repeat(64) } })).toBe("SOURCE_DIGEST_CHANGED");
    expect(invalidationReasonFor({ expected, prior: { ...expected, configBasis: "z".repeat(64) } })).toBe("CONFIG_CHANGED");
    expect(invalidationReasonFor({ expected, prior: { ...expected, toolchain: "node@v22" } })).toBe("TOOLCHAIN_CHANGED");
    expect(invalidationReasonFor({ expected, prior: { ...expected, platform: "linux" } })).toBe("PLATFORM_CHANGED");
    expect(invalidationReasonFor({ expected, prior: { ...expected, envClass: "z".repeat(64) } })).toBe("ENV_CLASS_CHANGED");
    expect(invalidationReasonFor({ expected, prior: { ...expected, graphVersion: "2.0.0" } })).toBe("GRAPH_STALE");
    expect(invalidationReasonFor({ expected, prior: expected })).toBe("BASIS_MISMATCH");
  });

  it("prunes only unreferenced proofs and keeps indexed ones", () => {
    const home = tempHome();
    const referenced = recordFor();
    storeProofRecord(referenced, indexContext(referenced), home);
    const orphanA = recordFor({ basisOverrides: { envClass: "a".repeat(64) } });
    const orphanB = recordFor({ basisOverrides: { envClass: "b".repeat(64) } });
    storeProofRecord(orphanA, indexContext(orphanA), home);
    storeProofRecord(orphanB, indexContext(orphanB), home);
    // Drop the index entries for the orphans so only the records remain.
    for (const record of [orphanA, orphanB]) {
      fs.rmSync(proofIndexPath(record.proofType, record.validityFingerprint, home));
    }
    const before = inspectProofStore(home);
    expect(before).toMatchObject({ records: 3, indexes: 1, referenced: 1, orphans: 2 });

    const dryRun = pruneProofStore({ maxEntries: 1, dryRun: true, uadsHome: home });
    expect(dryRun).toMatchObject({ pruned: 1, retainedReferenced: 1, dryRun: true });
    expect(fs.existsSync(path.join(home, "gef", "proofs", `${orphanA.proofDigest}.json`))).toBe(true);

    const pruned = pruneProofStore({ maxEntries: 1, uadsHome: home });
    expect(pruned.pruned).toBe(1);
    expect(pruned.retainedReferenced).toBe(1);
    expect(fs.existsSync(path.join(home, "gef", "proofs", `${referenced.proofDigest}.json`))).toBe(true);
    expect(listProofIndexEntries(home)).toHaveLength(1);
  });
});
