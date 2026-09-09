import fs from "node:fs";
import path from "node:path";
import { atomicWriteFile, atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { isPathInside, sha256Hex, toPosix } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import { findPackageRoot } from "../lib/version.js";
import { resolveUadsHome } from "../lib/workspace.js";
import {
  builtinHostAdapterRegistry,
  getHostAdapterDefinition,
} from "./host-adapter-registry.js";
import {
  detectHostAdapter,
  resolveHostTarget,
  type ResolvedHostTarget,
} from "./host-adapter-detect.js";
import {
  classifyHostAdapterTarget,
  legacyUserHomeForTarget,
  resolveLegacyV010HostTarget,
} from "./host-adapter-legacy.js";
import {
  HostAdapterRootError,
  createHostAdapterRootBinding,
  LEGACY_HOST_TARGET_ROOT_BINDING_VERSION,
  unboundLegacyReasonCodes,
  validateHostRootBinding,
} from "./host-adapter-root.js";
import type {
  HostAdapterId,
  HostAdapterInstallInput,
  HostAdapterResource,
  HostAdapterState,
  HostAdapterStatusSummary,
  HostAdapterUninstallInput,
} from "./host-adapter-types.js";
import {
  HOST_ADAPTER_CONTRACT_VERSION,
  HOST_ADAPTER_SCHEMA_VERSION,
  type HostAdapterDefinition,
} from "./host-adapter-types.js";

export class HostAdapterInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostAdapterInstallError";
  }
}

type SourceResource = HostAdapterResource & { content: Buffer };

type Snapshot = {
  exists: boolean;
  content: Buffer | null;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function safeRelativePath(value: string, label: string): string {
  const normalized = toPosix(value).replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").includes("..") ||
    normalized.includes("\0") ||
    normalized === "." ||
    normalized === ".."
  ) {
    throw new HostAdapterInstallError(`${label} is unsafe`);
  }
  return normalized;
}

function assertNoSymlinkEscape(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isPathInside(resolvedRoot, resolvedTarget)) {
    throw new HostAdapterInstallError("host target path escape rejected");
  }
  const parsed = path.parse(resolvedRoot);
  let current = parsed.root;
  const segments = resolvedRoot
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)
    .concat(
      path
        .relative(resolvedRoot, resolvedTarget)
        .split(path.sep)
        .filter(Boolean),
    );
  for (const segment of segments) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new HostAdapterInstallError("host target symlink escape rejected");
    }
  }
}

function assertDirectoryOrMissing(target: string, label: string): void {
  if (!fs.existsSync(target)) return;
  if (!fs.lstatSync(target).isDirectory()) {
    throw new HostAdapterInstallError(`${label} is not a directory`);
  }
}

function fileDigest(target: string): string | null {
  if (!fs.existsSync(target)) return null;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new HostAdapterInstallError("managed host resource is a symlink");
  if (!stat.isFile()) throw new HostAdapterInstallError("managed host resource is not a regular file");
  return sha256Hex(fs.readFileSync(target));
}

function hostStatePath(adapterId: HostAdapterId, uadsHome?: string): string {
  return path.join(resolveUadsHome(uadsHome), "adapters", adapterId, "state.json");
}

export function getHostAdapterStatePath(adapterId: HostAdapterId, uadsHome?: string): string {
  getHostAdapterDefinition(adapterId);
  return hostStatePath(adapterId, uadsHome);
}

function stateDigest(state: Omit<HostAdapterState, "stateDigest">): string {
  const { stateDigest: _ignored, ...withoutDigest } = state as HostAdapterState;
  return sha256Hex(
    JSON.stringify(
      stableValue({
        ...withoutDigest,
        updatedAt: null,
        detection: { ...withoutDigest.detection, detectedAt: null },
      }),
    ),
  );
}

function legacyStateDigest(state: HostAdapterState): string {
  const { stateDigest: _ignored, rootBinding: _legacyBinding, ...withoutDigest } = state;
  return sha256Hex(
    JSON.stringify(
      stableValue({
        ...withoutDigest,
        updatedAt: null,
        detection: { ...withoutDigest.detection, detectedAt: null },
      }),
    ),
  );
}

