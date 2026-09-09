import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, assertSafeSidecarId, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { isPathInside, sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import { findPackageRoot } from "../lib/version.js";
import type { UadsPaths } from "../lib/workspace.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import {
  assertHostDispatchBundleMatchesCurrent,
  readCurrentHostDispatchArtifacts,
  readCurrentHostDispatchBundle,
  type HostDispatchCurrentArtifacts,
} from "./host-dispatch.js";
import { inspectHostAdapterOwnership } from "./host-adapter-install.js";
import type {
  HostAdapterId,
  HostExecutionReceipt,
  HostExecutionReceiptInput,
  HostExecutionReceiptState,
} from "./host-adapter-types.js";
import { HOST_ADAPTER_CONTRACT_VERSION } from "./host-adapter-types.js";

export const HOST_EXECUTION_RECEIPT_SCHEMA_VERSION = "0.1.0" as const;
export const HOST_EXECUTION_RECEIPT_CONTRACT_VERSION = "0.1.0" as const;
export const HOST_EXECUTION_RECEIPT_HISTORY_LIMIT = 32;

export type HostExecutionReasonCode =
  | "HANDOFF_ACCEPTED"
  | "HANDOFF_STARTED"
  | "HANDOFF_COMPLETED"
  | "HANDOFF_FAILED"
  | "HANDOFF_BLOCKED"
  | "BUNDLE_MISSING"
  | "BUNDLE_CORRUPT"
  | "BUNDLE_DIGEST_MISMATCH"
  | "BUNDLE_STALE"
  | "PROJECT_MISMATCH"
  | "ADAPTER_MISMATCH"
  | "TARGET_ROOT_MISMATCH"
  | "OWNERSHIP_NOT_TRUSTED"
  | "EXECUTION_RUN_MISSING"
  | "EXECUTION_RUN_MISMATCH"
  | "CHANGE_IDENTITY_MISMATCH"
  | "MODEL_PLAN_BLOCKED"
  | "SPECIALIST_SELECTION_INVALID"
  | "HOST_CAPABILITY_UNPROVEN"
  | "HOST_CAPABILITY_INSUFFICIENT"
  | "APPROVAL_AUTHORIZATION_MISSING"
  | "HANDOFF_REPLAY"
  | "RECEIPT_CORRUPT"
  | "RECEIPT_DIGEST_MISMATCH"
  | "INVALID_TRANSITION"
  | "TERMINAL_IMMUTABLE"
  | "RECEIPT_NOT_GATE_EVIDENCE";

const REASON_CODES = new Set<HostExecutionReasonCode>([
  "HANDOFF_ACCEPTED",
  "HANDOFF_STARTED",
  "HANDOFF_COMPLETED",
  "HANDOFF_FAILED",
  "HANDOFF_BLOCKED",
  "BUNDLE_MISSING",
  "BUNDLE_CORRUPT",
  "BUNDLE_DIGEST_MISMATCH",
  "BUNDLE_STALE",
  "PROJECT_MISMATCH",
  "ADAPTER_MISMATCH",
  "TARGET_ROOT_MISMATCH",
  "OWNERSHIP_NOT_TRUSTED",
  "EXECUTION_RUN_MISSING",
  "EXECUTION_RUN_MISMATCH",
  "CHANGE_IDENTITY_MISMATCH",
  "MODEL_PLAN_BLOCKED",
  "SPECIALIST_SELECTION_INVALID",
  "HOST_CAPABILITY_UNPROVEN",
  "HOST_CAPABILITY_INSUFFICIENT",
  "APPROVAL_AUTHORIZATION_MISSING",
  "HANDOFF_REPLAY",
  "RECEIPT_CORRUPT",
  "RECEIPT_DIGEST_MISMATCH",
  "INVALID_TRANSITION",
  "TERMINAL_IMMUTABLE",
  "RECEIPT_NOT_GATE_EVIDENCE",
]);

