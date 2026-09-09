import fs from "node:fs";
import { readJsonIfValid } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import type { UadsPaths } from "../lib/workspace.js";
import { isCacheRecordSemanticallyValid, validateCacheReuseEvidence } from "./cache-integrity.js";
import { cachePaths } from "./cache-persist.js";
import { buildValidityBasis } from "./failure-memory.js";
import type { CacheDecision, CacheDecisionKind, EvidenceCacheRecord } from "./cache-types.js";
import { CACHE_SCHEMA_VERSION } from "./cache-types.js";
import {
  CACHE_POLICY_IDENTITY,
  collectEnvironmentIdentity,
  isCacheEligibleGate,
  MANIFEST_BASIS_PATHS,
  normalizeCommandIdentity,
  reuseClassForGate,
} from "./cache-policy.js";
import {
  listCacheRecordIdsForGate,
  markCacheRecordStatus,
  persistCacheDecision,
  persistEvidenceCacheRecord,
  readEvidenceCacheIndex,
  readEvidenceCacheRecord,
} from "./cache-persist.js";
import type { EvidenceRecord, ExecutionRun, GateStateSnapshot } from "./execution-types.js";
import { persistEvidenceRecord } from "./execution-persist.js";
import { gateDef } from "./gates.js";
import {
  buildGateReuseContract,
  computeReuseProofDigest,
  deriveNormalizedCommandFromMap,
  resolveToolchainIdentity,
} from "./gate-reuse-contract.js";
import { newPrefixedId } from "./ids.js";
import type { IndexBundle } from "./intelligence-types.js";
import type { RepositoryMap } from "./types.js";

const CONFIGURE_EDGE_TYPES = new Set(["configures", "manifest-reference"]);
const CONFIG_FILE_NAMES = [
  "vitest.config.ts",
  "vitest.config.js",
  "vitest.config.mts",
  "jest.config.js",
  "jest.config.ts",
  "jest.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  "webpack.config.js",
  "babel.config.js",
  "eslint.config.js",
  ".eslintrc.json",
  "foundry.toml",
  "hardhat.config.ts",
  "hardhat.config.js",
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function toolIdentityMatches(stored: Record<string, string>, live: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(stored), ...Object.keys(live)]);
  for (const key of keys) {
    if (stored[key] !== live[key]) {
      return false;
    }
  }
  return keys.size > 0;
}

function configPathsFromBundle(bundle: IndexBundle): string[] {
  return bundle.state.files
    .map((file) => file.path)
    .filter((pathName) => CONFIG_FILE_NAMES.some((name) => pathName === name || pathName.endsWith(`/${name}`)));
}

function compareDigestMap(
  stored: Record<string, string>,
  live: Record<string, string>,
  prefix: string,
): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(stored), ...Object.keys(live)]);
  for (const key of keys) {
    if (stored[key] !== live[key]) {
      changed.push(`${prefix}:${key}`);
    }
  }
  return changed.sort((a, b) => a.localeCompare(b));
}

function compareCandidateValidity(
  record: EvidenceCacheRecord,
  bundle: IndexBundle,
): { changed: string[]; liveBasisDigests: Record<string, string> } {
  const changed: string[] = [];
  const configPaths = configPathsFromBundle(bundle);
  const unionPaths = new Set([...record.validityBasisPaths, ...configPaths]);
  const liveBasisDigests: Record<string, string> = {};
  for (const relative of unionPaths) {
    const current = bundle.state.files.find((file) => file.path === relative)?.contentDigest;
    if (!current) {
      if (record.validityBasisDigests[relative]) {
        changed.push(`basis:${relative}`);
      }
      continue;
    }
    liveBasisDigests[relative] = current;
    const stored = record.validityBasisDigests[relative];
    if (stored && stored !== current) {
      changed.push(`basis:${relative}`);
    }
    if (!stored && configPaths.includes(relative)) {
      changed.push(`basis:${relative}`);
    }
  }
  return { changed, liveBasisDigests };
}

export function manifestDigestsFromBundle(bundle: IndexBundle): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const relative of MANIFEST_BASIS_PATHS) {
    const file = bundle.state.files.find((item) => item.path === relative);
    if (file) {
      digests[relative] = file.contentDigest;
    }
  }
  return digests;
}

