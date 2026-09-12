import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { runGefDoctor, runGefProfileShow, runGefStatus } from "../src/commands/gef.js";
import { adoptGefProject, readGefProject } from "../src/gef/registry.js";
import { checkGefSource } from "../src/gef/source-drift.js";
import { gefBaselinePath, gefCurrentPath, gefProfilePath } from "../src/gef/storage.js";
import { validateAgainstSchema } from "../src/lib/json-schema.js";

const previousHome = process.env.UADS_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.UADS_HOME;
  else process.env.UADS_HOME = previousHome;
});

function tempRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-repo-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-fixture.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "fixture\n");
  fs.mkdirSync(path.join(repo, "docs", "v2"), { recursive: true });
  fs.writeFileSync(path.join(repo, "docs", "v2", "03-SCOPE.md"), "scope\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ scripts: { build: "tsc", test: "vitest", typecheck: "tsc --noEmit", lint: "eslint" } }));
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "fixture"], { cwd: repo });
  return repo;
}

describe("GEF W0 contracts and skeleton", () => {
  it("adopts globally without creating project-local state", () => {
    const repo = tempRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-home-"));
    process.env.UADS_HOME = home;

    expect(JSON.parse(runGefStatus({ cwd: repo, json: true })).adoption.status).toBe("NOT_ADOPTED");
    expect(JSON.parse(runGefStatus({ cwd: repo, json: true })).sourceCheck).toBe("UNKNOWN");

    const result = adoptGefProject(repo);
    expect(result.profile.projectId).toHaveLength(16);
    expect(result.profile.repositoryIdentity).toBe("https://github.com/example/gef-fixture");
    expect(result.profile.adoptionMode).toBe("SHADOW");
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
    expect(fs.existsSync(path.join(home, "gef", "registry", "projects.json"))).toBe(true);
    expect(readGefProject(repo).current?.status).toBe("ADOPTED");
    expect(runGefStatus({ cwd: repo, json: true })).toContain('"zeroProjectFootprint": true');
    expect(runGefDoctor({ cwd: repo, json: true })).toContain('"status": "PASS"');
  });

  it("treats malformed profile and current state as corrupt, never not-adopted", () => {
    const repo = tempRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-home-"));
    process.env.UADS_HOME = home;
    const result = adoptGefProject(repo);

    fs.unlinkSync(gefProfilePath(result.paths, result.profile.projectId));
    expect(readGefProject(repo).reasonCode).toBe("PROFILE_MISSING");
    adoptGefProject(repo);
    fs.unlinkSync(gefCurrentPath(result.paths, result.profile.projectId));
    expect(readGefProject(repo).reasonCode).toBe("CURRENT_MISSING");
    adoptGefProject(repo);

    fs.writeFileSync(gefProfilePath(result.paths, result.profile.projectId), "{ malformed");
    expect(readGefProject(repo).reasonCode).toBe("PROFILE_MALFORMED_JSON");
    expect(JSON.parse(runGefStatus({ cwd: repo, json: true })).adoption.status).toBe("CORRUPT");
    expect(JSON.parse(runGefProfileShow({ cwd: repo, json: true })).status).toBe("CORRUPT");
    expect(JSON.parse(runGefDoctor({ cwd: repo, json: true })).status).toBe("BLOCKED");

    adoptGefProject(repo);
    fs.writeFileSync(gefCurrentPath(result.paths, result.profile.projectId), "{ malformed");
    expect(readGefProject(repo).reasonCode).toBe("CURRENT_MALFORMED_JSON");
    expect(JSON.parse(runGefStatus({ cwd: repo, json: true }).toString()).adoption.status).toBe("CORRUPT");
  });

  it("rejects schema-valid tampering and cross-record identity changes", () => {
    const repo = tempRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-home-"));
    process.env.UADS_HOME = home;
    const result = adoptGefProject(repo);

    const profilePath = gefProfilePath(result.paths, result.profile.projectId);
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8")) as Record<string, unknown>;
    profile.adoptionMode = "ACTIVE";
    fs.writeFileSync(profilePath, `${JSON.stringify(profile)}\n`);
    expect(readGefProject(repo).reasonCode).toBe("PROFILE_DIGEST_MISMATCH");

    adoptGefProject(repo);
    const currentPath = gefCurrentPath(result.paths, result.profile.projectId);
    const current = JSON.parse(fs.readFileSync(currentPath, "utf8")) as Record<string, unknown>;
    current.profileDigest = "f".repeat(64);
    fs.writeFileSync(currentPath, `${JSON.stringify(current)}\n`);
    expect(readGefProject(repo).reasonCode).toBe("PROFILE_DIGEST_MISMATCH");

    adoptGefProject(repo);
    const registry = JSON.parse(fs.readFileSync(result.paths.gefRegistry, "utf8")) as { entries: Array<Record<string, unknown>> };
    registry.entries[0]!.fingerprint = "b".repeat(64);
    fs.writeFileSync(result.paths.gefRegistry, `${JSON.stringify(registry)}\n`);
    expect(readGefProject(repo).reasonCode).toBe("REGISTRY_IDENTITY_MISMATCH");
  });

  it("requires adopted current state and complete cross-binding", () => {
    const repo = tempRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-home-"));
    process.env.UADS_HOME = home;
    const result = adoptGefProject(repo);
    const currentPath = gefCurrentPath(result.paths, result.profile.projectId);
    for (const status of ["CORRUPT", "NOT_ADOPTED", "SOURCE_CONFLICT"]) {
      adoptGefProject(repo);
      const current = JSON.parse(fs.readFileSync(currentPath, "utf8")) as Record<string, unknown>;
      current.status = status;
      fs.writeFileSync(currentPath, `${JSON.stringify(current)}\n`);
      expect(readGefProject(repo).reasonCode).toBe("CURRENT_STATUS_INVALID");
      expect(JSON.parse(runGefDoctor({ cwd: repo, json: true })).status).toBe("BLOCKED");
    }

    adoptGefProject(repo);
    const current = JSON.parse(fs.readFileSync(currentPath, "utf8")) as Record<string, unknown>;
    current.branch = "other-branch";
    fs.writeFileSync(currentPath, `${JSON.stringify(current)}\n`);
    expect(readGefProject(repo).reasonCode).toBe("CURRENT_BRANCH_BASELINE_MISMATCH");
    adoptGefProject(repo);
    const headCurrent = JSON.parse(fs.readFileSync(currentPath, "utf8")) as Record<string, unknown>;
    headCurrent.headSha = "a".repeat(40);
    fs.writeFileSync(currentPath, `${JSON.stringify(headCurrent)}\n`);
    expect(readGefProject(repo).reasonCode).toBe("CURRENT_HEAD_BASELINE_MISMATCH");

    const registryCases: Array<[string, string, string]> = [
      ["adoptionMode", "ACTIVE", "REGISTRY_ADOPTION_MODE_MISMATCH"],
      ["projectClass", "NEW_PROJECT", "REGISTRY_PROJECT_CLASS_MISMATCH"],
      ["defaultBranch", "other", "REGISTRY_DEFAULT_BRANCH_MISMATCH"],
      ["repositoryIdentity", "other", "REGISTRY_REPOSITORY_IDENTITY_MISMATCH"],
    ];
    for (const [field, value, reason] of registryCases) {
      adoptGefProject(repo);
      const registry = JSON.parse(fs.readFileSync(result.paths.gefRegistry, "utf8")) as { entries: Array<Record<string, unknown>> };
      registry.entries[0]![field] = value;
      fs.writeFileSync(result.paths.gefRegistry, `${JSON.stringify(registry)}\n`);
      expect(readGefProject(repo).reasonCode).toBe(reason);
    }
  });

  it("uses a persisted baseline and reports branch, head, and policy drift", () => {
    const repo = tempRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-home-"));
    process.env.UADS_HOME = home;
    const result = adoptGefProject(repo);
    expect(JSON.parse(runGefStatus({ cwd: repo, json: true })).sourceCheck).toBe("MATCH");

    execFileSync("git", ["checkout", "-b", "gef-drift"], { cwd: repo });
    const branchDrift = JSON.parse(runGefStatus({ cwd: repo, json: true }));
    expect(branchDrift.sourceCheck).toBe("SOURCE_CONFLICT");
    expect(branchDrift.sourceReasons).toContain("BRANCH_CHANGED");

    execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "--allow-empty", "-m", "head drift"], { cwd: repo });
    const headDrift = checkGefSource(repo, readGefProject(repo).baseline ?? {});
    expect(headDrift.reasons).toContain("HEAD_CHANGED");

    fs.writeFileSync(path.join(repo, "AGENTS.md"), "policy drift\n");
    const policyDrift = checkGefSource(repo, readGefProject(repo).baseline ?? {});
    expect(policyDrift.status).toBe("SOURCE_CONFLICT");
    expect(policyDrift.reasons).toContain("POLICY_CHANGED");

    fs.unlinkSync(gefBaselinePath(result.paths, result.profile.projectId));
    expect(JSON.parse(runGefStatus({ cwd: repo, json: true })).sourceCheck).toBe("UNKNOWN");
    expect(JSON.parse(runGefDoctor({ cwd: repo, json: true })).status).toBe("BLOCKED");
  });

  it("reports source conflict when an expected branch changes", () => {
    const repo = tempRepo();
    const result = checkGefSource(repo, { branch: "feature-that-is-not-current" });
    expect(result.status).toBe("SOURCE_CONFLICT");
    expect(result.reasons).toContain("BRANCH_CHANGED");
  });

  it("rejects unknown fields in closed W0 schemas", () => {
    const validProfile = {
      schema: "uads.gef-project-profile",
      schemaVersion: "0.1.0",
      projectId: "0123456789abcdef",
      fingerprint: "a".repeat(64),
      repositoryIdentity: "https://github.com/example/project",
      repositoryGeneration: "b".repeat(16),
      defaultBranch: "main",
      packageManager: "npm",
      buildSystem: "node",
      commands: { build: "npm run build", test: "npm test", typecheck: "npm run typecheck", lint: "npm run lint" },
      governancePaths: [],
      evidencePaths: [],
      hostedGateNames: [],
      supportedExecutorAdapters: ["codex"],
      currentGefVersion: "0.1.0",
      adoptionMode: "SHADOW",
      projectClass: "NEW_PROJECT",
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    };
    expect(validateAgainstSchema("gef-project-profile.schema.json", validProfile)).toEqual([]);
    expect(validateAgainstSchema("gef-project-profile.schema.json", { ...validProfile, unexpected: true })).not.toEqual([]);
  });
});
