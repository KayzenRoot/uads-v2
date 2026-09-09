import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import type { UadsPaths } from "../lib/workspace.js";
import type { ModelCapability } from "./model-types.js";

export const HOST_CAPABILITY_PROBE_DESCRIPTOR_SCHEMA = "uads.host-capability-probe-descriptor" as const;
export const HOST_CAPABILITY_PROBE_DESCRIPTOR_VERSION = "1.0.0" as const;
export const HOST_CAPABILITY_PROBE_RECEIPT_SCHEMA = "uads.host-capability-probe-receipt" as const;
export const HOST_CAPABILITY_PROBE_RECEIPT_VERSION = "1.0.0" as const;

export type ProbeAvailability = "PRODUCTION" | "TEST_ONLY";
export type ProbeSideEffectClass =
  | "READ_ONLY_LOCAL"
  | "TEMPORARY_LOCAL"
  | "NETWORK_OBSERVE"
  | "MUTATING"
  | "COST_BEARING";
export type ProbeNetworkPolicy = "DENY" | "OBSERVE";
export type ProbeParserId = "node-version-v1" | "exit-code-v1" | "echo-safe-v1";
export type ProbeStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "TIMED_OUT"
  | "OUTPUT_LIMIT"
  | "BLOCKED"
  | "IDENTITY_DRIFT";
export type SafeEnvName =
  | "SystemRoot"
  | "WINDIR"
  | "TEMP"
  | "TMP"
  | "TMPDIR"
  | "HOME"
  | "USERPROFILE"
  | "LANG"
  | "LC_ALL";

export type HostCapabilityProbeDescriptor = {
  schema: typeof HOST_CAPABILITY_PROBE_DESCRIPTOR_SCHEMA;
  schemaVersion: typeof HOST_CAPABILITY_PROBE_DESCRIPTOR_VERSION;
  probeId: string;
  purpose: string;
  availability: ProbeAvailability;
  capabilityId: ModelCapability | null;
  executableRule: "node-current";
  fixedArgs: string[];
  sideEffectClass: ProbeSideEffectClass;
  networkPolicy: ProbeNetworkPolicy;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  envAllowlist: SafeEnvName[];
  parserId: ProbeParserId;
  supportedPlatforms: Array<"linux" | "win32" | "darwin">;
  descriptorDigest: string;
};

export type HostCapabilityProbeReceipt = {
  schema: typeof HOST_CAPABILITY_PROBE_RECEIPT_SCHEMA;
  schemaVersion: typeof HOST_CAPABILITY_PROBE_RECEIPT_VERSION;
  executionId: string;
  probeId: string;
  descriptorDigest: string;
  subjectDigest: string;
  capabilityId: ModelCapability | null;
  status: ProbeStatus;
  executableIdentityBefore: string | null;
  executableIdentityAfter: string | null;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  signal: string | null;
  stdoutDigest: string;
  stderrDigest: string;
  stdoutBytes: number;
  stderrBytes: number;
  parserId: ProbeParserId;
  parsedSummary: string | null;
  reasonCodes: string[];
  receiptDigest: string;
};

export type HostCapabilityProbeRead =
  | { status: "VALID"; receipt: HostCapabilityProbeReceipt; error: null }
  | { status: "MISSING"; receipt: null; error: null }
  | { status: "REJECTED"; receipt: null; error: string };

export type ProbeExecutionOptions = {
  paths?: UadsPaths;
  persist?: boolean;
  schemaRoot?: string;
  now?: () => Date;
  identityProvider?: (phase: "before" | "after") => string;
};

type DescriptorInput = Omit<
  HostCapabilityProbeDescriptor,
  "schema" | "schemaVersion" | "descriptorDigest"
>;

const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const SAFE_ENV = new Set<SafeEnvName>([
  "SystemRoot","WINDIR","TEMP","TMP","TMPDIR","HOME","USERPROFILE","LANG","LC_ALL",
]);
const ALLOWED_DESCRIPTOR_INPUT_KEYS = [
  "probeId","purpose","availability","capabilityId","executableRule","fixedArgs",
  "sideEffectClass","networkPolicy","timeoutMs","maxStdoutBytes","maxStderrBytes",
  "envAllowlist","parserId","supportedPlatforms",
] as const;