const STATE_REASON: Record<HostExecutionReceiptState, HostExecutionReasonCode> = {
  ACCEPTED: "HANDOFF_ACCEPTED",
  STARTED: "HANDOFF_STARTED",
  COMPLETED: "HANDOFF_COMPLETED",
  FAILED: "HANDOFF_FAILED",
  BLOCKED: "HANDOFF_BLOCKED",
};

const TERMINAL_STATES = new Set<HostExecutionReceiptState>(["COMPLETED", "FAILED", "BLOCKED"]);
const ALLOWED_TRANSITIONS: Record<HostExecutionReceiptState, HostExecutionReceiptState[]> = {
  ACCEPTED: ["STARTED", "COMPLETED", "FAILED", "BLOCKED"],
  STARTED: ["COMPLETED", "FAILED", "BLOCKED"],
  COMPLETED: [],
  FAILED: [],
  BLOCKED: [],
};

export class HostExecutionError extends Error {
  readonly reasonCode: HostExecutionReasonCode;

  constructor(message: string, reasonCode: HostExecutionReasonCode) {
    super(message);
    this.name = "HostExecutionError";
    this.reasonCode = reasonCode;
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

export function computeHostExecutionReceiptDigest(receipt: Omit<HostExecutionReceipt, "receiptDigest">): string {
  return sha256Hex(JSON.stringify(stableValue(receipt)));
}

function assertNoSidecarEscape(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isPathInside(resolvedRoot, resolvedTarget)) {
    throw new HostExecutionError("host execution sidecar path escape rejected", "RECEIPT_CORRUPT");
  }
  let current = resolvedRoot;
  for (const segment of path.relative(resolvedRoot, resolvedTarget).split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new HostExecutionError("host execution sidecar symlink escape rejected", "RECEIPT_CORRUPT");
    }
  }
}

function assertReceiptLayout(paths: UadsPaths): void {
  assertNoSidecarEscape(paths.home, paths.hostExecution);
  assertNoSidecarEscape(paths.home, paths.currentHostExecutionReceipt);
  assertNoSidecarEscape(paths.home, paths.hostExecutionReceiptHistory);
}

function validateReceipt(receipt: HostExecutionReceipt, schemaRoot?: string): HostExecutionReceipt {
  try {
    assertSchema("host-execution-receipt.schema.json", receipt, schemaRoot);
    const { receiptDigest: stored, ...withoutDigest } = receipt;
    if (stored !== computeHostExecutionReceiptDigest(withoutDigest)) {
      throw new HostExecutionError("host execution receipt digest mismatch", "RECEIPT_DIGEST_MISMATCH");
    }
    const text = JSON.stringify(receipt);
    if (containsUnredactedSecret(text) || containsAbsoluteHostPath(text)) {
      throw new HostExecutionError("host execution receipt contains secret-like or host-path data", "RECEIPT_CORRUPT");
    }
    return receipt;
  } catch (error) {
    if (error instanceof HostExecutionError) throw error;
    throw new HostExecutionError(
      `host execution receipt is invalid: ${error instanceof Error ? error.message : String(error)}`,
      "RECEIPT_CORRUPT",
    );
  }
}

function readReceiptFile(file: string, schemaRoot?: string): HostExecutionReceipt {
  const parsed = readJsonIfValid<HostExecutionReceipt>(file);
  if (!parsed.ok) throw new HostExecutionError("host execution receipt is missing or corrupt", "RECEIPT_CORRUPT");
  return validateReceipt(parsed.value, schemaRoot);
}

export function readCurrentHostExecutionReceipt(
  paths: UadsPaths,
  schemaRoot?: string,
): HostExecutionReceipt | null {
  assertReceiptLayout(paths);
  if (!fs.existsSync(paths.currentHostExecutionReceipt)) return null;
  return readReceiptFile(paths.currentHostExecutionReceipt, schemaRoot);
}

export function listHostExecutionReceipts(
  paths: UadsPaths,
  schemaRoot?: string,
): HostExecutionReceipt[] {
  assertReceiptLayout(paths);
  if (!fs.existsSync(paths.hostExecutionReceiptHistory)) return [];
  const receipts: HostExecutionReceipt[] = [];
  for (const name of fs.readdirSync(paths.hostExecutionReceiptHistory).filter((item) => item.endsWith(".json")).sort()) {
    assertSafeSidecarId(name.slice(0, -5));
    receipts.push(readReceiptFile(path.join(paths.hostExecutionReceiptHistory, name), schemaRoot));
  }
  return receipts.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.receiptId.localeCompare(b.receiptId));
}

