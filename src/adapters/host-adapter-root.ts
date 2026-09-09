import os from "node:os";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import type { HostAdapterDefinition, HostAdapterDetectionInput, HostAdapterId } from "./host-adapter-types.js";
import type { ResolvedHostTargetSource } from "./host-adapter-detect.js";

export const HOST_TARGET_ROOT_BINDING_VERSION = "2" as const;
export const HOST_TARGET_ROOT_DOMAIN = "uads-host-target-root-v2" as const;
export const LEGACY_HOST_TARGET_ROOT_BINDING_VERSION = "1" as const;

export type HostAdapterRootBinding = {
  targetRootDigest: string;
  rootKind: HostRootKind;
  sourceClass: HostRootSourceClass;
  bindingVersion:
    | typeof HOST_TARGET_ROOT_BINDING_VERSION
    | typeof LEGACY_HOST_TARGET_ROOT_BINDING_VERSION;
};

export type HostRootKind = "system-user-home" | "synthetic-user-home" | "adapter-root";
export type HostRootSourceClass = "default" | "explicit-override" | "uads-environment" | "native-environment";

export type EnvironmentHostRootBinding = {
  variable: string;
  rootKind: HostRootKind;
  precedence: number;
};

export class HostAdapterRootError extends Error {
  readonly reasonCodes: readonly string[];

  constructor(message: string, reasonCodes: readonly string[]) {
    super(message);
    this.name = "HostAdapterRootError";
    this.reasonCodes = reasonCodes;
  }
}

export function adapterRootSegment(adapterId: HostAdapterId): string {
  if (adapterId === "cursor") return ".cursor";
  if (adapterId === "codex") return ".codex";
  return ".agents";
}

export function environmentBindings(adapterId: HostAdapterId): readonly EnvironmentHostRootBinding[] {
  if (adapterId === "cursor") {
    return [
      { variable: "UADS_CURSOR_HOME", rootKind: "synthetic-user-home", precedence: 1 },
      { variable: "CURSOR_USER_HOME", rootKind: "synthetic-user-home", precedence: 2 },
    ];
  }
  if (adapterId === "codex") {
    return [
      { variable: "UADS_CODEX_HOME", rootKind: "synthetic-user-home", precedence: 1 },
      { variable: "CODEX_HOME", rootKind: "adapter-root", precedence: 2 },
    ];
  }
  return [{ variable: "UADS_AGENT_SKILLS_HOME", rootKind: "synthetic-user-home", precedence: 1 }];
}

function posixPath(value: string): string {
  return path.resolve(value).split(path.sep).join("/");
}

export function hasDoubleHiddenAdapterRoot(targetRoot: string, adapterId: HostAdapterId): boolean {
  const segment = adapterRootSegment(adapterId);
  const posix = posixPath(targetRoot);
  if (posix.includes(`${segment}/${segment}`)) return true;
  const bare = segment.slice(1);
  const parts = posix.split("/").filter(Boolean);
  for (let index = 0; index < parts.length - 1; index += 1) {
    const current = parts[index]!;
    const next = parts[index + 1]!;
    if ((current === segment || current === bare) && (next === segment || next === bare)) {
      return true;
    }
  }
  return false;
}

function adapterRootBasenames(adapterId: HostAdapterId): readonly string[] {
  const segment = adapterRootSegment(adapterId);
  const bare = segment.slice(1);
  return [segment, bare];
}

export function isAlreadyAdapterRootPath(resolvedPath: string, adapterId: HostAdapterId): boolean {
  const base = path.basename(path.resolve(resolvedPath));
  return adapterRootBasenames(adapterId).includes(base);
}

function assertValidResolvedPath(resolvedPath: string, label: string): string {
  const absolute = path.resolve(resolvedPath);
  if (!absolute || absolute.includes("\0")) {
    throw new HostAdapterRootError(`${label} is invalid`, ["INVALID_HOST_ROOT_SEMANTICS"]);
  }
  return absolute;
}

function rejectDoubleAdapterRoot(targetRoot: string, adapterId: HostAdapterId): void {
  if (hasDoubleHiddenAdapterRoot(targetRoot, adapterId)) {
    throw new HostAdapterRootError("adapter root contains a duplicated hidden segment", [
      "DOUBLE_ADAPTER_ROOT_REJECTED",
    ]);
  }
}