const inFlight = new Map<string, Promise<HostCapabilityProbeReceipt>>();
let spawnCount = 0;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left],[right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key,nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("probe descriptor input must be an object");
  }
}

function assertSafeId(value: string, label: string): void {
  if (!SAFE_ID.test(value) || containsAbsoluteHostPath(value) || containsUnredactedSecret(value)) {
    throw new Error(`${label} is unsafe`);
  }
}

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) throw new Error(`${label} must be a sha256 digest`);
}

function assertSafeSummary(value: string): void {
  if (
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    containsAbsoluteHostPath(value) ||
    containsUnredactedSecret(value)
  ) {
    throw new Error("parsed summary is unsafe");
  }
}

export function computeHostCapabilityProbeDescriptorDigest(
  descriptor: Omit<HostCapabilityProbeDescriptor, "descriptorDigest">,
): string {
  return sha256Hex(canonicalJson(descriptor));
}

export function compileHostCapabilityProbeDescriptor(raw: unknown, schemaRoot?: string): HostCapabilityProbeDescriptor {
  assertRecord(raw);
  const unknown = Object.keys(raw).filter(
    (key) => !(ALLOWED_DESCRIPTOR_INPUT_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(`probe descriptor contains unsupported fields: ${unknown.sort().join(", ")}`);
  }

  const input = raw as unknown as DescriptorInput;
  if (input.executableRule !== "node-current") throw new Error("unsupported executable rule");
  if (!Array.isArray(input.fixedArgs) || input.fixedArgs.length > 16) throw new Error("fixedArgs is unbounded");
  for (const arg of input.fixedArgs) {
    if (typeof arg !== "string" || arg.length > 512 || /[\u0000\r\n]/.test(arg)) {
      throw new Error("fixedArgs contains unsafe or unbounded argument");
    }
  }
  if (!Array.isArray(input.envAllowlist) || input.envAllowlist.some((name) => !SAFE_ENV.has(name))) {
    throw new Error("envAllowlist contains unsupported variable");
  }
  if (new Set(input.envAllowlist).size !== input.envAllowlist.length) throw new Error("envAllowlist must be unique");
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 10 || input.timeoutMs > 5000) {
    throw new Error("timeoutMs is outside the Probe Budget Fence");
  }
  for (const [label,value] of [["maxStdoutBytes",input.maxStdoutBytes],["maxStderrBytes",input.maxStderrBytes]] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 65536) throw new Error(`${label} is outside the Probe Budget Fence`);
  }

  const unsigned: Omit<HostCapabilityProbeDescriptor, "descriptorDigest"> = {
    schema: HOST_CAPABILITY_PROBE_DESCRIPTOR_SCHEMA,
    schemaVersion: HOST_CAPABILITY_PROBE_DESCRIPTOR_VERSION,
    ...input,
  };
  const descriptor: HostCapabilityProbeDescriptor = {
    ...unsigned,
    descriptorDigest: computeHostCapabilityProbeDescriptorDigest(unsigned),
  };
  assertSchema("host-capability-probe-descriptor.schema.json", descriptor, schemaRoot);
  assertSafeId(descriptor.probeId, "probeId");
  if (containsAbsoluteHostPath(descriptor.purpose) || containsUnredactedSecret(descriptor.purpose)) {
    throw new Error("probe purpose contains unsafe data");
  }
  return descriptor;
}

