import { runResume } from "../kernel/orchestrator.js";

export function runResumeCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  const packet = runResume(input);
  if (input.json) {
    return `${JSON.stringify(packet, null, 2)}\n`;
  }
  return [
    "UADS resume",
    `projectId: ${packet.projectId}`,
    `workOrderId: ${packet.workOrderId ?? "(none)"}`,
    `phase: ${packet.phase ?? "(none)"}`,
    `status: ${packet.status}`,
    `objective: ${packet.objective ?? "(none)"}`,
    `scopeClass: ${packet.scopeClass ?? "(none)"}`,
    `riskLevel: ${packet.riskLevel ?? "(none)"}`,
    `specialists: ${packet.specialists.join(", ") || "(none)"}`,
    `gates: ${packet.gates.join(", ") || "(none)"}`,
    `repositoryMapDigest: ${packet.repositoryMapDigest ?? "(none)"}`,
    packet.executionRunId ? `executionRunId: ${packet.executionRunId}` : "",
    packet.attempt != null ? `attempt: ${packet.attempt}` : "",
    packet.changeDigest ? `changeDigest: ${packet.changeDigest}` : "",
    packet.pendingGates?.length ? `pendingGates: ${packet.pendingGates.join(", ")}` : "",
    packet.failedGates?.length ? `failedGates: ${packet.failedGates.join(", ")}` : "",
    packet.requiredReviewers?.length ? `requiredReviewers: ${packet.requiredReviewers.join(", ")}` : "",
    packet.completedReviewers?.length ? `completedReviewers: ${packet.completedReviewers.join(", ")}` : "",
    packet.activeFailureId ? `activeFailureId: ${packet.activeFailureId}` : "",
    packet.failureSignaturePrefix ? `failureSignaturePrefix: ${packet.failureSignaturePrefix}` : "",
    packet.diagnosisStatus ? `diagnosisStatus: ${packet.diagnosisStatus}` : "",
    packet.loopDetected ? `loopDetected: ${packet.loopDetected}` : "",
    packet.recommendedDiagnosticRadius
      ? `recommendedDiagnosticRadius: ${packet.recommendedDiagnosticRadius}`
      : "",
    packet.cacheReusableRecords != null ? `cacheReusableRecords: ${packet.cacheReusableRecords}` : "",
    packet.costBudgetStatus ? `costBudgetStatus: ${packet.costBudgetStatus}` : "",
    packet.qptRatio != null ? `qptRatio: ${packet.qptRatio}` : "",
    packet.modelRoutingStatus ? `modelRoutingStatus: ${packet.modelRoutingStatus}` : "",
    packet.modelPlanId ? `modelPlanId: ${packet.modelPlanId}` : "",
    packet.selectedProfileId ? `selectedProfileId: ${packet.selectedProfileId}` : "",
    packet.modelSelectionMode ? `modelSelectionMode: ${packet.modelSelectionMode}` : "",
    `nextAction: ${packet.nextAction}`,
    packet.invalidState ? `invalidState: ${packet.invalidState}` : "",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .concat("\n");
}
