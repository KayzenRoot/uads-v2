import { runContextExpand } from "../kernel/execution.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runContextExpandCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  reason: string;
  approveC5?: boolean;
}): string {
  try {
    const result = runContextExpand({
      cwd: input.cwd,
      uadsHome: input.uadsHome,
      reason: input.reason,
      approveC5: input.approveC5,
    });
    const payload = {
      executionRunId: result.run.executionRunId,
      contextRadius: result.run.contextRadius,
      contextCandidates: result.run.contextCandidates,
      contextPackId: result.run.contextPackId ?? null,
      nextAction: result.run.nextAction,
    };
    if (input.json) {
      return `${JSON.stringify(payload, null, 2)}\n`;
    }
    return [
      "UADS context expand",
      `executionRunId: ${payload.executionRunId}`,
      `contextRadius: ${payload.contextRadius}`,
      `contextPackId: ${payload.contextPackId ?? "(none)"}`,
      `candidates: ${payload.contextCandidates.join(", ") || "(none)"}`,
      `nextAction: ${payload.nextAction}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
