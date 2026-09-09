#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runNpm } from "../lib/exec.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = argumentValue("--output") ?? path.join(root, "tmp", "release", "validation-report.json");
const ciBinding = argumentValue("--ci-binding");
const directReview = argumentValue("--direct-review");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const currentCommit = git(["rev-parse", "HEAD"]);
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });

const commands = [
  ["npm-ci", ["ci"]],
  ["lint", ["run", "lint"]],
  ["typecheck", ["run", "typecheck"]],
  ["build", ["run", "build"]],
  ["tests", ["test"]],
  ["eval-orchestrator", ["run", "eval:orchestrator"]],
  ["eval-execution", ["run", "eval:execution"]],
  ["eval-context", ["run", "eval:context"]],
  ["eval-fault", ["run", "eval:fault"]],
  ["eval-cost", ["run", "eval:cost"]],
  ["eval-model-routing", ["run", "eval:model-routing"]],
  ["eval-specialist-routing", ["run", "eval:specialist-routing"]],
  ["eval-adapters", ["run", "eval:adapters"]],
  ["eval-assurance", ["run", "eval:assurance"]],
  ["eval-fault-injection", ["run", "eval:fault-injection"]],
  ["skills-validation", ["run", "validate:skills"]],
  ["action-pin-validation", ["run", "validate:actions"]],
  ["direct-review-validation", ["run", "validate:direct-review", "--", ...(directReview ? ["--file", path.resolve(directReview), "--expected-sha", currentCommit, "--expected-version", packageJson.version] : [])]],
  ["aggregate-validation", ["run", "validate"]],
  ["npm-audit", ["audit", "--audit-level=high"]],
  ["packaging", ["pack", "--dry-run", "--json"]],
];

const results = [];
for (const [id, args] of commands) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  process.stdout.write(`\n[release-validation] ${id}: npm ${args.join(" ")}\n`);
  const result = runNpm(args, { cwd: root, stdio: "inherit" });
  const entry = {
    id,
    command: `npm ${args.map(redactCommandArgument).join(" ")}`,
    startedAt,
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    exitCode: result.status ?? 1,
    status: result.status === 0 ? "PASS" : "FAIL",
  };
  results.push(entry);
  if (result.status !== 0) {
    writeReport(results, output);
    process.exit(result.status ?? 1);
  }
}

writeReport(results, output);
process.stdout.write(`\nrelease validation report: ${path.resolve(output)}\n`);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function writeReport(commandsRun, destination) {
  const report = {
    schema: "uads.release-validation-report",
    schemaVersion: packageJson.version,
    generatedAt: new Date().toISOString(),
    version: packageJson.version,
    commit: git(["rev-parse", "HEAD"]),
    ciBinding: ciBinding ? "ci-binding.json" : null,
    commands: commandsRun,
    summary: {
      total: commandsRun.length,
      passed: commandsRun.filter((command) => command.status === "PASS").length,
      failed: commandsRun.filter((command) => command.status !== "PASS").length,
    },
  };
  fs.writeFileSync(path.resolve(destination), `${JSON.stringify(report, null, 2)}\n`);
}

function redactCommandArgument(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) return value;
  const relative = path.relative(root, value);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.split(path.sep).join("/");
  return "<absolute-path>";
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}
