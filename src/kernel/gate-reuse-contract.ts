import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import type { IndexBundle } from "./intelligence-types.js";
import { CACHE_POLICY_IDENTITY, MANIFEST_BASIS_PATHS, normalizeCommandIdentity } from "./cache-policy.js";
import { gateDef, type GateContractKind } from "./gates.js";
import type { RepositoryMap } from "./types.js";

export const GATE_REUSE_CONTRACT_VERSION = "0.6.0-c1";

const GATE_SCRIPT_KEYS: Record<string, string[]> = {
  static: ["lint", "typecheck"],
  "unit-test": ["test", "unit-test"],
  "contract-test": ["test", "contract-test"],
  build: ["build"],
  "web3-unit": ["test", "web3-test"],
  "dependency-audit": ["audit"],
  "database-migration": ["migrate"],
  "release-check": ["release"],
};

function detectPackageManager(repoRoot: string): string | null {
  if (fs.existsSync(path.join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(repoRoot, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(repoRoot, "bun.lock"))) return "bun";
  if (fs.existsSync(path.join(repoRoot, "package-lock.json"))) return "npm";
  if (fs.existsSync(path.join(repoRoot, "package.json"))) return "npm";
  return null;
}

export function packageScriptInvocation(pm: string | null, scriptKey: string): string {
  const runner = pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : pm === "bun" ? "bun" : "npm";
  if (scriptKey === "test") {
    if (runner === "npm") return "npm test";
    if (runner === "pnpm") return "pnpm test";
    if (runner === "yarn") return "yarn test";
    if (runner === "bun") return "bun test";
  }
  return `${runner} run ${scriptKey}`;
}

export function deriveNormalizedCommandFromMap(gateId: string, map: RepositoryMap | null): string | null {
  if (!map) {
    return null;
  }
  const keys = GATE_SCRIPT_KEYS[gateId];
  if (!keys) {
    return null;
  }
  for (const key of keys) {
    const script = map.commands[key];
    if (script && String(script).trim()) {
      const invocation = packageScriptInvocation(map.packageManager, key);
      const scriptNorm = normalizeCommandIdentity(String(script));
      if (!scriptNorm) {
        return normalizeCommandIdentity(invocation);
      }
      return normalizeCommandIdentity(`${invocation} :: ${scriptNorm}`);
    }
  }
  return null;
}

export type GateReuseContract = {
  gateId: string;
  contractKind: GateContractKind;
  contractVersion: string;
  normalizedCommandIdentity: string | null;
  gateReuseContractIdentity: string;
  derivable: boolean;
};

export function buildGateReuseContract(gateId: string, map: RepositoryMap | null): GateReuseContract {
  const def = gateDef(gateId);
  const contractKind = def?.contractKind ?? "command";
  let normalizedCommandIdentity: string | null = null;
  let derivable = false;

  if (contractKind === "command") {
    normalizedCommandIdentity = deriveNormalizedCommandFromMap(gateId, map);
    derivable = normalizedCommandIdentity !== null;
  } else if (contractKind === "invariant") {
    derivable = true;
  } else {
    derivable = false;
  }

  const identityMaterial = [
    gateId,
    contractKind,
    GATE_REUSE_CONTRACT_VERSION,
    normalizedCommandIdentity ?? "",
    CACHE_POLICY_IDENTITY,
  ].join("|");

  return {
    gateId,
    contractKind,
    contractVersion: GATE_REUSE_CONTRACT_VERSION,
    normalizedCommandIdentity,
    gateReuseContractIdentity: sha256Hex(identityMaterial),
    derivable,
  };
}

const SUPPORTED_PRODUCERS: Record<string, string> = {
  vitest: "vitest",
  jest: "jest",
  tsc: "typescript",
  eslint: "eslint",
  vite: "vite",
  webpack: "webpack",
  rollup: "rollup",
  next: "next",
  tsup: "tsup",
};

const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/;

export type ToolchainIdentityResult = {
  provable: boolean;
  identity: Record<string, string>;
  producerFamily: string | null;
  producerVersion: string | null;
  reasonCodes: string[];
};

function scriptBodyFromNormalizedCommand(normalizedCommand: string | null): string | null {
  if (!normalizedCommand) {
    return null;
  }
  const parts = normalizedCommand.split("::");
  if (parts.length >= 2) {
    return parts.slice(1).join("::").trim();
  }
  return normalizedCommand.trim();
}

function isExactVersionSpec(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("^") || trimmed.includes("~") || trimmed.includes("*") || trimmed.includes("x")) {
    return false;
  }
  if (trimmed.startsWith(">") || trimmed.startsWith("<") || trimmed.includes("||")) {
    return false;
  }
  return EXACT_VERSION_RE.test(trimmed);
}