export function buildCacheValidityBasis(
  bundle: IndexBundle,
  seedPaths: string[],
): { paths: string[]; digests: Record<string, string>; manifests: Record<string, string> } {
  const seeds = [...seedPaths, ...MANIFEST_BASIS_PATHS];
  const basis = buildValidityBasis(bundle, seeds);
  const extraPaths = new Set<string>();

  for (const seed of basis.paths) {
    for (const edge of bundle.graph.edges) {
      if (!CONFIGURE_EDGE_TYPES.has(edge.type)) {
        continue;
      }
      if (edge.source === seed) {
        extraPaths.add(edge.target);
      }
      if (edge.target === seed) {
        extraPaths.add(edge.source);
      }
    }
  }

  for (const file of bundle.state.files) {
    if (CONFIG_FILE_NAMES.some((name) => file.path === name || file.path.endsWith(`/${name}`))) {
      extraPaths.add(file.path);
    }
  }

  const mergedPaths = [...new Set([...basis.paths, ...extraPaths])].sort((a, b) => a.localeCompare(b));
  const digests: Record<string, string> = {};
  for (const filePath of mergedPaths) {
    const digest = bundle.state.files.find((file) => file.path === filePath)?.contentDigest;
    if (digest) {
      digests[filePath] = digest;
    }
  }

  return {
    paths: Object.keys(digests),
    digests,
    manifests: manifestDigestsFromBundle(bundle),
  };
}

export function indexIsReusable(bundle: IndexBundle): boolean {
  return bundle.state.complete && !bundle.state.truncated && !bundle.state.stale;
}

function listCandidatesForGate(
  paths: UadsPaths,
  projectId: string,
  gateId: string,
  schemaRoot?: string,
): EvidenceCacheRecord[] {
  const ids = listCacheRecordIdsForGate(paths, projectId, gateId);
  const records: EvidenceCacheRecord[] = [];
  for (const id of ids) {
    const record = readEvidenceCacheRecord(paths, id, schemaRoot);
    if (record) {
      records.push(record);
    }
  }
  return records.sort((a, b) => {
    const timeCmp = b.createdAt.localeCompare(a.createdAt);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    return b.cacheRecordId.localeCompare(a.cacheRecordId);
  });
}

function decideKind(input: {
  eligible: boolean;
  blocked: boolean;
  candidate: EvidenceCacheRecord | null;
  changed: string[];
  contractUnprovable: boolean;
  toolchainUnprovable: boolean;
  allCandidatesStale: boolean;
}): CacheDecisionKind {
  if (input.blocked) return "BLOCKED";
  if (!input.eligible) return "NOT_REUSABLE";
  if (input.contractUnprovable || input.toolchainUnprovable) return "NOT_REUSABLE";
  if (input.allCandidatesStale && input.changed.length > 0) return "STALE";
  if (!input.candidate) return "MISS";
  if (input.changed.length > 0) return "STALE";
  return "HIT";
}

function readRepositoryMap(paths: UadsPaths): RepositoryMap | null {
  const parsed = readJsonIfValid<RepositoryMap>(paths.repositoryMap);
  return parsed.ok ? parsed.value : null;
}

