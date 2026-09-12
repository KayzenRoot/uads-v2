import fs from "node:fs";
import { readCurrentContextPack } from "../kernel/intelligence-persist.js";
import { readFailureStatusFields } from "../kernel/failure-persist.js";
import { loadModelProfileRegistry, addModelProfiles } from "../kernel/model-registry.js";
import { deriveCapabilityTruth, modelRoutingLockInput, resolveRoutingCapabilityTruth, routeModel } from "../kernel/model-router.js";
import { persistModelExecutionPlan, readCurrentModelExecutionPlan, readCurrentModelExecutionPlanState, readModelExecutionPlan } from "../kernel/model-persist.js";
import { persistRuntimeCapabilitySnapshot, readRuntimeCapabilitySnapshot } from "../kernel/model-runtime.js";
import {
  clearModelLock,
  readModelRoutingState,
  readModelRoutingStateRevisions,
  recoverModelRoutingState,
  setModelLock,
} from "../kernel/model-lock.js";
import type { HostAdapterId } from "../adapters/host-adapter-types.js";
import { readWorkOrder } from "../kernel/persist.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import { findPackageRoot } from "../lib/version.js";
import { safeErrorMessage } from "../lib/safe-persist.js";
import { assertSafeEvidenceInput } from "../kernel/failure-binding.js";

const MAX_MODEL_PROFILE_FILE_BYTES = 512 * 1024;

function context(input: { cwd?: string; uadsHome?: string }) {
  return resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
}

function profileRow(profile: ReturnType<typeof loadModelProfileRegistry>["profiles"][number]) {
  return {
    profileId: profile.profileId,
    providerId: profile.providerId,
    modelId: profile.modelId,
    status: profile.status,
    capabilityClass: profile.capabilityClass,
    reasoningClass: profile.reasoningClass,
    relativeCostClass: profile.relativeCostClass,
    relativeLatencyClass: profile.relativeLatencyClass,
    profileDigest: profile.profileDigest,
  };
}