function assertHistoryEntryImmutable(
  paths: UadsPaths,
  receipt: HostExecutionReceipt,
  schemaRoot?: string,
): void {
  const target = sidecarJsonPath(paths.hostExecutionReceiptHistory, receipt.receiptId);
  assertNoSidecarEscape(paths.home, target);
  if (!fs.existsSync(target)) return;
  const existing = readReceiptFile(target, schemaRoot);
  if (JSON.stringify(existing) !== JSON.stringify(receipt)) {
    throw new HostExecutionError("host execution history replay would rewrite an immutable receipt", "HANDOFF_REPLAY");
  }
}

function pruneReceiptHistory(paths: UadsPaths, schemaRoot?: string): void {
  const receipts = listHostExecutionReceipts(paths, schemaRoot);
  const excess = receipts.length - HOST_EXECUTION_RECEIPT_HISTORY_LIMIT;
  if (excess <= 0) return;
  for (const receipt of receipts.slice(0, excess)) {
    const target = sidecarJsonPath(paths.hostExecutionReceiptHistory, receipt.receiptId);
    assertNoSidecarEscape(paths.home, target);
    fs.unlinkSync(target);
  }
}

export function persistHostExecutionReceipt(
  paths: UadsPaths,
  receipt: HostExecutionReceipt,
  schemaRoot?: string,
): HostExecutionReceipt {
  assertReceiptLayout(paths);
  const validated = validateReceipt(receipt, schemaRoot);
  const safe = sanitizeOperationalValue(validated);
  assertHistoryEntryImmutable(paths, validated, schemaRoot);
  fs.mkdirSync(paths.hostExecutionReceiptHistory, { recursive: true });
  atomicWriteJson(sidecarJsonPath(paths.hostExecutionReceiptHistory, validated.receiptId), safe);
  atomicWriteJson(paths.currentHostExecutionReceipt, safe);
  pruneReceiptHistory(paths, schemaRoot);
  return validated;
}

function defaultReason(state: HostExecutionReceiptState): HostExecutionReasonCode {
  return STATE_REASON[state];
}

function validateReasonCodes(
  state: HostExecutionReceiptState,
  reasonCodes: string[] | undefined,
): HostExecutionReasonCode[] {
  const codes = reasonCodes?.length ? [...reasonCodes] : [defaultReason(state)];
  if (codes.length > 8 || new Set(codes).size !== codes.length || codes.some((code) => !REASON_CODES.has(code as HostExecutionReasonCode))) {
    throw new HostExecutionError("host execution receipt reason codes are invalid", "INVALID_TRANSITION");
  }
  const normalized = [...new Set(codes)] as HostExecutionReasonCode[];
  if (!normalized.includes(defaultReason(state))) {
    throw new HostExecutionError("host execution receipt reason code does not match state", "INVALID_TRANSITION");
  }
  return normalized.sort();
}

function receiptBinding(receipt: HostExecutionReceipt): Record<string, unknown> {
  return {
    handoffId: receipt.handoffId,
    adapterId: receipt.adapterId,
    adapterContractVersion: receipt.adapterContractVersion,
    projectId: receipt.projectId,
    bundleId: receipt.bundleId,
    bundleDigest: receipt.bundleDigest,
    workOrderId: receipt.workOrderId,
    workOrderDigest: receipt.workOrderDigest,
    routingDecisionId: receipt.routingDecisionId,
    routingDecisionDigest: receipt.routingDecisionDigest,
    specialistSelectionPlanId: receipt.specialistSelectionPlanId,
    specialistSelectionDigest: receipt.specialistSelectionDigest,
    modelPlanId: receipt.modelPlanId,
    modelPlanDigest: receipt.modelPlanDigest,
    modelRuntimeIdentityDigest: receipt.modelRuntimeIdentityDigest,
    runtimeId: receipt.runtimeId,
    runtimeIdentityDigest: receipt.runtimeIdentityDigest,
    executionRunId: receipt.executionRunId,
    hostTargetRootDigest: receipt.hostTargetRootDigest,
    currentChangeDigest: receipt.currentChangeDigest,
  };
}

