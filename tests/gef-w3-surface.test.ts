import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGefAssuranceDelta, runGefAssurancePlan, runGefImpactBuild, runGefImpactExplain, runGefProofList, runGefProofPrune, runGefProofShow, runGefProofVerify, readPersistedPlan } from "../src/commands/gef-assurance.js";
import { getUadsPaths } from "../src/lib/workspace.js";

type Fixture = { repo: string; home: string; originalHome: string | undefined; originalCwd: string };

function tempRepo(): Fixture {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w3-surface-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w3-surface.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "package.json"), `{\n  "name": "w3-surface-fixture",\n  "version": "1.0.0"\n}\n`);
  fs.mkdirSync(path.join(repo, "tests"), { recursive: true });
  fs.writeFileSync(path.join(repo, "tests", "gef-w3-impact.test.ts"), `export const t = 1;\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "fixture"], { cwd: repo });
  return {
    repo,
    home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w3-surface-home-")),
    originalHome: process.env.UADS_HOME,
    originalCwd: process.cwd(),
  };
}

describe("GEF W3 operator surface", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = tempRepo();
    process.env.UADS_HOME = fixture.home;
  });

  afterEach(() => {
    if (fixture.originalHome === undefined) delete process.env.UADS_HOME;
    else process.env.UADS_HOME = fixture.originalHome;
    process.chdir(fixture.originalCwd);
  });

  it("exposes structured impact build and explain JSON", () => {
    const build = JSON.parse(runGefImpactBuild("w3-surface", { cwd: fixture.repo, json: true })) as Record<string, unknown>;
    expect(build.taskId).toBe("w3-surface");
    expect(build.graphState).toBe("MISSING");
    expect(build.expansionState).toBe("IMPACT_EXPANSION_REQUIRED");
    expect(build.zeroProjectFootprint).toBe(true);
    expect(typeof build.graphNodeCount).toBe("number");
    expect(build.impactDigest).toMatch(/^[a-f0-9]{64}$/);

    const explain = JSON.parse(runGefImpactExplain("w3-surface", { cwd: fixture.repo, json: true })) as Record<string, unknown>;
    expect(explain.impactDigest).toBe(build.impactDigest);
    expect(explain.zeroProjectFootprint).toBe(true);
    expect(Array.isArray(explain.reasons)).toBe(true);
    expect((explain.reasons as Array<{ reason: string }>).some((entry) => entry.reason === "GRAPH_EXPANSION")).toBe(true);
  });

  it("refuses to explain or plan without a stored impact assessment", () => {
    expect(() => runGefImpactExplain("w3-missing", { cwd: fixture.repo, json: true })).toThrow("W3_IMPACT_MISSING");
    expect(() => runGefAssurancePlan("w3-missing", { cwd: fixture.repo, json: true })).toThrow("W3_IMPACT_MISSING");
    // The delta surface verifies its plan provenance first, so a missing plan is
    // reported as such rather than as an absent delta.
    expect(() => runGefAssuranceDelta("w3-missing", { cwd: fixture.repo, json: true })).toThrow("W3_PLAN_MISSING");

    runGefImpactBuild("w3-no-delta", { cwd: fixture.repo, json: true });
    runGefAssurancePlan("w3-no-delta", { cwd: fixture.repo, json: true });
    expect(() => runGefAssuranceDelta("w3-no-delta", { cwd: fixture.repo, json: true })).toThrow("W3_DELTA_MISSING");
  });

  it("plans deterministically and refuses corrupt or foreign plans", () => {
    runGefImpactBuild("w3-surface", { cwd: fixture.repo, json: true });
    const first = JSON.parse(runGefAssurancePlan("w3-surface", { cwd: fixture.repo, json: true })) as Record<string, unknown>;
    const second = JSON.parse(runGefAssurancePlan("w3-surface", { cwd: fixture.repo, json: true })) as Record<string, unknown>;
    expect(first.planDigest).toBe(second.planDigest);
    expect(first.minimumAssurance).toBe("A2");
    expect(first.zeroProjectFootprint).toBe(true);

    const projectId = fs.readdirSync(path.join(fixture.home, "gef", "projects"))[0] as string;
    const planPath = path.join(fixture.home, "gef", "projects", projectId, "assurance", "w3-surface-plan.json");
    const stored = JSON.parse(fs.readFileSync(planPath, "utf8")) as Record<string, unknown>;

    // A tampered plan is refused on read, not trusted because it exists.
    fs.writeFileSync(planPath, `${JSON.stringify({ ...stored, minimumAssurance: "A0" })}\n`);
    expect(() => readPersistedPlan(getUadsPaths(projectId, fixture.home), projectId, "w3-surface")).toThrow(/W3_PLAN_CORRUPT/);

    // A plan bound to another project is refused too.
    fs.writeFileSync(planPath, `${JSON.stringify({ ...stored, projectFingerprint: "f".repeat(64), planDigest: "e".repeat(64) })}\n`);
    expect(() => readPersistedPlan(getUadsPaths(projectId, fixture.home), projectId, "w3-surface")).toThrow(/W3_PLAN_CORRUPT/);
  });

  it("reports the proof store and verifies stored proofs", () => {
    const list = JSON.parse(runGefProofList({ json: true })) as Record<string, unknown>;
    expect(list).toMatchObject({ records: 0, indexes: 0, zeroProjectFootprint: true });
    expect(() => runGefProofShow("a".repeat(64), { json: true })).toThrow("PROOF_MISSING");
    expect(() => runGefProofVerify("not-a-digest", { json: true })).toThrow("PROOF_STORE_ID_REJECTED");

    const prune = JSON.parse(runGefProofPrune({ dryRun: true, json: true })) as Record<string, unknown>;
    expect(prune).toMatchObject({ pruned: 0, dryRun: true, zeroProjectFootprint: true });
  });

  it("keeps every W3 artifact inside the global sidecar", () => {
    const before = execFileSync("git", ["status", "--porcelain"], { cwd: fixture.repo, encoding: "utf8" });
    runGefImpactBuild("w3-footprint", { cwd: fixture.repo, json: true });
    runGefAssurancePlan("w3-footprint", { cwd: fixture.repo, json: true });
    const after = execFileSync("git", ["status", "--porcelain"], { cwd: fixture.repo, encoding: "utf8" });
    expect(after).toBe(before);
    const projectId = fs.readdirSync(path.join(fixture.home, "gef", "projects"))[0] as string;
    const sidecar = path.join(fixture.home, "gef", "projects", projectId);
    expect(fs.existsSync(path.join(sidecar, "impact", "graph.json"))).toBe(true);
    expect(fs.existsSync(path.join(sidecar, "impact", "graph.meta.json"))).toBe(true);
    expect(fs.existsSync(path.join(sidecar, "assurance", "w3-footprint-impact.json"))).toBe(true);
    expect(fs.existsSync(path.join(sidecar, "assurance", "w3-footprint-plan.json"))).toBe(true);
    const stray = fs.readdirSync(fixture.repo).filter((name) => name === ".uads" || name.startsWith("gef-"));
    expect(stray).toEqual([]);
  });

  it("reports missing artifacts instead of inventing proof state", () => {
    runGefImpactBuild("w3-truthful", { cwd: fixture.repo, json: true });
    const list = JSON.parse(runGefProofList({ json: true })) as { records: number };
    expect(list.records).toBe(0);
    expect(() => runGefProofShow("b".repeat(64), { json: true })).toThrow("PROOF_MISSING");
  });
});