function rejectSyntheticPathLooksLikeAdapterRoot(resolvedPath: string, adapterId: HostAdapterId): void {
  if (isAlreadyAdapterRootPath(resolvedPath, adapterId)) {
    throw new HostAdapterRootError("synthetic user home cannot already be an adapter root", [
      "DOUBLE_ADAPTER_ROOT_REJECTED",
      "AMBIGUOUS_ADAPTER_ROOT_OVERRIDE",
    ]);
  }
}

function resolveFromUserHome(
  userHome: string,
  definition: HostAdapterDefinition,
  rootKind: HostRootKind,
): { hostHome: string; targetRoot: string } {
  const hostHome = assertValidResolvedPath(userHome, "host home");
  if (rootKind === "adapter-root") {
    rejectDoubleAdapterRoot(hostHome, definition.adapterId);
    return { hostHome: path.dirname(hostHome), targetRoot: hostHome };
  }
  rejectSyntheticPathLooksLikeAdapterRoot(hostHome, definition.adapterId);
  const targetRoot = path.join(hostHome, adapterRootSegment(definition.adapterId));
  rejectDoubleAdapterRoot(targetRoot, definition.adapterId);
  return { hostHome, targetRoot };
}

type ResolvedRootInput = {
  hostHome: string;
  targetRoot: string;
  rootKind: HostRootKind;
  sourceClass: HostRootSourceClass;
  source: ResolvedHostTargetSource;
  sourceLabel: string;
};

function mapSourceClass(sourceClass: HostRootSourceClass): ResolvedHostTargetSource {
  if (sourceClass === "default") return "default";
  if (sourceClass === "native-environment" || sourceClass === "uads-environment") return "environment";
  return "explicit-override";
}

function resolveEnvironmentInput(definition: HostAdapterDefinition): ResolvedRootInput | null {
  const bindings = environmentBindings(definition.adapterId)
    .slice()
    .sort((a, b) => a.precedence - b.precedence);
  for (const binding of bindings) {
    const value = process.env[binding.variable]?.trim();
    if (!value) continue;
    const resolved = resolveFromUserHome(value, definition, binding.rootKind);
    const sourceClass = binding.variable.startsWith("UADS_") ? "uads-environment" : "native-environment";
    return {
      ...resolved,
      rootKind: binding.rootKind,
      sourceClass,
      source: mapSourceClass(sourceClass),
      sourceLabel: binding.variable.toLowerCase().replace(/_/g, "-"),
    };
  }
  return null;
}

export function resolveHostRootInput(
  definition: HostAdapterDefinition,
  input: HostAdapterDetectionInput = {},
): ResolvedRootInput {
  if (input.adapterRoot && input.hostHome) {
    throw new HostAdapterRootError("adapter root override cannot be combined with synthetic user home", [
      "AMBIGUOUS_ADAPTER_ROOT_OVERRIDE",
      "INVALID_HOST_ROOT_SEMANTICS",
    ]);
  }
  if (input.adapterRoot) {
    const targetRoot = assertValidResolvedPath(input.adapterRoot, "adapter root");
    rejectDoubleAdapterRoot(targetRoot, definition.adapterId);
    const segment = adapterRootSegment(definition.adapterId);
    if (!isAlreadyAdapterRootPath(targetRoot, definition.adapterId)) {
      throw new HostAdapterRootError("explicit adapter root must resolve to the fixed adapter segment", [
        "INVALID_HOST_ROOT_SEMANTICS",
      ]);
    }
    return {
      hostHome: path.dirname(targetRoot),
      targetRoot,
      rootKind: "adapter-root",
      sourceClass: "explicit-override",
      source: "explicit-override",
      sourceLabel: "explicit-adapter-root",
    };
  }
  if (input.hostHome) {
    const resolved = resolveFromUserHome(input.hostHome, definition, "synthetic-user-home");
    return {
      ...resolved,
      rootKind: "synthetic-user-home",
      sourceClass: "explicit-override",
      source: "explicit-override",
      sourceLabel: "explicit-synthetic-user-home",
    };
  }
  const fromEnvironment = resolveEnvironmentInput(definition);
  if (fromEnvironment) return fromEnvironment;
  const hostHome = path.resolve(os.homedir());
  const targetRoot = path.join(hostHome, adapterRootSegment(definition.adapterId));
  rejectDoubleAdapterRoot(targetRoot, definition.adapterId);
  return {
    hostHome,
    targetRoot,
    rootKind: "system-user-home",
    sourceClass: "default",
    source: "default",
    sourceLabel: definition.targetLabel,
  };
}

