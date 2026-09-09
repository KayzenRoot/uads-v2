import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { builtinSpecialistRegistry, createSpecialistRegistry, normalizeSpecialistProfile } from "../kernel/specialist-registry.js";
import { isSpecialistSelectionPlanCurrent, selectSpecialistPlan } from "../kernel/specialist-router.js";
import type { SpecialistRegistry, SpecialistRoutingInput } from "../kernel/specialist-types.js";
import { findPackageRoot } from "../lib/version.js";

type EvalCase = { id: string; name: string };
type CaseInput = Partial<Omit<SpecialistRoutingInput, "projectId" | "workOrderId" | "registry">> & { domains: string[]; objective: string };

function assertEval(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function registry(): SpecialistRegistry {
  return builtinSpecialistRegistry(findPackageRoot());
}

function makeInput(id: string, overrides: CaseInput): SpecialistRoutingInput {
  return {
    projectId: `specialist-eval-${id.toLowerCase()}`,
    workOrderId: `wo-${id.toLowerCase()}`,
    objective: overrides.objective,
    constraints: overrides.constraints ?? [],
    inScope: overrides.inScope ?? [overrides.objective],
    outOfScope: overrides.outOfScope ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["requested outcome is verified"],
    domains: overrides.domains,
    scopeClass: overrides.scopeClass ?? "local",
    riskLevel: overrides.riskLevel ?? "MEDIUM",
    riskSignals: overrides.riskSignals ?? [],
    affectedAreas: overrides.affectedAreas ?? ["src"],
    gates: overrides.gates ?? ["unit-test"],
    requiredEvidence: overrides.requiredEvidence ?? ["focused test evidence"],
    dependencyInfo: overrides.dependencyInfo ?? [],
    changeDigest: overrides.changeDigest ?? null,
    impactDigest: overrides.impactDigest ?? null,
    gateContractDigest: overrides.gateContractDigest ?? null,
    registry: registry(),
    allowExperimental: false,
  };
}

function has(plan: ReturnType<typeof selectSpecialistPlan>, id: string): boolean {
  return [...plan.selected, ...plan.assurance].some((item) => item.specialistId === id);
}

function runCase(id: string): void {
  if (id === "SR1") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Change primary button color", domains: ["frontend"], scopeClass: "trivial", riskLevel: "LOW" }));
    assertEval(plan.status === "SELECTED" && has(plan, "frontend-specialist"), "frontend specialist missing");
    assertEval(!has(plan, "software-architect") && !has(plan, "web3-contract-specialist") && !has(plan, "finance-math-specialist"), "unrelated specialist selected");
  } else if (id === "SR2") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Add authenticated billing API endpoint", domains: ["api", "backend"], riskLevel: "HIGH", riskSignals: ["authentication"], gates: ["integration-test", "security-review"] }));
    assertEval(has(plan, "backend-api-specialist") && has(plan, "security-reviewer"), "API/security coverage missing");
  } else if (id === "SR3") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Add destructive database migration", domains: ["database"], riskLevel: "CRITICAL", riskSignals: ["database-migration", "destructive"], gates: ["database-migration", "rollback-validation"] }));
    assertEval(has(plan, "database-specialist") && has(plan, "reliability-reviewer") && has(plan, "software-architect"), "migration coverage missing");
  } else if (id === "SR4") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Implement DeFi vault withdrawal", domains: ["web3", "smart-contracts", "finance-economics"], riskLevel: "CRITICAL", riskSignals: ["web3"], gates: ["web3-unit", "web3-fuzz", "web3-invariant", "security-review"] }));
    assertEval(has(plan, "web3-contract-specialist") && has(plan, "finance-math-specialist") && has(plan, "security-reviewer"), "DeFi coverage missing");
  } else if (id === "SR5") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Fix a typo in the README", domains: ["documentation"], scopeClass: "trivial", riskLevel: "LOW" }));
    assertEval(has(plan, "documentation-dx-specialist") && !has(plan, "security-reviewer") && !has(plan, "performance-reviewer"), "documentation routing expanded unexpectedly");
  } else if (id === "SR6") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Optimize API hot path", domains: ["backend", "performance"], riskSignals: ["performance-hot-path"], gates: ["performance-check"] }));
    assertEval(has(plan, "backend-api-specialist") && has(plan, "performance-reviewer"), "performance coverage missing");
  } else if (id === "SR7") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Fix financial rounding calculation", domains: ["finance-economics", "mathematics-simulation"], riskSignals: ["financial-calculation"], gates: ["financial-numerical-validation"] }));
    assertEval(has(plan, "finance-math-specialist"), "finance specialist missing");
  } else if (id === "SR8") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Balance combat damage formula", domains: ["game-systems", "mathematics-simulation"], gates: ["simulation-invariant"] }));
    assertEval(has(plan, "game-systems-specialist") && !has(plan, "web3-contract-specialist") && !has(plan, "documentation-dx-specialist"), "game routing incorrect");
  } else if (id === "SR9") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Fix mobile offline state", domains: ["mobile"] }));
    assertEval(has(plan, "mobile-client-specialist"), "mobile specialist missing");
  } else if (id === "SR10") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Harden cloud infrastructure rollback", domains: ["cloud-devops"], riskLevel: "HIGH", riskSignals: ["infrastructure"], gates: ["rollback-validation"] }));
    assertEval(has(plan, "platform-cloud-specialist") && has(plan, "reliability-reviewer"), "cloud/reliability coverage missing");
  } else if (id === "SR11") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Validate an AI data pipeline", domains: ["data-ai"] }));
    assertEval(has(plan, "data-ai-specialist"), "data/AI specialist missing");
  } else if (id === "SR12") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Validate wallet signing boundary", domains: ["wallets"], riskLevel: "HIGH", riskSignals: ["authentication"] }));
    assertEval(has(plan, "web3-contract-specialist") && has(plan, "security-reviewer"), "wallet/security coverage missing");
  } else if (id === "SR13") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Prepare release provenance", domains: ["release"], gates: ["release-check"] }));
    assertEval(has(plan, "release-specialist"), "release specialist missing");
  } else if (id === "SR14") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Change a frontend label", domains: ["frontend"], scopeClass: "local" }));
    assertEval(!has(plan, "web3-contract-specialist") && !has(plan, "finance-math-specialist") && !has(plan, "game-systems-specialist"), "negative routing selected unrelated domain");
  } else if (id === "SR15") {
    const first = makeInput(id, { objective: "Cross-cutting API and UI change", domains: ["frontend", "api"], scopeClass: "cross-cutting" });
    const second = { ...first, registry: createSpecialistRegistry(first.registry.profiles.slice().reverse()) };
    const a = selectSpecialistPlan(first); const b = selectSpecialistPlan(second);
    assertEval(a.selectionPlanId === b.selectionPlanId && a.selectionDigest === b.selectionDigest, "registry order changed selection identity");
  } else if (id === "SR16") {
    const plan = selectSpecialistPlan(makeInput(id, { objective: "Implement a local change", domains: ["frontend"] }));
    assertEval(has(plan, "implementation-agent") && has(plan, "independent-reviewer"), "independent review missing");
    assertEval(!plan.assurance.some((item) => item.independenceClass === "implementation"), "implementer entered assurance phase");
  } else if (id === "SR17") {
    const base = registry();
    let duplicateRejected = false;
    try { createSpecialistRegistry([...base.profiles, base.profiles[0]!]); } catch { duplicateRejected = true; }
    let digestRejected = false;
    try { selectSpecialistPlan({ ...makeInput(id, { objective: "safe", domains: ["frontend"] }), registry: { ...base, registryDigest: "0".repeat(64) } }); } catch { digestRejected = true; }
    assertEval(duplicateRejected && digestRejected, "duplicate or corrupt registry was accepted");
  } else if (id === "SR18") {
    const base = registry();
    const withoutFrontend = createSpecialistRegistry(base.profiles.filter((profile) => profile.specialistId !== "frontend-specialist"));
    const plan = selectSpecialistPlan({ ...makeInput(id, { objective: "frontend work", domains: ["frontend"] }), registry: withoutFrontend });
    assertEval(plan.status === "BLOCKED" && plan.blockedReasonCodes.includes("NO_DOMAIN_COVERAGE"), "missing critical domain did not block");
  } else if (id === "SR19") {
    const input = makeInput(id, { objective: "frontend work", domains: ["frontend"], changeDigest: "a".repeat(64) });
    const plan = selectSpecialistPlan(input);
    assertEval(isSpecialistSelectionPlanCurrent(plan, input), "fresh selection was not current");
    assertEval(!isSpecialistSelectionPlanCurrent(plan, { ...input, changeDigest: "b".repeat(64) }), "changed identity remained current");
  } else if (id === "SR20") {
    const input = makeInput(id, { objective: "Cross-cutting frontend and API work", domains: ["frontend", "api"], scopeClass: "cross-cutting" });
    const plan = selectSpecialistPlan(input);
    assertEval(plan.status === "SELECTED" && plan.dispatch.parallelEligibleGroups.some((group) => group.includes("frontend-specialist") && group.includes("backend-api-specialist")), "bounded parallel domain group missing");
    assertEval(isSpecialistSelectionPlanCurrent(plan, input), "parallel selection was not stable");
  } else if (id === "SR21") {
    const plan = selectSpecialistPlan(makeInput(id, {
      objective: "Validate a numerical obligation",
      domains: ["general"],
      gates: ["financial-numerical-validation"],
      requiredEvidence: ["gate:financial-numerical-validation"],
      riskLevel: "LOW",
    }));
    assertEval(plan.status === "SELECTED" && has(plan, "finance-math-specialist"), "gate-driven finance coverage missing");
    assertEval(
      plan.coveredObligations.some((item) => item.obligationId === "gate:financial-numerical-validation" && item.specialistId === "finance-math-specialist"),
      "finance gate obligation was not persisted",
    );
  } else if (id === "SR22") {
    const plan = selectSpecialistPlan(makeInput(id, {
      objective: "Validate migration rollback",
      domains: ["general"],
      gates: ["database-migration", "rollback-validation"],
      requiredEvidence: ["gate:database-migration", "gate:rollback-validation"],
    }));
    assertEval(plan.status === "SELECTED" && has(plan, "database-specialist") && has(plan, "reliability-reviewer"), "migration/rollback coverage missing");
  } else if (id === "SR23") {
    const base = registry();
    const disabled = normalizeSpecialistProfile({
      ...base.profiles.find((profile) => profile.specialistId === "finance-math-specialist")!,
      status: "disabled",
      profileDigest: undefined,
    }, "user-config");
    const current = createSpecialistRegistry([
      ...base.profiles.filter((profile) => profile.specialistId !== "finance-math-specialist"),
      disabled,
    ]);
    const plan = selectSpecialistPlan({
      ...makeInput(id, {
        objective: "Validate a required numerical gate",
        domains: ["general"],
        gates: ["financial-numerical-validation"],
        requiredEvidence: ["gate:financial-numerical-validation"],
      }),
      registry: current,
    });
    assertEval(plan.status === "BLOCKED" && plan.blockedReasonCodes.includes("UNMET_REQUIRED_EVIDENCE"), "disabled evidence producer did not block");
  } else if (id === "SR24") {
    const plan = selectSpecialistPlan(makeInput(id, {
      objective: "Require an undeclared evidence artifact",
      domains: ["general"],
      requiredEvidence: ["undeclared evidence artifact"],
    }));
    assertEval(plan.status === "BLOCKED" && plan.blockedReasonCodes.includes("UNMET_REQUIRED_EVIDENCE"), "free-form evidence was fabricated");
  } else if (id === "SR25") {
    const current = makeInput(id, { objective: "Original objective", domains: ["frontend"] });
    const plan = selectSpecialistPlan(current);
    assertEval(!isSpecialistSelectionPlanCurrent(plan, { ...current, objective: "Mutated objective" }), "semantic Work Order mutation remained current");
  } else if (id === "SR26") {
    const current = makeInput(id, {
      objective: "Bound gate and impact identity",
      domains: ["frontend"],
      gates: ["unit-test"],
      changeDigest: "a".repeat(64),
      impactDigest: "b".repeat(64),
      gateContractDigest: "c".repeat(64),
    });
    const plan = selectSpecialistPlan(current);
    assertEval(!isSpecialistSelectionPlanCurrent(plan, { ...current, gates: ["build"] }), "gate mutation remained current");
    assertEval(!isSpecialistSelectionPlanCurrent(plan, { ...current, impactDigest: "d".repeat(64) }), "impact mutation remained current");
  } else {
    throw new Error(`unknown specialist routing eval case ${id}`);
  }
}

export function runSpecialistRoutingEvals(): number {
  const casesPath = path.join(findPackageRoot(), "evals", "specialist-routing", "cases.json");
  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as EvalCase[];
  let failures = 0;
  for (const item of cases) {
    try { runCase(item.id); process.stdout.write(`${item.id} PASS ${item.name}\n`); }
    catch (error) { failures += 1; process.stdout.write(`${item.id} FAIL ${item.name}: ${error instanceof Error ? error.message : String(error)}\n`); }
  }
  process.stdout.write(`specialist routing eval ${cases.length - failures}/${cases.length}\n`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && path.normalize(path.resolve(process.argv[1])) === path.normalize(fileURLToPath(import.meta.url))) process.exitCode = runSpecialistRoutingEvals();
