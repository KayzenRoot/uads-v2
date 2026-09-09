import { describe, expect, it } from "vitest";
import { assertSchema } from "../src/lib/json-schema.js";
import { builtinSpecialistRegistry, createSpecialistRegistry, normalizeSpecialistProfile } from "../src/kernel/specialist-registry.js";
import { isSpecialistSelectionPlanCurrent, selectSpecialistPlan } from "../src/kernel/specialist-router.js";
import type { SpecialistRegistry, SpecialistRoutingInput } from "../src/kernel/specialist-types.js";

const ROOT = process.cwd();

function input(overrides: Partial<SpecialistRoutingInput> = {}): SpecialistRoutingInput {
  const base = builtinSpecialistRegistry(ROOT);
  return {
    projectId: "project-test",
    workOrderId: "wo-test",
    objective: "Implement a bounded frontend change",
    constraints: [],
    inScope: ["frontend"],
    outOfScope: [],
    acceptanceCriteria: ["verified"],
    domains: ["frontend"],
    scopeClass: "local",
    riskLevel: "LOW",
    riskSignals: [],
    affectedAreas: ["src/ui"],
    gates: ["unit-test"],
    requiredEvidence: ["test evidence"],
    dependencyInfo: [],
    changeDigest: null,
    impactDigest: null,
    gateContractDigest: null,
    registry: base,
    allowExperimental: false,
    ...overrides,
  };
}

function profile(id: string, patch: Record<string, unknown> = {}) {
  const base = builtinSpecialistRegistry(ROOT).profiles.find((item) => item.specialistId === "frontend-specialist")!;
  return normalizeSpecialistProfile({ ...base, specialistId: id, profileDigest: undefined, ...patch }, "user-config");
}

function registryWith(mutator: (registry: SpecialistRegistry) => SpecialistRegistry): SpecialistRegistry {
  return mutator(builtinSpecialistRegistry(ROOT));
}

