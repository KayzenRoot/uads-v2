import { spawnSync } from "node:child_process";
import { resolveNpmInvocation } from "../lib/exec.js";
import { redactSecrets } from "../lib/secrets.js";
import { sha256Hex } from "../lib/hash.js";
import type { CommandContract } from "./command-contract.js";

export type RunnerOutcome = "PASS" | "FAIL" | "TIMEOUT" | "ERROR";

export type RunnerResult = {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdoutHead: string;
  stderrHead: string;
  outcome: RunnerOutcome;
};

export type RunOptions = {
  repoRoot: string;
  env?: Record<string, string>;
};

function resolveExecutable(contract: CommandContract): { command: string; args: string[] } {
  if (contract.executable === "npm") {
    const npm = resolveNpmInvocation();
    return { command: npm.command, args: [...npm.argsPrefix, ...contract.args] };
  }
  return { command: contract.executable, args: [...contract.args] };
}

function buildEnv(allowlist: string[], extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  const names = new Set([...allowlist, ...Object.keys(extra ?? {})]);
  for (const name of names) {
    if (!/^[A-Z0-9_]{1,80}$/.test(name)) continue;
    const value = extra?.[name] ?? process.env[name];
    if (typeof value !== "string") continue;
    if (redactSecrets(value).redactionCount > 0) continue;
    env[name] = value;
  }
  if (process.platform === "win32") {
    for (const name of ["SystemRoot", "windir", "PATH", "PATHEXT", "TEMP", "TMP"]) {
      if (typeof process.env[name] === "string" && env[name] === undefined) env[name] = process.env[name] as string;
    }
  } else {
    if (typeof process.env.PATH === "string" && env.PATH === undefined) env.PATH = process.env.PATH;
  }
  return env;
}

function capOutput(output: string, maxBytes: number): { head: string; totalBytes: number; truncated: boolean } {
  const bytes = Buffer.byteLength(output, "utf8");
  if (bytes <= maxBytes) return { head: output, totalBytes: bytes, truncated: false };
  const buffer = Buffer.from(output, "utf8").subarray(0, maxBytes);
  return { head: buffer.toString("utf8"), totalBytes: bytes, truncated: true };
}

export function runCommandContract(contract: CommandContract, options: RunOptions): RunnerResult {
  const started = Date.now();
  const { command, args } = resolveExecutable(contract);
  let result: RunnerResult;
  try {
    const spawned = spawnSync(command, args, {
      cwd: options.repoRoot,
      env: buildEnv(contract.envAllowlist, options.env),
      shell: false,
      windowsHide: true,
      timeout: contract.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      encoding: "utf8",
    });
    const durationMs = Date.now() - started;
    const timedOut = (spawned.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT" || spawned.signal === "SIGTERM";
    const stdout = typeof spawned.stdout === "string" ? spawned.stdout : "";
    const stderr = typeof spawned.stderr === "string" ? spawned.stderr : "";
    const out = capOutput(stdout, contract.maxStdoutBytes);
    const err = capOutput(stderr, contract.maxStderrBytes);
    const exitCode = typeof spawned.status === "number" ? spawned.status : null;
    let outcome: RunnerOutcome;
    if (timedOut) outcome = "TIMEOUT";
    else if (spawned.error) outcome = "ERROR";
    else outcome = exitCode === 0 ? "PASS" : "FAIL";
    result = {
      exitCode,
      signal: typeof spawned.signal === "string" ? spawned.signal : null,
      timedOut,
      durationMs,
      stdoutBytes: out.totalBytes,
      stderrBytes: err.totalBytes,
      stdoutTruncated: out.truncated,
      stderrTruncated: err.truncated,
      stdoutHead: out.head,
      stderrHead: err.head,
      outcome,
    };
  } catch (error) {
    result = {
      exitCode: null,
      signal: null,
      timedOut: false,
      durationMs: Date.now() - started,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      stdoutHead: "",
      stderrHead: error instanceof Error ? error.message.slice(0, 500) : "spawn failed",
      outcome: "ERROR",
    };
  }
  return result;
}

export function summarizeResult(result: RunnerResult): { text: string; digest: string } {
  const redacted = redactSecrets(`outcome=${result.outcome} exit=${result.exitCode ?? "?"} stdout=${result.stdoutBytes}b stderr=${result.stderrBytes}b head=${result.stdoutHead.slice(0, 1200)} err=${result.stderrHead.slice(0, 400)}`).text;
  const text = redacted.slice(0, 2048);
  return { text, digest: sha256Hex(text) };
}
