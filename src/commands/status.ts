import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { readUadsVersion } from "../lib/version.js";
import { getUadsPaths } from "../lib/workspace.js";
import { readCacheStatusCompact } from "../kernel/cache-engine.js";
import { readCostStatusCompact } from "../kernel/cost-persist.js";
import { loadExecutionView } from "../kernel/execution.js";
import { readFailureStatusFields } from "../kernel/failure-persist.js";
import { readCurrentCheckpoint, readContextPlan, readWorkOrder } from "../kernel/persist.js";
import fs from "node:fs";
import path from "node:path";
import { loadModelProfileRegistry } from "../kernel/model-registry.js";
import { readCurrentModelExecutionPlan } from "../kernel/model-persist.js";
import { readRuntimeCapabilitySnapshot } from "../kernel/model-runtime.js";
import { findPackageRoot } from "../lib/version.js";
import { loadSpecialistRegistry } from "../kernel/specialist-registry.js";
import { readCurrentSpecialistSelectionPlan } from "../kernel/specialist-persist.js";
import { hostAdapterStatus } from "../adapters/host-dispatch.js";
import { HOST_ADAPTER_IDS, type HostAdapterStatusSummary } from "../adapters/host-adapter-types.js";

export function runStatus(cwd: string = process.cwd(), options: { uadsHome?: string; json?: boolean } = {}): string {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? path.resolve(cwd);
  const fingerprint = computeProjectFingerprint({
    originUrl: git.originUrl,
    repoRoot,
  });
  const paths = getUadsPaths(fingerprint.projectId, options.uadsHome);
  const version = readUadsVersion();
  const dirty = git.status !== "(clean)" && git.status.length > 0;
  const checkpoint = fs.existsSync(paths.currentState) ? readCurrentCheckpoint(paths) : null;
  const workOrder =
    checkpoint?.workOrderId && fs.existsSync(paths.workOrders)
      ? readWorkOrder(paths, checkpoint.workOrderId)
      : null;
  const contextPlan = fs.existsSync(paths.workspace) ? readContextPlan(paths) : null;
  const execution = fs.existsSync(paths.workspace)
    ? loadExecutionView({ cwd, uadsHome: options.uadsHome })
    : null;
  let failure = {
    activeFailureId: null as string | null,
    failureSignaturePrefix: null as string | null,
    diagnosisStatus: null as string | null,
    loopDetected: false,
    recommendedDiagnosticRadius: null as string | null,
  };
  if (fs.existsSync(paths.workspace)) {
    try {
      failure = readFailureStatusFields(paths);
    } catch {
      failure = { ...failure, diagnosisStatus: "blocked" };
    }
  }
  const cache = fs.existsSync(paths.workspace)
    ? readCacheStatusCompact(paths, fingerprint.projectId)
    : { reusableRecords: 0, staleRecords: 0, notReusableRecords: 0, indexedRecords: 0, indexCorrupt: false };
  const cost = fs.existsSync(paths.workspace)
    ? readCostStatusCompact(paths, fingerprint.projectId)
    : { budgetStatus: "unavailable" as const, qptRatio: null };
  let model = {
    registryStatus: "unavailable",
    profileCount: 0,
    runtimeId: null as string | null,
    runtimeIdentityDigest: null as string | null,
    routingStatus: null as string | null,
    modelPlanId: null as string | null,
    selectedProfileId: null as string | null,
    selectionMode: null as string | null,
    requiredCapabilityClass: null as string | null,
  };
  let specialist = {
    registryStatus: "unavailable",
    profileCount: 0,
    registryDigest: null as string | null,
    selectionStatus: null as string | null,
    selectionPlanId: null as string | null,
  };
  try {
    const registry = loadModelProfileRegistry(paths, findPackageRoot());
    const runtime = readRuntimeCapabilitySnapshot(paths, "generic-runtime", findPackageRoot());
    const plan = readCurrentModelExecutionPlan(paths, findPackageRoot());
    model = {
      registryStatus: "valid",
      profileCount: registry.profiles.length,
      runtimeId: runtime.runtimeId,
      runtimeIdentityDigest: runtime.identityDigest,
      routingStatus: plan?.status ?? null,
      modelPlanId: plan?.planId ?? null,
      selectedProfileId: plan?.selectedProfileId ?? null,
      selectionMode: plan?.selectionMode ?? null,
      requiredCapabilityClass: plan?.requiredCapabilityClass ?? null,
    };
  } catch {
    model.registryStatus = "blocked-corrupt-or-unavailable";
  }
  try {
    const registry = loadSpecialistRegistry(paths, findPackageRoot());
    const plan = readCurrentSpecialistSelectionPlan(paths, findPackageRoot());
    specialist = { registryStatus: "valid", profileCount: registry.profiles.length, registryDigest: registry.registryDigest, selectionStatus: plan?.status ?? null, selectionPlanId: plan?.selectionPlanId ?? null };
  } catch {
    specialist.registryStatus = "blocked-corrupt-or-unavailable";
  }
  const adapters: HostAdapterStatusSummary[] = HOST_ADAPTER_IDS.map((adapterId) => {
    try {
      return hostAdapterStatus(
        adapterId,
        { uadsHome: options.uadsHome, projectId: fingerprint.projectId, paths },
        findPackageRoot(),
      );
    } catch {
      return {
        adapterId,
        support: "BLOCKED",
        install: "NOT_INSTALLED",
        ownership: "UNKNOWN",
        version: null,
        targetLabel: "unknown",
        capabilityProof: "unknown",
        preparedBundle: "stale",
        reasonCodes: ["ADAPTER_STATE_UNAVAILABLE"],
      };
    }
  });

  if (options.json) {
    return `${JSON.stringify(
      {
        version,
        projectId: fingerprint.projectId,
        fingerprint: fingerprint.fingerprint,
        workspaceExists: fs.existsSync(paths.workspace),
        zeroProjectFootprint: true,
        workingTree: dirty ? "dirty" : "clean",
        workOrderId: workOrder?.workOrderId ?? null,
        phase: checkpoint?.phase ?? null,
        riskLevel: workOrder?.riskLevel ?? null,
        scopeClass: workOrder?.scopeClass ?? null,
        specialists: workOrder?.specialists ?? [],
        gates: workOrder?.qualityGates ?? [],
        nextAction: execution?.executionRunId ? execution.nextAction : checkpoint?.nextAction ?? null,
        executionRunId: execution?.executionRunId ?? null,
        attempt: execution?.attempt ?? null,
        changeDigest: execution?.changeDigest ?? null,
        pendingGates: execution?.pendingGates ?? [],
        failedGates: execution?.failedGates ?? [],
        requiredReviewers: execution?.requiredReviewers ?? [],
        completedReviewers: execution?.completedReviewers ?? [],
        contextPackId: contextPlan?.contextPackId ?? null,
        indexDigest: contextPlan?.indexDigest ?? null,
        activeFailureId: failure?.activeFailureId ?? null,
        failureSignaturePrefix: failure?.failureSignaturePrefix ?? null,
        diagnosisStatus: failure?.diagnosisStatus ?? null,
        loopDetected: failure?.loopDetected ?? false,
        recommendedDiagnosticRadius: failure?.recommendedDiagnosticRadius ?? null,
        cacheReusableRecords: cache.reusableRecords,
        costBudgetStatus: cost.budgetStatus,
        qptRatio: cost.qptRatio,
        modelRegistryStatus: model.registryStatus,
        modelProfileCount: model.profileCount,
        runtimeId: model.runtimeId,
        runtimeIdentityDigest: model.runtimeIdentityDigest,
        modelRoutingStatus: model.routingStatus,
        modelPlanId: model.modelPlanId,
        selectedProfileId: model.selectedProfileId,
        modelSelectionMode: model.selectionMode,
        modelRequiredCapabilityClass: model.requiredCapabilityClass,
        specialistRegistryStatus: specialist.registryStatus,
        specialistProfileCount: specialist.profileCount,
        specialistRegistryDigest: specialist.registryDigest,
        specialistSelectionStatus: specialist.selectionStatus,
        specialistSelectionPlanId: specialist.selectionPlanId,
        adapters,
      },
      null,
      2,
    )}\n`;
  }

  return [
    `UADS status v${version}`,
    `branch: ${git.branch ?? "(none)"}`,
    `head: ${git.head ?? "(no commits)"}`,
    `origin: ${git.originUrl ?? "(none)"}`,
    `fingerprintSource: ${fingerprint.source}`,
    `fingerprint: ${fingerprint.fingerprint}`,
    `projectId: ${fingerprint.projectId}`,
    `workspaceExists: ${fs.existsSync(paths.workspace)}`,
    `zeroProjectFootprint: true`,
    `workingTree: ${dirty ? "dirty" : "clean"}`,
    `workOrderId: ${workOrder?.workOrderId ?? "(none)"}`,
    `executionRunId: ${execution?.executionRunId ?? "(none)"}`,
    `phase: ${checkpoint?.phase ?? "(none)"}`,
    `executionStatus: ${execution?.status ?? "(none)"}`,
    `attempt: ${execution?.attempt ?? "(none)"}`,
    `changeDigest: ${execution?.changeDigest ?? "(none)"}`,
    `riskLevel: ${workOrder?.riskLevel ?? "(none)"}`,
    `scopeClass: ${workOrder?.scopeClass ?? "(none)"}`,
    `specialists: ${workOrder?.specialists.join(", ") || "(none)"}`,
    `gates: ${workOrder?.qualityGates.join(", ") || "(none)"}`,
    `pendingGates: ${execution?.pendingGates.join(", ") || "(none)"}`,
    `nextAction: ${execution?.executionRunId ? execution.nextAction : checkpoint?.nextAction ?? "(none)"}`,
    `activeFailureId: ${failure?.activeFailureId ?? "(none)"}`,
    `failureSignaturePrefix: ${failure?.failureSignaturePrefix ?? "(none)"}`,
    `diagnosisStatus: ${failure?.diagnosisStatus ?? "(none)"}`,
    `loopDetected: ${failure?.loopDetected ?? false}`,
    `recommendedDiagnosticRadius: ${failure?.recommendedDiagnosticRadius ?? "(none)"}`,
    `modelRegistryStatus: ${model.registryStatus}`,
    `modelProfileCount: ${model.profileCount}`,
    `modelRoutingStatus: ${model.routingStatus ?? "(none)"}`,
    `modelPlanId: ${model.modelPlanId ?? "(none)"}`,
    `selectedProfileId: ${model.selectedProfileId ?? "(none)"}`,
    `modelSelectionMode: ${model.selectionMode ?? "(none)"}`,
    `specialistRegistryStatus: ${specialist.registryStatus}`,
    `specialistProfileCount: ${specialist.profileCount}`,
    `specialistSelectionStatus: ${specialist.selectionStatus ?? "(none)"}`,
    `specialistSelectionPlanId: ${specialist.selectionPlanId ?? "(none)"}`,
    ...adapters.map((adapter) =>
      `adapter:${adapter.adapterId} support=${adapter.support} install=${adapter.install} ownership=${adapter.ownership} prepared=${adapter.preparedBundle}`,
    ),
    "",
  ].join("\n");
}