function evaluateCandidate(input: {
  record: EvidenceCacheRecord;
  projectId: string;
  gateId: string;
  bundle: IndexBundle;
  contract: ReturnType<typeof buildGateReuseContract>;
  liveToolchain: Record<string, string>;
  liveEnv: string | null;
  liveManifests: Record<string, string>;
}): { changed: string[]; semanticallyValid: boolean; reuseProofDigest: string | null } {
  const changed: string[] = [];
  if (!isCacheRecordSemanticallyValid(input.record)) {
    return { changed: ["semantic-invalid"], semanticallyValid: false, reuseProofDigest: null };
  }
  if (input.record.projectId !== input.projectId) {
    return { changed: ["cross-project"], semanticallyValid: false, reuseProofDigest: null };
  }
  if (input.record.gateId !== input.gateId) {
    return { changed: ["gateId"], semanticallyValid: false, reuseProofDigest: null };
  }

  if (input.contract.contractKind === "command" && !input.contract.derivable) {
    return { changed: ["gateContractUnprovable"], semanticallyValid: false, reuseProofDigest: null };
  }

  if (input.record.gateReuseContractIdentity !== input.contract.gateReuseContractIdentity) {
    changed.push("gateReuseContractIdentity");
  }
  if (input.record.policyIdentity !== CACHE_POLICY_IDENTITY) {
    changed.push("policyIdentity");
  }
  if (!toolIdentityMatches(input.record.toolIdentity, input.liveToolchain)) {
    changed.push("toolIdentity");
  }
  if (input.record.environmentIdentity !== input.liveEnv) {
    changed.push("environmentIdentity");
  }

  const validity = compareCandidateValidity(input.record, input.bundle);
  changed.push(...validity.changed);
  changed.push(...compareDigestMap(input.record.manifestDigests, input.liveManifests, "manifest"));

  const liveProof = computeReuseProofDigest({
    projectId: input.projectId,
    gateReuseContractIdentity: input.contract.gateReuseContractIdentity,
    normalizedCommandIdentity: input.contract.normalizedCommandIdentity,
    validityBasisDigests: validity.liveBasisDigests,
    manifestDigests: input.liveManifests,
    toolIdentity: input.liveToolchain,
    environmentIdentity: input.liveEnv,
    policyIdentity: CACHE_POLICY_IDENTITY,
  });

  if (input.record.reuseProofDigest !== liveProof) {
    changed.push("reuseProofDigest");
  }

  return {
    changed: [...new Set(changed)],
    semanticallyValid: true,
    reuseProofDigest: liveProof,
  };
}

