import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNpm, runProcess } from "./exec.js";
import { sanitizeReviewText } from "./secrets.js";
import type { UadsPaths } from "./workspace.js";

export const EVIDENCE_FILE_NAMES = [
  "validation-summary.json",
  "npm-ci.txt",
  "lint.txt",
  "typecheck.txt",
  "build.txt",
  "tests.txt",
  "orchestrator-eval.txt",
  "execution-eval.txt",
  "context-eval.txt",
  "fault-eval.txt",
  "cost-eval.txt",
  "skills-validation.txt",
  "foundation-validation.txt",
  "npm-audit.txt",
] as const;

export type EvidenceStatus = "PASS" | "FAIL" | "NOT_RUN";

export type ValidationCommandRecord = {
  id: string;
  command: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number | null;
  status: EvidenceStatus;
  toolVersion: string;
  outputArtifact: string;
};

export type ValidationSummary = {
  schema: "uads.validation-summary";
  schemaVersion: "0.1.0";
  generatedAt: string;
  runtime: {
    node: string;
    npm: string;
    os: string;
  };
  commands: ValidationCommandRecord[];
};

export type GateSpec = {
  id: string;
  command: string;
  args: string[];
  file: string;
};

export const FOUNDATION_GATES: GateSpec[] = [
  { id: "npm-ci", command: "npm", args: ["ci"], file: "npm-ci.txt" },
  { id: "lint", command: "npm", args: ["run", "lint"], file: "lint.txt" },
  { id: "typecheck", command: "npm", args: ["run", "typecheck"], file: "typecheck.txt" },
  { id: "build", command: "npm", args: ["run", "build"], file: "build.txt" },
  { id: "tests", command: "npm", args: ["test"], file: "tests.txt" },
  { id: "orchestrator-eval", command: "npm", args: ["run", "eval:orchestrator"], file: "orchestrator-eval.txt" },
  { id: "execution-eval", command: "npm", args: ["run", "eval:execution"], file: "execution-eval.txt" },
  { id: "context-eval", command: "npm", args: ["run", "eval:context"], file: "context-eval.txt" },
  { id: "fault-eval", command: "npm", args: ["run", "eval:fault"], file: "fault-eval.txt" },
  { id: "cost-eval", command: "npm", args: ["run", "eval:cost"], file: "cost-eval.txt" },
  { id: "skills-validation", command: "npm", args: ["run", "validate:skills"], file: "skills-validation.txt" },
  { id: "validate", command: "npm", args: ["run", "validate"], file: "foundation-validation.txt" },
  { id: "npm-audit", command: "npm", args: ["audit"], file: "npm-audit.txt" },
];

export function statusFromExit(exitCode: number | null, ran: boolean): EvidenceStatus {
  if (!ran) {
    return "NOT_RUN";
  }
  if (exitCode === 0) {
    return "PASS";
  }
  return "FAIL";
}

export function assertStatusMatchesExit(record: ValidationCommandRecord): void {
  const expected = statusFromExit(record.exitCode, record.status !== "NOT_RUN");
  if (record.status === "PASS" && record.exitCode !== 0) {
    throw new Error("validation summary cannot record PASS for a non-zero exit code");
  }
  if (record.status !== "NOT_RUN" && record.status !== expected) {
    throw new Error("validation summary status does not match exit code");
  }
}

export function writeValidationSummary(evidenceDir: string, summary: ValidationSummary): void {
  for (const record of summary.commands) {
    assertStatusMatchesExit(record);
  }
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, "validation-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
}

function toolVersion(command: string): string {
  try {
    const result = command === "npm" ? runNpm(["--version"]) : runProcess(command, ["--version"]);
    return `${command} ${(result.stdout || result.stderr || "").trim() || "unknown"}`.trim();
  } catch {
    return `${command} unknown`;
  }
}

export function captureFoundationEvidence(input: {
  cwd: string;
  paths: UadsPaths;
}): { summary: ValidationSummary; evidenceDir: string; failed: boolean } {
  const evidenceDir = path.join(input.paths.workspace, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });

  const commands: ValidationCommandRecord[] = [];
  const hostPaths = [input.cwd, input.paths.home, input.paths.workspace];

  for (const gate of FOUNDATION_GATES) {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const result =
      gate.command === "npm"
        ? runNpm(gate.args, { cwd: input.cwd })
        : runProcess(gate.command, gate.args, { cwd: input.cwd });
    const endedAt = new Date().toISOString();
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const sanitized = sanitizeReviewText(output, hostPaths);
    fs.writeFileSync(
      path.join(evidenceDir, gate.file),
      sanitized.omit ? "[REDACTED:unsanitizable-output]\n" : sanitized.text,
      "utf8",
    );

    const exitCode = result.status;
    const record: ValidationCommandRecord = {
      id: gate.id,
      command: `${gate.command} ${gate.args.join(" ")}`.trim(),
      startedAt,
      endedAt,
      durationMs: Date.now() - startedMs,
      exitCode,
      status: statusFromExit(exitCode, true),
      toolVersion: toolVersion(gate.command),
      outputArtifact: `evidence/${gate.file}`,
    };
    commands.push(record);
  }

  const summary: ValidationSummary = {
    schema: "uads.validation-summary",
    schemaVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      npm: toolVersion("npm"),
      os: `${os.platform()} ${os.release()}`,
    },
    commands,
  };
  writeValidationSummary(evidenceDir, summary);

  return {
    summary,
    evidenceDir,
    failed: commands.some((command) => command.status === "FAIL"),
  };
}

export function listSidecarEvidence(evidenceDir: string): Array<{ name: string; content: string }> {
  if (!fs.existsSync(evidenceDir)) {
    return [];
  }

  const files: Array<{ name: string; content: string }> = [];
  for (const name of EVIDENCE_FILE_NAMES) {
    const abs = path.join(evidenceDir, name);
    if (!fs.existsSync(abs)) {
      continue;
    }
    files.push({ name, content: fs.readFileSync(abs, "utf8") });
  }
  return files;
}