type JsonProbe = {
  present: boolean;
  value: Record<string, unknown> | null;
  reason: "missing" | "valid" | "invalid" | "unsafe";
};

function readJsonUnderRepo(repoRoot: string, relativePath: string): JsonProbe {
  const normalizedRoot = path.resolve(repoRoot);
  const target = path.resolve(repoRoot, relativePath);
  if (!target.startsWith(normalizedRoot + path.sep) && target !== normalizedRoot) {
    return { present: true, value: null, reason: "unsafe" };
  }

  let lexicalStat: fs.Stats;
  try {
    lexicalStat = fs.lstatSync(target);
  } catch {
    return { present: false, value: null, reason: "missing" };
  }

  try {
    const realRoot = fs.realpathSync.native(normalizedRoot);
    const realTarget = fs.realpathSync.native(target);
    const relative = path.relative(realRoot, realTarget);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return { present: true, value: null, reason: "unsafe" };
    }
    if (!lexicalStat.isFile() && !lexicalStat.isSymbolicLink()) {
      return { present: true, value: null, reason: "invalid" };
    }
    const parsed = JSON.parse(fs.readFileSync(realTarget, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { present: true, value: null, reason: "invalid" };
    }
    return { present: true, value: parsed as Record<string, unknown>, reason: "valid" };
  } catch {
    return { present: true, value: null, reason: "invalid" };
  }
}

type VersionEvidence = {
  version: string | null;
  resolvedFrom: string | null;
  state: "missing" | "valid" | "invalid";
  reasonCode?: string;
};

function missingVersionEvidence(): VersionEvidence {
  return { version: null, resolvedFrom: null, state: "missing" };
}

function invalidVersionEvidence(reasonCode: string): VersionEvidence {
  return { version: null, resolvedFrom: null, state: "invalid", reasonCode };
}

function validVersionEvidence(version: string, resolvedFrom: string): VersionEvidence {
  return { version, resolvedFrom, state: "valid" };
}

function resolveFromNpmLock(repoRoot: string, packageName: string): VersionEvidence {
  const probe = readJsonUnderRepo(repoRoot, "package-lock.json");
  if (!probe.present) {
    return missingVersionEvidence();
  }
  if (probe.reason === "unsafe") {
    return invalidVersionEvidence("PRODUCER_METADATA_UNSAFE_PATH");
  }
  if (probe.reason !== "valid" || !probe.value) {
    return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
  }

  const lock = probe.value;
  const rawPackages = lock.packages;
  if (rawPackages !== undefined && (!rawPackages || typeof rawPackages !== "object" || Array.isArray(rawPackages))) {
    return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
  }
  const packages = rawPackages as Record<string, unknown> | undefined;
  if (packages) {
    const directEntry = packages[`node_modules/${packageName}`];
    if (directEntry !== undefined) {
      if (!directEntry || typeof directEntry !== "object" || Array.isArray(directEntry)) {
        return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
      }
      const direct = (directEntry as { version?: unknown }).version;
      return typeof direct === "string" && isExactVersionSpec(direct)
        ? validVersionEvidence(direct, "lockfile")
        : invalidVersionEvidence("PRODUCER_VERSION_UNRESOLVED");
    }
  }
  const rawDependencies = lock.dependencies;
  if (rawDependencies !== undefined && (!rawDependencies || typeof rawDependencies !== "object" || Array.isArray(rawDependencies))) {
    return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
  }
  const dependencies = rawDependencies as Record<string, unknown> | undefined;
  const nestedEntry = dependencies?.[packageName];
  if (nestedEntry !== undefined) {
    if (!nestedEntry || typeof nestedEntry !== "object" || Array.isArray(nestedEntry)) {
      return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
    }
    const nested = (nestedEntry as { version?: unknown }).version;
    return typeof nested === "string" && isExactVersionSpec(nested)
      ? validVersionEvidence(nested, "lockfile")
      : invalidVersionEvidence("PRODUCER_VERSION_UNRESOLVED");
  }
  return missingVersionEvidence();
}