export function evaluateCache(input: {
  paths: UadsPaths;
  projectId: string;
  gateId: string;
  workOrderId?: string | null;
  executionRunId?: string | null;
  liveChangeDigest?: string | null;
  bundle: IndexBundle | null;
  repoRoot?: string | null;
  repositoryMap?: RepositoryMap | null;
  persistDecision?: boolean;
  schemaRoot?: string;
}): CacheDecision {
  const createdAt = nowIso();
  const eligible = isCacheEligibleGate(input.gateId);
  const reasonCodes: string[] = [];
  let changed: string[] = [];
  let candidate: EvidenceCacheRecord | null = null;
  let blocked = false;
  let contractUnprovable = false;
  let toolchainUnprovable = false;
  let reuseProofDigest: string | null = null;

  if (!eligible) {
    reasonCodes.push("GATE_NOT_REUSABLE");
  }
  if (!input.bundle || !indexIsReusable(input.bundle)) {
    blocked = eligible;
    reasonCodes.push(input.bundle ? "INDEX_NOT_REUSABLE" : "INDEX_UNAVAILABLE");
  } else if (input.bundle.state.projectId !== input.projectId) {
    blocked = true;
    reasonCodes.push("CROSS_PROJECT");
  }

  const index = readEvidenceCacheIndex(input.paths, input.projectId);
  if (eligible && !index) {
    blocked = true;
    reasonCodes.push("CACHE_INDEX_CORRUPT");
  }

  const map = input.repositoryMap ?? readRepositoryMap(input.paths);
  const contract = buildGateReuseContract(input.gateId, map);
  if (eligible && contract.contractKind === "command" && !contract.derivable) {
    contractUnprovable = true;
    reasonCodes.push("GATE_CONTRACT_UNPROVABLE");
  }

  const repoRoot = input.repoRoot ?? process.cwd();
  const toolchainResult = resolveToolchainIdentity(repoRoot, contract.normalizedCommandIdentity, input.bundle);
  const liveToolchain = toolchainResult.identity;
  if (eligible && contract.contractKind === "command" && !toolchainResult.provable) {
    toolchainUnprovable = true;
    reasonCodes.push("TOOLCHAIN_UNPROVABLE");
    for (const code of toolchainResult.reasonCodes) {
      if (code !== "TOOLCHAIN_UNPROVABLE") {
        reasonCodes.push(code);
      }
    }
  }
  const liveEnv = collectEnvironmentIdentity(input.gateId);
  const liveManifests = input.bundle ? manifestDigestsFromBundle(input.bundle) : {};
  const bundle = input.bundle;

  if (eligible && !blocked && !contractUnprovable && !toolchainUnprovable && index && bundle) {
    const candidates = listCandidatesForGate(input.paths, input.projectId, input.gateId, input.schemaRoot);
    let sawCorrupt = false;
    let sawStale = false;
    let lastStaleChanged: string[] = [];

    for (const record of candidates) {
      if (record.projectId !== input.projectId) {
        blocked = true;
        reasonCodes.push("CROSS_PROJECT");
        candidate = record;
        break;
      }

      const evaluation = evaluateCandidate({
        record,
        projectId: input.projectId,
        gateId: input.gateId,
        bundle,
        contract,
        liveToolchain,
        liveEnv,
        liveManifests,
      });

      if (!evaluation.semanticallyValid) {
        if (evaluation.changed.includes("cross-project")) {
          blocked = true;
          candidate = record;
          break;
        }
        continue;
      }

      if (evaluation.changed.length === 0 && evaluation.reuseProofDigest) {
        candidate = record;
        changed = [];
        reuseProofDigest = evaluation.reuseProofDigest;
        break;
      }

      sawStale = true;
      lastStaleChanged = evaluation.changed;
      markCacheRecordStatus(
        input.paths,
        record.cacheRecordId,
        "stale",
        evaluation.changed.join(","),
        input.schemaRoot,
      );
    }

    if (!candidate && sawStale) {
      changed = lastStaleChanged;
    }

    if (!candidate && candidates.length > 0 && !blocked) {
      if (sawStale) {
        reasonCodes.push("ALL_CANDIDATES_STALE");
      } else {
        reasonCodes.push("NO_VALID_CANDIDATE");
      }
    } else if (!candidate && candidates.length === 0) {
      reasonCodes.push("NO_CANDIDATE");
    }

    if (!candidate && sawCorrupt) {
      blocked = true;
      reasonCodes.push("CACHE_RECORD_CORRUPT");
    }
  }

  const decision = decideKind({
    eligible,
    blocked,
    candidate,
    changed,
    contractUnprovable,
    toolchainUnprovable,
    allCandidatesStale: !candidate && changed.length > 0,
  });
  if (decision === "HIT") {
    reasonCodes.push("VALIDITY_BASIS_MATCH");
    reasonCodes.push("GATE_CONTRACT_MATCH");
  } else if (decision === "STALE") {
    reasonCodes.push("VALIDITY_BASIS_CHANGED");
  }

  const uniqueReasons = [...new Set(reasonCodes)];
  const uniqueChanged = [...new Set(changed)].sort((a, b) => a.localeCompare(b));
  const result: CacheDecision = {
    schema: "uads.cache-decision",
    schemaVersion: CACHE_SCHEMA_VERSION,
    cacheDecisionId: newPrefixedId(
      "cd",
      `${input.projectId}:${input.gateId}:${input.liveChangeDigest ?? ""}:${createdAt}:${decision}`,
    ),
    projectId: input.projectId,
    workOrderId: input.workOrderId ?? null,
    executionRunId: input.executionRunId ?? null,
    gateId: input.gateId,
    candidateCacheRecordId: candidate?.cacheRecordId ?? null,
    decision,
    reasonCodes: uniqueReasons,
    changedValidityInputs: uniqueChanged,
    executionRequired: decision !== "HIT",
    maySatisfyGate: decision === "HIT",
    liveChangeDigest: input.liveChangeDigest ?? null,
    indexDigest: input.bundle?.state.indexDigest ?? null,
    gateReuseContractIdentity: contract.gateReuseContractIdentity,
    reuseProofDigest: decision === "HIT" ? reuseProofDigest : null,
    createdAt,
  };
  if (input.persistDecision !== false) {
    try {
      persistCacheDecision(input.paths, result, input.schemaRoot);
    } catch {
      // Explainability write must not corrupt the authoritative execution path.
    }
  }
  return result;
}