function validateState(
  state: HostAdapterState,
  schemaRoot?: string,
  allowLegacyUnboundDigest = false,
): HostAdapterState {
  try {
    assertSchema("host-adapter-state.schema.json", state, schemaRoot);
    const definition = getHostAdapterDefinition(state.adapterId);
    if (
      state.contractVersion !== HOST_ADAPTER_CONTRACT_VERSION ||
      state.targetLabel !== definition.targetLabel ||
      state.manifestRelativeTarget !== definition.manifestRelativeTarget ||
      JSON.stringify(state.detection.provenCapabilities) !== JSON.stringify(definition.capabilities) ||
      state.detection.adapterId !== state.adapterId ||
      state.detection.targetLabel !== state.targetLabel
    ) {
      throw new Error("host adapter state contract mismatch");
    }
    if (state.installStatus === "INSTALLED" && state.rootBinding) {
      if (
        (state.rootBinding.bindingVersion !== LEGACY_HOST_TARGET_ROOT_BINDING_VERSION &&
          state.rootBinding.bindingVersion !== "2") ||
        state.rootBinding.targetRootDigest.length !== 64
      ) {
        throw new Error("host adapter root binding contract mismatch");
      }
    }
    const { stateDigest: stored, ...withoutDigest } = state;
    const currentDigestMatches = stored === stateDigest(withoutDigest);
    const legacyDigestMatches =
      allowLegacyUnboundDigest &&
      state.rootBinding === null &&
      stored === legacyStateDigest(state);
    if (!currentDigestMatches && !legacyDigestMatches) {
      throw new Error("host adapter state digest mismatch");
    }
    if (containsUnredactedSecret(JSON.stringify(state)) || containsAbsoluteHostPath(JSON.stringify(state))) {
      throw new Error("host adapter state contains secret-like or host-path data");
    }
    return state;
  } catch (error) {
    throw new HostAdapterInstallError(
      `host adapter state is corrupt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function readHostAdapterState(
  adapterId: HostAdapterId,
  uadsHome?: string,
  schemaRoot?: string,
): HostAdapterState | null {
  const target = hostStatePath(adapterId, uadsHome);
  assertNoSymlinkEscape(resolveUadsHome(uadsHome), target);
  if (!fs.existsSync(target)) return null;
  const parsed = readJsonIfValid<HostAdapterState>(target);
  if (!parsed.ok) throw new HostAdapterInstallError("host adapter state is missing or unreadable");
  const normalized: HostAdapterState = {
    ...parsed.value,
    rootBinding: parsed.value.rootBinding ?? null,
  };
  return validateState(normalized, schemaRoot, parsed.value.rootBinding === undefined);
}

function writeHostAdapterState(
  state: Omit<HostAdapterState, "stateDigest">,
  uadsHome: string,
  schemaRoot?: string,
): HostAdapterState {
  const { stateDigest: _ignored, ...withoutDigest } = state as HostAdapterState;
  if (withoutDigest.installStatus === "INSTALLED" && !withoutDigest.rootBinding) {
    throw new HostAdapterInstallError("installed host adapter state requires root binding");
  }
  if (
    withoutDigest.installStatus === "INSTALLED" &&
    withoutDigest.rootBinding?.bindingVersion !== "2"
  ) {
    throw new HostAdapterInstallError("newly written installed host adapter state requires v2 root binding");
  }
  if (withoutDigest.installStatus === "NOT_INSTALLED" && withoutDigest.rootBinding !== null) {
    throw new HostAdapterInstallError("uninstalled host adapter state cannot retain root binding");
  }
  const normalized = sanitizeOperationalValue({
    ...withoutDigest,
    stateDigest: stateDigest(withoutDigest),
  }) as HostAdapterState;
  validateState(normalized, schemaRoot);
  const target = hostStatePath(normalized.adapterId, uadsHome);
  assertNoSymlinkEscape(resolveUadsHome(uadsHome), target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  atomicWriteJson(target, normalized);
  return normalized;
}

function collectSourceResources(
  definition: HostAdapterDefinition,
  packageRoot: string,
): SourceResource[] {
  const sourceRoot = path.resolve(packageRoot, definition.sourceRoot);
  if (!fs.existsSync(sourceRoot) || !fs.lstatSync(sourceRoot).isDirectory()) {
    throw new HostAdapterInstallError(`canonical ${definition.resourceKind} source is unavailable`);
  }
  assertNoSymlinkEscape(path.resolve(packageRoot), sourceRoot);
  const files: string[] = [];
  const visit = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      assertNoSymlinkEscape(sourceRoot, absolute);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      } else {
        throw new HostAdapterInstallError("canonical adapter source contains an unsupported filesystem entry");
      }
    }
  };
  visit(sourceRoot);
  const canonicalFiles =
    definition.resourceKind === "agents"
      ? files.filter(
          (file) =>
            path.dirname(file) === sourceRoot &&
            /^uads-[a-z0-9][a-z0-9-]*\.md$/.test(path.basename(file)),
        )
      : files;
  if (canonicalFiles.length === 0 || canonicalFiles.length > 128) {
    throw new HostAdapterInstallError("canonical adapter resource count is outside the allowed bound");
  }
  return canonicalFiles.map((absolute) => {
    const relative = safeRelativePath(path.relative(sourceRoot, absolute), "canonical resource path");
    const sourceRef = toPosix(path.posix.join(definition.sourceRoot, relative));
    const relativeTarget =
      definition.resourceKind === "agents"
        ? toPosix(path.posix.join(definition.targetRelativeRoot, relative))
        : toPosix(path.posix.join(definition.targetRelativeRoot, "uads-orchestrator", relative));
    const content = fs.readFileSync(absolute);
    const digest = sha256Hex(content);
    return {
      sourceRef,
      relativeTarget: safeRelativePath(relativeTarget, "host resource path"),
      sourceDigest: digest,
      installedDigest: digest,
      content,
    };
  });
}

function readSnapshot(target: string): Snapshot {
  if (!fs.existsSync(target)) return { exists: false, content: null };
  assertNoSymlinkEscape(path.dirname(target), target);
  const stat = fs.lstatSync(target);
  if (!stat.isFile()) throw new HostAdapterInstallError("host resource is not a regular file");
  return { exists: true, content: fs.readFileSync(target) };
}

function restoreSnapshot(target: string, snapshot: Snapshot): void {
  if (snapshot.exists && snapshot.content !== null) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, snapshot.content);
  } else if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (stat.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(target);
  }
}

function targetPath(target: ResolvedHostTarget, relativeTarget: string): string {
  const safe = safeRelativePath(relativeTarget, "host target");
  const resolved = path.resolve(target.targetRoot, safe);
  assertNoSymlinkEscape(target.targetRoot, resolved);
  return resolved;
}

function sourceAgentFileName(sourceRef: string): string {
  const relative = sourceRef.startsWith("agents/") ? sourceRef.slice("agents/".length) : sourceRef;
  if (relative.includes("/") || !/^uads-[a-z0-9][a-z0-9-]*\.md$/.test(relative)) {
    throw new HostAdapterInstallError("canonical agent resource name is invalid");
  }
  return relative;
}

function canonicalAgentPaths(resources: SourceResource[], uadsHome: string): string[] {
  const canonicalRoot = path.join(uadsHome, "agents");
  return resources.map((resource) => path.join(canonicalRoot, sourceAgentFileName(resource.sourceRef)));
}

function assertAdapterRootWritable(target: ResolvedHostTarget): void {
  if (target.isLegacyV010Target) return;
  if (!target.canCreateAdapterRoot && !fs.existsSync(target.targetRoot)) {
    throw new HostAdapterInstallError("host adapter root is not present; explicit override or pre-existing host root is required");
  }
}

function assertManagedWritesContained(target: ResolvedHostTarget, absolutePaths: string[]): void {
  const resolvedRoot = path.resolve(target.targetRoot);
  for (const absolute of absolutePaths) {
    if (!isPathInside(resolvedRoot, path.resolve(absolute))) {
      throw new HostAdapterInstallError("managed host write would escape the adapter root");
    }
  }
}

function injectInstallFault(point: string): void {
  if (process.env.UADS_ADAPTER_INSTALL_FAULT === point) {
    throw new HostAdapterInstallError(`injected install fault at ${point}`);
  }
}

function removeManagedLegacyFiles(target: ResolvedHostTarget, state: HostAdapterState): void {
  for (const resource of state.resources) {
    const absolute = targetPath(target, resource.relativeTarget);
    if (fs.existsSync(absolute)) {
      const stat = fs.lstatSync(absolute);
      if (stat.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(absolute);
    }
  }
  if (fs.existsSync(target.manifestPath)) {
    const stat = fs.lstatSync(target.manifestPath);
    if (stat.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(target.manifestPath);
  }
}

function migrateLegacyV010Target(
  current: ResolvedHostTarget,
  legacy: ResolvedHostTarget,
  state: HostAdapterState,
  resources: SourceResource[],
  manifest: { content: string; digest: string },
  input: HostAdapterInstallInput,
  uadsHome: string,
  schemaRoot?: string,
): HostAdapterState {
  const registry = builtinHostAdapterRegistry();
  const adapterId = current.definition.adapterId;
  const snapshots = new Map<string, Snapshot>();
  const managedCurrent = resources.map((resource) => targetPath(current, resource.relativeTarget));
  const managedLegacy = state.resources.map((resource) => targetPath(legacy, resource.relativeTarget));
  const canonicalTargets = current.definition.resourceKind === "agents" ? canonicalAgentPaths(resources, uadsHome) : [];
  for (const absolute of [
    ...managedCurrent,
    current.manifestPath,
    ...managedLegacy,
    legacy.manifestPath,
    hostStatePath(adapterId, uadsHome),
    ...canonicalTargets,
  ]) {
    snapshots.set(absolute, readSnapshot(absolute));
  }

  try {
    if (current.definition.resourceKind === "agents") syncCanonicalAgents(resources, uadsHome);
    injectInstallFault("after-canonical-sync");
    assertNoSymlinkEscape(current.targetRoot, current.resourceRoot);
    fs.mkdirSync(current.resourceRoot, { recursive: true });
    for (const resource of resources) {
      const absolute = targetPath(current, resource.relativeTarget);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      atomicWriteFile(absolute, resource.content.toString("utf8"));
    }
    injectInstallFault("after-host-write");
    fs.mkdirSync(path.dirname(current.manifestPath), { recursive: true });
    atomicWriteFile(current.manifestPath, manifest.content);
    const detection = detectHostAdapter(adapterId, input, registry);
    const next = writeHostAdapterState(
      {
        schema: "uads.host-adapter-state",
        schemaVersion: HOST_ADAPTER_SCHEMA_VERSION,
        adapterId,
        contractVersion: HOST_ADAPTER_CONTRACT_VERSION,
        targetLabel: current.definition.targetLabel,
        detection,
        installStatus: "INSTALLED",
        ownershipStatus: "CLEAN",
        rootBinding: rootBindingForTarget(current),
        resources: resources.map(({ content: _content, ...resource }) => resource),
        manifestRelativeTarget: current.definition.manifestRelativeTarget,
        manifestDigest: manifest.digest,
        updatedAt: new Date().toISOString(),
      },
      uadsHome,
      schemaRoot,
    );
    removeManagedLegacyFiles(legacy, state);
    return next;
  } catch (error) {
    for (const [absolute, snapshot] of snapshots) {
      try {
        restoreSnapshot(absolute, snapshot);
      } catch {
        // Preserve the original failure.
      }
    }
    throw error instanceof HostAdapterInstallError
      ? error
      : new HostAdapterInstallError(error instanceof Error ? error.message : String(error));
  }
}

function syncCanonicalAgents(resources: SourceResource[], uadsHome: string): void {
  const canonicalRoot = path.join(uadsHome, "agents");
  assertNoSymlinkEscape(uadsHome, canonicalRoot);
  fs.mkdirSync(canonicalRoot, { recursive: true });
  for (const resource of resources) {
    const fileName = sourceAgentFileName(resource.sourceRef);
    const destination = path.join(canonicalRoot, fileName);
    assertNoSymlinkEscape(canonicalRoot, destination);
    atomicWriteFile(destination, resource.content.toString("utf8"));
  }
}

function priorResourceMap(state: HostAdapterState | null): Map<string, HostAdapterResource> {
  return new Map((state?.resources ?? []).map((resource) => [resource.relativeTarget, resource]));
}

function assertUnmanagedAgentFiles(
  target: ResolvedHostTarget,
  desired: Set<string>,
  prior: Map<string, HostAdapterResource>,
): void {
  if (target.definition.resourceKind === "agents") {
    if (!fs.existsSync(target.resourceRoot)) return;
    for (const entry of fs.readdirSync(target.resourceRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith("uads-") || !entry.name.endsWith(".md")) continue;
      const relative = toPosix(path.posix.join(target.definition.targetRelativeRoot, entry.name));
      if (relative === target.definition.manifestRelativeTarget) continue;
      if (!desired.has(relative) && !prior.has(relative)) {
        throw new HostAdapterInstallError(`unmanaged UADS resource conflict: ${entry.name}`);
      }
    }
    return;
  }
  const skillRoot = path.join(target.targetRoot, "skills", "uads-orchestrator");
  if (!fs.existsSync(skillRoot)) return;
  assertNoSymlinkEscape(target.targetRoot, skillRoot);
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      assertNoSymlinkEscape(target.targetRoot, absolute);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile()) throw new HostAdapterInstallError("generic skill target contains an unsupported entry");
      const relative = toPosix(path.relative(target.targetRoot, absolute));
      if (!desired.has(relative) && !prior.has(relative)) {
        throw new HostAdapterInstallError(`unmanaged Generic Agent Skills resource conflict: ${relative}`);
      }
    }
  };
  visit(skillRoot);
}

function manifestBase(
  definition: HostAdapterDefinition,
  resources: SourceResource[],
): Record<string, unknown> {
  return {
    schema: "uads.host-adapter-manifest",
    schemaVersion: HOST_ADAPTER_SCHEMA_VERSION,
    adapterId: definition.adapterId,
    contractVersion: HOST_ADAPTER_CONTRACT_VERSION,
    files: resources.map((resource) =>
      definition.resourceKind === "agents"
        ? sourceAgentFileName(resource.sourceRef)
        : resource.relativeTarget,
    ),
    resources: resources.map(({ content: _content, ...resource }) => ({
      relativeTarget: resource.relativeTarget,
      installedDigest: resource.installedDigest,
    })),
  };
}

function manifestContent(
  definition: HostAdapterDefinition,
  resources: SourceResource[],
): { content: string; digest: string } {
  const base = manifestBase(definition, resources);
  const manifestDigest = sha256Hex(JSON.stringify(stableValue(base)));
  const content = `${JSON.stringify({ ...base, manifestDigest }, null, 2)}\n`;
  return { content, digest: sha256Hex(content) };
}

function assertManifestSafety(target: ResolvedHostTarget, state: HostAdapterState | null): void {
  if (!fs.existsSync(target.manifestPath)) return;
  assertNoSymlinkEscape(target.targetRoot, target.manifestPath);
  const digest = fileDigest(target.manifestPath);
  if (!state?.manifestDigest || digest !== state.manifestDigest) {
    throw new HostAdapterInstallError("unmanaged or modified host adapter manifest conflict");
  }
}

function rootBindingForTarget(target: ResolvedHostTarget) {
  return createHostAdapterRootBinding({
    definition: target.definition,
    targetRoot: target.targetRoot,
    rootKind: target.rootKind,
    sourceClass: target.sourceClass,
  });
}

function assertInstallRootBinding(
  state: HostAdapterState | null,
  target: ResolvedHostTarget,
): void {
  const binding = validateHostRootBinding(state, target);
  if (binding.status === "ROOT_BINDING_MISMATCH") {
    throw new HostAdapterInstallError("host adapter root binding mismatch");
  }
  if (binding.status === "ROOT_BINDING_TAMPERED") {
    throw new HostAdapterInstallError("host adapter root binding is tampered");
  }
}

function allowsExplicitLegacyBindingAdoption(reasonCodes: readonly string[]): boolean {
  return (
    unboundLegacyReasonCodes(reasonCodes) ||
    reasonCodes.includes("LEGACY_ROOT_BINDING_V1") ||
    reasonCodes.includes("ROOT_BINDING_UPGRADE_REQUIRED")
  );
}

function assertDestructiveRootBinding(
  state: HostAdapterState,
  target: ResolvedHostTarget,
): void {
  const binding = validateHostRootBinding(state, target);
  if (binding.status === "ROOT_BINDING_MISMATCH" || binding.status === "ROOT_BINDING_TAMPERED") {
    throw new HostAdapterInstallError("host adapter root binding mismatch");
  }
  if (binding.status === "UNBOUND_LEGACY" || binding.status === "LEGACY_ROOT_BINDING_V1") {
    throw new HostAdapterInstallError("host adapter root binding is required");
  }
}

export function inspectHostAdapterOwnership(
  adapterId: HostAdapterId,
  input: HostAdapterInstallInput = {},
  schemaRoot?: string,
): { status: HostAdapterState["ownershipStatus"]; reasonCodes: string[] } {
  const state = readHostAdapterState(adapterId, input.uadsHome, schemaRoot);
  if (!state || state.installStatus === "NOT_INSTALLED" || state.resources.length === 0) {
    return { status: state?.ownershipStatus ?? "UNKNOWN", reasonCodes: [] };
  }
  const definition = getHostAdapterDefinition(adapterId);
  let target: ResolvedHostTarget;
  try {
    target = resolveHostTarget(definition, input);
  } catch (error) {
    if (error instanceof HostAdapterRootError) {
      throw new HostAdapterInstallError(`${error.message}: ${error.reasonCodes.join(",")}`);
    }
    throw error;
  }
  const legacy = resolveLegacyV010HostTarget(definition, legacyUserHomeForTarget(target));
  const classification = classifyHostAdapterTarget(target, legacy, state);
  const activeTarget =
    classification.classification.startsWith("LEGACY_V010") && legacy ? legacy : target;
  const rootBinding = validateHostRootBinding(state, target);
  const reasons: string[] = [...rootBinding.reasonCodes];
  if (rootBinding.status === "ROOT_BINDING_MISMATCH" || rootBinding.status === "ROOT_BINDING_TAMPERED") {
    return { status: "CONFLICT", reasonCodes: reasons.sort() };
  }
  for (const resource of state.resources) {
    const absolute = targetPath(activeTarget, resource.relativeTarget);
    if (!fs.existsSync(absolute)) {
      reasons.push(`MISSING_MANAGED_RESOURCE:${resource.relativeTarget}`);
      continue;
    }
    try {
      if (fileDigest(absolute) !== resource.installedDigest) {
        reasons.push(`MODIFIED_MANAGED_RESOURCE:${resource.relativeTarget}`);
      }
    } catch {
      reasons.push(`SYMLINK_MANAGED_RESOURCE:${resource.relativeTarget}`);
    }
  }
  try {
    assertNoSymlinkEscape(activeTarget.targetRoot, activeTarget.manifestPath);
    if (!fs.existsSync(activeTarget.manifestPath)) {
      reasons.push("MISSING_MANIFEST");
    } else if (fileDigest(activeTarget.manifestPath) !== state.manifestDigest) {
      reasons.push("MODIFIED_MANIFEST");
    }
  } catch {
    reasons.push("SYMLINK_MANIFEST");
  }
  if (classification.classification === "LEGACY_V010_TARGET_AMBIGUOUS") {
    reasons.push("LEGACY_TARGET_AMBIGUOUS");
  }
  if (reasons.some((reason) => reason.startsWith("MODIFIED") || reason.startsWith("SYMLINK") || reason === "LEGACY_TARGET_AMBIGUOUS")) {
    return { status: "CONFLICT", reasonCodes: reasons.sort() };
  }
  if (rootBinding.status === "UNBOUND_LEGACY") {
    return { status: "STALE", reasonCodes: reasons.sort() };
  }
  if (rootBinding.status === "LEGACY_ROOT_BINDING_V1") {
    return { status: "STALE", reasonCodes: reasons.sort() };
  }
  if (reasons.length > 0) return { status: "STALE", reasonCodes: reasons.sort() };
  return { status: "CLEAN", reasonCodes: classification.reasonCodes };
}

export function installHostAdapter(
  adapterId: HostAdapterId,
  input: HostAdapterInstallInput = {},
  schemaRoot?: string,
): HostAdapterState {
  if (input.force) throw new HostAdapterInstallError("force-managed host adapter installation is not supported");
  const registry = builtinHostAdapterRegistry();
  const definition = getHostAdapterDefinition(adapterId, registry);
  const packageRoot = path.resolve(input.packageRoot ?? findPackageRoot());
  const uadsHome = resolveUadsHome(input.uadsHome);
  let target: ResolvedHostTarget;
  try {
    target = resolveHostTarget(definition, input);
  } catch (error) {
    if (error instanceof HostAdapterRootError) {
      throw new HostAdapterInstallError(
        `${error.message}: ${error.reasonCodes.join(",")}`,
      );
    }
    throw error;
  }
  const legacy = resolveLegacyV010HostTarget(definition, legacyUserHomeForTarget(target));
  if (input.projectRoot && isPathInside(path.resolve(input.projectRoot), target.targetRoot)) {
    throw new HostAdapterInstallError("project-local host adapter target is forbidden");
  }
  const resources = collectSourceResources(definition, packageRoot);
  const state = readHostAdapterState(adapterId, uadsHome, schemaRoot);
  const classification = classifyHostAdapterTarget(target, legacy, state);
  if (classification.classification === "LEGACY_V010_TARGET_MODIFIED") {
    throw new HostAdapterInstallError("legacy host adapter target was modified");
  }
  if (classification.classification === "LEGACY_V010_TARGET_AMBIGUOUS") {
    throw new HostAdapterInstallError("legacy host adapter target is ambiguous");
  }
  assertInstallRootBinding(state, target);
  const ownership = inspectHostAdapterOwnership(adapterId, input, schemaRoot);
  if (ownership.status === "CONFLICT") {
    throw new HostAdapterInstallError("host adapter ownership state is not clean");
  }
  if (ownership.status === "STALE" && !allowsExplicitLegacyBindingAdoption(ownership.reasonCodes)) {
    throw new HostAdapterInstallError("host adapter ownership state is not clean");
  }
  if (state && state.ownershipStatus !== "CLEAN" && state.installStatus === "INSTALLED" && ownership.status !== "STALE") {
    throw new HostAdapterInstallError("host adapter ownership state is not clean");
  }
  assertAdapterRootWritable(target);
  assertDirectoryOrMissing(target.targetRoot, "host adapter target root");
  assertDirectoryOrMissing(target.resourceRoot, "host adapter resource root");
  const previous = priorResourceMap(state);
  const desired = new Set(resources.map((resource) => resource.relativeTarget));
  assertUnmanagedAgentFiles(target, desired, previous);
  const manifestTarget =
    classification.classification === "LEGACY_V010_TARGET_CLEAN" && legacy ? legacy : target;
  assertManifestSafety(manifestTarget, state);
  if (state?.installStatus === "INSTALLED" && state.resources.length > 0 && !fs.existsSync(manifestTarget.manifestPath)) {
    const allMissing = state.resources.every((resource) => !fs.existsSync(targetPath(manifestTarget, resource.relativeTarget)));
    if (allMissing) throw new HostAdapterInstallError("installed host adapter target is no longer present");
  }

  for (const resource of resources) {
    const absolute = targetPath(target, resource.relativeTarget);
    const current = fileDigest(absolute);
    const prior = previous.get(resource.relativeTarget);
    if (current !== null && (!prior || current !== prior.installedDigest)) {
      throw new HostAdapterInstallError(`managed resource ownership conflict: ${resource.relativeTarget}`);
    }
  }
  for (const prior of previous.values()) {
    if (desired.has(prior.relativeTarget)) continue;
    const absolute = targetPath(target, prior.relativeTarget);
    const current = fileDigest(absolute);
    if (current !== null && current !== prior.installedDigest) {
      throw new HostAdapterInstallError(`obsolete managed resource was modified: ${prior.relativeTarget}`);
    }
  }

  const manifest = manifestContent(definition, resources);
  const desiredStateResources = resources.map(({ content: _content, ...resource }) => resource);
  const hasLegacyV1Binding =
    state?.installStatus === "INSTALLED" &&
    state.rootBinding?.bindingVersion === LEGACY_HOST_TARGET_ROOT_BINDING_VERSION;
  if (
    hasLegacyV1Binding &&
    state &&
    state.ownershipStatus === "CLEAN" &&
    classification.classification === "CURRENT_TARGET_CLEAN" &&
    fs.existsSync(target.manifestPath) &&
    state.manifestDigest === manifest.digest &&
    JSON.stringify(stableValue(state.resources)) === JSON.stringify(stableValue(desiredStateResources))
  ) {
    const snapshots = new Map<string, Snapshot>();
    const canonicalTargets = definition.resourceKind === "agents" ? canonicalAgentPaths(resources, uadsHome) : [];
    for (const absolute of [hostStatePath(adapterId, uadsHome), ...canonicalTargets]) {
      snapshots.set(absolute, readSnapshot(absolute));
    }
    try {
      if (definition.resourceKind === "agents") syncCanonicalAgents(resources, uadsHome);
      injectInstallFault("after-canonical-sync");
      const detection = detectHostAdapter(adapterId, input, registry);
      return writeHostAdapterState(
        {
          ...state,
          detection,
          ownershipStatus: "CLEAN",
          rootBinding: rootBindingForTarget(target),
          updatedAt: new Date().toISOString(),
        },
        uadsHome,
        schemaRoot,
      );
    } catch (error) {
      for (const [absolute, snapshot] of snapshots) {
        try {
          restoreSnapshot(absolute, snapshot);
        } catch {
          // Preserve the original failure.
        }
      }
      throw error instanceof HostAdapterInstallError
        ? error
        : new HostAdapterInstallError(error instanceof Error ? error.message : String(error));
    }
  }
  if (
    classification.classification === "LEGACY_V010_TARGET_CLEAN" &&
    legacy &&
    state
  ) {
    return migrateLegacyV010Target(target, legacy, state, resources, manifest, input, uadsHome, schemaRoot);
  }
  if (
    state?.installStatus === "INSTALLED" &&
    state.ownershipStatus === "CLEAN" &&
    classification.classification === "CURRENT_TARGET_CLEAN" &&
    !hasLegacyV1Binding &&
    fs.existsSync(target.manifestPath) &&
    state.manifestDigest === manifest.digest &&
    JSON.stringify(stableValue(state.resources)) === JSON.stringify(stableValue(desiredStateResources))
  ) {
    if (!state.rootBinding) {
      return writeHostAdapterState(
        {
          ...state,
          rootBinding: rootBindingForTarget(target),
          ownershipStatus: "CLEAN",
          updatedAt: new Date().toISOString(),
        },
        uadsHome,
        schemaRoot,
      );
    }
    if (definition.resourceKind === "agents") syncCanonicalAgents(resources, uadsHome);
    return state;
  }
  const hostManagedTargets = [
    ...resources.map((resource) => targetPath(target, resource.relativeTarget)),
    ...[...previous.values()]
      .filter((resource) => !desired.has(resource.relativeTarget))
      .map((resource) => targetPath(target, resource.relativeTarget)),
    target.manifestPath,
  ];
  assertManagedWritesContained(target, hostManagedTargets);
  const canonicalTargets = definition.resourceKind === "agents" ? canonicalAgentPaths(resources, uadsHome) : [];
  const snapshots = new Map<string, Snapshot>();
  for (const absolute of [...hostManagedTargets, hostStatePath(adapterId, uadsHome), ...canonicalTargets]) {
    snapshots.set(absolute, readSnapshot(absolute));
  }

  try {
    if (definition.resourceKind === "agents") syncCanonicalAgents(resources, uadsHome);
    injectInstallFault("after-canonical-sync");
    assertNoSymlinkEscape(target.targetRoot, target.resourceRoot);
    if (target.canCreateAdapterRoot && !fs.existsSync(target.targetRoot)) {
      fs.mkdirSync(target.targetRoot, { recursive: true });
    }
    fs.mkdirSync(target.resourceRoot, { recursive: true });
    for (const resource of resources) {
      const absolute = targetPath(target, resource.relativeTarget);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      atomicWriteFile(absolute, resource.content.toString("utf8"));
    }
    injectInstallFault("after-host-write");
    fs.mkdirSync(path.dirname(target.manifestPath), { recursive: true });
    atomicWriteFile(target.manifestPath, manifest.content);
    const detection = detectHostAdapter(adapterId, input, registry);
    const next = writeHostAdapterState(
      {
        schema: "uads.host-adapter-state",
        schemaVersion: HOST_ADAPTER_SCHEMA_VERSION,
        adapterId,
        contractVersion: HOST_ADAPTER_CONTRACT_VERSION,
        targetLabel: definition.targetLabel,
        detection,
        installStatus: "INSTALLED",
        ownershipStatus: "CLEAN",
        rootBinding: rootBindingForTarget(target),
        resources: resources.map(({ content: _content, ...resource }) => resource),
        manifestRelativeTarget: definition.manifestRelativeTarget,
        manifestDigest: manifest.digest,
        updatedAt: new Date().toISOString(),
      },
      uadsHome,
      schemaRoot,
    );
    for (const prior of previous.values()) {
      if (desired.has(prior.relativeTarget)) continue;
      const absolute = targetPath(target, prior.relativeTarget);
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    }
    return next;
  } catch (error) {
    for (const [absolute, snapshot] of snapshots) {
      try {
        restoreSnapshot(absolute, snapshot);
      } catch {
        // Preserve the original failure; never claim a successful install.
      }
    }
    throw error instanceof HostAdapterInstallError
      ? error
      : new HostAdapterInstallError(error instanceof Error ? error.message : String(error));
  }
}

export function uninstallHostAdapter(
  adapterId: HostAdapterId,
  input: HostAdapterUninstallInput = {},
  schemaRoot?: string,
): HostAdapterState | null {
  if (input.force) throw new HostAdapterInstallError("force-managed host adapter uninstall is not supported");
  const definition = getHostAdapterDefinition(adapterId);
  const uadsHome = resolveUadsHome(input.uadsHome);
  const state = readHostAdapterState(adapterId, uadsHome, schemaRoot);
  if (!state) return null;
  if (state.installStatus === "NOT_INSTALLED") return state;
  let target: ResolvedHostTarget;
  try {
    target = resolveHostTarget(definition, input);
  } catch (error) {
    if (error instanceof HostAdapterRootError) {
      throw new HostAdapterInstallError(`${error.message}: ${error.reasonCodes.join(",")}`);
    }
    throw error;
  }
  assertDestructiveRootBinding(state, target);
  if (state.ownershipStatus !== "CLEAN") {
    throw new HostAdapterInstallError("host adapter ownership state is not clean");
  }
  const legacy = resolveLegacyV010HostTarget(definition, legacyUserHomeForTarget(target));
  const classification = classifyHostAdapterTarget(target, legacy, state);
  const activeTarget =
    classification.classification.startsWith("LEGACY_V010") && legacy ? legacy : target;
  if (input.projectRoot && isPathInside(path.resolve(input.projectRoot), activeTarget.targetRoot)) {
    throw new HostAdapterInstallError("project-local host adapter target is forbidden");
  }
  assertManifestSafety(activeTarget, state);
  const snapshots = new Map<string, Snapshot>();
  const managedTargets = state.resources.map((resource) => targetPath(activeTarget, resource.relativeTarget));
  for (const absolute of [...managedTargets, activeTarget.manifestPath, hostStatePath(adapterId, uadsHome)]) {
    snapshots.set(absolute, readSnapshot(absolute));
  }
  for (const resource of state.resources) {
    const absolute = targetPath(activeTarget, resource.relativeTarget);
    const current = fileDigest(absolute);
    if (current !== null && current !== resource.installedDigest) {
      throw new HostAdapterInstallError(`modified managed resource blocks uninstall: ${resource.relativeTarget}`);
    }
  }
  try {
    for (const absolute of managedTargets) {
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    }
    if (fs.existsSync(activeTarget.manifestPath)) fs.unlinkSync(activeTarget.manifestPath);
    const detection = detectHostAdapter(adapterId, input);
    return writeHostAdapterState(
      {
        ...state,
        detection,
        installStatus: "NOT_INSTALLED",
        ownershipStatus: "CLEAN",
        rootBinding: null,
        resources: [],
        manifestDigest: null,
        updatedAt: new Date().toISOString(),
      },
      uadsHome,
      schemaRoot,
    );
  } catch (error) {
    for (const [absolute, snapshot] of snapshots) {
      try {
        restoreSnapshot(absolute, snapshot);
      } catch {
        // Preserve the original failure.
      }
    }
    throw error instanceof HostAdapterInstallError
      ? error
      : new HostAdapterInstallError(error instanceof Error ? error.message : String(error));
  }
}

export function getHostAdapterStatusSummary(
  adapterId: HostAdapterId,
  input: HostAdapterInstallInput = {},
  schemaRoot?: string,
): HostAdapterStatusSummary {
  const detection = detectHostAdapter(adapterId, input);
  const state = readHostAdapterState(adapterId, input.uadsHome, schemaRoot);
  const ownership = inspectHostAdapterOwnership(adapterId, input, schemaRoot);
  return {
    adapterId,
    support: detection.status,
    install: state?.installStatus ?? "NOT_INSTALLED",
    ownership: ownership.status,
    version: detection.version,
    targetLabel: detection.targetLabel,
    capabilityProof: detection.status === "SUPPORTED" ? "current" : "unknown",
    preparedBundle: "none",
    reasonCodes: [...new Set([...detection.reasonCodes, ...ownership.reasonCodes])].sort(),
  };
}