function resolveFromNodeModules(repoRoot: string, packageName: string): VersionEvidence {
  const probe = readJsonUnderRepo(repoRoot, `node_modules/${packageName}/package.json`);
  if (!probe.present) {
    return missingVersionEvidence();
  }
  if (probe.reason === "unsafe") {
    return invalidVersionEvidence("PRODUCER_METADATA_UNSAFE_PATH");
  }
  if (probe.reason !== "valid" || !probe.value) {
    return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
  }
  const version = probe.value.version;
  return typeof version === "string" && isExactVersionSpec(version)
    ? validVersionEvidence(version, "node_modules")
    : invalidVersionEvidence("PRODUCER_VERSION_UNRESOLVED");
}

function resolveFromPackageJsonExact(repoRoot: string, packageName: string): VersionEvidence {
  const probe = readJsonUnderRepo(repoRoot, "package.json");
  if (!probe.present) {
    return missingVersionEvidence();
  }
  if (probe.reason === "unsafe") {
    return invalidVersionEvidence("PRODUCER_METADATA_UNSAFE_PATH");
  }
  if (probe.reason !== "valid" || !probe.value) {
    return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
  }

  const pkg = probe.value;
  const dependencySources: Array<{ name: string; values: Record<string, unknown> }> = [];
  for (const name of ["dependencies", "devDependencies"] as const) {
    const raw = pkg[name];
    if (raw === undefined) {
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
    }
    dependencySources.push({ name, values: raw as Record<string, unknown> });
  }
  const matching = dependencySources
    .map((source) => ({ source: source.name, spec: source.values[packageName] }))
    .filter((item) => item.spec !== undefined);
  if (matching.length === 0) {
    return missingVersionEvidence();
  }
  const specs = matching.map((item) => item.spec);
  if (specs.some((spec) => typeof spec !== "string" || !spec.trim())) {
    return invalidVersionEvidence("PRODUCER_METADATA_INVALID");
  }
  const normalizedSpecs = [...new Set(specs.map((spec) => (spec as string).trim()))];
  if (normalizedSpecs.length > 1) {
    return invalidVersionEvidence("PRODUCER_VERSION_AMBIGUOUS");
  }
  const spec = normalizedSpecs[0];
  return spec && isExactVersionSpec(spec) ? validVersionEvidence(spec, "package-json-exact") : missingVersionEvidence();
}

function resolveProducerVersion(repoRoot: string, npmPackage: string): {
  version: string | null;
  resolvedFrom: string | null;
  reasonCodes: string[];
} {
  const sources = [
    resolveFromNpmLock(repoRoot, npmPackage),
    resolveFromNodeModules(repoRoot, npmPackage),
    resolveFromPackageJsonExact(repoRoot, npmPackage),
  ];
  const invalid = sources.find((source) => source.state === "invalid");
  if (invalid) {
    return { version: null, resolvedFrom: null, reasonCodes: [invalid.reasonCode ?? "PRODUCER_METADATA_INVALID"] };
  }

  const valid = sources.filter((source): source is VersionEvidence & { version: string; resolvedFrom: string } =>
    source.state === "valid" && Boolean(source.version && source.resolvedFrom),
  );
  const versions = [...new Set(valid.map((source) => source.version))];
  if (versions.length === 0) {
    return { version: null, resolvedFrom: null, reasonCodes: ["PRODUCER_VERSION_UNRESOLVED"] };
  }
  if (versions.length > 1) {
    return { version: null, resolvedFrom: null, reasonCodes: ["PRODUCER_VERSION_AMBIGUOUS"] };
  }
  return {
    version: versions[0] ?? null,
    resolvedFrom: valid.map((source) => source.resolvedFrom).join("+") || null,
    reasonCodes: [],
  };
}

