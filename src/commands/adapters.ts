import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { safeErrorMessage } from "../lib/safe-persist.js";
import { findPackageRoot } from "../lib/version.js";
import { getUadsPaths } from "../lib/workspace.js";
import { prepareHostDispatchBundle, hostAdapterStatus } from "../adapters/host-dispatch.js";
import { handoffHostExecution, transitionHostExecutionReceipt } from "../adapters/host-execution.js";
import {
  detectAllHostAdapters,
  detectHostAdapter,
} from "../adapters/host-adapter-detect.js";
import {
  builtinHostAdapterRegistry,
  getHostAdapterDefinition,
} from "../adapters/host-adapter-registry.js";
import {
  installHostAdapter,
  uninstallHostAdapter,
} from "../adapters/host-adapter-install.js";
import {
  HOST_ADAPTER_IDS,
  type HostAdapterId,
  type HostExecutionReceiptState,
} from "../adapters/host-adapter-types.js";

function adapterId(value: string): HostAdapterId {
  if (!(HOST_ADAPTER_IDS as readonly string[]).includes(value)) {
    throw new Error(`unknown host adapter: ${value}`);
  }
  return value as HostAdapterId;
}

function projectState(input: { cwd?: string; uadsHome?: string }) {
  const cwd = input.cwd ?? process.cwd();
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? cwd;
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  return { projectId: fingerprint.projectId, repoRoot, paths: getUadsPaths(fingerprint.projectId, input.uadsHome) };
}

