import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest } from "./upir.js";

export const COMMAND_CONTRACT_SCHEMA_VERSION = "0.1.0" as const;
export const COMMAND_CONTRACT_SCHEMA_FILE = "gef-command-contract.schema.json" as const;

export type CommandExecutable = "npm" | "node" | "git";
export type CommandPlatform = "win32" | "linux" | "darwin";

export type CommandContract = {
  schemaVersion: typeof COMMAND_CONTRACT_SCHEMA_VERSION;
  id: string;
  version: string;
  executable: CommandExecutable;
  args: string[];
  cwdMode: "PROJECT_ROOT";
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  envAllowlist: string[];
  platforms: CommandPlatform[];
  relevantFiles: string[];
  testOnly?: boolean;
  contractDigest: string;
};

function digestFor(contract: Omit<CommandContract, "contractDigest">): string {
  return canonicalDigest(contract);
}

function defineContract(contract: Omit<CommandContract, "contractDigest">): CommandContract {
  const full = { ...contract, contractDigest: digestFor(contract) };
  assertSchema(COMMAND_CONTRACT_SCHEMA_FILE, full, findPackageRoot());
  return full;
}

const REGISTRY: CommandContract[] = [
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.work.typecheck",
    version: "1.0.0",
    executable: "npm",
    args: ["run", "typecheck"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 180000,
    maxStdoutBytes: 65536,
    maxStderrBytes: 65536,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: ["package.json", "package-lock.json", "tsconfig.json"],
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.work.build",
    version: "1.0.0",
    executable: "npm",
    args: ["run", "build"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 180000,
    maxStdoutBytes: 65536,
    maxStderrBytes: 65536,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: ["package.json", "package-lock.json", "tsconfig.json"],
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.work.test.w2",
    version: "1.0.0",
    executable: "npm",
    args: ["run", "test", "--", "tests/gef-w2-commands.test.ts"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 180000,
    maxStdoutBytes: 65536,
    maxStderrBytes: 65536,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: ["package.json", "package-lock.json", "vitest.config.ts"],
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.work.git.facts",
    version: "1.0.0",
    executable: "git",
    args: ["status", "--porcelain=v1", "-uall"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 30000,
    maxStdoutBytes: 65536,
    maxStderrBytes: 16384,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: [],
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.test.probe",
    version: "1.0.0",
    executable: "node",
    args: ["-e", "process.stdout.write('gef-probe-ok')"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 30000,
    maxStdoutBytes: 4096,
    maxStderrBytes: 4096,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: [],
    testOnly: true,
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.test.fail",
    version: "1.0.0",
    executable: "node",
    args: ["-e", "process.stderr.write('boom');process.exit(3)"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 30000,
    maxStdoutBytes: 4096,
    maxStderrBytes: 4096,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: [],
    testOnly: true,
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.test.hang",
    version: "1.0.0",
    executable: "node",
    args: ["-e", "setTimeout(()=>{},30000)"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 800,
    maxStdoutBytes: 4096,
    maxStderrBytes: 4096,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: [],
    testOnly: true,
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.test.loud",
    version: "1.0.0",
    executable: "node",
    args: ["-e", "process.stdout.write('x'.repeat(200000))"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 30000,
    maxStdoutBytes: 1024,
    maxStderrBytes: 1024,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: [],
    testOnly: true,
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.test.emit-secret",
    version: "1.0.0",
    executable: "node",
    args: ["-e", "process.stdout.write('token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd end')"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 30000,
    maxStdoutBytes: 4096,
    maxStderrBytes: 4096,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: [],
    testOnly: true,
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.test.argv-literal",
    version: "1.0.0",
    executable: "node",
    args: ["-e", "process.stdout.write(process.argv.slice(1).join('|'))", "a;rm -rf x", "$(evil)", "a|b", "`backtick`", ">redirect"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 30000,
    maxStdoutBytes: 4096,
    maxStderrBytes: 4096,
    envAllowlist: [],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: [],
    testOnly: true,
  }),
  defineContract({
    schemaVersion: "0.1.0",
    id: "gef.test.env.probe",
    version: "1.0.0",
    executable: "node",
    args: ["-e", "process.stdout.write(JSON.stringify({v:process.env.GEF_TEST_VALUE??null,e:process.env.GEF_TEST_INJECTED??null}))"],
    cwdMode: "PROJECT_ROOT",
    timeoutMs: 30000,
    maxStdoutBytes: 4096,
    maxStderrBytes: 4096,
    envAllowlist: ["GEF_TEST_VALUE"],
    platforms: ["win32", "linux", "darwin"],
    relevantFiles: [],
    testOnly: true,
  }),
];

export function listCommandContracts(includeTestOnly = false): CommandContract[] {
  return REGISTRY.filter((contract) => includeTestOnly || contract.testOnly !== true).map((contract) => ({ ...contract, args: [...contract.args] }));
}

export function getCommandContract(id: string, options: { allowTestOnly?: boolean } = {}): CommandContract {
  const contract = REGISTRY.find((item) => item.id === id);
  if (!contract) throw new Error(`COMMAND_CONTRACT_UNKNOWN:${id}`);
  if (contract.testOnly === true && options.allowTestOnly !== true) throw new Error(`COMMAND_CONTRACT_TEST_ONLY:${id}`);
  if (!contract.platforms.includes(process.platform as CommandPlatform)) throw new Error(`COMMAND_CONTRACT_PLATFORM_UNSUPPORTED:${id}@${process.platform}`);
  const errors = validateAgainstSchema(COMMAND_CONTRACT_SCHEMA_FILE, contract, findPackageRoot());
  if (errors.length > 0) throw new Error(`COMMAND_CONTRACT_CORRUPT:${id}`);
  const { contractDigest: _stored, ...rest } = contract;
  void _stored;
  if (digestFor(rest) !== contract.contractDigest) throw new Error(`COMMAND_CONTRACT_DIGEST_MISMATCH:${id}`);
  return { ...contract, args: [...contract.args] };
}

export function validatePackCommandIds(ids: string[]): void {
  for (const id of ids) {
    if (!REGISTRY.some((contract) => contract.id === id && contract.testOnly !== true)) {
      throw new Error(`PACK_COMMAND_UNKNOWN:${id}`);
    }
  }
}

export function computeContractDigest(contract: Omit<CommandContract, "contractDigest">): string {
  return digestFor(contract);
}
