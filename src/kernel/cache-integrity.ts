import type { UadsPaths } from "../lib/workspace.js";
import { isCacheEligibleGate, reuseClassForGate } from "./cache-policy.js";
import { readCacheDecision, readEvidenceCacheRecord } from "./cache-persist.js";
import { gateDef } from "./gates.js";
import type { EvidenceRecord } from "./execution-types.js";
import type { EvidenceCacheRecord } from "./cache-types.js";

export type CacheReuseValidationResult = {
  valid: boolean;
  reasonCodes: string[];
};

const PROVENANCE_FIELDS = [
  "sourceCacheRecordId",
  "sourceEvidenceId",
  "cacheDecisionId",
  "reuseProofDigest",
  "gateReuseContractIdentity",
] as const;

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate the static semantics required before a cache record can be used as
 * the source of derived current evidence. Live identity and digest checks are
 * performed by evaluateCache; this helper covers the persisted record shape
 * and canonical gate policy.
 */
export function isCacheRecordSemanticallyValid(record: EvidenceCacheRecord): boolean {
  const def = gateDef(record.gateId);
  if (!def || !isCacheEligibleGate(record.gateId) || reuseClassForGate(record.gateId) !== "eligible") {
    return false;
  }
  if (!def.allowedEvidenceKinds.includes(record.evidenceKind)) {
    return false;
  }
  if (record.status !== "reusable" || record.reusable !== true || record.reuseClass !== "eligible") {
    return false;
  }
  if (record.evidenceStatus !== "PASS" || !hasText(record.gateReuseContractIdentity) || !hasText(record.reuseProofDigest)) {
    return false;
  }
  if (record.evidenceKind === "command") {
    if (!hasText(record.command) || !hasText(record.outputDigest)) {
      return false;
    }
    if (!hasText(record.toolIdentity.producerFamily) || !hasText(record.toolIdentity.producerVersion)) {
      return false;
    }
  }
  if (record.evidenceKind === "file" && !hasText(record.fileDigest)) {
    return false;
  }
  if (record.evidenceKind === "invariant" && !hasText(record.outputDigest) && !hasText(record.fileDigest)) {
    return false;
  }
  return true;
}

function evidenceHasConcreteGateProof(record: EvidenceRecord): boolean {
  const def = gateDef(record.gateId);
  if (!def || !def.allowedEvidenceKinds.includes(record.kind)) {
    return false;
  }
  if (def.contractKind === "command" || record.kind === "command") {
    return record.kind === "command" && hasText(record.command) && record.exitCode === 0 && hasText(record.outputRef) && hasText(record.outputDigest);
  }
  if (record.kind === "file") {
    return hasText(record.fileRef) && hasText(record.fileDigest);
  }
  if (record.kind === "invariant") {
    return (hasText(record.outputRef) && hasText(record.outputDigest)) || (hasText(record.fileRef) && hasText(record.fileDigest));
  }
  return false;
}

