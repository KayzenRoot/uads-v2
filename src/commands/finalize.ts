import { runFinalize } from "../kernel/execution.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runFinalizeCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const result = runFinalize(input);
    const payload = {
      executionRunId: result.run.executionRunId,
      status: result.run.status,
      phase: result.run.phase,
      changeDigest: result.run.currentChangeDigest,
      nextAction: result.run.nextAction,
    };
    if (input.json) {
      return `${JSON.stringify(payload, null, 2)}\n`;
    }
    return [
      "UADS finalize",
      `executionRunId: ${payload.executionRunId}`,
      `status: ${payload.status}`,
      `changeDigest: ${payload.changeDigest ?? "(none)"}`,
      `nextAction: ${payload.nextAction}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