function bundleBinding(
  bundle: NonNullable<ReturnType<typeof readCurrentHostDispatchBundle>>,
): Record<string, unknown> {
  return {
    handoffId: `heh_${sha256Hex(JSON.stringify(stableValue({
      adapterId: bundle.adapterId,
      projectId: bundle.projectId,
      bundleId: bundle.bundleId,
      bundleDigest: bundle.bundleDigest,
      executionRunId: bundle.executionRunId,
    }))).slice(0, 16)}`,
    adapterId: bundle.adapterId,
    adapterContractVersion: bundle.adapterContractVersion,
    projectId: bundle.projectId,
    bundleId: bundle.bundleId,
    bundleDigest: bundle.bundleDigest,
    workOrderId: bundle.workOrderId,
    workOrderDigest: bundle.workOrderDigest,
    routingDecisionId: bundle.routingDecisionId,
    routingDecisionDigest: bundle.routingDecisionDigest,
    specialistSelectionPlanId: bundle.specialistSelectionPlanId,
    specialistSelectionDigest: bundle.specialistSelectionDigest,
    modelPlanId: bundle.modelPlanId,
    modelPlanDigest: bundle.modelPlanDigest,
    modelRuntimeIdentityDigest: bundle.modelRuntimeIdentityDigest,
    runtimeId: bundle.runtimeId,
    runtimeIdentityDigest: bundle.runtimeIdentityDigest,
    executionRunId: bundle.executionRunId,
    hostTargetRootDigest: bundle.hostTargetRootDigest,
    currentChangeDigest: bundle.currentChangeDigest,
  };
}

function buildReceipt(
  bundle: NonNullable<ReturnType<typeof readCurrentHostDispatchBundle>>,
  state: HostExecutionReceiptState,
  reasonCodes: HostExecutionReasonCode[],
  previous?: HostExecutionReceipt,
): HostExecutionReceipt {
  const binding = bundleBinding(bundle);
  const handoffId = String(binding.handoffId);
  const now = new Date().toISOString();
  const receiptId = `her_${sha256Hex(JSON.stringify(stableValue({ ...binding, state, reasonCodes, now }))).slice(0, 16)}`;
  const base: Omit<HostExecutionReceipt, "receiptDigest"> = {
    schema: "uads.host-execution-receipt",
    schemaVersion: HOST_EXECUTION_RECEIPT_SCHEMA_VERSION,
    contractVersion: HOST_EXECUTION_RECEIPT_CONTRACT_VERSION,
    receiptId,
    handoffId,
    adapterId: bundle.adapterId,
    adapterContractVersion: HOST_ADAPTER_CONTRACT_VERSION,
    projectId: bundle.projectId,
    bundleId: bundle.bundleId,
    bundleDigest: bundle.bundleDigest,
    workOrderId: bundle.workOrderId,
    workOrderDigest: bundle.workOrderDigest,
    routingDecisionId: bundle.routingDecisionId,
    routingDecisionDigest: bundle.routingDecisionDigest,
    specialistSelectionPlanId: bundle.specialistSelectionPlanId,
    specialistSelectionDigest: bundle.specialistSelectionDigest,
    modelPlanId: bundle.modelPlanId,
    modelPlanDigest: bundle.modelPlanDigest,
    modelRuntimeIdentityDigest: bundle.modelRuntimeIdentityDigest,
    runtimeId: bundle.runtimeId,
    runtimeIdentityDigest: bundle.runtimeIdentityDigest,
    executionRunId: bundle.executionRunId as string,
    hostTargetRootDigest: bundle.hostTargetRootDigest,
    currentChangeDigest: bundle.currentChangeDigest,
    state,
    reasonCodes,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    acceptedAt: previous?.acceptedAt ?? now,
    startedAt: previous?.startedAt ?? (state === "STARTED" ? now : null),
    completedAt: TERMINAL_STATES.has(state) ? now : previous?.completedAt ?? null,
  };
  return { ...base, receiptDigest: computeHostExecutionReceiptDigest(base) };
}

