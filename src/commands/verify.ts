import { runVerify } from "../kernel/execution.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runVerifyCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const result = runVerify(input);
    const payload = {
      executionRunId: result.run.executionRunId,
      phase: result.run.phase,
      status: result.run.status,
      changeDigest: result.run.currentChangeDigest,
      changedFiles: result.run.changedFiles,
      pendingGates: result.pendingGates,
      nextAction: result.run.nextAction,
    };
    if (input.json) {
      return `${JSON.stringify(payload, null, 2)}\n`;
    }
    return [
      "UADS verify",
      `executionRunId: ${payload.executionRunId}`,
      `changeDigest: ${payload.changeDigest ?? "(none)"}`,
      `changedFiles: ${payload.changedFiles.join(", ") || "(none)"}`,
      `pendingGates: ${payload.pendingGates.join(", ") || "(none)"}`,
      `nextAction: ${payload.nextAction}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
