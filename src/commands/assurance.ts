import { runAssuranceRecord, runAssuranceStart } from "../kernel/execution.js";
import type { ReviewVerdict } from "../kernel/execution-types.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runAssuranceStartCommand(input: { cwd?: string; uadsHome?: string; json?: boolean } = {}): string {
  try {
    const result = runAssuranceStart(input);
    if (input.json) {
      return `${JSON.stringify(result.packet, null, 2)}\n`;
    }
    return [
      "UADS assurance start",
      `executionRunId: ${result.packet.executionRunId}`,
      `changeDigest: ${result.packet.changeDigest}`,
      `requiredReviewers: ${result.packet.requiredReviewers.join(", ") || "(none)"}`,
      `gates: ${result.packet.gateStates.map((gate) => `${gate.gateId}=${gate.status}`).join(", ")}`,
      `nextAction: ${result.packet.nextAction}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}

export function runAssuranceRecordCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  role: string;
  session: string;
  implementerSession?: string;
  verdict: string;
  summary: string;
  findings?: string;
  findingsFile?: string;
}): string {
  try {
    const result = runAssuranceRecord({
      cwd: input.cwd,
      uadsHome: input.uadsHome,
      role: input.role,
      session: input.session,
      implementerSession: input.implementerSession,
      verdict: input.verdict as ReviewVerdict,
      summary: input.summary,
      findingsJson: input.findings,
      findingsFile: input.findingsFile,
    });
    const payload = {
      reviewId: result.record.reviewId,
      verdict: result.record.verdict,
      phase: result.run.phase,
      status: result.run.status,
      attempt: result.run.attempt,
      nextAction: result.run.nextAction,
    };
    if (input.json) {
      return `${JSON.stringify(payload, null, 2)}\n`;
    }
    return [
      "UADS assurance record",
      `reviewId: ${payload.reviewId}`,
      `verdict: ${payload.verdict}`,
      `phase: ${payload.phase}`,
      `status: ${payload.status}`,
      `attempt: ${payload.attempt}`,
      `nextAction: ${payload.nextAction}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
