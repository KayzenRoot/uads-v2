import { spawnSync } from "node:child_process";
import { resolveNpmInvocation } from "../lib/exec.js";
import { redactSecrets } from "../lib/secrets.js";
import { sha256Hex } from "../lib/hash.js";
import { canonicalDigest } from "./upir.js";
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
  // Node contracts execute with the current runtime binary, never a bare
  // PATH-resolved `node`, so the executed identity always matches the
  // toolchain basis (process.version + execPath digest) even under PATH
  // shadowing.
  if (contract.executable === "node") {
    return { command: process.execPath, args: [...contract.args] };
  }
  return { command: contract.executable, args: [...contract.args] };
}

function probeVersion(command: string, args: string[], kind: string): string {
  const spawned = spawnSync(command, args, {
    shell: false,
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 65536,
    encoding: "utf8",
  });
  const output = typeof spawned.stdout === "string" ? spawned.stdout.trim() : "";
  const failed = spawned.error !== undefined || (spawned.status ?? 1) !== 0 || output.length === 0;
  if (failed) {
    throw new Error(`TOOLCHAIN_PROBE_FAILED:${kind}`);
  }
  return output.slice(0, 200);
}

function launchResolutionDigest(): string {
  // Resolution-sensitive launch basis only (PATH/PATHEXT select bare executables).
  // Values are hashed; raw host paths never persist in evidence.
  const names = process.platform === "win32" ? ["PATH", "PATHEXT"] : ["PATH"];
  return sha256Hex(names.map((name) => `${name}=${process.env[name] ?? ""}`).join("\n"));
}

export function resolveToolchainBasis(contract: CommandContract): string {
  if (contract.executable === "node") {
    return canonicalDigest({
      kind: "node",
      nodeVersion: process.version,
      execPathDigest: sha256Hex(process.execPath),
    });
  }
  if (contract.executable === "npm") {
    const npm = resolveNpmInvocation();
    const pathSensitive = npm.command === "npm";
    return canonicalDigest({
      kind: "npm",
      nodeVersion: process.version,
      invocationDigest: sha256Hex([npm.command, ...npm.argsPrefix].join("\n")),
      npmVersion: probeVersion(npm.command, [...npm.argsPrefix, "--version"], "npm"),
      ...(pathSensitive ? { launchDigest: launchResolutionDigest() } : {}),
    });
  }
  return canonicalDigest({
    kind: "git",
    gitVersion: probeVersion("git", ["--version"], "git"),
    launchDigest: launchResolutionDigest(),
  });
}

export type CommandEnvPair = { name: string; value: string };

export type ResolvedCommandEnv = {
  childEnv: Record<string, string>;
  semantic: CommandEnvPair[];
};

const OS_LAUNCH_VARS: Record<string, string[]> = {
  win32: ["SystemRoot", "windir", "PATH", "PATHEXT", "TEMP", "TMP"],
  linux: ["PATH"],
  darwin: ["PATH"],
};

export function resolveCommandEnv(contract: CommandContract, extra?: Record<string, string>): ResolvedCommandEnv {
  // The contract allowlist is the only key source: injected keys outside it
  // never reach the child, even when explicitly supplied via options.
  const semantic: CommandEnvPair[] = [];
  for (const name of [...contract.envAllowlist].sort()) {
    if (!/^[A-Z0-9_]{1,80}$/.test(name)) continue;
    const value = extra?.[name] ?? process.env[name];
    if (value === undefined || typeof value !== "string") continue;
    if (redactSecrets(value).redactionCount > 0) {
      throw new Error(`COMMAND_ENV_SECRET_REJECTED:${name}`);
    }
    semantic.push({ name, value });
  }
  const childEnv: Record<string, string> = Object.fromEntries(semantic.map((pair) => [pair.name, pair.value]));
  // Minimal OS launch variables stay launch-only: required to spawn the
  // executable on some platforms, excluded from semantic classification.
  for (const name of OS_LAUNCH_VARS[process.platform] ?? OS_LAUNCH_VARS.linux ?? []) {
    if (typeof process.env[name] === "string" && childEnv[name] === undefined) {
      childEnv[name] = process.env[name] as string;
    }
  }
  return { childEnv, semantic };
}

export function computeEnvClass(semantic: CommandEnvPair[]): string {
  return canonicalDigest([...semantic].sort((left, right) => (left.name < right.name ? -1 : 1)));
}

export function timeoutTreeCleanupKind(): "process-group" | "taskkill-tree" {
  // Bounded platform strategy without arbitrary shell: POSIX terminates the
  // dedicated process group the supervised child leads, Windows uses native
  // taskkill tree termination. Both paths are argv-only; no model-generated
  // shell text is ever involved.
  return process.platform === "win32" ? "taskkill-tree" : "process-group";
}

// Supervision runs in a child Node process so runCommandContract can stay
// synchronous: the supervisor owns the live event loop (no pipe deadlock on
// large output), enforces the contract timeout, and cleans up the whole
// process tree. The outer spawnSync carries a generous backstop timeout and
// only ever kills the supervisor itself.
const SUPERVISOR_REAP_GRACE_MS = 2000 as const;
const SUPERVISOR_OUTER_SLACK_MS = 30000 as const;

