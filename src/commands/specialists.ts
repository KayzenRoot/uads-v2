import { readCurrentCheckpoint, readContextPlan, readRoutingDecision, readWorkOrder, persistPlan } from "../kernel/persist.js";
import { loadSpecialistRegistry } from "../kernel/specialist-registry.js";
import { persistSpecialistSelectionPlan, readCurrentSpecialistSelectionPlan, specialistRoutingInputFromWorkOrder } from "../kernel/specialist-persist.js";
import { selectSpecialistPlan } from "../kernel/specialist-router.js";
import { resolveProjectContext } from "../kernel/project-context.js";
import { findPackageRoot } from "../lib/version.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

function context(input: { cwd?: string; uadsHome?: string }) {
  return resolveProjectContext(input.cwd ?? process.cwd(), input.uadsHome);
}

function currentWorkOrderId(ctx: ReturnType<typeof context>, explicit?: string): string {
  if (explicit) return explicit;
  const checkpoint = readCurrentCheckpoint(ctx.paths, findPackageRoot());
  if (!checkpoint?.workOrderId) throw new Error("no current Work Order is available");
  return checkpoint.workOrderId;
}

export function runSpecialistsListCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const registry = loadSpecialistRegistry(ctx.paths, findPackageRoot());
    const profiles = registry.profiles.map((profile) => ({
      specialistId: profile.specialistId,
      kind: profile.kind,
      status: profile.status,
      purpose: profile.purpose,
      coveredDomains: profile.coveredDomains,
      functions: profile.functions,
      mayImplement: profile.mayImplement,
      reviewOnly: profile.reviewOnly,
      priority: profile.priority,
      profileDigest: profile.profileDigest,
    }));
    const payload = { registryDigest: registry.registryDigest, policyVersion: registry.policyVersion, profileCount: profiles.length, profiles };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS specialists list",
      `profiles: ${profiles.length}`,
      `registryDigest: ${registry.registryDigest}`,
      ...profiles.map((profile) => `${profile.specialistId}  ${profile.status}  ${profile.kind}  ${profile.coveredDomains.join(",")}`),
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runSpecialistsStatusCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const registry = loadSpecialistRegistry(ctx.paths, schemaRoot);
    const plan = readCurrentSpecialistSelectionPlan(ctx.paths, schemaRoot);
    const payload = {
      projectId: ctx.projectId,
      registryDigest: registry.registryDigest,
      policyVersion: registry.policyVersion,
      profileCount: registry.profiles.length,
      enabledProfiles: registry.profiles.filter((profile) => profile.status === "enabled").length,
      experimentalProfiles: registry.profiles.filter((profile) => profile.status === "experimental").length,
      currentSelection: plan ? { selectionPlanId: plan.selectionPlanId, workOrderId: plan.workOrderId, status: plan.status, selectionDigest: plan.selectionDigest, selected: plan.selected.map((item) => item.specialistId), assurance: plan.assurance.map((item) => item.specialistId), blockedReasonCodes: plan.blockedReasonCodes } : null,
    };
    if (input.json) return `${JSON.stringify(payload, null, 2)}\n`;
    return [
      "UADS specialists status",
      `projectId: ${ctx.projectId}`,
      `profiles: ${payload.profileCount} (${payload.enabledProfiles} enabled, ${payload.experimentalProfiles} experimental)`,
      `registryDigest: ${payload.registryDigest}`,
      `currentSelection: ${payload.currentSelection?.status ?? "(none)"}`,
      payload.currentSelection ? `selected: ${payload.currentSelection.selected.join(", ")}` : "",
      payload.currentSelection ? `assurance: ${payload.currentSelection.assurance.join(", ")}` : "",
      "",
    ].filter(Boolean).join("\n") + "\n";
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runSpecialistsExplainCommand(input: { cwd?: string; uadsHome?: string; workOrderId?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const plan = readCurrentSpecialistSelectionPlan(ctx.paths, schemaRoot);
    if (!plan || (input.workOrderId && plan.workOrderId !== input.workOrderId) || plan.projectId !== ctx.projectId) {
      throw new Error("no current specialist selection for this project/Work Order");
    }
    if (input.json) return `${JSON.stringify(plan, null, 2)}\n`;
    return [
      "UADS specialists explain",
      `selectionPlanId: ${plan.selectionPlanId}`,
      `workOrderId: ${plan.workOrderId}`,
      `status: ${plan.status}`,
      `selected: ${plan.selected.map((item) => `${item.specialistId}[${item.reasonCodes.join(",")}]`).join(", ")}`,
      `assurance: ${plan.assurance.map((item) => `${item.specialistId}[${item.reasonCodes.join(",")}]`).join(", ")}`,
      `unmetCoverage: ${plan.unmetCoverage.join(", ") || "(none)"}`,
      `requiredObligations: ${plan.requiredObligations.length}`,
      `coveredObligations: ${plan.coveredObligations.length}`,
      `unmetObligations: ${plan.unmetObligations.map((item) => `${item.obligationId}[${item.reasonCode}]`).join(", ") || "(none)"}`,
      `conflicts: ${plan.conflicts.join(", ") || "(none)"}`,
      `parallelEligibleGroups: ${plan.dispatch.parallelEligibleGroups.map((group) => group.join(",")).join(" | ") || "(none)"}`,
      "rejections:",
      ...plan.rejections.map((item) => `  ${item.specialistId}: ${item.reasonCodes.join(",")}`),
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runSpecialistsSelectCommand(input: { cwd?: string; uadsHome?: string; workOrderId?: string; json?: boolean } = {}): string {
  try {
    const ctx = context(input);
    const schemaRoot = findPackageRoot();
    const workOrder = readWorkOrder(ctx.paths, currentWorkOrderId(ctx, input.workOrderId), schemaRoot);
    if (!workOrder || workOrder.projectId !== ctx.projectId) throw new Error("Work Order missing or cross-project");
    const registry = loadSpecialistRegistry(ctx.paths, schemaRoot);
    const plan = selectSpecialistPlan(specialistRoutingInputFromWorkOrder(workOrder, registry));
    persistSpecialistSelectionPlan(ctx.paths, plan, schemaRoot);
    const checkpoint = readCurrentCheckpoint(ctx.paths, schemaRoot);
    const decision = readRoutingDecision(ctx.paths, workOrder.routingDecisionId, schemaRoot);
    const contextPlan = readContextPlan(ctx.paths);
    if (checkpoint && decision && contextPlan) {
      persistPlan({
        paths: ctx.paths,
        workOrder: { ...workOrder, status: plan.status === "BLOCKED" ? "blocked" : workOrder.status, specialists: plan.selected.map((item) => item.specialistId), assuranceReviewers: plan.assurance.map((item) => item.specialistId), specialistSelectionPlanId: plan.selectionPlanId, specialistSelectionDigest: plan.selectionDigest, specialistRegistryDigest: plan.registryDigest, specialistPolicyDigest: plan.policyDigest, specialistChangeDigest: plan.changeDigest, specialistImpactDigest: plan.impactDigest, specialistGateContractDigest: plan.gateContractDigest, specialistAssignments: plan.assignments },
        decision: { ...decision, specialists: plan.selected.map((item) => item.specialistId), assuranceSpecialists: plan.assurance.map((item) => item.specialistId), specialistSelectionPlanId: plan.selectionPlanId, specialistSelectionDigest: plan.selectionDigest, specialistRegistryDigest: plan.registryDigest, specialistPolicyDigest: plan.policyDigest, specialistChangeDigest: plan.changeDigest, specialistImpactDigest: plan.impactDigest, specialistGateContractDigest: plan.gateContractDigest },
        checkpoint: { ...checkpoint, status: plan.status === "BLOCKED" ? "blocked" : checkpoint.status, blockers: [...plan.unmetCoverage, ...plan.conflicts] },
        contextPlan,
        schemaRoot,
      });
    }
    if (input.json) return `${JSON.stringify(plan, null, 2)}\n`;
    return `UADS specialists select\nselectionPlanId: ${plan.selectionPlanId}\nstatus: ${plan.status}\nselected: ${plan.selected.map((item) => item.specialistId).join(", ")}\nassurance: ${plan.assurance.map((item) => item.specialistId).join(", ")}\n\n`;
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
