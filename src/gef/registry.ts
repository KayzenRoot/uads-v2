import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { findPackageRoot } from "../lib/version.js";
import { getUadsPaths, type UadsPaths } from "../lib/workspace.js";
import { sha256Hex } from "../lib/hash.js";
import { runProcess } from "../lib/exec.js";
import { captureGefSourceSnapshot } from "./source-drift.js";
import { computeGefProfileDigest, computeGefSourceSnapshotDigest, type GefAdoptionMode, type GefCurrent, type GefProjectClass, type GefProjectProfile, type GefProjectRead, type GefRegistryEntry } from "./types.js";
import { ensureGefLayout, readGefBaseline, readGefCurrent, readGefProfile, readGefRegistry, writeGefBaseline, writeGefCurrent, writeGefProfile, writeGefRegistry } from "./storage.js";
import { writeGefTelemetry } from "./storage.js";

function commandFromPackageJson(repoRoot: string, name: string): string | null {
  const packagePath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(packagePath)) return null;
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> };
    return packageJson.scripts?.[name] ? `npm run ${name}` : null;
  } catch {
    return null;
  }
}

function detectPackageManager(repoRoot: string): string | null {
  if (fs.existsSync(path.join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(repoRoot, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(repoRoot, "bun.lockb")) || fs.existsSync(path.join(repoRoot, "bun.lock"))) return "bun";
  if (fs.existsSync(path.join(repoRoot, "package-lock.json"))) return "npm";
  return fs.existsSync(path.join(repoRoot, "package.json")) ? "npm" : null;
}

function defaultBranch(repoRoot: string): string {
  const result = runProcess("git", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { cwd: repoRoot });
  const branch = (result.stdout ?? "").trim().replace(/^origin\//, "");
  return branch || "main";
}

function classifyProject(repoRoot: string): GefProjectClass {
  const hasGovernance = ["AGENTS.md", "GOVERNANCE.md", "docs/v2", ".github"].some((item) => fs.existsSync(path.join(repoRoot, item)));
  const hasCheckpoint = fs.existsSync(path.join(repoRoot, "docs/v2/11-CHECKPOINT.md"));
  if (hasCheckpoint && hasGovernance) return "EXISTING_PROJECT";
  return hasGovernance ? "PARTIALLY_GOVERNED" : "NEW_PROJECT";
}

function repositoryGeneration(fingerprint: string, headSha: string | null): string {
  return sha256Hex(`${fingerprint}|${headSha ?? "unknown"}`).slice(0, 16);
}

function createProfile(cwd: string, mode: GefAdoptionMode): { paths: UadsPaths; profile: GefProjectProfile; current: GefCurrent; baseline: ReturnType<typeof captureGefSourceSnapshot>; projectClass: GefProjectClass } {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? path.resolve(cwd);
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  const paths = getUadsPaths(fingerprint.projectId);
  const now = new Date().toISOString();
  const projectClass = classifyProject(repoRoot);
  const profileWithoutDigest = {
    schema: "uads.gef-project-profile" as const,
    schemaVersion: "0.1.0" as const,
    projectId: fingerprint.projectId,
    fingerprint: fingerprint.fingerprint,
    repositoryIdentity: fingerprint.source === "remote" ? fingerprint.material : "local",
    repositoryGeneration: repositoryGeneration(fingerprint.fingerprint, git.head),
    defaultBranch: defaultBranch(repoRoot),
    packageManager: detectPackageManager(repoRoot),
    buildSystem: fs.existsSync(path.join(repoRoot, "package.json")) ? "node" : null,
    commands: {
      build: commandFromPackageJson(repoRoot, "build"),
      test: commandFromPackageJson(repoRoot, "test"),
      typecheck: commandFromPackageJson(repoRoot, "typecheck"),
      lint: commandFromPackageJson(repoRoot, "lint"),
    },
    governancePaths: ["AGENTS.md", "GOVERNANCE.md", "docs/v2"].filter((item) => fs.existsSync(path.join(repoRoot, item))),
    evidencePaths: ["docs/v2", ".github"].filter((item) => fs.existsSync(path.join(repoRoot, item))),
    hostedGateNames: [],
    supportedExecutorAdapters: ["codex", "cursor", "generic"],
    currentGefVersion: "0.1.0" as const,
    adoptionMode: mode,
    projectClass,
    createdAt: now,
    updatedAt: now,
  } satisfies Omit<GefProjectProfile, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
  const profile = profileWithoutDigest;
  const profileDigest = computeGefProfileDigest(profile);
  const baseline = captureGefSourceSnapshot(cwd);
  const current: GefCurrent = {
    schema: "uads.gef-current",
    schemaVersion: "0.1.0",
    projectId: profile.projectId,
    fingerprint: profile.fingerprint,
    adoptionMode: mode,
    status: "ADOPTED",
    branch: git.branch,
    headSha: git.head,
    profileDigest,
    baselineDigest: computeGefSourceSnapshotDigest(baseline),
    updatedAt: now,
  };
  return { paths, profile, current, baseline, projectClass };
}

export function adoptGefProject(cwd: string, requestedMode: GefAdoptionMode = "SHADOW"): { profile: GefProjectProfile; current: GefCurrent; paths: UadsPaths } {
  if (requestedMode === "ACTIVE") throw new Error("ACTIVE_ADOPTION_UNAVAILABLE");
  const mode: GefAdoptionMode = "SHADOW";
  const result = createProfile(cwd, mode);
  ensureGefLayout(result.paths);
  writeGefProfile(result.paths, result.profile, findPackageRoot());
  writeGefBaseline(result.paths, result.baseline, findPackageRoot());
  writeGefCurrent(result.paths, result.current, findPackageRoot());
  const registry = readGefRegistry(result.paths, findPackageRoot());
  const entry: GefRegistryEntry = {
    projectId: result.profile.projectId,
    fingerprint: result.profile.fingerprint,
    repositoryIdentity: result.profile.repositoryIdentity,
    defaultBranch: result.profile.defaultBranch,
    adoptionMode: result.profile.adoptionMode,
    projectClass: result.profile.projectClass,
    profileDigest: result.current.profileDigest,
    updatedAt: result.current.updatedAt,
  };
  writeGefRegistry(result.paths, { ...registry, entries: [...registry.entries.filter((item) => item.projectId !== entry.projectId), entry], updatedAt: result.current.updatedAt }, findPackageRoot());
  writeGefTelemetry(result.paths, {
    schema: "uads.gef-telemetry-event",
    schemaVersion: "0.1.0",
    eventId: randomUUID(),
    projectId: result.profile.projectId,
    fingerprint: result.profile.fingerprint,
    workOrder: "UADS-GEF-V1-NATIVE-IMPLEMENTATION",
    taskClass: "T3",
    event: "adoption",
    executorRequested: null,
    executorApplied: null,
    filesOpened: null,
    filesChanged: 0,
    activeExecutorSeconds: 0,
    focusedTestSeconds: null,
    cacheHits: 0,
    cacheMisses: 0,
    sourceConflictCount: 0,
    budgetExpansionCount: 0,
    finalVerdict: "ADOPTED",
    createdAt: result.current.updatedAt,
  }, findPackageRoot());
  return result;
}

export function readGefProject(cwd: string): GefProjectRead {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? path.resolve(cwd);
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  const paths = getUadsPaths(fingerprint.projectId);
  const profileState = readGefProfile(paths, fingerprint.projectId, findPackageRoot());
  const currentState = readGefCurrent(paths, fingerprint.projectId, findPackageRoot());
  const baselineState = readGefBaseline(paths, fingerprint.projectId, findPackageRoot());
  let registry;
  try {
    registry = readGefRegistry(paths, findPackageRoot());
  } catch {
    return { paths, profile: null, current: null, baseline: null, status: "UNAVAILABLE", reasonCode: "REGISTRY_UNAVAILABLE" };
  }
  const noProjectState = profileState.status === "MISSING" && currentState.status === "MISSING" && baselineState.status === "MISSING";
  if (noProjectState) {
    return registry.entries.some((entry) => entry.projectId === fingerprint.projectId)
      ? { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "PROJECT_STATE_MISSING" }
      : { paths, profile: null, current: null, baseline: null, status: "NOT_ADOPTED", reasonCode: null };
  }
  if (profileState.status === "CORRUPT") return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: `PROFILE_${profileState.reasonCode}` };
  if (currentState.status === "CORRUPT") return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: `CURRENT_${currentState.reasonCode}` };
  if (baselineState.status === "CORRUPT") return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: `BASELINE_${baselineState.reasonCode}` };
  if (profileState.status === "MISSING") return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "PROFILE_MISSING" };
  if (currentState.status === "MISSING") return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "CURRENT_MISSING" };
  if (baselineState.status === "MISSING") return { paths, profile: null, current: null, baseline: null, status: "UNAVAILABLE", reasonCode: "BASELINE_MISSING" };
  const profile = profileState.value;
  const current = currentState.value;
  const baseline = baselineState.value;
  if (profile.projectId !== fingerprint.projectId || profile.fingerprint !== fingerprint.fingerprint) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "PROFILE_IDENTITY_MISMATCH" };
  if (current.projectId !== fingerprint.projectId || current.fingerprint !== fingerprint.fingerprint) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "CURRENT_IDENTITY_MISMATCH" };
  if (baseline.projectId !== fingerprint.projectId || baseline.fingerprint !== fingerprint.fingerprint) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "BASELINE_IDENTITY_MISMATCH" };
  if (computeGefProfileDigest(profile) !== current.profileDigest) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "PROFILE_DIGEST_MISMATCH" };
  if (computeGefSourceSnapshotDigest(baseline) !== current.baselineDigest) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "BASELINE_DIGEST_MISMATCH" };
  if (profile.adoptionMode !== current.adoptionMode) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "ADOPTION_MODE_MISMATCH" };
  const entry = registry.entries.find((item) => item.projectId === fingerprint.projectId);
  if (!entry) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "REGISTRY_ENTRY_MISSING" };
  if (entry.fingerprint !== profile.fingerprint || entry.projectId !== profile.projectId) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "REGISTRY_IDENTITY_MISMATCH" };
  if (entry.profileDigest !== current.profileDigest) return { paths, profile: null, current: null, baseline: null, status: "CORRUPT", reasonCode: "REGISTRY_DIGEST_MISMATCH" };
  return { paths, profile, current, baseline, status: "VALID", reasonCode: null };
}