export function runModelsListCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const registry = loadModelProfileRegistry(ctx.paths, findPackageRoot());
    const profiles = registry.profiles.map(profileRow);
    if (input.json) return `${JSON.stringify({ registryDigest: registry.registryDigest, profiles }, null, 2)}\n`;
    return [
      "UADS models list",
      `profiles: ${profiles.length}`,
      ...profiles.map((profile) => `${profile.profileId}  ${profile.status}  ${profile.capabilityClass}/${profile.reasoningClass}  ${profile.providerId}/${profile.modelId}`),
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runModelsStatusCommand(input: { cwd?: string; uadsHome?: string; json?: boolean; adapter?: string | null; hostHome?: string } = {}): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const registry = loadModelProfileRegistry(ctx.paths, schemaRoot);
    const runtime = resolveRoutingCapabilityTruth({
      adapterId: (input.adapter ?? null) as HostAdapterId | null,
      hostHome: input.hostHome,
      paths: ctx.paths,
      schemaRoot,
    });
    const capabilityTruth = deriveCapabilityTruth(runtime);
    const planRead = readCurrentModelExecutionPlanState(ctx.paths, schemaRoot);
    const plan = planRead.status === "CURRENT" ? planRead.plan : null;
    const routingState = readModelRoutingState(ctx.paths, ctx.projectId, schemaRoot);
    const lockRevisions = readModelRoutingStateRevisions(ctx.paths);
    const payload = {
      projectId: ctx.projectId,
      registryDigest: registry.registryDigest,
      profileCount: registry.profiles.length,
      enabledProfiles: registry.profiles.filter((profile) => profile.status === "enabled").length,
      experimentalProfiles: registry.profiles.filter((profile) => profile.status === "experimental").length,
      runtime: {
        runtimeId: runtime.runtimeId,
        adapterId: runtime.adapterId,
        adapterVersion: runtime.adapterVersion,
        identityDigest: runtime.identityDigest,
        provenance: runtime.provenance,
        capabilities: runtime.capabilities,
      },
      capabilityTruth,
      routingState: {
        status: routingState.status,
        mode: routingState.status === "CURRENT" ? routingState.state.mode : null,
        locked: routingState.status === "CURRENT" ? routingState.state.locked : null,
        lockRevision: routingState.status === "CURRENT" ? routingState.state.lockRevision : null,
        reasonCodes: routingState.status === "UNAVAILABLE" ? routingState.reasonCodes : [],
        revisionRecords: lockRevisions.length,
      },
      currentPlanState:
        planRead.status === "CURRENT"
          ? { status: "CURRENT" }
          : planRead.status === "LEGACY"
            ? { status: "LEGACY", observedSchemaVersion: planRead.observedSchemaVersion }
            : { status: "UNAVAILABLE", reasonCodes: planRead.reasonCodes },
      currentPlan: plan
        ? {
            planId: plan.planId,
            workOrderId: plan.workOrderId,
            status: plan.status,
            selectionMode: plan.selectionMode,
            selectedProfileId: plan.selectedProfileId,
            requiredCapabilityClass: plan.requiredCapabilityClass,
            blockedReason: plan.blockedReason,
            routingMode: plan.routingMode,
            modelLock: plan.modelLock,
            routingEnforcement: plan.routingEnforcement,
          }
        : null,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS models status",
      `profiles: ${payload.profileCount} (${payload.enabledProfiles} enabled, ${payload.experimentalProfiles} experimental)`,
      `capabilityTruth: adapter=${capabilityTruth.adapterId ?? "(unspecified)"} digest=${capabilityTruth.runtimeIdentityDigest}`,
      `currentPlan: ${plan?.status ?? "(none)"} state=${payload.currentPlanState.status}`,
      `selectedProfile: ${plan?.selectedProfileId ?? "(none)"}`,
      `routingMode: ${payload.routingState.mode ?? "(default)"}`,
      `lockRevision: ${payload.routingState.lockRevision ?? "(none)"}`,
      `routingEnforcement: ${plan?.routingEnforcement.state ?? "(none)"}`,
      plan?.blockedReason ? `blockedReason: ${plan.blockedReason}` : "",
      routingState.status === "UNAVAILABLE" ? `routingStateUnavailable: ${routingState.reasonCodes.join(", ")}` : "",
      "",
    ].filter(Boolean).join("\n") + "\n";
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runModelsExplainCommand(input: { cwd?: string; uadsHome?: string; workOrderId: string; json?: boolean }): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const workOrder = readWorkOrder(ctx.paths, input.workOrderId, schemaRoot);
    if (!workOrder || workOrder.projectId !== ctx.projectId) throw new Error("Work Order missing or cross-project");
    const current = readCurrentModelExecutionPlan(ctx.paths, schemaRoot);
    const plan = current?.workOrderId === workOrder.workOrderId ? current : null;
    const payload = plan ?? {
      workOrderId: workOrder.workOrderId,
      status: "STALE_OR_MISSING",
      message: "No current Model Execution Plan is persisted for this Work Order. Run uads models route --work-order <id>.",
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    if (!plan) return `UADS models explain\nworkOrderId: ${workOrder.workOrderId}\nstatus: STALE_OR_MISSING\nmessage: No current Model Execution Plan is persisted for this Work Order. Run uads models route --work-order <id>.\n`;
    return [
      "UADS models explain",
      `workOrderId: ${plan.workOrderId}`,
      `status: ${plan.status}`,
      `requiredCapabilityClass: ${plan.requiredCapabilityClass}`,
      `requiredCapabilities: ${plan.requiredCapabilities.join(", ")}`,
      `selectedProfile: ${plan.selectedProfileId ?? "(none)"}`,
      `selectedProvider: ${plan.selectedProviderId ?? "(none)"}`,
      `selectedModel: ${plan.selectedModelId ?? "(none)"}`,
      `selectionMode: ${plan.selectionMode}`,
      `routingMode: ${plan.routingMode}`,
      `lockRevision: ${plan.modelLock.revision}`,
      `routingEnforcement: ${plan.routingEnforcement.state}`,
      `capabilityTruthAdapter: ${plan.capabilityTruth.adapterId ?? "(unspecified)"}`,
      `parallel: ${plan.execution.parallel}`,
      `roleDispatch: ${plan.execution.roleDispatch}`,
      `usageTelemetryAvailable: ${plan.execution.usageTelemetryAvailable ?? "null"}`,
      `eligibleCandidates: ${plan.eligibleCandidates.join(", ") || "(none)"}`,
      `fallbacks: ${plan.fallbackProfileIds.join(", ") || "(none)"}`,
      `reasonCodes: ${plan.selectionReasonCodes.join(", ")}`,
      `blockedReason: ${plan.blockedReason ?? "(none)"}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runModelsRouteCommand(input: { cwd?: string; uadsHome?: string; workOrderId: string; json?: boolean; adapter?: string | null; hostHome?: string }): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const workOrder = readWorkOrder(ctx.paths, input.workOrderId, schemaRoot);
    if (!workOrder || workOrder.projectId !== ctx.projectId) throw new Error("Work Order missing or cross-project");
    const registry = loadModelProfileRegistry(ctx.paths, schemaRoot);
    const runtime = persistRuntimeCapabilitySnapshot(
      ctx.paths,
      resolveRoutingCapabilityTruth({
        adapterId: (input.adapter ?? null) as HostAdapterId | null,
        hostHome: input.hostHome,
        paths: ctx.paths,
        schemaRoot,
      }),
      schemaRoot,
    );
    const previousPlan = readCurrentModelExecutionPlan(ctx.paths, schemaRoot);
    const failure = readFailureStatusFields(ctx.paths, schemaRoot);
    const plan = routeModel({
      projectId: ctx.projectId,
      workOrder,
      registry,
      runtime,
      contextPack: readCurrentContextPack(ctx.paths, schemaRoot),
      previousPlan: previousPlan?.workOrderId === workOrder.workOrderId ? previousPlan : null,
      failureSignals: { loopDetected: failure.loopDetected },
      lockState: modelRoutingLockInput(readModelRoutingState(ctx.paths, ctx.projectId, schemaRoot)),
    });
    const persisted = persistModelExecutionPlan(ctx.paths, plan, schemaRoot);
    if (input.json) return `${JSON.stringify(persisted, null, 2)}\n`;
    return [
      "UADS models route",
      `planId: ${persisted.planId}`,
      `workOrderId: ${persisted.workOrderId}`,
      `status: ${persisted.status}`,
      `selectionMode: ${persisted.selectionMode}`,
      `selectedProfile: ${persisted.selectedProfileId ?? "(none)"}`,
      `requiredCapabilityClass: ${persisted.requiredCapabilityClass}`,
      `routingMode: ${persisted.routingMode}`,
      `lockRevision: ${persisted.modelLock.revision}`,
      `routingEnforcement: ${persisted.routingEnforcement.state}`,
      `capabilityTruthAdapter: ${persisted.capabilityTruth.adapterId ?? "(unspecified)"}`,
      `fallbacks: ${persisted.fallbackProfileIds.join(", ") || "(none)"}`,
      `blockedReason: ${persisted.blockedReason ?? "(none)"}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runModelsRegisterCommand(input: { cwd?: string; uadsHome?: string; filePath: string; json?: boolean }): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const safePath = assertSafeEvidenceInput(input.filePath, ctx.repoRoot, ctx.paths.workspace);
    const fileStat = fs.statSync(safePath);
    if (fileStat.size > MAX_MODEL_PROFILE_FILE_BYTES) throw new Error("model profile input exceeds the maximum size");
    const raw = JSON.parse(fs.readFileSync(safePath, "utf8")) as unknown;
    const registry = addModelProfiles(ctx.paths, raw, schemaRoot);
    const imported = Array.isArray(raw) ? raw.length : typeof raw === "object" && raw !== null && Array.isArray((raw as { profiles?: unknown }).profiles)
      ? ((raw as { profiles: unknown[] }).profiles).length
      : 1;
    const payload = { registryDigest: registry.registryDigest, profileCount: registry.profiles.length, imported };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return `UADS models register\nprofileCount: ${payload.profileCount}\nregistryDigest: ${payload.registryDigest}\n\n`;
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runCapabilitiesStatusCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const snapshot = readRuntimeCapabilitySnapshot(ctx.paths, "generic-runtime", findPackageRoot());
    if (input.json) return `${JSON.stringify(snapshot, null, 2)}\n`;
    return [
      "UADS capabilities status",
      `runtimeId: ${snapshot.runtimeId}`,
      `adapter: ${snapshot.adapterId}@${snapshot.adapterVersion}`,
      `identityDigest: ${snapshot.identityDigest}`,
      ...Object.entries(snapshot.capabilities).map(([name, value]) => `${name}: ${value}`),
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runCapabilitiesExplainCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const snapshot = readRuntimeCapabilitySnapshot(ctx.paths, "generic-runtime", findPackageRoot());
    const payload = {
      runtimeId: snapshot.runtimeId,
      adapterId: snapshot.adapterId,
      adapterVersion: snapshot.adapterVersion,
      provenance: snapshot.provenance,
      identityDigest: snapshot.identityDigest,
      capabilities: Object.fromEntries(Object.entries(snapshot.capabilities).map(([name, value]) => [name, { value, usable: value === true, conservativeUnknown: value === "unknown" }])),
      note: "Unknown capabilities are unavailable for required features; no provider capability is inferred.",
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS capabilities explain",
      `runtime: ${snapshot.runtimeId}`,
      `provenance: ${snapshot.provenance.source}/${snapshot.provenance.confidence}`,
      ...Object.entries(payload.capabilities).map(([name, value]) => `${name}: ${value.value} (usable=${value.usable})`),
      payload.note,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

type ModelLockStatePayload = {
  status: "CURRENT" | "ABSENT" | "UNAVAILABLE";
  mode: string | null;
  locked: { profileId: string; providerId: string; modelId: string } | null;
  lockRevision: number | null;
  updatedAt: string | null;
  registryDigest: string | null;
  stateDigest: string | null;
  revisionRecords: number;
  reasonCodes: string[];
  message?: string;
  recoveryHint?: string;
};

function modelLockStatePayload(
  read: ReturnType<typeof readModelRoutingState>,
  revisionRecords: number,
): ModelLockStatePayload {
  if (read.status === "CURRENT") {
    return {
      status: "CURRENT",
      mode: read.state.mode,
      locked: read.state.locked,
      lockRevision: read.state.lockRevision,
      updatedAt: read.state.updatedAt,
      registryDigest: read.state.registryDigest,
      stateDigest: read.state.stateDigest,
      revisionRecords,
      reasonCodes: [],
    };
  }
  if (read.status === "ABSENT") {
    return {
      status: "ABSENT",
      mode: null,
      locked: null,
      lockRevision: null,
      updatedAt: null,
      registryDigest: null,
      stateDigest: null,
      revisionRecords,
      reasonCodes: [],
    };
  }
  return {
    status: "UNAVAILABLE",
    mode: null,
    locked: null,
    lockRevision: null,
    updatedAt: null,
    registryDigest: null,
    stateDigest: null,
    revisionRecords,
    reasonCodes: read.reasonCodes,
    message: read.message,
    recoveryHint: "uads models lock recover",
  };
}

function renderModelLockPayload(payload: ModelLockStatePayload): string {
  return [
    `status: ${payload.status}`,
    `mode: ${payload.mode ?? "(default)"}`,
    `lockedProfile: ${payload.locked?.profileId ?? "(none)"}`,
    `lockRevision: ${payload.lockRevision ?? "(none)"}`,
    `revisionRecords: ${payload.revisionRecords}`,
    payload.reasonCodes.length > 0 ? `reasonCodes: ${payload.reasonCodes.join(", ")}` : "",
    payload.message ? `message: ${payload.message}` : "",
    payload.recoveryHint ? `recovery: ${payload.recoveryHint}` : "",
    "",
  ].filter(Boolean).join("\n");
}

export function runModelsLockShowCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const payload = modelLockStatePayload(
      readModelRoutingState(ctx.paths, ctx.projectId, schemaRoot),
      readModelRoutingStateRevisions(ctx.paths).length,
    );
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return `UADS models lock show\n${renderModelLockPayload(payload)}`;
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runModelsLockSetCommand(input: { cwd?: string; uadsHome?: string; profileId: string; json?: boolean }): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const registry = loadModelProfileRegistry(ctx.paths, schemaRoot);
    const profile = registry.profiles.find((item) => item.profileId === input.profileId);
    if (!profile) {
      throw new Error(`profile ${input.profileId} is not registered; Model Lock requires an exact registry profileId`);
    }
    const state = setModelLock({
      paths: ctx.paths,
      projectId: ctx.projectId,
      profile: { profileId: profile.profileId, providerId: profile.providerId, modelId: profile.modelId },
      registryDigest: registry.registryDigest,
      schemaRoot,
    });
    const payload = {
      status: "CURRENT",
      mode: state.mode,
      locked: state.locked,
      lockRevision: state.lockRevision,
      stateDigest: state.stateDigest,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return `UADS models lock set\nmode: ${payload.mode}\nlockedProfile: ${payload.locked?.profileId ?? "(none)"}\nlockRevision: ${payload.lockRevision}\n`;
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runModelsLockClearCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const registry = loadModelProfileRegistry(ctx.paths, schemaRoot);
    const state = clearModelLock({
      paths: ctx.paths,
      projectId: ctx.projectId,
      registryDigest: registry.registryDigest,
      schemaRoot,
    });
    const payload = { status: "CURRENT", mode: state.mode, locked: state.locked, lockRevision: state.lockRevision, stateDigest: state.stateDigest };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return `UADS models lock clear\nmode: ${payload.mode}\nlockRevision: ${payload.lockRevision}\n`;
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runModelsLockRecoverCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const registry = loadModelProfileRegistry(ctx.paths, schemaRoot);
    const state = recoverModelRoutingState({
      paths: ctx.paths,
      projectId: ctx.projectId,
      registryDigest: registry.registryDigest,
      schemaRoot,
    });
    const payload = {
      status: "CURRENT",
      mode: state.mode,
      locked: state.locked,
      lockRevision: state.lockRevision,
      stateDigest: state.stateDigest,
      archivedRawState: true,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return `UADS models lock recover\nmode: ${payload.mode}\nlockRevision: ${payload.lockRevision}\narchivedRawState: ${payload.archivedRawState}\n`;
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
