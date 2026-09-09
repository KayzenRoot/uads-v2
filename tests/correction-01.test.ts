import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_GITHUB_TOKEN, gitCommit, initRepo, tempDirs } from "./helpers.js";
import { validateAgainstSchema } from "../src/lib/json-schema.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import { inspectRepository } from "../src/kernel/inspector.js";
import { intakeFromRequest, normalizeIntake } from "../src/kernel/intake.js";
import { runInspect, runPlan } from "../src/kernel/orchestrator.js";
import { classifyRisk, selectContextRadius } from "../src/kernel/policy.js";
import { selectGates } from "../src/kernel/routing.js";
import { assertUniqueGateIds, MANDATORY_GATE_IDS } from "../src/kernel/gates.js";
import { selectContextCandidates } from "../src/kernel/context-candidates.js";
import type { NormalizedIntake, RepositoryMap } from "../src/kernel/types.js";

const packageRoot = path.resolve(".");

function collectText(root: string): string {
  let out = "";
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(abs);
        continue;
      }
      out += fs.readFileSync(abs, "utf8");
    }
  };
  visit(root);
  return out;
}

function baseMap(overrides: Partial<RepositoryMap> = {}): RepositoryMap {
  return {
    schema: "uads.repository-map",
    schemaVersion: "0.2.0",
    projectId: "aaaaaaaaaaaaaaaa",
    generatedAt: new Date().toISOString(),
    mapVersion: "0.2.0",
    repositoryName: "fixture",
    digest: "digest",
    gitHead: "abc",
    branch: "main",
    dirty: false,
    dirtyDigest: "clean",
    reused: false,
    languages: ["typescript"],
    packageManager: "npm",
    frameworks: [],
    commands: { build: "build", test: "test", lint: null, typecheck: null },
    signals: {
      git: true,
      tests: true,
      docs: true,
      docker: false,
      ci: false,
      agentsMd: false,
      cursor: false,
      skills: false,
      database: false,
      migrations: false,
      web3: false,
    },
    modules: [
      { id: "frontend", path: "frontend", kind: "module" },
      { id: "backend", path: "backend", kind: "module" },
      { id: "docs", path: "docs", kind: "docs" },
      { id: "contracts", path: "contracts", kind: "module" },
      { id: "tests", path: "tests", kind: "module" },
    ],
    entrypoints: ["frontend/main.ts"],
    locations: { agentsMd: [], cursor: [], skills: [] },
    manifestHashes: {},
    ...overrides,
  };
}