function detectProducerFromScript(scriptBody: string): { family: string; npmPackage: string } | null {
  const trimmed = scriptBody.trim();
  if (!trimmed) {
    return null;
  }
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  const bare = firstToken.replace(/^.*[/\\]/, "");
  const npmPackage = SUPPORTED_PRODUCERS[bare];
  if (!npmPackage) {
    return null;
  }
  const family = bare === "tsc" ? "typescript" : bare;
  return { family, npmPackage };
}

export function resolveToolchainIdentity(
  repoRoot: string,
  normalizedCommand: string | null,
  bundle: IndexBundle | null,
): ToolchainIdentityResult {
  const identity: Record<string, string> = {
    node: process.version,
    platform: process.platform,
    runtimeFamily: "node",
  };
  const reasonCodes: string[] = [];

  const pm = detectPackageManager(repoRoot);
  if (pm) {
    identity.packageManager = pm;
  }

  if (bundle) {
    for (const rel of MANIFEST_BASIS_PATHS) {
      const file = bundle.state.files.find((item) => item.path === rel);
      if (file) {
        identity[`manifestDigest:${rel}`] = file.contentDigest;
      }
    }
  }

  const scriptBody = scriptBodyFromNormalizedCommand(normalizedCommand);
  if (!scriptBody) {
    reasonCodes.push("TOOLCHAIN_UNPROVABLE");
    reasonCodes.push("MISSING_SCRIPT_BODY");
    return {
      provable: false,
      identity,
      producerFamily: null,
      producerVersion: null,
      reasonCodes,
    };
  }

  const producer = detectProducerFromScript(scriptBody);
  if (!producer) {
    reasonCodes.push("TOOLCHAIN_UNPROVABLE");
    reasonCodes.push("UNSUPPORTED_PRODUCER");
    return {
      provable: false,
      identity,
      producerFamily: null,
      producerVersion: null,
      reasonCodes,
    };
  }

  const resolved = resolveProducerVersion(repoRoot, producer.npmPackage);
  if (!resolved.version) {
    reasonCodes.push("TOOLCHAIN_UNPROVABLE");
    reasonCodes.push(...resolved.reasonCodes);
    return {
      provable: false,
      identity,
      producerFamily: producer.family,
      producerVersion: null,
      reasonCodes,
    };
  }

  identity.producerFamily = producer.family;
  identity.producerVersion = resolved.version;
  if (resolved.resolvedFrom) {
    identity.producerResolvedFrom = resolved.resolvedFrom;
  }

  return {
    provable: true,
    identity,
    producerFamily: producer.family,
    producerVersion: resolved.version,
    reasonCodes: [],
  };
}

export function collectToolchainIdentity(
  repoRoot: string,
  normalizedCommand: string | null,
  bundle: IndexBundle | null,
): Record<string, string> {
  return resolveToolchainIdentity(repoRoot, normalizedCommand, bundle).identity;
}

export function computeReuseProofDigest(input: {
  projectId: string;
  gateReuseContractIdentity: string;
  normalizedCommandIdentity: string | null;
  validityBasisDigests: Record<string, string>;
  manifestDigests: Record<string, string>;
  toolIdentity: Record<string, string>;
  environmentIdentity: string | null;
  policyIdentity: string;
}): string {
  const lines = [
    input.projectId,
    input.gateReuseContractIdentity,
    input.normalizedCommandIdentity ?? "",
    input.policyIdentity,
    input.environmentIdentity ?? "",
    ...Object.entries(input.validityBasisDigests)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `basis:${key}=${value}`),
    ...Object.entries(input.manifestDigests)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `manifest:${key}=${value}`),
    ...Object.entries(input.toolIdentity)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `tool:${key}=${value}`),
  ];
  return sha256Hex(lines.join("\n"));
}