function currentReceiptMatchesBundle(
  receipt: HostExecutionReceipt,
  bundle: NonNullable<ReturnType<typeof readCurrentHostDispatchBundle>>,
): boolean {
  return JSON.stringify(stableValue(receiptBinding(receipt))) === JSON.stringify(stableValue(bundleBinding(bundle)));
}

function classifyDispatchFailure(error: unknown): HostExecutionReasonCode {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("model") && message.includes("blocked")) return "MODEL_PLAN_BLOCKED";
  if (message.includes("specialist")) return "SPECIALIST_SELECTION_INVALID";
  if (message.includes("execution run")) return "EXECUTION_RUN_MISMATCH";
  if (message.includes("target root") || message.includes("host adapter")) return "TARGET_ROOT_MISMATCH";
  if (message.includes("change") && message.includes("digest")) return "CHANGE_IDENTITY_MISMATCH";
  return "BUNDLE_STALE";
}

type CurrentAuthorityInput = {
  adapterId: HostAdapterId;
  cwd?: string;
  uadsHome?: string;
  hostHome?: string;
  schemaRoot: string;
};

function assertCurrentHostExecutionAuthority(
  input: CurrentAuthorityInput,
  bundle: NonNullable<ReturnType<typeof readCurrentHostDispatchBundle>>,
  receipt?: HostExecutionReceipt,
): HostDispatchCurrentArtifacts {
  const ownership = inspectHostAdapterOwnership(
    input.adapterId,
    { uadsHome: input.uadsHome, hostHome: input.hostHome },
    input.schemaRoot,
  );
  if (ownership.status !== "CLEAN") {
    throw new HostExecutionError("host adapter ownership is not trusted for current execution authority", "OWNERSHIP_NOT_TRUSTED");
  }

  try {
    const artifacts = readCurrentHostDispatchArtifacts(input);
    if (artifacts.executionRunId !== bundle.executionRunId) {
      throw new HostExecutionError("current execution run does not match the accepted host dispatch bundle", "EXECUTION_RUN_MISMATCH");
    }
    assertHostDispatchBundleMatchesCurrent(bundle, artifacts, input.adapterId);
    if (receipt && !currentReceiptMatchesBundle(receipt, bundle)) {
      throw new HostExecutionError("accepted host execution receipt is bound to a stale dispatch bundle", "BUNDLE_STALE");
    }
    return artifacts;
  } catch (error) {
    if (error instanceof HostExecutionError) throw error;
    throw new HostExecutionError("current host execution authority is stale or invalid", classifyDispatchFailure(error));
  }
}

function assertApprovalBoundary(artifacts: HostDispatchCurrentArtifacts): void {
  if (artifacts.activeApprovalIntentAmbiguous || artifacts.activeApprovalGatedActions.length > 0) {
    throw new HostExecutionError(
      "host execution handoff is blocked: APPROVAL_AUTHORIZATION_MISSING; no verifiable authorization record exists for the current approval-gated Work Order",
      "APPROVAL_AUTHORIZATION_MISSING",
    );
  }
}

