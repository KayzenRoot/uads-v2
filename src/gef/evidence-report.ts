import type { MachineEvidence } from "./machine-evidence.js";
import { summarizeValidation } from "./machine-evidence.js";

export const EVIDENCE_REPORT_VERSION = "1.0.0" as const;

export function renderEvidenceReport(evidence: MachineEvidence): string {
  const lines: string[] = [];
  const summary = summarizeValidation(evidence);
  lines.push(`# GEF Work Evidence — ${evidence.taskId}`);
  lines.push("");
  lines.push(`- workOrder: ${evidence.workOrder}`);
  lines.push(`- base: ${evidence.baseSha ?? "UNAVAILABLE"}`);
  lines.push(`- head: ${evidence.headSha ?? "UNAVAILABLE"}`);
  lines.push(`- workingTree: ${evidence.workingTreeDigest === null ? (evidence.headSha === null ? "UNAVAILABLE" : "CLEAN") : `DIRTY ${evidence.workingTreeDigest.slice(0, 12)}`}`);
  lines.push(`- terminalState: ${evidence.terminalState}`);
  lines.push(`- checks: ${summary.pass} PASS / ${summary.fail} FAIL / ${summary.notRun} NOT_RUN`);
  lines.push(`- evidenceDigest: ${evidence.evidenceDigest}`);
  lines.push("");
  lines.push("## Changed files");
  if (evidence.changedFiles.length === 0) {
    lines.push("- (none)");
  } else {
    for (const file of evidence.changedFiles) lines.push(`- ${file}`);
  }
  lines.push("");
  lines.push("## Command receipts");
  if (evidence.commandReceipts.length === 0) {
    lines.push("- (none)");
  } else {
    for (const receipt of evidence.commandReceipts) {
      lines.push(`- ${receipt.commandId}@${receipt.commandVersion} [${receipt.source}] ${receipt.outcome} exit=${receipt.exitCode ?? "?"} durationMs=${receipt.durationMs} bytes=${receipt.stdoutBytes}/${receipt.stderrBytes}`);
    }
  }
  lines.push("");
  lines.push("## Local validation");
  const names = Object.keys(evidence.localValidation).sort();
  if (names.length === 0) {
    lines.push("- (none)");
  } else {
    for (const name of names) lines.push(`- ${name}: ${evidence.localValidation[name] ?? "UNAVAILABLE"}`);
  }
  lines.push("");
  lines.push("## Telemetry");
  lines.push(`- commandsRun=${evidence.telemetry.commandsRun} cacheHits=${evidence.telemetry.cacheHits} cacheMisses=${evidence.telemetry.cacheMisses} totalDurationMs=${evidence.telemetry.totalDurationMs} totalStdoutBytes=${evidence.telemetry.totalStdoutBytes}`);
  if (evidence.knownDebt.length > 0) {
    lines.push("");
    lines.push("## Known debt");
    for (const debt of evidence.knownDebt) lines.push(`- ${debt}`);
  }
  lines.push("");
  return `${lines.join("\n")}`;
}
