import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import type { HostAdapterDefinition, HostAdapterId, HostAdapterState } from "./host-adapter-types.js";
import type { ResolvedHostTarget } from "./host-adapter-detect.js";
import { computeRootIdentityDigest, computeTargetRootDigest, resolveLegacyUserHome } from "./host-adapter-root.js";

export type TargetClassification =
  | "NOT_INSTALLED"
  | "CURRENT_TARGET_CLEAN"
  | "CURRENT_TARGET_CONFLICT"
  | "LEGACY_V010_TARGET_CLEAN"
  | "LEGACY_V010_TARGET_MODIFIED"
  | "LEGACY_V010_TARGET_AMBIGUOUS";

const LEGACY_V010_ADAPTERS = new Set<HostAdapterId>(["codex", "generic-agent-skills"]);

function fileDigest(target: string): string | null {
  if (!fs.existsSync(target)) return null;
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  return sha256Hex(fs.readFileSync(target));
}

export function resolveLegacyV010HostTarget(
  definition: HostAdapterDefinition,
  userHome: string,
): ResolvedHostTarget | null {
  if (!LEGACY_V010_ADAPTERS.has(definition.adapterId)) return null;
  const targetRoot = path.resolve(userHome);
  const resourceRoot = path.join(targetRoot, definition.targetRelativeRoot);
  const manifestPath = path.join(targetRoot, definition.manifestRelativeTarget);
  const sourceLabel = `${definition.targetLabel}-legacy-v010`;
  return {
    definition,
    hostHome: userHome,
    targetRoot,
    resourceRoot,
    manifestPath,
    source: "default",
    rootKind: "synthetic-user-home",
    sourceClass: "default",
    sourceLabel,
    rootIdentityDigest: computeRootIdentityDigest({
      adapterId: definition.adapterId,
      rootKind: "synthetic-user-home",
      sourceClass: "default",
      sourceLabel,
      isLegacyV010Target: true,
    }),
    targetRootDigest: computeTargetRootDigest(definition.adapterId, targetRoot),
    rootLabel: sourceLabel,
    canCreateAdapterRoot: false,
    isLegacyV010Target: true,
  };
}

export function classifyHostAdapterTarget(
  current: ResolvedHostTarget,
  legacy: ResolvedHostTarget | null,
  state: HostAdapterState | null,
): { classification: TargetClassification; reasonCodes: string[] } {
  if (!state || state.installStatus !== "INSTALLED" || state.resources.length === 0) {
    return { classification: "NOT_INSTALLED", reasonCodes: [] };
  }

  const currentReasons = ownershipReasons(current, state);
  if (currentReasons.length === 0) {
    return { classification: "CURRENT_TARGET_CLEAN", reasonCodes: [] };
  }
  if (currentReasons.some((reason) => reason.startsWith("MODIFIED") || reason.startsWith("SYMLINK"))) {
    return { classification: "CURRENT_TARGET_CONFLICT", reasonCodes: currentReasons };
  }

  if (!legacy) {
    return { classification: "CURRENT_TARGET_CONFLICT", reasonCodes: currentReasons };
  }

  const legacyReasons = ownershipReasons(legacy, state);
  if (legacyReasons.length === 0) {
    return { classification: "LEGACY_V010_TARGET_CLEAN", reasonCodes: ["LEGACY_V010_TARGET"] };
  }
  if (legacyReasons.some((reason) => reason.startsWith("MODIFIED") || reason.startsWith("SYMLINK"))) {
    return { classification: "LEGACY_V010_TARGET_MODIFIED", reasonCodes: legacyReasons };
  }
  return { classification: "LEGACY_V010_TARGET_AMBIGUOUS", reasonCodes: [...currentReasons, ...legacyReasons] };
}

function ownershipReasons(target: ResolvedHostTarget, state: HostAdapterState): string[] {
  const reasons: string[] = [];
  for (const resource of state.resources) {
    const absolute = path.resolve(target.targetRoot, resource.relativeTarget);
    if (!fs.existsSync(absolute)) {
      reasons.push(`MISSING_MANAGED_RESOURCE:${resource.relativeTarget}`);
      continue;
    }
    const digest = fileDigest(absolute);
    if (digest === null) {
      reasons.push(`SYMLINK_MANAGED_RESOURCE:${resource.relativeTarget}`);
    } else if (digest !== resource.installedDigest) {
      reasons.push(`MODIFIED_MANAGED_RESOURCE:${resource.relativeTarget}`);
    }
  }
  if (!fs.existsSync(target.manifestPath)) {
    reasons.push("MISSING_MANIFEST");
  } else {
    const digest = fileDigest(target.manifestPath);
    if (digest === null) {
      reasons.push("SYMLINK_MANIFEST");
    } else if (digest !== state.manifestDigest) {
      reasons.push("MODIFIED_MANIFEST");
    }
  }
  return reasons.sort();
}

export function targetRootIdentityDigest(target: ResolvedHostTarget): string {
  return target.rootIdentityDigest;
}

export function legacyUserHomeForTarget(target: ResolvedHostTarget): string {
  return resolveLegacyUserHome(target);
}