export function resolveLegacyUserHome(target: {
  rootKind: HostRootKind;
  hostHome: string;
  targetRoot: string;
}): string {
  if (target.rootKind === "adapter-root") {
    return path.dirname(target.targetRoot);
  }
  return target.hostHome;
}

export function computeRootIdentityDigest(input: {
  adapterId: HostAdapterId;
  rootKind: HostRootKind;
  sourceClass: HostRootSourceClass;
  sourceLabel: string;
  isLegacyV010Target?: boolean;
}): string {
  return sha256Hex(
    JSON.stringify({
      adapterId: input.adapterId,
      rootKind: input.rootKind,
      sourceClass: input.sourceClass,
      sourceLabel: input.sourceLabel,
      isLegacyV010Target: Boolean(input.isLegacyV010Target),
    }),
  );
}

export function canonicalTargetRootPath(targetRoot: string): string {
  const resolved = path.resolve(targetRoot);
  const parsed = path.parse(resolved);
  const segments = resolved
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  const root = parsed.root.replace(/\\/g, "/");
  const suffix = segments.join("/");
  if (root === "/") return suffix ? `/${suffix}` : "/";
  if (root.endsWith("/")) return `${root}${suffix}`;
  return suffix ? `${root}/${suffix}` : root;
}

export function computeTargetRootDigest(adapterId: HostAdapterId, targetRoot: string): string {
  return sha256Hex(
    `${HOST_TARGET_ROOT_DOMAIN}\0${adapterId}\0${canonicalTargetRootPath(targetRoot)}`,
  );
}

export function createHostAdapterRootBinding(target: {
  definition: { adapterId: HostAdapterId };
  targetRoot: string;
  rootKind: HostRootKind;
  sourceClass: HostRootSourceClass;
}): HostAdapterRootBinding {
  return {
    targetRootDigest: computeTargetRootDigest(target.definition.adapterId, target.targetRoot),
    rootKind: target.rootKind,
    sourceClass: target.sourceClass,
    bindingVersion: HOST_TARGET_ROOT_BINDING_VERSION,
  };
}

export type HostRootBindingStatus =
  | "BOUND_MATCH"
  | "LEGACY_ROOT_BINDING_V1"
  | "UNBOUND_LEGACY"
  | "ROOT_BINDING_MISMATCH"
  | "ROOT_BINDING_REQUIRED"
  | "ROOT_BINDING_TAMPERED"
  | "NOT_INSTALLED";

export function validateHostRootBinding(
  state: { installStatus: "INSTALLED" | "NOT_INSTALLED"; rootBinding?: HostAdapterRootBinding | null } | null,
  currentTarget: {
    definition: { adapterId: HostAdapterId };
    targetRoot: string;
    rootKind: HostRootKind;
    sourceClass: HostRootSourceClass;
  },
): { status: HostRootBindingStatus; reasonCodes: string[] } {
  if (!state || state.installStatus !== "INSTALLED") {
    return { status: "NOT_INSTALLED", reasonCodes: [] };
  }
  const currentDigest = computeTargetRootDigest(currentTarget.definition.adapterId, currentTarget.targetRoot);
  if (!state.rootBinding) {
    return { status: "UNBOUND_LEGACY", reasonCodes: ["UNBOUND_LEGACY_ROOT_IDENTITY", "ROOT_BINDING_REQUIRED"] };
  }
  if (state.rootBinding.bindingVersion === LEGACY_HOST_TARGET_ROOT_BINDING_VERSION) {
    return {
      status: "LEGACY_ROOT_BINDING_V1",
      reasonCodes: ["LEGACY_ROOT_BINDING_V1", "ROOT_BINDING_UPGRADE_REQUIRED"],
    };
  }
  if (state.rootBinding.bindingVersion !== HOST_TARGET_ROOT_BINDING_VERSION) {
    return { status: "ROOT_BINDING_TAMPERED", reasonCodes: ["ROOT_BINDING_TAMPERED"] };
  }
  if (state.rootBinding.targetRootDigest !== currentDigest) {
    return { status: "ROOT_BINDING_MISMATCH", reasonCodes: ["ROOT_BINDING_MISMATCH"] };
  }
  return { status: "BOUND_MATCH", reasonCodes: [] };
}

export function unboundLegacyReasonCodes(reasonCodes: readonly string[]): boolean {
  const legacy = new Set(["UNBOUND_LEGACY_ROOT_IDENTITY", "ROOT_BINDING_REQUIRED"]);
  return reasonCodes.length > 0 && reasonCodes.every((code) => legacy.has(code));
}
