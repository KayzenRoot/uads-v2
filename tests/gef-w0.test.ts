import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { runGefDoctor, runGefStatus } from "../src/commands/gef.js";
import { adoptGefProject, readGefProject } from "../src/gef/registry.js";
import { checkGefSource } from "../src/gef/source-drift.js";
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
  return repo;
}

describe("GEF W0 contracts and skeleton", () => {
  it("adopts globally without creating project-local state", () => {
    const repo = tempRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-home-"));
    process.env.UADS_HOME = home;

    const result = adoptGefProject(repo, "SHADOW");
    expect(result.profile.projectId).toHaveLength(16);
    expect(result.profile.repositoryIdentity).toBe("https://github.com/example/gef-fixture");
    expect(result.profile.adoptionMode).toBe("SHADOW");
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
    expect(fs.existsSync(path.join(home, "gef", "registry", "projects.json"))).toBe(true);
    expect(readGefProject(repo).current?.status).toBe("ADOPTED");
    expect(runGefStatus({ cwd: repo, json: true })).toContain('"zeroProjectFootprint": true');
    expect(runGefDoctor({ cwd: repo, json: true })).toContain('"status": "PASS"');
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
