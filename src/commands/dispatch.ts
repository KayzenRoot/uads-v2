import { runDispatch } from "../kernel/execution.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runDispatchCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  session?: string;
}): string {
  try {
    const result = runDispatch({ cwd: input.cwd, uadsHome: input.uadsHome, session: input.session });
    if (input.json) {
      return `${JSON.stringify(result.packet, null, 2)}\n`;
    }
    return [
      "UADS dispatch",
      `executionRunId: ${result.run.executionRunId}`,
      `workOrderId: ${result.run.workOrderId}`,
      `phase: ${result.run.phase}`,
      `status: ${result.run.status}`,
      `attempt: ${result.run.attempt}`,
      `baselineGitHead: ${result.run.baseline.gitHead ?? "(none)"}`,
      `contextRadius: ${result.run.contextRadius}`,
      `gates: ${result.run.selectedGates.join(", ") || "(none)"}`,
      `modelPlanId: ${result.run.modelPlanId ?? "(none)"}`,
      `selectedProfile: ${result.run.selectedProfileId ?? "(none)"}`,
      `modelSelectionMode: ${result.run.selectionMode ?? "(none)"}`,
      `nextAction: ${result.run.nextAction}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