describe("specialist registry and deterministic routing", () => {
  it("rejects duplicate IDs", () => {
    const base = builtinSpecialistRegistry(ROOT);
    expect(() => createSpecialistRegistry([...base.profiles, base.profiles[0]!])).toThrow(/duplicate/i);
  });

  it("rejects registry digest mismatch", () => {
    const base = builtinSpecialistRegistry(ROOT);
    expect(() => selectSpecialistPlan({ ...input(), registry: { ...base, registryDigest: "0".repeat(64) } })).toThrow(/digest/i);
  });

  it("rejects registry policy mismatch", () => {
    const base = builtinSpecialistRegistry(ROOT);
    expect(() => selectSpecialistPlan({ ...input(), registry: { ...base, policyVersion: "0.8.0" as "0.9.0" } })).toThrow(/policy/i);
  });

  it("rejects unknown profile fields", () => {
    expect(() => normalizeSpecialistProfile({ ...builtinSpecialistRegistry(ROOT).profiles[0]!, unknownField: true })).toThrow(/unsupported fields/i);
  });

  it("rejects unknown domain and function values", () => {
    expect(() => normalizeSpecialistProfile({ ...builtinSpecialistRegistry(ROOT).profiles[0]!, coveredDomains: ["unknown-domain"], profileDigest: undefined })).toThrow(/unsupported value/i);
    expect(() => normalizeSpecialistProfile({ ...builtinSpecialistRegistry(ROOT).profiles[0]!, functions: ["unknown-function"], profileDigest: undefined })).toThrow(/unsupported value/i);
  });

  it("rejects invalid implementation/review combinations", () => {
    const base = builtinSpecialistRegistry(ROOT).profiles.find((item) => item.specialistId === "implementation-agent")!;
    expect(() => normalizeSpecialistProfile({ ...base, reviewOnly: true, profileDigest: undefined })).toThrow(/reviewOnly/i);
    expect(() => normalizeSpecialistProfile({ ...base, independenceClass: "independent-review", profileDigest: undefined })).toThrow(/independent-review/i);
  });

  it("rejects unsafe IDs", () => {
    expect(() => normalizeSpecialistProfile({ ...builtinSpecialistRegistry(ROOT).profiles[0]!, specialistId: "../escape", profileDigest: undefined })).toThrow(/unsafe/i);
  });

  it.each(["disabled", "experimental"] as const)("does not select %s profiles by default", (status) => {
    const base = builtinSpecialistRegistry(ROOT);
    const disabled = normalizeSpecialistProfile({ ...base.profiles.find((item) => item.specialistId === "frontend-specialist")!, status, profileDigest: undefined }, "user-config");
    const current = createSpecialistRegistry([...base.profiles.filter((item) => item.specialistId !== "frontend-specialist"), disabled]);
    const plan = selectSpecialistPlan({ ...input(), registry: current });
    expect(plan.selected.some((item) => item.specialistId === "frontend-specialist")).toBe(false);
    expect(plan.rejections.find((item) => item.specialistId === "frontend-specialist")?.reasonCodes[0]).toMatch(/SPECIALIST_(DISABLED|EXPERIMENTAL_NOT_ALLOWED)/);
  });

  it("rejects secrets, absolute paths, commands, and hooks in profiles", () => {
    const base = builtinSpecialistRegistry(ROOT).profiles[0]!;
    for (const value of ["ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "C:\\Users\\secret", "/tmp/secret", "curl https://attacker.invalid", "hook: execute this"]) {
      expect(() => normalizeSpecialistProfile({ ...base, notes: value, profileDigest: undefined })).toThrow();
    }
  });

  it("enforces the bounded profile count", () => {
    const base = builtinSpecialistRegistry(ROOT);
    expect(() => createSpecialistRegistry(Array.from({ length: 65 }, (_, index) => profile(`extra-${index}`)))).toThrow(/maximum profile count/i);
  });

  it("always selects independent review for an implementer", () => {
    const plan = selectSpecialistPlan(input());
    expect(plan.selected.some((item) => item.specialistId === "implementation-agent")).toBe(true);
    expect(plan.assurance.some((item) => item.specialistId === "independent-reviewer")).toBe(true);
  });

  it("preserves security assurance for high-risk financial changes", () => {
    const plan = selectSpecialistPlan(input({
      objective: "Change fee accrual and rounding for a financial ledger",
      domains: ["finance-economics", "backend"],
      riskLevel: "HIGH",
      riskSignals: ["financial-calculation"],
      gates: ["financial-numerical-validation"],
      requiredEvidence: ["numerical and edge-case validation"],
    }));
    expect(plan.selected.some((item) => item.specialistId === "finance-math-specialist")).toBe(true);
    expect(plan.assurance.map((item) => item.specialistId)).toEqual(
      expect.arrayContaining(["independent-reviewer", "security-reviewer"]),
    );
  });

  it("blocks unknown domain coverage instead of guessing", () => {
    const plan = selectSpecialistPlan(input({ domains: ["unknown-domain"] }));
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasonCodes).toContain("NO_DOMAIN_COVERAGE");
  });

  it("blocks missing required domain coverage", () => {
    const base = builtinSpecialistRegistry(ROOT);
    const without = createSpecialistRegistry(base.profiles.filter((item) => item.specialistId !== "frontend-specialist"));
    const plan = selectSpecialistPlan(input({ registry: without }));
    expect(plan.status).toBe("BLOCKED");
    expect(plan.unmetCoverage.join(" ")).toMatch(/frontend/);
  });

  it("is deterministic under registry and input ordering", () => {
    const first = input({ domains: ["frontend", "api"], scopeClass: "cross-cutting" });
    const second = { ...first, domains: ["api", "frontend"], registry: createSpecialistRegistry(first.registry.profiles.slice().reverse()) };
    const a = selectSpecialistPlan(first);
    const b = selectSpecialistPlan(second);
    expect(b.selectionPlanId).toBe(a.selectionPlanId);
    expect(b.selectionDigest).toBe(a.selectionDigest);
  });

  it("rejects cross-project selection identity", () => {
    const current = input();
    const plan = selectSpecialistPlan(current);
    expect(isSpecialistSelectionPlanCurrent(plan, { ...current, projectId: "other-project" })).toBe(false);
  });

  it("invalidates reordered/stale work-order identity", () => {
    const current = input();
    const plan = selectSpecialistPlan(current);
    expect(isSpecialistSelectionPlanCurrent(plan, { ...current, constraints: ["new constraint"] })).toBe(false);
    expect(isSpecialistSelectionPlanCurrent(plan, { ...current, domains: ["api"] })).toBe(false);
  });

  it("invalidates changed risk, gates, evidence, change, impact, and gate contract", () => {
    const current = input({ riskLevel: "MEDIUM", gates: ["unit-test"], requiredEvidence: ["evidence"], changeDigest: "a".repeat(64), impactDigest: "b".repeat(64), gateContractDigest: "c".repeat(64) });
    const plan = selectSpecialistPlan(current);
    for (const changed of [
      { riskLevel: "HIGH" as const },
      { gates: ["security-review"] },
      { requiredEvidence: ["new evidence"] },
      { changeDigest: "d".repeat(64) },
      { impactDigest: "e".repeat(64) },
      { gateContractDigest: "f".repeat(64) },
    ]) expect(isSpecialistSelectionPlanCurrent(plan, { ...current, ...changed })).toBe(false);
  });

  it("invalidates changed registry and policy digests", () => {
    const current = input();
    const plan = selectSpecialistPlan(current);
    const changedProfile = profile("added-specialist");
    const changedRegistry = createSpecialistRegistry([...current.registry.profiles, changedProfile]);
    expect(isSpecialistSelectionPlanCurrent(plan, { ...current, registry: changedRegistry })).toBe(false);
    expect(isSpecialistSelectionPlanCurrent(plan, { ...current, registry: { ...current.registry, policyVersion: "0.8.0" as "0.9.0" } })).toBe(false);
  });

  it("keeps dispatch groups bounded and never parallelizes implementation/review", () => {
    const plan = selectSpecialistPlan(input({ domains: ["frontend", "api"], scopeClass: "cross-cutting" }));
    expect(plan.dispatch.parallelEligibleGroups.every((group) => !group.includes("implementation-agent") && !group.includes("independent-reviewer"))).toBe(true);
    expect(plan.dispatch.dependencyGroups.length).toBeLessThanOrEqual(8);
  });

  it("keeps assignments scoped, evidence-bound, and path-safe", () => {
    const plan = selectSpecialistPlan(input({ affectedAreas: ["src/ui", "sidecar://context", "https://example.invalid"] }));
    expect(plan.assignments.every((item) => item.relevantFiles.every((file) => !file.startsWith("/") && !file.includes("\\")))).toBe(true);
    expect(plan.assignments.every((item) => item.evidenceObligations.length > 0)).toBe(true);
  });

  it("emits a strict selection schema with no provider or secret data", () => {
    const plan = selectSpecialistPlan(input());
    expect(() => assertSchema("specialist-selection-plan.schema.json", plan, ROOT)).not.toThrow();
    expect(JSON.stringify(plan)).not.toMatch(/ghp_|apiKey|providerCacheId|private.?key/i);
  });

  it("does not select UGAS or game-assets as specialist domains", () => {
    const plan = selectSpecialistPlan(input({ domains: ["game-systems"] }));
    expect([...plan.selected, ...plan.assurance].some((item) => /ugas|game-assets/i.test(item.specialistId))).toBe(false);
    expect([...plan.selected, ...plan.assurance].flatMap((item) => item.coversDomains)).not.toContain("game-assets");
  });

  it("selects reliability assurance for irreversible infrastructure signals", () => {
    const plan = selectSpecialistPlan(input({ domains: ["cloud-devops"], riskLevel: "CRITICAL", riskSignals: ["infrastructure", "destructive"], gates: ["rollback-validation"] }));
    expect(plan.assurance.some((item) => item.specialistId === "reliability-reviewer")).toBe(true);
    expect(plan.selected.some((item) => item.specialistId === "platform-cloud-specialist")).toBe(true);
  });

  it("does not use an experimental assurance profile for a critical plan", () => {
    const base = builtinSpecialistRegistry(ROOT);
    const experimental = normalizeSpecialistProfile({ ...base.profiles.find((item) => item.specialistId === "security-reviewer")!, status: "experimental", profileDigest: undefined }, "user-config");
    const current = createSpecialistRegistry([...base.profiles.filter((item) => item.specialistId !== "security-reviewer"), experimental]);
    const plan = selectSpecialistPlan(input({ registry: current, riskLevel: "CRITICAL", riskSignals: ["authentication"] }));
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasonCodes).toContain("SPECIALIST_EXPERIMENTAL_NOT_ALLOWED");
  });

  it("rejects a profile with an incompatible selected peer", () => {
    const base = builtinSpecialistRegistry(ROOT);
    const custom = normalizeSpecialistProfile({ ...base.profiles.find((item) => item.specialistId === "frontend-specialist")!, incompatibleWith: ["backend-api-specialist"], profileDigest: undefined }, "user-config");
    const current = createSpecialistRegistry([...base.profiles.filter((item) => item.specialistId !== "frontend-specialist"), custom]);
    const plan = selectSpecialistPlan(input({ registry: current, domains: ["frontend", "api"] }));
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasonCodes).toContain("SPECIALIST_CONFLICT");
  });

  it("keeps stable identity independent of timestamps", () => {
    const a = selectSpecialistPlan(input());
    const b = selectSpecialistPlan({ ...input(), objective: input().objective });
    expect(a.selectionPlanId).toBe(b.selectionPlanId);
    expect(a.selectionDigest).toBe(b.selectionDigest);
  });

  it("uses generic verification roles for generic gate obligations", () => {
    const plan = selectSpecialistPlan(
      input({
        domains: ["general"],
        gates: ["unit-test"],
        requiredEvidence: ["gate:unit-test"],
      }),
    );
    expect(plan.status).toBe("SELECTED");
    expect(plan.selected.map((item) => item.specialistId)).toContain("test-engineer");
    expect(plan.selected.map((item) => item.specialistId)).not.toEqual(
      expect.arrayContaining(["finance-math-specialist", "web3-contract-specialist"]),
    );
    expect(
      plan.coveredObligations.find((item) => item.obligationId === "gate:unit-test")?.specialistId,
    ).toBe("test-engineer");
  });

  it("requires the declared security and performance assurance roles", () => {
    const security = selectSpecialistPlan(
      input({
        gates: ["security-review"],
        requiredEvidence: ["gate:security-review"],
      }),
    );
    expect(security.status).toBe("SELECTED");
    expect(security.assurance.map((item) => item.specialistId)).toContain("security-reviewer");
    expect(
      security.coveredObligations.find((item) => item.obligationId === "gate:security-review")?.specialistId,
    ).toBe("security-reviewer");

    const performance = selectSpecialistPlan(
      input({
        gates: ["performance-check"],
        requiredEvidence: ["gate:performance-check"],
      }),
    );
    expect(performance.status).toBe("SELECTED");
    expect(performance.assurance.map((item) => item.specialistId)).toContain("performance-reviewer");
  });

  it("routes gate-only Web3, architecture, and release obligations", () => {
    const web3 = selectSpecialistPlan(
      input({
        gates: ["web3-fuzz", "web3-invariant"],
        requiredEvidence: ["gate:web3-fuzz", "gate:web3-invariant"],
      }),
    );
    expect(web3.status).toBe("SELECTED");
    expect(web3.selected.map((item) => item.specialistId)).toContain("web3-contract-specialist");

    const architecture = selectSpecialistPlan(
      input({
        gates: ["architecture-conformance"],
        requiredEvidence: ["gate:architecture-conformance"],
      }),
    );
    expect(architecture.status).toBe("SELECTED");
    expect(architecture.selected.map((item) => item.specialistId)).toContain("software-architect");

    const release = selectSpecialistPlan(
      input({
        gates: ["release-check"],
        requiredEvidence: ["gate:release-check"],
      }),
    );
    expect(release.status).toBe("SELECTED");
    expect(release.selected.map((item) => item.specialistId)).toContain("release-specialist");
  });

  it("blocks unknown gates and unproven free-form evidence", () => {
    const unknownGate = selectSpecialistPlan(
      input({
        gates: ["unknown-gate"],
        requiredEvidence: ["gate:unknown-gate"],
      }),
    );
    expect(unknownGate.status).toBe("BLOCKED");
    expect(unknownGate.blockedReasonCodes).toContain("UNMET_REQUIRED_EVIDENCE");

    const unknownEvidence = selectSpecialistPlan(
      input({
        requiredEvidence: ["an evidence producer that does not exist"],
      }),
    );
    expect(unknownEvidence.status).toBe("BLOCKED");
    expect(unknownEvidence.blockedReasonCodes).toContain("UNMET_REQUIRED_EVIDENCE");
  });

  it("fails closed when the only canonical obligation producer is disabled", () => {
    const base = builtinSpecialistRegistry(ROOT);
    const disabled = normalizeSpecialistProfile({
      ...base.profiles.find((item) => item.specialistId === "finance-math-specialist")!,
      status: "disabled",
      profileDigest: undefined,
    }, "user-config");
    const registry = createSpecialistRegistry([
      ...base.profiles.filter((item) => item.specialistId !== "finance-math-specialist"),
      disabled,
    ]);
    const plan = selectSpecialistPlan({
      ...input({
        domains: ["general"],
        gates: ["financial-numerical-validation"],
        requiredEvidence: ["gate:financial-numerical-validation"],
      }),
      registry,
    });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasonCodes).toContain("UNMET_REQUIRED_EVIDENCE");
    expect(plan.selected.map((item) => item.specialistId)).not.toContain("finance-math-specialist");
  });

  it("does not use an experimental assurance profile for critical obligations", () => {
    const base = builtinSpecialistRegistry(ROOT);
    const experimental = normalizeSpecialistProfile({
      ...base.profiles.find((item) => item.specialistId === "security-reviewer")!,
      status: "experimental",
      profileDigest: undefined,
    }, "user-config");
    const registry = createSpecialistRegistry([
      ...base.profiles.filter((item) => item.specialistId !== "security-reviewer"),
      experimental,
    ]);
    const plan = selectSpecialistPlan({
      ...input({
        riskLevel: "CRITICAL",
        gates: ["security-review"],
        requiredEvidence: ["gate:security-review"],
      }),
      registry,
      allowExperimental: true,
    });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasonCodes).toContain("SPECIALIST_EXPERIMENTAL_NOT_ALLOWED");
  });

  it("uses only exact affected-area and structured dependency signals", () => {
    const base = builtinSpecialistRegistry(ROOT);
    const areaProfile = normalizeSpecialistProfile({
      ...base.profiles.find((item) => item.specialistId === "frontend-specialist")!,
      specialistId: "ui-area-specialist",
      activation: { affectedAreaAny: ["src/exact-ui"] },
      coveredDomains: ["frontend"],
      profileDigest: undefined,
    }, "user-config");
    const areaRegistry = createSpecialistRegistry([...base.profiles, areaProfile]);
    const areaPlan = selectSpecialistPlan(input({
      registry: areaRegistry,
      domains: ["general"],
      affectedAreas: ["src/exact-ui"],
    }));
    expect(areaPlan.selected.map((item) => item.specialistId)).toContain("ui-area-specialist");
    expect(areaPlan.selected.find((item) => item.specialistId === "ui-area-specialist")?.reasonCodes).toContain("AFFECTED_AREA_MATCH");

    const dependencyPlan = selectSpecialistPlan(input({
      domains: ["general"],
      dependencyInfo: ["this prose must not trigger routing"],
      dependencySignals: { crossCutting: true, source: "host-structured" },
    }));
    expect(dependencyPlan.selected.map((item) => item.specialistId)).toContain("software-architect");
    expect(dependencyPlan.selected.find((item) => item.specialistId === "software-architect")?.reasonCodes).toContain("DEPENDENCY_CROSS_CUTTING");
  });

  it("binds obligation coverage into the runtime selection identity", () => {
    const current = input({
      domains: ["general"],
      gates: ["financial-numerical-validation"],
      requiredEvidence: ["gate:financial-numerical-validation"],
    });
    const plan = selectSpecialistPlan(current);
    const tampered = {
      ...plan,
      coveredObligations: plan.coveredObligations.map((item, index) =>
        index === 0 ? { ...item, specialistId: "implementation-agent" } : item,
      ),
    };
    expect(isSpecialistSelectionPlanCurrent(tampered, current)).toBe(false);
    expect(plan.selectionDigest).not.toBe(
      selectSpecialistPlan({ ...current, requiredEvidence: ["gate:unit-test"] }).selectionDigest,
    );
  });
});
