import { runEvidenceRecord } from "../kernel/execution.js";
import type { EvidenceKind, EvidenceRuntimeStatus } from "../kernel/execution-types.js";
import { safeErrorMessage } from "../lib/safe-persist.js";

export function runEvidenceRecordCommand(input: {
  cwd?: string;
  uadsHome?: string;
  json?: boolean;
  gateId: string;
  kind: string;
  role: string;
  command?: string;
  exitCode?: string;
  output?: string;
  file?: string;
  summary: string;
  status?: string;
}): string {
  try {
    const exitCode = input.exitCode === undefined ? undefined : Number(input.exitCode);
    if (input.exitCode !== undefined && !Number.isInteger(exitCode)) {
      throw new Error("exit-code must be an integer");
    }
    const result = runEvidenceRecord({
      cwd: input.cwd,
      uadsHome: input.uadsHome,
      gateId: input.gateId,
      kind: input.kind as EvidenceKind,
      role: input.role,
      command: input.command,
      exitCode,
      outputPath: input.output,
      file: input.file,
      summary: input.summary,
      status: input.status as EvidenceRuntimeStatus | undefined,
    });
    const payload = {
      evidenceId: result.record.evidenceId,
      gateId: result.record.gateId,
      status: result.record.status,
      changeDigest: result.record.changeDigest,
      gateStates: result.gateStates,
    };
    if (input.json) {
      return `${JSON.stringify(payload, null, 2)}\n`;
    }
    return [
      "UADS evidence record",
      `evidenceId: ${payload.evidenceId}`,
      `gateId: ${payload.gateId}`,
      `status: ${payload.status}`,
      `changeDigest: ${payload.changeDigest}`,
      `gateStates: ${payload.gateStates.map((gate) => `${gate.gateId}=${gate.status}`).join(", ")}`,
      "",
    ].join("\n");
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