export function validateCacheReuseEvidence(input: {
  paths: UadsPaths;
  projectId: string;
  gateId: string;
  changeDigest: string | null;
  workOrderId?: string | null;
  executionRunId?: string | null;
  record: EvidenceRecord;
  schemaRoot?: string;
}): CacheReuseValidationResult {
  if (input.record.source !== "cache-reuse") {
    return { valid: true, reasonCodes: [] };
  }

  const reasonCodes: string[] = [];

  const def = gateDef(input.gateId);
  if (!def) {
    reasonCodes.push("UNKNOWN_GATE");
  }
  if (!input.changeDigest) {
    reasonCodes.push("MISSING_CURRENT_CHANGE_DIGEST");
  }
  if (def && !def.allowedEvidenceKinds.includes(input.record.kind)) {
    reasonCodes.push("EVIDENCE_KIND_NOT_ALLOWED");
  }
  if (!evidenceHasConcreteGateProof(input.record)) {
    reasonCodes.push("EVIDENCE_CONTRACT_INVALID");
  }

  for (const field of PROVENANCE_FIELDS) {
    const value = input.record[field];
    if (!value || String(value).trim().length === 0) {
      reasonCodes.push(`MISSING_${field.toUpperCase()}`);
    }
  }

  if (input.record.projectId !== input.projectId) {
    reasonCodes.push("PROJECT_MISMATCH");
  }
  if (input.record.gateId !== input.gateId) {
    reasonCodes.push("GATE_MISMATCH");
  }
  if (input.record.changeDigest !== input.changeDigest) {
    reasonCodes.push("CHANGE_DIGEST_MISMATCH");
  }
  if (input.workOrderId && input.record.workOrderId !== input.workOrderId) {
    reasonCodes.push("WORK_ORDER_MISMATCH");
  }
  if (input.executionRunId && input.record.executionRunId !== input.executionRunId) {
    reasonCodes.push("EXECUTION_RUN_MISMATCH");
  }

  if (reasonCodes.length > 0) {
    return { valid: false, reasonCodes };
  }

  const decision = readCacheDecision(input.paths, input.record.cacheDecisionId!, input.schemaRoot);
  if (!decision) {
    return { valid: false, reasonCodes: ["MISSING_CACHE_DECISION"] };
  }
  if (decision.cacheDecisionId !== input.record.cacheDecisionId) {
    reasonCodes.push("DECISION_ID_MISMATCH");
  }
  if (decision.projectId !== input.projectId) {
    reasonCodes.push("DECISION_PROJECT_MISMATCH");
  }
  if (decision.gateId !== input.gateId) {
    reasonCodes.push("DECISION_GATE_MISMATCH");
  }
  if (input.workOrderId && decision.workOrderId !== input.workOrderId) {
    reasonCodes.push("DECISION_WORK_ORDER_MISMATCH");
  }
  if (input.executionRunId && decision.executionRunId !== input.executionRunId) {
    reasonCodes.push("DECISION_EXECUTION_RUN_MISMATCH");
  }
  if (decision.liveChangeDigest !== input.record.changeDigest) {
    reasonCodes.push("DECISION_CHANGE_DIGEST_MISMATCH");
  }
  if (decision.decision !== "HIT" || !decision.maySatisfyGate) {
    reasonCodes.push("DECISION_NOT_HIT");
  }
  if (decision.candidateCacheRecordId !== input.record.sourceCacheRecordId) {
    reasonCodes.push("DECISION_CACHE_RECORD_MISMATCH");
  }
  if (decision.reuseProofDigest !== input.record.reuseProofDigest) {
    reasonCodes.push("DECISION_PROOF_MISMATCH");
  }
  if (decision.gateReuseContractIdentity !== input.record.gateReuseContractIdentity) {
    reasonCodes.push("DECISION_CONTRACT_MISMATCH");
  }

  const cacheRecord = readEvidenceCacheRecord(input.paths, input.record.sourceCacheRecordId!, input.schemaRoot);
  if (!cacheRecord) {
    return { valid: false, reasonCodes: ["MISSING_CACHE_RECORD", ...reasonCodes] };
  }
  if (cacheRecord.cacheRecordId !== input.record.sourceCacheRecordId) {
    reasonCodes.push("CACHE_RECORD_ID_MISMATCH");
  }
  if (cacheRecord.projectId !== input.projectId) {
    reasonCodes.push("CACHE_RECORD_PROJECT_MISMATCH");
  }
  if (cacheRecord.gateId !== input.gateId) {
    reasonCodes.push("CACHE_RECORD_GATE_MISMATCH");
  }
  if (cacheRecord.evidenceId !== input.record.sourceEvidenceId) {
    reasonCodes.push("SOURCE_EVIDENCE_MISMATCH");
  }
  if (!isCacheRecordSemanticallyValid(cacheRecord)) {
    reasonCodes.push("CACHE_RECORD_SEMANTIC_INVALID");
  }
  if (cacheRecord.reuseProofDigest !== input.record.reuseProofDigest) {
    reasonCodes.push("CACHE_RECORD_PROOF_MISMATCH");
  }
  if (cacheRecord.gateReuseContractIdentity !== input.record.gateReuseContractIdentity) {
    reasonCodes.push("CACHE_RECORD_CONTRACT_MISMATCH");
  }

  return { valid: reasonCodes.length === 0, reasonCodes };
}
