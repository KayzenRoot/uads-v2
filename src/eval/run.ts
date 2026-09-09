import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { intakeFromRequest, normalizeIntake } from "../kernel/intake.js";
import { planFromIntake } from "../kernel/orchestrator.js";
import type { RepositoryMap } from "../kernel/types.js";
import { findPackageRoot } from "../lib/version.js";
import { ensureWorkspace } from "../lib/workspace.js";

type Expectation = {
  domainsInclude?: string[];
  domainsExclude?: string[];
  riskIn?: string[];
  scopeIn?: string[];
  specialistsInclude?: string[];
  specialistsExclude?: string[];
  gatesInclude?: string[];
  gatesExclude?: string[];
  contextIn?: string[];
  assuranceInclude?: string[];
  requiresApprovalContains?: string[];
  maxSpecialists?: number;
};

type EvalCase = {
  id: string;
  name: string;
  request?: string;
  intake?: unknown;
  expect: Expectation;
};

function stubMap(projectId: string, extras: { web3?: boolean; migrations?: boolean; database?: boolean } = {}): RepositoryMap {
  return {
    schema: "uads.repository-map",
    schemaVersion: "0.2.0",
    projectId,
    generatedAt: new Date().toISOString(),
    mapVersion: "0.2.0",
    repositoryName: "eval-fixture",
    digest: "eval",
    gitHead: null,
    branch: null,
    dirty: false,
    dirtyDigest: "eval",
    reused: false,
    languages: ["typescript"],
    packageManager: "npm",
    frameworks: [],
    commands: { build: "build", test: "test", lint: "lint", typecheck: "typecheck" },
    signals: {
      git: false,
      tests: true,
      docs: true,
      docker: false,
      ci: false,
      agentsMd: false,
      cursor: false,
      skills: false,
      web3: extras.web3 ?? false,
      database: extras.database ?? false,
      migrations: extras.migrations ?? false,
    },
    modules: [{ id: "src", path: "src", kind: "module" }],
    entrypoints: ["src/cli.ts"],
    locations: { agentsMd: [], cursor: [], skills: [] },
    manifestHashes: {},
  };
}

function loadCases(dir: string): EvalCase[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as EvalCase);
}

function missing(actual: string[], required: string[] | undefined): string[] {
  return (required ?? []).filter((item) => !actual.includes(item));
}

function present(actual: string[], forbidden: string[] | undefined): string[] {
  return (forbidden ?? []).filter((item) => actual.includes(item));
}

function run(): number {
  const packageRoot = findPackageRoot();
  const casesDir = path.join(packageRoot, "evals", "orchestrator");
  const cases = loadCases(casesDir);
  if (cases.length === 0) {
    process.stderr.write("no orchestrator eval cases found\n");
    return 1;
  }

  const failures: string[] = [];
  for (const evalCase of cases) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), `uads-eval-${evalCase.id}-`));
    const projectId = `eval${evalCase.id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}00000000`.slice(0, 16);
    const paths = ensureWorkspace(projectId, home);
    const intake = evalCase.intake
      ? normalizeIntake(evalCase.intake, packageRoot)
      : intakeFromRequest(evalCase.request ?? "");
    const result = planFromIntake({
      intake,
      map: stubMap(projectId, {
        web3: intake.domainSignals.includes("web3") || intake.domainSignals.includes("smart-contracts"),
        database: intake.domainSignals.includes("database"),
        migrations: intake.riskSignals.includes("database-migration"),
      }),
      mapReused: false,
      projectId,
      paths,
      schemaRoot: packageRoot,
    });
    const domains = result.workOrder.domains;
    const specialists = result.workOrder.specialists;
    const assurance = result.workOrder.assuranceReviewers;
    const union = [...new Set([...specialists, ...assurance])];
    const gates = result.workOrder.qualityGates;
    const diffs: string[] = [];

    const domainMiss = missing(domains, evalCase.expect.domainsInclude);
    if (domainMiss.length) diffs.push(`missing domains: ${domainMiss.join(", ")}`);
    const domainHit = present(domains, evalCase.expect.domainsExclude);
    if (domainHit.length) diffs.push(`unexpected domains: ${domainHit.join(", ")}`);
    if (evalCase.expect.riskIn && !evalCase.expect.riskIn.includes(result.workOrder.riskLevel)) {
      diffs.push(`risk ${result.workOrder.riskLevel} not in ${evalCase.expect.riskIn.join("|")}`);
    }
    if (evalCase.expect.scopeIn && !evalCase.expect.scopeIn.includes(result.workOrder.scopeClass)) {
      diffs.push(`scope ${result.workOrder.scopeClass} not in ${evalCase.expect.scopeIn.join("|")}`);
    }
    const specMiss = missing(union, evalCase.expect.specialistsInclude);
    if (specMiss.length) diffs.push(`missing specialists: ${specMiss.join(", ")}`);
    const specHit = present(union, evalCase.expect.specialistsExclude);
    if (specHit.length) diffs.push(`unexpected specialists: ${specHit.join(", ")}`);
    const gateMiss = missing(gates, evalCase.expect.gatesInclude);
    if (gateMiss.length) diffs.push(`missing gates: ${gateMiss.join(", ")}`);
    const gateHit = present(gates, evalCase.expect.gatesExclude);
    if (gateHit.length) diffs.push(`unexpected gates: ${gateHit.join(", ")}`);
    if (evalCase.expect.contextIn && !evalCase.expect.contextIn.includes(result.workOrder.contextRadius)) {
      diffs.push(`context ${result.workOrder.contextRadius} not in ${evalCase.expect.contextIn.join("|")}`);
    }
    const assuranceMiss = missing(assurance, evalCase.expect.assuranceInclude);
    if (assuranceMiss.length) diffs.push(`missing assurance: ${assuranceMiss.join(", ")}`);
    for (const needle of evalCase.expect.requiresApprovalContains ?? []) {
      if (!result.workOrder.autonomyBoundary.requiresApproval.some((item) => item.includes(needle))) {
        diffs.push(`missing approval boundary: ${needle}`);
      }
    }
    if (evalCase.expect.maxSpecialists && union.length > evalCase.expect.maxSpecialists) {
      diffs.push(`specialist explosion: ${union.length} > ${evalCase.expect.maxSpecialists}`);
    }
    if (diffs.length > 0) {
      failures.push(`${evalCase.id} ${evalCase.name}\n  ${diffs.join("\n  ")}`);
      process.stdout.write(`FAIL ${evalCase.id} ${evalCase.name}\n`);
    } else {
      process.stdout.write(`PASS ${evalCase.id} ${evalCase.name}\n`);
    }
  }

  process.stdout.write(`\n${cases.length - failures.length} passed, ${failures.length} failed, ${cases.length} total\n`);
  if (failures.length > 0) {
    process.stderr.write(`\n${failures.join("\n\n")}\n`);
    return 1;
  }
  return 0;
}

function invokedAsCli(): boolean {
  const argvPath = process.argv[1];
  if (typeof argvPath !== "string" || argvPath.length === 0) {
    return false;
  }
  return path.normalize(path.resolve(argvPath)) === path.normalize(fileURLToPath(import.meta.url));
}

if (invokedAsCli()) {
  process.exit(run());
}

export { run as runOrchestratorEvals };