function supervisorScript(): string {
  return [
    "const { spawn, spawnSync } = require('node:child_process');",
    "const payload = JSON.parse(process.argv[1]);",
    "const child = spawn(payload.command, payload.args, { cwd: payload.cwd, env: payload.env, shell: false, windowsHide: true, detached: process.platform !== 'win32' });",
    "const started = Date.now();",
    "let stdoutHead = '', stderrHead = '', stdoutBytes = 0, stderrBytes = 0, stdoutTruncated = false, stderrTruncated = false, done = false;",
    "function cap(current, chunk, total, max) {",
    "  const text = chunk.toString('utf8');",
    "  const grown = total + Buffer.byteLength(text);",
    "  if (Buffer.byteLength(current) < max) {",
    "    current = Buffer.concat([Buffer.from(current, 'utf8'), Buffer.from(text, 'utf8')]).subarray(0, max).toString('utf8');",
    "  }",
    "  return [current, grown, grown > max];",
    "}",
    "if (child.stdout) child.stdout.on('data', (c) => { const next = cap(stdoutHead, c, stdoutBytes, payload.maxStdoutBytes); stdoutHead = next[0]; stdoutBytes = next[1]; stdoutTruncated = stdoutTruncated || next[2]; });",
    "if (child.stderr) child.stderr.on('data', (c) => { const next = cap(stderrHead, c, stderrBytes, payload.maxStderrBytes); stderrHead = next[0]; stderrBytes = next[1]; stderrTruncated = stderrTruncated || next[2]; });",
    "function snapshot() {",
    "  return { durationMs: Date.now() - started,",
    "    stdoutHead: Buffer.from(stdoutHead, 'utf8').toString('base64'), stdoutBytes: stdoutBytes, stdoutTruncated: stdoutTruncated,",
    "    stderrHead: Buffer.from(stderrHead, 'utf8').toString('base64'), stderrBytes: stderrBytes, stderrTruncated: stderrTruncated };",
    "}",
    "function finish(envelope) { if (done) return; done = true; process.stdout.write(JSON.stringify(envelope)); }",
    "let killFired = false;",
    "const timer = setTimeout(() => {",
    "  killFired = true;",
    "  try {",
    "    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, timeout: 10000 });",
    "    else process.kill(-child.pid, 'SIGKILL');",
    "  } catch (ignored) { try { child.kill('SIGKILL'); } catch (alsoIgnored) { void alsoIgnored; } }",
    "  setTimeout(() => finish(Object.assign(snapshot(), { timedOut: true, exitCode: null, signal: 'SIGKILL' })), " + String(SUPERVISOR_REAP_GRACE_MS) + ");",
    "}, payload.timeoutMs);",
    "child.on('exit', (code, signal) => { if (killFired) return; clearTimeout(timer); finish(Object.assign(snapshot(), { timedOut: false, exitCode: code, signal: signal || null })); });",
    "child.on('error', (err) => { if (killFired) return; clearTimeout(timer); finish({ spawnError: String((err && err.message) || err) }); });",
  ].join("\n");
}

type SupervisorEnvelope = {
  timedOut: boolean;
  exitCode: number | null;
  signal: string | null;
  stdoutHead: string;
  stdoutBytes: number;
  stdoutTruncated: boolean;
  stderrHead: string;
  stderrBytes: number;
  stderrTruncated: boolean;
  spawnError?: string;
};

function parseSupervisorEnvelope(output: string): SupervisorEnvelope | null {
  try {
    const parsed = JSON.parse(output.trim()) as SupervisorEnvelope;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.timedOut !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function runCommandContract(contract: CommandContract, options: RunOptions): RunnerResult {
  const started = Date.now();
  const { command, args } = resolveExecutable(contract);
  // Secret-like allowlisted values fail closed here before any spawn, and the
  // work plane resolves the same basis before any cache lookup, so no stale
  // cache entry can ever authorize the run.
  const { childEnv } = resolveCommandEnv(contract, options.env);
  let result: RunnerResult;
  try {
    const payload = JSON.stringify({
      command,
      args,
      cwd: options.repoRoot,
      env: childEnv,
      timeoutMs: contract.timeoutMs,
      maxStdoutBytes: contract.maxStdoutBytes,
      maxStderrBytes: contract.maxStderrBytes,
    });
    const spawned = spawnSync(process.execPath, ["-e", supervisorScript(), payload], {
      cwd: options.repoRoot,
      env: childEnv,
      shell: false,
      windowsHide: true,
      timeout: contract.timeoutMs + SUPERVISOR_OUTER_SLACK_MS,
      maxBuffer: 8 * 1024 * 1024,
      encoding: "utf8",
    });
    const durationMs = Date.now() - started;
    const outerTimedOut = (spawned.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT" || spawned.signal === "SIGTERM";
    const envelope = outerTimedOut ? null : parseSupervisorEnvelope(typeof spawned.stdout === "string" ? spawned.stdout : "");
    const stdout = envelope ? Buffer.from(envelope.stdoutHead, "base64").toString("utf8") : "";
    const stderr = envelope ? Buffer.from(envelope.stderrHead, "base64").toString("utf8") : "";
    const exitCode = envelope?.exitCode ?? (typeof spawned.status === "number" ? spawned.status : null);
    let outcome: RunnerOutcome;
    if (outerTimedOut) outcome = "TIMEOUT";
    else if (!envelope || envelope.spawnError) outcome = "ERROR";
    else if (envelope.timedOut) outcome = "TIMEOUT";
    else outcome = exitCode === 0 ? "PASS" : "FAIL";
    result = {
      exitCode,
      signal: envelope?.signal ?? (typeof spawned.signal === "string" ? spawned.signal : null),
      timedOut: outcome === "TIMEOUT",
      durationMs,
      stdoutBytes: envelope?.stdoutBytes ?? 0,
      stderrBytes: envelope?.stderrBytes ?? 0,
      stdoutTruncated: envelope?.stdoutTruncated ?? false,
      stderrTruncated: envelope?.stderrTruncated ?? false,
      stdoutHead: stdout,
      stderrHead: envelope?.spawnError ?? stderr,
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