export function populateCacheFromEvidence(input: {
  paths: UadsPaths;
  repoRoot: string;
  run: ExecutionRun;
  record: EvidenceRecord;
  bundle: IndexBundle;
  repositoryMap?: RepositoryMap | null;
  schemaRoot?: string;
}): EvidenceCacheRecord | null {
  if (input.record.status !== "PASS" || input.record.projectId !== input.run.projectId) {
    return null;
  }
  const def = gateDef(input.record.gateId);
  if (!def) {
    return null;
  }
  const reuseClass = reuseClassForGate(input.record.gateId);
  if (reuseClass !== "eligible") {
    return null;
  }
  if (input.record.kind === "command" && (!input.record.command || !input.record.outputDigest || input.record.exitCode !== 0)) {
    return null;
  }
  if (!def.allowedEvidenceKinds.includes(input.record.kind)) {
    return null;
  }
  if (!indexIsReusable(input.bundle) || input.bundle.state.projectId !== input.run.projectId) {
    return null;
  }

  const map = input.repositoryMap ?? readRepositoryMap(input.paths);
  const contract = buildGateReuseContract(input.record.gateId, map);
  const normalizedCommand = normalizeCommandIdentity(input.record.command);
  if (contract.contractKind === "command") {
    if (!normalizedCommand || !contract.derivable) {
      return null;
    }
    if (normalizedCommand !== contract.normalizedCommandIdentity) {
      return null;
    }
  }

  const basis = buildCacheValidityBasis(input.bundle, input.run.changedFiles);
  const toolchainResult = resolveToolchainIdentity(input.repoRoot, normalizedCommand, input.bundle);
  if (contract.contractKind === "command" && !toolchainResult.provable) {
    return null;
  }
  const toolchain = toolchainResult.identity;
  const environmentIdentity = collectEnvironmentIdentity(input.record.gateId);
  const gateReuseContractIdentity = contract.gateReuseContractIdentity;
  const reuseProofDigest = computeReuseProofDigest({
    projectId: input.run.projectId,
    gateReuseContractIdentity,
    normalizedCommandIdentity: contract.normalizedCommandIdentity,
    validityBasisDigests: basis.digests,
    manifestDigests: basis.manifests,
    toolIdentity: toolchain,
    environmentIdentity,
    policyIdentity: CACHE_POLICY_IDENTITY,
  });

  const createdAt = nowIso();
  const cacheRecord: EvidenceCacheRecord = {
    schema: "uads.evidence-cache-record",
    schemaVersion: CACHE_SCHEMA_VERSION,
    cacheRecordId: newPrefixedId(
      "ecr",
      `${input.run.projectId}:${input.record.gateId}:${input.record.outputDigest ?? input.record.fileDigest ?? createdAt}`,
    ),
    projectId: input.run.projectId,
    originatingWorkOrderId: input.record.workOrderId,
    originatingExecutionRunId: input.record.executionRunId,
    gateId: input.record.gateId,
    evidenceId: input.record.evidenceId,
    evidenceStatus: "PASS",
    evidenceKind: input.record.kind === "review" ? "command" : input.record.kind,
    originatingChangeDigest: input.record.changeDigest,
    command: normalizedCommand,
    gateReuseContractIdentity,
    reuseProofDigest,
    toolIdentity: toolchain,
    environmentIdentity,
    validityBasisPaths: basis.paths,
    validityBasisDigests: basis.digests,
    manifestDigests: basis.manifests,
    indexDigest: input.bundle.state.indexDigest,
    policyIdentity: CACHE_POLICY_IDENTITY,
    outputDigest: input.record.outputDigest ?? null,
    fileDigest: input.record.fileDigest ?? null,
    createdAt,
    reuseClass,
    reusable: true,
    status: "reusable",
    invalidationReason: null,
  };
  return persistEvidenceCacheRecord(input.paths, cacheRecord, input.schemaRoot);
}