const BUILTIN_PROBE_INPUTS: readonly DescriptorInput[] = [
  {
    probeId: "uads.node.version.v1",
    purpose: "Validate generic local probe execution using the current Node runtime.",
    availability: "PRODUCTION",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["--version"],
    sideEffectClass: "READ_ONLY_LOCAL",
    networkPolicy: "DENY",
    timeoutMs: 1000,
    maxStdoutBytes: 256,
    maxStderrBytes: 256,
    envAllowlist: ["SystemRoot","WINDIR","LANG","LC_ALL"],
    parserId: "node-version-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
  {
    probeId: "test.stdout-overflow.v1",
    purpose: "Fixed test fixture for stdout ceiling.",
    availability: "TEST_ONLY",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["-e","process.stdout.write('x'.repeat(4096))"],
    sideEffectClass: "READ_ONLY_LOCAL",
    networkPolicy: "DENY",
    timeoutMs: 1000,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    envAllowlist: ["SystemRoot","WINDIR"],
    parserId: "exit-code-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
  {
    probeId: "test.stderr-overflow.v1",
    purpose: "Fixed test fixture for stderr ceiling.",
    availability: "TEST_ONLY",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["-e","process.stderr.write('x'.repeat(4096))"],
    sideEffectClass: "READ_ONLY_LOCAL",
    networkPolicy: "DENY",
    timeoutMs: 1000,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    envAllowlist: ["SystemRoot","WINDIR"],
    parserId: "exit-code-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
  {
    probeId: "test.timeout.v1",
    purpose: "Fixed test fixture for timeout.",
    availability: "TEST_ONLY",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["-e","setTimeout(()=>{},10000)"],
    sideEffectClass: "READ_ONLY_LOCAL",
    networkPolicy: "DENY",
    timeoutMs: 50,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    envAllowlist: ["SystemRoot","WINDIR"],
    parserId: "exit-code-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
  {
    probeId: "test.env-secret.v1",
    purpose: "Fixed test fixture for inherited secret exclusion.",
    availability: "TEST_ONLY",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["-e","process.stdout.write(process.env.UADS_TEST_SECRET?'LEAKED':'ABSENT')"],
    sideEffectClass: "READ_ONLY_LOCAL",
    networkPolicy: "DENY",
    timeoutMs: 1000,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    envAllowlist: ["SystemRoot","WINDIR"],
    parserId: "echo-safe-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
  {
    probeId: "test.single-flight.v1",
    purpose: "Fixed test fixture for single-flight execution.",
    availability: "TEST_ONLY",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["-e","setTimeout(()=>process.stdout.write('OK'),75)"],
    sideEffectClass: "READ_ONLY_LOCAL",
    networkPolicy: "DENY",
    timeoutMs: 1000,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    envAllowlist: ["SystemRoot","WINDIR"],
    parserId: "echo-safe-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
  {
    probeId: "test.mutating-blocked.v1",
    purpose: "Fixed policy-block fixture.",
    availability: "TEST_ONLY",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["--version"],
    sideEffectClass: "MUTATING",
    networkPolicy: "DENY",
    timeoutMs: 1000,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    envAllowlist: ["SystemRoot","WINDIR"],
    parserId: "node-version-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
  {
    probeId: "test.network-blocked.v1",
    purpose: "Fixed network-policy block fixture.",
    availability: "TEST_ONLY",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["--version"],
    sideEffectClass: "NETWORK_OBSERVE",
    networkPolicy: "OBSERVE",
    timeoutMs: 1000,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    envAllowlist: ["SystemRoot","WINDIR"],
    parserId: "node-version-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
  {
    probeId: "test.cost-blocked.v1",
    purpose: "Fixed cost-policy block fixture.",
    availability: "TEST_ONLY",
    capabilityId: null,
    executableRule: "node-current",
    fixedArgs: ["--version"],
    sideEffectClass: "COST_BEARING",
    networkPolicy: "DENY",
    timeoutMs: 1000,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    envAllowlist: ["SystemRoot","WINDIR"],
    parserId: "node-version-v1",
    supportedPlatforms: ["linux","win32","darwin"],
  },
];

const BUILTIN_PROBE_REGISTRY = new Map<string, HostCapabilityProbeDescriptor>(
  BUILTIN_PROBE_INPUTS.map((input) => {
    const descriptor = compileHostCapabilityProbeDescriptor(input);
    return [descriptor.probeId, descriptor];
  }),
);

export function getHostCapabilityProbeDescriptor(probeId: string): HostCapabilityProbeDescriptor {
  assertSafeId(probeId, "probeId");
  const descriptor = BUILTIN_PROBE_REGISTRY.get(probeId);
  if (!descriptor) throw new Error(`probe is not registered: ${probeId}`);
  return descriptor;
}

export function listProductionHostCapabilityProbeDescriptors(): HostCapabilityProbeDescriptor[] {
  return [...BUILTIN_PROBE_REGISTRY.values()]
    .filter((descriptor) => descriptor.availability === "PRODUCTION")
    .sort((a,b) => (a.probeId < b.probeId ? -1 : a.probeId > b.probeId ? 1 : 0));
}

export function evaluateHostCapabilityProbePolicy(
  descriptor: HostCapabilityProbeDescriptor,
  options: { nodeEnv?: string; platform?: NodeJS.Platform } = {},
): { allowed: boolean; reasonCodes: string[] } {
  const reasons: string[] = [];
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const platform = options.platform ?? process.platform;
  if (descriptor.availability === "TEST_ONLY" && nodeEnv !== "test") reasons.push("TEST_ONLY_PROBE_BLOCKED");
  if (descriptor.sideEffectClass !== "READ_ONLY_LOCAL") reasons.push("SIDE_EFFECT_CLASS_BLOCKED");
  if (descriptor.networkPolicy !== "DENY") reasons.push("NETWORK_POLICY_BLOCKED");
  if (!descriptor.supportedPlatforms.includes(platform as "linux" | "win32" | "darwin")) {
    reasons.push("PLATFORM_UNSUPPORTED");
  }
  return { allowed: reasons.length === 0, reasonCodes: reasons };
}

function executableIdentityDigest(): string {
  const resolved = fs.realpathSync(process.execPath);
  const stat = fs.statSync(resolved);
  return sha256Hex(canonicalJson({
    domain: "uads-m03-probe-executable-identity-v1",
    realpathDigest: sha256Hex(resolved),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    mode: stat.mode,
    platform: process.platform,
    arch: process.arch,
  }));
}

function hardMinimalEnvironment(descriptor: HostCapabilityProbeDescriptor): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of descriptor.envAllowlist) {
    if (!SAFE_ENV.has(name)) continue;
    const value = process.env[name];
    if (typeof value === "string" && value.length <= 4096) env[name] = value;
  }
  return env;
}

function parseOutput(descriptor: HostCapabilityProbeDescriptor, stdout: string, exitCode: number | null): string | null {
  if (descriptor.parserId === "node-version-v1") {
    const text = stdout.trim();
    if (!/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?$/.test(text)) return null;
    assertSafeSummary(text);
    return text;
  }
  if (descriptor.parserId === "exit-code-v1") {
    const text = exitCode === null ? null : `EXIT_${exitCode}`;
    if (text) assertSafeSummary(text);
    return text;
  }
  const text = stdout.trim();
  if (!/^[A-Z0-9._:-]{1,64}$/.test(text)) return null;
  assertSafeSummary(text);
  return text;
}

function unsignedReceipt(receipt: HostCapabilityProbeReceipt): Omit<HostCapabilityProbeReceipt,"receiptDigest"> {
  const { receiptDigest: _digest, ...unsigned } = receipt;
  return unsigned;
}

export function computeHostCapabilityProbeReceiptDigest(
  receipt: Omit<HostCapabilityProbeReceipt,"receiptDigest">,
): string {
  return sha256Hex(canonicalJson(receipt));
}

export function normalizeHostCapabilityProbeReceipt(raw: unknown, schemaRoot?: string): HostCapabilityProbeReceipt {
  assertSchema("host-capability-probe-receipt.schema.json", raw, schemaRoot);
  const receipt = raw as HostCapabilityProbeReceipt;
  assertSafeId(receipt.executionId, "executionId");
  assertSafeId(receipt.probeId, "probeId");
  assertDigest(receipt.descriptorDigest, "descriptorDigest");
  assertDigest(receipt.subjectDigest, "subjectDigest");
  if (receipt.executableIdentityBefore !== null) assertDigest(receipt.executableIdentityBefore, "executableIdentityBefore");
  if (receipt.executableIdentityAfter !== null) assertDigest(receipt.executableIdentityAfter, "executableIdentityAfter");
  assertDigest(receipt.stdoutDigest, "stdoutDigest");
  assertDigest(receipt.stderrDigest, "stderrDigest");
  if (receipt.parsedSummary !== null) assertSafeSummary(receipt.parsedSummary);
  const expected = computeHostCapabilityProbeReceiptDigest(unsignedReceipt(receipt));
  if (receipt.receiptDigest !== expected) throw new Error("probe receipt digest mismatch");
  return receipt;
}

function receiptPath(paths: UadsPaths, subjectDigest: string, probeId: string, executionId: string): string {
  assertDigest(subjectDigest, "subjectDigest");
  assertSafeId(probeId, "probeId");
  assertSafeId(executionId, "executionId");
  const dir = path.join(paths.runtimeCapabilities, "probe-runs", subjectDigest, probeId);
  return sidecarJsonPath(dir, executionId);
}

export function persistHostCapabilityProbeReceipt(
  paths: UadsPaths,
  raw: unknown,
  schemaRoot?: string,
): HostCapabilityProbeReceipt {
  const receipt = normalizeHostCapabilityProbeReceipt(raw, schemaRoot);
  atomicWriteJson(receiptPath(paths, receipt.subjectDigest, receipt.probeId, receipt.executionId), receipt);
  return receipt;
}

export function readHostCapabilityProbeReceipt(
  paths: UadsPaths,
  subjectDigest: string,
  probeId: string,
  executionId: string,
  schemaRoot?: string,
): HostCapabilityProbeRead {
  const target = receiptPath(paths, subjectDigest, probeId, executionId);
  if (!fs.existsSync(target)) return { status:"MISSING", receipt:null, error:null };
  const parsed = readJsonIfValid<unknown>(target);
  if (!parsed.ok) return { status:"REJECTED", receipt:null, error:parsed.error };
  try {
    const receipt = normalizeHostCapabilityProbeReceipt(parsed.value, schemaRoot);
    if (receipt.subjectDigest !== subjectDigest) throw new Error("probe receipt subject binding mismatch");
    if (receipt.probeId !== probeId) throw new Error("probe receipt probe binding mismatch");
    if (receipt.executionId !== executionId) throw new Error("probe receipt execution binding mismatch");
    return { status:"VALID", receipt, error:null };
  } catch (error) {
    return { status:"REJECTED", receipt:null, error:error instanceof Error ? error.message : String(error) };
  }
}

function buildReceipt(input: Omit<HostCapabilityProbeReceipt,"schema"|"schemaVersion"|"receiptDigest">, schemaRoot?: string): HostCapabilityProbeReceipt {
  const unsigned: Omit<HostCapabilityProbeReceipt,"receiptDigest"> = {
    schema: HOST_CAPABILITY_PROBE_RECEIPT_SCHEMA,
    schemaVersion: HOST_CAPABILITY_PROBE_RECEIPT_VERSION,
    ...input,
  };
  const receipt: HostCapabilityProbeReceipt = {
    ...unsigned,
    receiptDigest: computeHostCapabilityProbeReceiptDigest(unsigned),
  };
  return normalizeHostCapabilityProbeReceipt(receipt, schemaRoot);
}

function errorCode(error: Error & { code?: string | number; signal?: string }): number | null {
  return typeof error.code === "number" ? error.code : null;
}

function signalName(error: Error & { signal?: string }): string | null {
  return typeof error.signal === "string" && error.signal.length > 0 ? error.signal.slice(0,32) : null;
}

async function executeRegisteredProbe(
  descriptor: HostCapabilityProbeDescriptor,
  subjectDigest: string,
  options: ProbeExecutionOptions,
): Promise<HostCapabilityProbeReceipt> {
  assertDigest(subjectDigest, "subjectDigest");
  if (options.identityProvider && process.env.NODE_ENV !== "test") {
    throw new Error("test-only identity provider is not allowed outside test mode");
  }
  const clock = options.now ?? (() => new Date());
  const executionId = randomUUID();
  const startedAt = clock().toISOString();
  const policy = evaluateHostCapabilityProbePolicy(descriptor);
  if (!policy.allowed) {
    const blocked = buildReceipt({
      executionId,
      probeId:descriptor.probeId,
      descriptorDigest:descriptor.descriptorDigest,
      subjectDigest,
      capabilityId:descriptor.capabilityId,
      status:"BLOCKED",
      executableIdentityBefore:null,
      executableIdentityAfter:null,
      startedAt,
      finishedAt:clock().toISOString(),
      exitCode:null,
      signal:null,
      stdoutDigest:sha256Hex(""),
      stderrDigest:sha256Hex(""),
      stdoutBytes:0,
      stderrBytes:0,
      parserId:descriptor.parserId,
      parsedSummary:null,
      reasonCodes:policy.reasonCodes,
    }, options.schemaRoot);
    if ((options.persist ?? Boolean(options.paths)) && options.paths) {
      persistHostCapabilityProbeReceipt(options.paths, blocked, options.schemaRoot);
    }
    return blocked;
  }

  const identityBefore = options.identityProvider?.("before") ?? executableIdentityDigest();
  spawnCount += 1;
  const controller = new AbortController();
  let timeoutTriggered = false;
  const timer = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, descriptor.timeoutMs);

  const outcome = await new Promise<{
    error: (Error & { code?: string | number; signal?: string }) | null;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    execFile(
      process.execPath,
      descriptor.fixedArgs,
      {
        shell:false,
        windowsHide:true,
        env:hardMinimalEnvironment(descriptor),
        signal:controller.signal,
        maxBuffer:Math.min(descriptor.maxStdoutBytes, descriptor.maxStderrBytes),
        encoding:"utf8",
      },
      (error, stdout, stderr) => {
        resolve({
          error:error as (Error & { code?: string | number; signal?: string }) | null,
          stdout:typeof stdout === "string" ? stdout : String(stdout ?? ""),
          stderr:typeof stderr === "string" ? stderr : String(stderr ?? ""),
        });
      },
    );
  });
  clearTimeout(timer);

  const identityAfter = options.identityProvider?.("after") ?? executableIdentityDigest();
  const stdoutBytes = Math.min(Buffer.byteLength(outcome.stdout), descriptor.maxStdoutBytes);
  const stderrBytes = Math.min(Buffer.byteLength(outcome.stderr), descriptor.maxStderrBytes);
  const outputLimit =
    Boolean(outcome.error && (
      String(outcome.error.code) === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
      outcome.error.message.includes("maxBuffer")
    ));

  let status: ProbeStatus;
  const reasons: string[] = [];
  if (identityBefore !== identityAfter) {
    status = "IDENTITY_DRIFT";
    reasons.push("EXECUTABLE_IDENTITY_DRIFT");
  } else if (timeoutTriggered || outcome.error?.name === "AbortError" || String(outcome.error?.code) === "ABORT_ERR") {
    status = "TIMED_OUT";
    reasons.push("PROBE_TIMEOUT");
  } else if (outputLimit) {
    status = "OUTPUT_LIMIT";
    reasons.push("PROBE_OUTPUT_LIMIT");
  } else if (outcome.error) {
    status = "FAILED";
    reasons.push("PROBE_PROCESS_FAILED");
  } else {
    status = "SUCCEEDED";
    reasons.push("PROBE_EXECUTION_SUCCEEDED");
  }

  const parsedSummary = status === "SUCCEEDED"
    ? parseOutput(descriptor, outcome.stdout, 0)
    : null;
  if (status === "SUCCEEDED" && parsedSummary === null) {
    status = "FAILED";
    reasons.splice(0,reasons.length,"PROBE_PARSER_REJECTED");
  }

  const receipt = buildReceipt({
    executionId,
    probeId:descriptor.probeId,
    descriptorDigest:descriptor.descriptorDigest,
    subjectDigest,
    capabilityId:descriptor.capabilityId,
    status,
    executableIdentityBefore:identityBefore,
    executableIdentityAfter:identityAfter,
    startedAt,
    finishedAt:clock().toISOString(),
    exitCode:outcome.error ? errorCode(outcome.error) : 0,
    signal:outcome.error ? signalName(outcome.error) : null,
    stdoutDigest:sha256Hex(outcome.stdout),
    stderrDigest:sha256Hex(outcome.stderr),
    stdoutBytes,
    stderrBytes,
    parserId:descriptor.parserId,
    parsedSummary,
    reasonCodes:reasons,
  }, options.schemaRoot);

  if ((options.persist ?? Boolean(options.paths)) && options.paths) {
    persistHostCapabilityProbeReceipt(options.paths, receipt, options.schemaRoot);
  }
  return receipt;
}

export function executeHostCapabilityProbe(
  probeId: string,
  subjectDigest: string,
  options: ProbeExecutionOptions = {},
): Promise<HostCapabilityProbeReceipt> {
  const descriptor = getHostCapabilityProbeDescriptor(probeId);
  const key = `${subjectDigest}|${descriptor.capabilityId ?? "none"}|${descriptor.probeId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = executeRegisteredProbe(descriptor, subjectDigest, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key,promise);
  return promise;
}

export function hostCapabilityProbeRuntimeStats(): { inFlight: number; spawnCount: number } {
  return { inFlight:inFlight.size, spawnCount };
}

export function resetHostCapabilityProbeRuntimeStatsForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("probe runtime stats reset is test-only");
  if (inFlight.size > 0) throw new Error("cannot reset probe runtime stats while probes are in flight");
  spawnCount = 0;
}
