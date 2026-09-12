import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { findPackageRoot } from "../lib/version.js";
import { getUadsPaths, type UadsPaths } from "../lib/workspace.js";
import { sha256Hex } from "../lib/hash.js";
import { runProcess } from "../lib/exec.js";
import { type GefAdoptionMode, type GefCurrent, type GefProjectClass, type GefProjectProfile, type GefRegistryEntry } from "./types.js";
import { ensureGefLayout, readGefCurrent, readGefProfile, readGefRegistry, writeGefCurrent, writeGefProfile, writeGefRegistry } from "./storage.js";
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

function createProfile(cwd: string, mode: GefAdoptionMode): { paths: UadsPaths; profile: GefProjectProfile; current: GefCurrent; projectClass: GefProjectClass } {
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
  const profileDigest = createHash("sha256").update(JSON.stringify(profileWithoutDigest)).digest("hex");
  const profile = profileWithoutDigest;
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
    updatedAt: now,
  };
  return { paths, profile, current, projectClass };
}

export function adoptGefProject(cwd: string, mode: GefAdoptionMode): { profile: GefProjectProfile; current: GefCurrent; paths: UadsPaths } {
  const result = createProfile(cwd, mode);
  ensureGefLayout(result.paths);
  writeGefProfile(result.paths, result.profile, findPackageRoot());
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

export function readGefProject(cwd: string): { paths: UadsPaths; profile: GefProjectProfile | null; current: GefCurrent | null; error: string | null } {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? path.resolve(cwd);
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  const paths = getUadsPaths(fingerprint.projectId);
  try {
    return { paths, profile: readGefProfile(paths, fingerprint.projectId, findPackageRoot()), current: readGefCurrent(paths, fingerprint.projectId, findPackageRoot()), error: null };
  } catch (error) {
    return { paths, profile: null, current: null, error: error instanceof Error ? error.message : String(error) };
  }
}
