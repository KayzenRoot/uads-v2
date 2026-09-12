import fs from "node:fs";
import path from "node:path";
import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { findPackageRoot, readUadsVersion } from "../lib/version.js";
import { getUadsPaths, resolveUadsHome } from "../lib/workspace.js";
import { checkGefSource } from "../gef/source-drift.js";
import { adoptGefProject, readGefProject } from "../gef/registry.js";
import { readGefRegistry } from "../gef/storage.js";

type GefOptions = { cwd?: string; json?: boolean };

function identity(cwd: string): { git: ReturnType<typeof readGitSummary>; projectId: string; fingerprint: string; paths: ReturnType<typeof getUadsPaths> } {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? path.resolve(cwd);
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  return { git, projectId: fingerprint.projectId, fingerprint: fingerprint.fingerprint, paths: getUadsPaths(fingerprint.projectId) };
}

export function runGefStatus(options: GefOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const project = readGefProject(cwd);
  let registry: ReturnType<typeof readGefRegistry> | null = null;
  let registryError: string | null = null;
  if (fs.existsSync(current.paths.gefRegistry)) {
    try {
      registry = readGefRegistry(current.paths, findPackageRoot());
    } catch (error) {
      registryError = error instanceof Error ? error.message : String(error);
    }
  }
  const result = {
    version: readUadsVersion(),
    gefVersion: "0.1.0",
    projectId: current.projectId,
    fingerprint: current.fingerprint,
    branch: current.git.branch,
    headSha: current.git.head,
    adoption: project.error ? { status: "CORRUPT", mode: null, projectClass: null } : project.profile ? { status: project.current?.status ?? "CORRUPT", mode: project.profile.adoptionMode, projectClass: project.profile.projectClass } : { status: "NOT_ADOPTED", mode: null, projectClass: null },
    globalRoot: path.join(resolveUadsHome(), "gef"),
    zeroProjectFootprint: true,
    registeredProjects: registry?.entries.length ?? null,
    registryStatus: registryError ? "CORRUPT" : registry ? "VALID" : "NOT_INITIALIZED",
    sourceCheck: checkGefSource(cwd).status,
  };
  if (options.json) return `${JSON.stringify(result, null, 2)}\n`;
  return [
    `UADS GEF status v${result.gefVersion}`,
    `projectId: ${result.projectId}`,
    `fingerprint: ${result.fingerprint}`,
    `branch: ${result.branch ?? "(none)"}`,
    `head: ${result.headSha ?? "(none)"}`,
    `adoption: ${result.adoption.status}`,
    `mode: ${result.adoption.mode ?? "(none)"}`,
    `globalRoot: ${result.globalRoot}`,
    `zeroProjectFootprint: ${result.zeroProjectFootprint}`,
    `registeredProjects: ${result.registeredProjects}`,
    `sourceCheck: ${result.sourceCheck}`,
    "",
  ].join("\n");
}

export function runGefAdopt(options: { cwd?: string; json?: boolean; shadow?: boolean } = {}): string {
  const result = adoptGefProject(options.cwd ?? process.cwd(), options.shadow ? "SHADOW" : "ACTIVE");
  const output = { status: "ADOPTED", projectId: result.profile.projectId, fingerprint: result.profile.fingerprint, projectClass: result.profile.projectClass, adoptionMode: result.profile.adoptionMode, profilePath: path.relative(resolveUadsHome(), path.join(result.paths.gefProjects, result.profile.projectId, "profile.json")), currentPath: path.relative(resolveUadsHome(), path.join(result.paths.gefProjects, result.profile.projectId, "current.json")) };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `UADS GEF adopt\nstatus: ADOPTED\nprojectId: ${output.projectId}\nprojectClass: ${output.projectClass}\nadoptionMode: ${output.adoptionMode}\n`;
}

export function runGefProfileShow(options: GefOptions = {}): string {
  const project = readGefProject(options.cwd ?? process.cwd());
  const output = project.error ? { status: "CORRUPT", reason: project.error, projectId: identity(options.cwd ?? process.cwd()).projectId } : project.profile ?? { status: "NOT_ADOPTED", projectId: identity(options.cwd ?? process.cwd()).projectId };
  return options.json ? `${JSON.stringify(output, null, 2)}\n` : `${JSON.stringify(output, null, 2)}\n`;
}

export function runGefDoctor(options: GefOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const current = identity(cwd);
  const checks = [
    { name: "global-gef-layout", ok: [current.paths.gef, current.paths.gefProjects, current.paths.gefReceipts, current.paths.gefTelemetry].every((item) => fs.existsSync(item)) },
    { name: "project-fingerprint", ok: /^[a-f0-9]{64}$/.test(current.fingerprint) },
    { name: "source-check", ok: checkGefSource(cwd).status === "MATCH" },
  ];
  const output = { status: checks.every((check) => check.ok) ? "PASS" : "BLOCKED", checks, projectId: current.projectId, zeroProjectFootprint: true };
  if (options.json) return `${JSON.stringify(output, null, 2)}\n`;
  return [`UADS GEF doctor`, ...checks.map((check) => `${check.ok ? "ok  " : "FAIL"} ${check.name}`), "", `status: ${output.status}`, ""].join("\n");
}