function seedMultiRoot(repo: string): void {
  initRepo(repo, "https://github.com/example/uads-c01.git");
  for (const dir of ["frontend", "backend", "docs", "contracts", "tests", "prisma/migrations"]) {
    fs.mkdirSync(path.join(repo, dir), { recursive: true });
    fs.writeFileSync(path.join(repo, dir, "keep.txt"), "ok\n");
  }
  fs.writeFileSync(path.join(repo, "foundry.toml"), "[profile.default]\n");
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "# agents\n");
  fs.mkdirSync(path.join(repo, ".cursor", "rules"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".cursor", "rules", "x.md"), "rule\n");
  fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify({ name: "c01", version: "1.0.0" }, null, 2)}\n`);
  fs.writeFileSync(path.join(repo, ".env"), `API_TOKEN=${FIXTURE_GITHUB_TOKEN}\n`);
  gitCommit(repo, "init fixture");
}

describe("Prompt 002 Correction 01", { timeout: 90_000 }, () => {
  it("redacts secrets from persisted orchestration state and does not echo them", () => {
    const { repo, home } = tempDirs();
    seedMultiRoot(repo);
    const planned = runPlan({
      cwd: repo,
      uadsHome: home,
      request: `Change the primary button color. token=${FIXTURE_GITHUB_TOKEN}`,
    });
    const workspace = path.join(home, "workspaces", planned.workOrder.projectId);
    const blob = collectText(workspace);
    expect(blob).not.toContain(FIXTURE_GITHUB_TOKEN);
    expect(blob).toContain("[REDACTED:github-token]");
    expect(planned.workOrder.riskLevel).toBe("LOW");
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);

    const intake = normalizeIntake({
      schema: "uads.intake",
      schemaVersion: "0.2.0",
      objective: `Fix copy in docs token=${FIXTURE_GITHUB_TOKEN}`,
      inScope: [`docs wording ${FIXTURE_GITHUB_TOKEN}`],
      acceptanceCriteria: [`page renders ${FIXTURE_GITHUB_TOKEN}`],
      affectedAreas: [`docs ${FIXTURE_GITHUB_TOKEN}`],
      domainSignals: ["documentation"],
    });
    const second = runPlan({ cwd: repo, uadsHome: home, intake });
    const blob2 = collectText(path.join(home, "workspaces", second.workOrder.projectId));
    expect(blob2).not.toContain(FIXTURE_GITHUB_TOKEN);
    expect(() =>
      normalizeIntake({
        schema: "uads.intake",
        schemaVersion: "9.9.9",
        objective: `bad version ${FIXTURE_GITHUB_TOKEN}`,
      }),
    ).toThrow(/schemaVersion is invalid/);
    try {
      normalizeIntake({
        schema: "uads.intake",
        schemaVersion: "9.9.9",
        objective: `bad version ${FIXTURE_GITHUB_TOKEN}`,
      });
    } catch (error) {
      expect(String(error)).not.toContain(FIXTURE_GITHUB_TOKEN);
    }
  });

  it("rejects incomplete but otherwise plausible operational artifacts", () => {
    const { repo, home } = tempDirs();
    seedMultiRoot(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, request: "Change the primary button color." });
    const wo = { ...planned.workOrder };
    const { qualityGates: _gates, ...noGates } = wo;
    expect(validateAgainstSchema("work-order.schema.json", noGates).length).toBeGreaterThan(0);
    const { tokenBudget: _tb, ...noBudget } = wo;
    expect(validateAgainstSchema("work-order.schema.json", noBudget).length).toBeGreaterThan(0);
    const { autonomyBoundary: _ab, ...noAutonomy } = wo;
    expect(validateAgainstSchema("work-order.schema.json", noAutonomy).length).toBeGreaterThan(0);
    const budget = { ...wo.tokenBudget };
    delete (budget as { hardLimit?: number }).hardLimit;
    expect(validateAgainstSchema("work-order.schema.json", { ...wo, tokenBudget: budget }).length).toBeGreaterThan(0);
    const { domains: _d, ...noDomains } = planned.decision;
    expect(validateAgainstSchema("routing-decision.schema.json", noDomains).length).toBeGreaterThan(0);
    const { gates: _g, ...noRdGates } = planned.decision;
    expect(validateAgainstSchema("routing-decision.schema.json", noRdGates).length).toBeGreaterThan(0);
    const { resumeCursor: _rc, ...noCursor } = planned.checkpoint;
    expect(validateAgainstSchema("checkpoint.schema.json", noCursor).length).toBeGreaterThan(0);
    expect(validateAgainstSchema("work-order.schema.json", planned.workOrder)).toEqual([]);
    expect(validateAgainstSchema("routing-decision.schema.json", planned.decision)).toEqual([]);
    expect(validateAgainstSchema("checkpoint.schema.json", planned.checkpoint)).toEqual([]);
  });

  it("selects C4 for CRITICAL/architectural and keeps C5 exceptional", () => {
    expect(selectContextRadius("cross-cutting", "CRITICAL").radius).toBe("C4");
    expect(selectContextRadius("local", "CRITICAL").radius).toBe("C4");
    expect(selectContextRadius("architectural", "LOW").radius).toBe("C4");
    expect(selectContextRadius("cross-cutting", "HIGH").radius).toBe("C3");
    expect(selectContextRadius("trivial", "LOW").radius).toBe("C1");
    expect(selectContextRadius("local", "LOW").radius).toBe("C2");
    const { repo, home } = tempDirs();
    seedMultiRoot(repo);
    const defi = runPlan({
      cwd: repo,
      uadsHome: home,
      request: "Implement a withdrawal path for a DeFi vault smart contract.",
    });
    expect(defi.workOrder.contextRadius).toBe("C4");
    expect(defi.workOrder.contextRadius).not.toBe("C5");
  });

  it("bounds C1 candidates and keeps C4 connected without dumping the repo", () => {
    const map = baseMap();
    const style = intakeFromRequest("Change the primary button color.");
    const c1 = selectContextCandidates({ radius: "C1", intake: { ...style, affectedAreas: ["frontend"] }, map });
    expect(c1).toContain("frontend");
    expect(c1).not.toContain("contracts");
    expect(c1).not.toContain("backend");
    expect(c1).not.toContain("docs");
    const defi = intakeFromRequest("Implement a withdrawal path for a DeFi vault smart contract.");
    const c4 = selectContextCandidates({ radius: "C4", intake: defi, map });
    expect(c4).toContain("contracts");
    expect(c4.length).toBeLessThan(map.modules.length + map.entrypoints.length);
    const { repo, home } = tempDirs();
    seedMultiRoot(repo);
    const first = runInspect({ cwd: repo, uadsHome: home });
    const second = runInspect({ cwd: repo, uadsHome: home });
    expect(second.reused).toBe(true);
    expect(first.map.digest).toBe(second.map.digest);
  });

  it("selects the complete mandatory gate contract only when relevant", () => {
    assertUniqueGateIds();
    expect(MANDATORY_GATE_IDS).toEqual(
      expect.arrayContaining([
        "dependency-audit",
        "architecture-conformance",
        "release-check",
        "web3-fuzz",
        "database-migration",
      ]),
    );
    const dep = selectGates({
      domains: ["general"],
      risk: "MEDIUM",
      scopeClass: "local",
      intake: intakeFromRequest("Upgrade npm dependencies for a package update."),
    });
    expect(dep.map((gate) => gate.id)).toContain("dependency-audit");
    const arch = selectGates({
      domains: ["architecture"],
      risk: "MEDIUM",
      scopeClass: "architectural",
      intake: intakeFromRequest("Change the public API contract for auth architecture."),
    });
    expect(arch.map((gate) => gate.id)).toContain("architecture-conformance");
    const release = selectGates({
      domains: ["release"],
      risk: "LOW",
      scopeClass: "local",
      intake: intakeFromRequest("Prepare a release checklist."),
    });
    expect(release.map((gate) => gate.id)).toContain("release-check");
    const style = selectGates({
      domains: ["frontend"],
      risk: "LOW",
      scopeClass: "trivial",
      intake: intakeFromRequest("Change the primary button color."),
    });
    expect(style.map((gate) => gate.id)).not.toEqual(
      expect.arrayContaining(["dependency-audit", "architecture-conformance", "release-check"]),
    );
    const defi = selectGates({
      domains: ["web3", "smart-contracts"],
      risk: "CRITICAL",
      scopeClass: "cross-cutting",
      intake: intakeFromRequest("Implement a withdrawal path for a DeFi vault smart contract."),
    });
    expect(defi.map((gate) => gate.id)).toEqual(
      expect.arrayContaining(["web3-unit", "web3-fuzz", "web3-invariant", "security-review"]),
    );
    const db = selectGates({
      domains: ["database"],
      risk: "HIGH",
      scopeClass: "cross-cutting",
      intake: intakeFromRequest("Remove a production column and migrate its data."),
    });
    expect(db.map((gate) => gate.id)).toEqual(expect.arrayContaining(["database-migration", "rollback-validation"]));
  });

  it("uses relevant repository context without contaminating unrelated tasks", () => {
    const riskyMap = baseMap({
      signals: { ...baseMap().signals, database: true, migrations: true, web3: true },
    });
    const css = classifyRisk(intakeFromRequest("Change the primary button color."), riskyMap);
    expect(css.level).toBe("LOW");
    const migration = classifyRisk(intakeFromRequest("Remove a production column and migrate its data."), riskyMap);
    expect(["HIGH", "CRITICAL"]).toContain(migration.level);
    expect(migration.reasons.join(" ")).toMatch(/repository map corroborates/i);
    const defi = classifyRisk(intakeFromRequest("Implement a withdrawal path for a DeFi vault smart contract."), riskyMap);
    expect(defi.level).toBe("CRITICAL");
    const uncertain: NormalizedIntake = {
      ...intakeFromRequest("Clarify the remaining auth behavior."),
      uncertainties: ["unknown production impact"],
      domainSignals: ["security"],
      affectedAreas: ["auth"],
      riskSignals: [],
    };
    expect(classifyRisk(uncertain, riskyMap).level).not.toBe("LOW");

    const { repo, home } = tempDirs();
    seedMultiRoot(repo);
    const inspected = inspectRepository({
      repoRoot: repo,
      projectId: "bbbbbbbbbbbbbbbb",
      paths: ensureWorkspace("bbbbbbbbbbbbbbbb", home),
      schemaRoot: packageRoot,
    });
    expect(inspected.map.signals.database).toBe(true);
    expect(inspected.map.signals.migrations).toBe(true);
    expect(inspected.map.signals.web3).toBe(true);
    expect(inspected.map.branch).toBe("main");
    expect(inspected.map.locations.agentsMd).toEqual(["AGENTS.md"]);
    expect(inspected.map.locations.cursor.every((rel) => !path.isAbsolute(rel))).toBe(true);
    expect(inspected.map.modules.every((mod) => !path.isAbsolute(mod.path))).toBe(true);
    const mapText = fs.readFileSync(path.join(home, "workspaces", "bbbbbbbbbbbbbbbb", "index", "repository-map.json"), "utf8");
    expect(mapText).not.toContain(FIXTURE_GITHUB_TOKEN);
    expect(JSON.parse(mapText).locations.agentsMd[0]).not.toMatch(/^[A-Za-z]:/);
  });
});