export function runAdaptersListCommand(input: { json?: boolean } = {}): string {
  try {
    const registry = builtinHostAdapterRegistry();
    const adapters = registry.adapters.map((definition) => ({
      adapterId: definition.adapterId,
      resourceKind: definition.resourceKind,
      targetLabel: definition.targetLabel,
      contractVersion: registry.contractVersion,
      capabilities: definition.capabilities,
    }));
    const payload = {
      schema: registry.schema,
      schemaVersion: registry.schemaVersion,
      contractVersion: registry.contractVersion,
      registryDigest: registry.registryDigest,
      adapters,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS adapters list",
      `contractVersion: ${registry.contractVersion}`,
      `registryDigest: ${registry.registryDigest}`,
      ...adapters.map((item) => `${item.adapterId}  ${item.resourceKind}  ${item.targetLabel}`),
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runAdaptersDetectCommand(input: {
  adapter?: string;
  hostHome?: string;
  json?: boolean;
} = {}): string {
  try {
    const detections = input.adapter
      ? [detectHostAdapter(adapterId(input.adapter), { hostHome: input.hostHome })]
      : detectAllHostAdapters({ hostHome: input.hostHome });
    if (input.json) return `${JSON.stringify({ detections }, null, 2)}\n`;
    return [
      "UADS adapters detect",
      ...detections.map((item) => `${item.adapterId}: ${item.status} (${item.reasonCodes.join(", ") || "none"})`),
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runAdaptersStatusCommand(input: {
  cwd?: string;
  uadsHome?: string;
  hostHome?: string;
  adapter?: string;
  json?: boolean;
} = {}): string {
  try {
    const state = projectState(input);
    const ids = input.adapter
      ? [adapterId(input.adapter)]
      : [...HOST_ADAPTER_IDS].sort((a, b) => a.localeCompare(b));
    const statuses = ids.map((id) =>
      hostAdapterStatus(
        id,
        {
          uadsHome: input.uadsHome,
          hostHome: input.hostHome,
          projectId: state.projectId,
          paths: state.paths,
        },
        findPackageRoot(),
      ),
    );
    const payload = { projectId: state.projectId, statuses };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS adapters status",
      `projectId: ${state.projectId}`,
      ...statuses.map((item) =>
        `${item.adapterId}: support=${item.support} install=${item.install} ownership=${item.ownership} prepared=${item.preparedBundle}`,
      ),
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runAdaptersExplainCommand(input: {
  adapter: string;
  uadsHome?: string;
  hostHome?: string;
  json?: boolean;
}): string {
  try {
    const id = adapterId(input.adapter);
    const definition = getHostAdapterDefinition(id);
    const detection = detectHostAdapter(id, { hostHome: input.hostHome });
    const payload = {
      adapter: definition,
      detection,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS adapters explain",
      `adapter: ${id}`,
      `support: ${detection.status}`,
      `target: ${definition.targetLabel}`,
      `resourceKind: ${definition.resourceKind}`,
      `version: ${detection.version ?? "(unproven)"}`,
      `detectionMethod: ${detection.detectionMethod}`,
      `capabilities: ${Object.entries(detection.provenCapabilities).map(([key, value]) => `${key}=${value}`).join(", ")}`,
      `reasonCodes: ${detection.reasonCodes.join(", ") || "(none)"}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runAdaptersInstallCommand(input: {
  cwd?: string;
  adapter: string;
  uadsHome?: string;
  hostHome?: string;
  packageRoot?: string;
  json?: boolean;
}): string {
  try {
    const project = projectState(input);
    const state = installHostAdapter(
      adapterId(input.adapter),
      {
        uadsHome: input.uadsHome,
        hostHome: input.hostHome,
        packageRoot: input.packageRoot,
        projectRoot: project.repoRoot,
      },
      findPackageRoot(),
    );
    if (input.json) return `${JSON.stringify(state, null, 2)}\n`;
    return [
      "UADS adapters install",
      `adapter: ${state.adapterId}`,
      `install: ${state.installStatus}`,
      `ownership: ${state.ownershipStatus}`,
      `resources: ${state.resources.length}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runAdaptersUninstallCommand(input: {
  cwd?: string;
  adapter: string;
  uadsHome?: string;
  hostHome?: string;
  json?: boolean;
}): string {
  try {
    const project = projectState(input);
    const state = uninstallHostAdapter(
      adapterId(input.adapter),
      {
        uadsHome: input.uadsHome,
        hostHome: input.hostHome,
        projectRoot: project.repoRoot,
      },
      findPackageRoot(),
    );
    const payload = state ?? {
      adapterId: adapterId(input.adapter),
      installStatus: "NOT_INSTALLED",
      ownershipStatus: "UNKNOWN",
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS adapters uninstall",
      `adapter: ${payload.adapterId}`,
      `install: ${payload.installStatus}`,
      `ownership: ${payload.ownershipStatus}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runAdaptersPrepareCommand(input: {
  adapter: string;
  cwd?: string;
  uadsHome?: string;
  hostHome?: string;
  json?: boolean;
}): string {
  try {
    const bundle = prepareHostDispatchBundle({
      adapterId: adapterId(input.adapter),
      cwd: input.cwd,
      uadsHome: input.uadsHome,
      hostHome: input.hostHome,
      schemaRoot: findPackageRoot(),
    });
    if (input.json) return `${JSON.stringify(bundle, null, 2)}\n`;
    return [
      "UADS adapters prepare",
      `adapter: ${bundle.adapterId}`,
      `bundleId: ${bundle.bundleId}`,
      `status: ${bundle.status}`,
      `projectId: ${bundle.projectId}`,
      `workOrderId: ${bundle.workOrderId}`,
      `execution: ${bundle.execution.roleDispatch}, parallel=${bundle.execution.parallel}`,
      `assignments: ${bundle.assignments.length}`,
      `bundleDigest: ${bundle.bundleDigest}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

function receiptState(value: string): HostExecutionReceiptState {
  const states: readonly HostExecutionReceiptState[] = ["ACCEPTED", "STARTED", "COMPLETED", "FAILED", "BLOCKED"];
  if (!states.includes(value as HostExecutionReceiptState)) {
    throw new Error(`invalid host execution receipt state: ${value}`);
  }
  return value as HostExecutionReceiptState;
}

export function runAdaptersHandoffCommand(input: {
  adapter: string;
  cwd?: string;
  uadsHome?: string;
  hostHome?: string;
  json?: boolean;
}): string {
  try {
    const receipt = handoffHostExecution({
      adapterId: adapterId(input.adapter),
      cwd: input.cwd,
      uadsHome: input.uadsHome,
      hostHome: input.hostHome,
      schemaRoot: findPackageRoot(),
    });
    if (input.json) return `${JSON.stringify(receipt, null, 2)}\n`;
    return [
      "UADS adapters handoff",
      `adapter: ${receipt.adapterId}`,
      `receiptId: ${receipt.receiptId}`,
      `handoffId: ${receipt.handoffId}`,
      `state: ${receipt.state}`,
      `bundleId: ${receipt.bundleId}`,
      `executionRunId: ${receipt.executionRunId}`,
      `reasonCodes: ${receipt.reasonCodes.join(", ")}`,
      `receiptDigest: ${receipt.receiptDigest}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runAdaptersReceiptCommand(input: {
  adapter: string;
  state: string;
  reasonCodes?: string[];
  cwd?: string;
  uadsHome?: string;
  hostHome?: string;
  json?: boolean;
}): string {
  try {
    const receipt = transitionHostExecutionReceipt({
      adapterId: adapterId(input.adapter),
      state: receiptState(input.state),
      reasonCodes: input.reasonCodes,
      cwd: input.cwd,
      uadsHome: input.uadsHome,
      hostHome: input.hostHome,
      schemaRoot: findPackageRoot(),
    });
    if (input.json) return `${JSON.stringify(receipt, null, 2)}\n`;
    return [
      "UADS adapters receipt",
      `adapter: ${receipt.adapterId}`,
      `receiptId: ${receipt.receiptId}`,
      `state: ${receipt.state}`,
      `reasonCodes: ${receipt.reasonCodes.join(", ")}`,
      `executionRunId: ${receipt.executionRunId}`,
      `receiptDigest: ${receipt.receiptDigest}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