export function applyEligibleCacheHits(input: {
  paths: UadsPaths;
  repoRoot: string;
  run: ExecutionRun;
  bundle: IndexBundle | null;
  gateStates: GateStateSnapshot[];
  repositoryMap?: RepositoryMap | null;
  schemaRoot?: string;
}): { applied: EvidenceRecord[]; decisions: CacheDecision[] } {
  const applied: EvidenceRecord[] = [];
  const decisions: CacheDecision[] = [];
  const map = input.repositoryMap ?? readRepositoryMap(input.paths);

  for (const gate of input.run.selectedGates) {
    if (!isCacheEligibleGate(gate)) {
      const decision = evaluateCache({
        paths: input.paths,
        projectId: input.run.projectId,
        gateId: gate,
        workOrderId: input.run.workOrderId,
        executionRunId: input.run.executionRunId,
        liveChangeDigest: input.run.currentChangeDigest,
        bundle: input.bundle,
        repoRoot: input.repoRoot,
        repositoryMap: map,
        schemaRoot: input.schemaRoot,
      });
      decisions.push(decision);
      continue;
    }
    const current = input.gateStates.find((item) => item.gateId === gate);
    if (current && (current.status === "FAIL" || current.status === "BLOCKED" || current.status === "PASS")) {
      continue;
    }
    const decision = evaluateCache({
      paths: input.paths,
      projectId: input.run.projectId,
      gateId: gate,
      workOrderId: input.run.workOrderId,
      executionRunId: input.run.executionRunId,
      liveChangeDigest: input.run.currentChangeDigest,
      bundle: input.bundle,
      repoRoot: input.repoRoot,
      repositoryMap: map,
      schemaRoot: input.schemaRoot,
    });
    decisions.push(decision);
    if (decision.decision !== "HIT" || !decision.candidateCacheRecordId || !input.run.currentChangeDigest) {
      continue;
    }
    if (!decision.reuseProofDigest || !decision.gateReuseContractIdentity) {
      continue;
    }
    const cacheRecord = readEvidenceCacheRecord(input.paths, decision.candidateCacheRecordId, input.schemaRoot);
    if (!cacheRecord || cacheRecord.projectId !== input.run.projectId || !isCacheRecordSemanticallyValid(cacheRecord)) {
      continue;
    }
    if (cacheRecord.reuseProofDigest !== decision.reuseProofDigest) {
      continue;
    }
    const createdAt = nowIso();
    const derived: EvidenceRecord = {
      schema: "uads.evidence-record",
      schemaVersion: "0.3.0",
      evidenceId: newPrefixedId("ev", `${input.run.executionRunId}:${gate}:cache:${decision.cacheDecisionId}`),
      projectId: input.run.projectId,
      workOrderId: input.run.workOrderId,
      executionRunId: input.run.executionRunId,
      changeDigest: input.run.currentChangeDigest,
      gateId: gate,
      sourceRole: "evidence-cache",
      kind: cacheRecord.evidenceKind,
      createdAt,
      status: "PASS",
      summary: `cache-reuse of ${cacheRecord.cacheRecordId}`,
      command: cacheRecord.command ?? undefined,
      exitCode: cacheRecord.evidenceKind === "command" ? 0 : undefined,
      outputRef: cacheRecord.outputDigest ? `sidecar://cache/evidence/${cacheRecord.cacheRecordId}` : null,
      outputDigest: cacheRecord.outputDigest,
      fileRef: null,
      fileDigest: cacheRecord.fileDigest,
      source: "cache-reuse",
      sourceCacheRecordId: cacheRecord.cacheRecordId,
      sourceEvidenceId: cacheRecord.evidenceId,
      cacheDecisionId: decision.cacheDecisionId,
      reuseProofDigest: decision.reuseProofDigest,
      gateReuseContractIdentity: decision.gateReuseContractIdentity,
    };
    const provenance = validateCacheReuseEvidence({
      paths: input.paths,
      projectId: input.run.projectId,
      gateId: gate,
      changeDigest: input.run.currentChangeDigest,
      workOrderId: input.run.workOrderId,
      executionRunId: input.run.executionRunId,
      record: derived,
      schemaRoot: input.schemaRoot,
    });
    if (!provenance.valid) {
      continue;
    }
    persistEvidenceRecord({ paths: input.paths, record: derived, schemaRoot: input.schemaRoot });
    applied.push(derived);
  }
  return { applied, decisions };
}

export function readCacheStatusCompact(paths: UadsPaths, projectId: string): {
  reusableRecords: number;
  staleRecords: number;
  notReusableRecords: number;
  indexedRecords: number;
  indexCorrupt: boolean;
} {
  const index = readEvidenceCacheIndex(paths, projectId);
  if (!index) {
    return {
      reusableRecords: 0,
      staleRecords: 0,
      notReusableRecords: 0,
      indexedRecords: 0,
      indexCorrupt: fs.existsSync(cachePaths(paths).index),
    };
  }
  return {
    reusableRecords: index.records.filter((item) => item.status === "reusable").length,
    staleRecords: index.records.filter((item) => item.status === "stale").length,
    notReusableRecords: index.records.filter((item) => item.status === "not-reusable").length,
    indexedRecords: index.records.length,
    indexCorrupt: false,
  };
}

export function layerDigestForItems(items: Array<{ layer: string; path: string; contentDigest: string }>, layer: string): string {
  const parts = items
    .filter((item) => item.layer === layer)
    .map((item) => `${item.path}:${item.contentDigest}`)
    .sort((a, b) => a.localeCompare(b));
  return sha256Hex(parts.join("|") || layer);
}

// re-export for tests that need command derivation
export { deriveNormalizedCommandFromMap };
