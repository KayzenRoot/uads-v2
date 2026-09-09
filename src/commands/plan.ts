import fs from "node:fs";
import { runPlan } from "../kernel/orchestrator.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runPlanCommand(input: {
  cwd?: string;
  uadsHome?: string;
  request?: string;
  intakePath?: string;
  json?: boolean;
}): string {
  if (!input.request && !input.intakePath) {
    throw new Error("uads plan requires --request <text> or --intake <file>");
  }
  try {
    let intake: unknown;
    if (input.intakePath) {
      intake = JSON.parse(fs.readFileSync(input.intakePath, "utf8"));
    }
    const result = runPlan({
      cwd: input.cwd,
      uadsHome: input.uadsHome,
      request: input.request,
      intake,
    });
    if (input.json) {
      return `${JSON.stringify(
        {
          workOrderId: result.workOrder.workOrderId,
          projectId: result.workOrder.projectId,
          title: result.workOrder.title,
          scopeClass: result.workOrder.scopeClass,
          riskLevel: result.workOrder.riskLevel,
          domains: result.workOrder.domains,
          specialists: result.workOrder.specialists,
          assuranceReviewers: result.workOrder.assuranceReviewers,
          specialistSelectionPlanId: result.workOrder.specialistSelectionPlanId,
          specialistSelectionDigest: result.workOrder.specialistSelectionDigest,
          specialistRegistryDigest: result.workOrder.specialistRegistryDigest,
          specialistPolicyDigest: result.workOrder.specialistPolicyDigest,
          specialistRoutingStatus: result.specialistPlan.status,
          qualityGates: result.workOrder.qualityGates,
          contextRadius: result.workOrder.contextRadius,
          modelPlanId: result.modelPlan.planId,
          modelRoutingStatus: result.modelPlan.status,
          modelRequiredCapabilityClass: result.modelPlan.requiredCapabilityClass,
          selectedProfileId: result.modelPlan.selectedProfileId,
          modelSelectionMode: result.modelPlan.selectionMode,
          nextAction: result.workOrder.nextAction,
          mapReused: result.mapReused,
        },
        null,
        2,
      )}\n`;
    }
    return [
      "UADS plan",
      `workOrderId: ${result.workOrder.workOrderId}`,
      `scopeClass: ${result.workOrder.scopeClass}`,
      `riskLevel: ${result.workOrder.riskLevel}`,
      `domains: ${result.workOrder.domains.join(", ")}`,
      `specialists: ${result.workOrder.specialists.join(", ")}`,
      `assurance: ${result.workOrder.assuranceReviewers.join(", ")}`,
      `specialistSelectionPlanId: ${result.specialistPlan.selectionPlanId}`,
      `specialistRoutingStatus: ${result.specialistPlan.status}`,
      `gates: ${result.workOrder.qualityGates.join(", ")}`,
      `contextRadius: ${result.workOrder.contextRadius}`,
      `capabilityClass: ${result.workOrder.tokenBudget.capabilityClass}`,
      `modelPlanId: ${result.modelPlan.planId}`,
      `modelRoutingStatus: ${result.modelPlan.status}`,
      `selectedProfile: ${result.modelPlan.selectedProfileId ?? "(none)"}`,
      `modelSelectionMode: ${result.modelPlan.selectionMode}`,
      `nextAction: ${result.workOrder.nextAction}`,
      `classifier: ${input.intakePath ? "host-structured" : "fallback-text"}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