export function handoffHostExecution(input: {
  adapterId: HostAdapterId;
  cwd?: string;
  uadsHome?: string;
  hostHome?: string;
  schemaRoot?: string;
}): HostExecutionReceipt {
  const schemaRoot = input.schemaRoot ?? findPackageRoot();
  const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
  let bundle: NonNullable<ReturnType<typeof readCurrentHostDispatchBundle>>;
  try {
    const current = readCurrentHostDispatchBundle(ctx.paths, schemaRoot);
    if (!current) throw new HostExecutionError("current host dispatch bundle is missing", "BUNDLE_MISSING");
    bundle = current;
  } catch (error) {
    if (error instanceof HostExecutionError) {
      if (error.message.includes("digest")) throw new HostExecutionError(error.message, "BUNDLE_DIGEST_MISMATCH");
      throw error;
    }
    if (error instanceof Error && error.message.toLowerCase().includes("digest")) {
      throw new HostExecutionError("current host dispatch bundle digest is invalid", "BUNDLE_DIGEST_MISMATCH");
    }
    throw new HostExecutionError("current host dispatch bundle is corrupt", "BUNDLE_CORRUPT");
  }
  const existing = readCurrentHostExecutionReceipt(ctx.paths, schemaRoot);
  if (bundle.adapterId !== input.adapterId) {
    throw new HostExecutionError("host dispatch bundle belongs to another adapter", "ADAPTER_MISMATCH");
  }
  if (bundle.projectId !== ctx.projectId) {
    throw new HostExecutionError("host dispatch bundle belongs to another project", "PROJECT_MISMATCH");
  }
  if (!bundle.executionRunId) {
    throw new HostExecutionError("host dispatch bundle has no execution run identity", "EXECUTION_RUN_MISSING");
  }

  const artifacts = assertCurrentHostExecutionAuthority(
    { adapterId: input.adapterId, cwd: input.cwd, uadsHome: input.uadsHome, hostHome: input.hostHome, schemaRoot },
    bundle,
  );
  assertApprovalBoundary(artifacts);

  if (existing && currentReceiptMatchesBundle(existing, bundle)) {
    return existing;
  }

  const receipt = buildReceipt(bundle, "ACCEPTED", ["HANDOFF_ACCEPTED"]);
  return persistHostExecutionReceipt(ctx.paths, receipt, schemaRoot);
}

export function transitionHostExecutionReceipt(input: HostExecutionReceiptInput & { adapterId: HostAdapterId }): HostExecutionReceipt {
  const schemaRoot = input.schemaRoot ?? findPackageRoot();
  const ctx = resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
  const current = readCurrentHostExecutionReceipt(ctx.paths, schemaRoot);
  if (!current) throw new HostExecutionError("no current host execution receipt exists", "RECEIPT_CORRUPT");
  if (current.adapterId !== input.adapterId) {
    throw new HostExecutionError("current receipt belongs to another adapter", "ADAPTER_MISMATCH");
  }
  const nextState = input.state;
  const reasonCodes = validateReasonCodes(nextState, input.reasonCodes);
  if (TERMINAL_STATES.has(current.state)) {
    if (nextState === current.state && JSON.stringify(current.reasonCodes) === JSON.stringify(reasonCodes)) return current;
    throw new HostExecutionError("terminal host execution receipt is immutable", "TERMINAL_IMMUTABLE");
  }
  if (nextState === current.state) {
    if (JSON.stringify(current.reasonCodes) === JSON.stringify(reasonCodes)) return current;
    throw new HostExecutionError("host execution receipt replay has different reason codes", "INVALID_TRANSITION");
  }
  if (!ALLOWED_TRANSITIONS[current.state].includes(nextState)) {
    throw new HostExecutionError("host execution receipt transition is invalid", "INVALID_TRANSITION");
  }
  const bundle = readCurrentHostDispatchBundle(ctx.paths, schemaRoot);
  if (!bundle || bundle.adapterId !== input.adapterId || bundle.projectId !== current.projectId) {
    throw new HostExecutionError("host execution receipt is not bound to the current adapter/project", "ADAPTER_MISMATCH");
  }
  if (!currentReceiptMatchesBundle(current, bundle)) {
    throw new HostExecutionError("host execution receipt binding is stale", "BUNDLE_STALE");
  }
  const artifacts = assertCurrentHostExecutionAuthority(
    { adapterId: input.adapterId, cwd: input.cwd, uadsHome: input.uadsHome, hostHome: input.hostHome, schemaRoot },
    bundle,
    current,
  );
  assertApprovalBoundary(artifacts);
  const next = buildReceipt(bundle, nextState, reasonCodes, current);
  return persistHostExecutionReceipt(ctx.paths, next, schemaRoot);
}
