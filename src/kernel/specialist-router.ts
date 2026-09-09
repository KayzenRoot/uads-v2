import { sha256Hex } from "../lib/hash.js";
import type { DomainId } from "./domains.js";
import { gateDef } from "./gates.js";
import {
  computeSpecialistRegistryDigest,
  normalizeSpecialistProfile,
} from "./specialist-registry.js";
import {
  deriveSpecialistObligations,
  profileCoversSpecialistObligation,
  SPECIALIST_OBLIGATION_CONTRACT_DIGEST,
  SPECIALIST_OBLIGATION_POLICY_VERSION,
  specialistObligationReasonCode,
} from "./specialist-obligations.js";
import type {
  SpecialistAssignment,
  SpecialistObligation,
  SpecialistObligationCoverage,
  SpecialistProfile,
  SpecialistRegistry,
  SpecialistRoutingInput,
  SpecialistSelection,
  SpecialistSelectionPlan,
  SpecialistUnmetObligation,
} from "./specialist-types.js";
import { SPECIALIST_POLICY_VERSION } from "./specialist-types.js";

export const SPECIALIST_POLICY = {
  schema: "uads.specialist-routing-policy",
  policyVersion: "0.9.0",
  obligationPolicyVersion: SPECIALIST_OBLIGATION_POLICY_VERSION,
  obligationContractDigest: SPECIALIST_OBLIGATION_CONTRACT_DIGEST,
  maxProfiles: 64,
  maxSelected: 32,
  algorithm: "bounded-deterministic-greedy",
  mandatoryCoreOrder: [
    "repo-inspector",
    "implementation-planner",
    "checkpoint-manager",
    "requirements-engineer",
    "software-architect",
    "implementation-agent",
    "test-engineer",
  ],
  assuranceOrder: [
    "independent-reviewer",
    "security-reviewer",
    "performance-reviewer",
    "reliability-reviewer",
  ],
  forbiddenParallelPairs: [
    ["implementation-agent", "independent-reviewer"],
    ["implementation-agent", "security-reviewer"],
    ["implementation-agent", "performance-reviewer"],
    ["implementation-agent", "reliability-reviewer"],
  ],
} as const;

export const SPECIALIST_POLICY_DIGEST = sha256Hex(JSON.stringify(SPECIALIST_POLICY));

const RISK_ORDER = new Map(["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value, index) => [value, index]));
const REASON = {
  CORE_REQUIRED: "CORE_REQUIRED",
  DOMAIN_COVERAGE: "DOMAIN_COVERAGE",
  ARCHITECTURE_SCOPE: "ARCHITECTURE_SCOPE",
  RISK_ASSURANCE: "RISK_ASSURANCE",
  GATE_REQUIRES_SPECIALIST: "GATE_REQUIRES_SPECIALIST",
  AFFECTED_AREA_MATCH: "AFFECTED_AREA_MATCH",
  DEPENDENCY_CROSS_CUTTING: "DEPENDENCY_CROSS_CUTTING",
  INDEPENDENT_REVIEW_REQUIRED: "INDEPENDENT_REVIEW_REQUIRED",
  SECURITY_ASSURANCE_REQUIRED: "SECURITY_ASSURANCE_REQUIRED",
  PERFORMANCE_ASSURANCE_REQUIRED: "PERFORMANCE_ASSURANCE_REQUIRED",
  RELIABILITY_ASSURANCE_REQUIRED: "RELIABILITY_ASSURANCE_REQUIRED",
  RELEASE_ASSURANCE_REQUIRED: "RELEASE_ASSURANCE_REQUIRED",
  MINIMUM_SUFFICIENT_SET: "MINIMUM_SUFFICIENT_SET",
  SPECIALIST_DISABLED: "SPECIALIST_DISABLED",
  SPECIALIST_EXPERIMENTAL_NOT_ALLOWED: "SPECIALIST_EXPERIMENTAL_NOT_ALLOWED",
  SPECIALIST_CONFLICT: "SPECIALIST_CONFLICT",
  NO_DOMAIN_COVERAGE: "NO_DOMAIN_COVERAGE",
  NO_ASSURANCE_COVERAGE: "NO_ASSURANCE_COVERAGE",
  UNMET_REQUIRED_EVIDENCE: "UNMET_REQUIRED_EVIDENCE",
} as const;

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].sort((a, b) => a.localeCompare(b));
}

function canonicalInput(input: SpecialistRoutingInput): Record<string, unknown> {
  return {
    projectId: input.projectId,
    objective: input.objective,
    constraints: sortedUnique(input.constraints),
    inScope: sortedUnique(input.inScope),
    outOfScope: sortedUnique(input.outOfScope),
    acceptanceCriteria: sortedUnique(input.acceptanceCriteria),
    domains: sortedUnique(input.domains),
    scopeClass: input.scopeClass,
    riskLevel: input.riskLevel,
    riskSignals: sortedUnique(input.riskSignals),
    riskReasons: sortedUnique(input.riskReasons ?? []),
    affectedAreas: sortedUnique(input.affectedAreas),
    gates: sortedUnique(input.gates),
    requiredEvidence: sortedUnique(input.requiredEvidence),
    dependencyInfo: sortedUnique(input.dependencyInfo ?? []),
    dependencySignals: input.dependencySignals
      ? {
          crossCutting: input.dependencySignals.crossCutting,
          source: input.dependencySignals.source,
        }
      : null,
    changeDigest: input.changeDigest ?? null,
    impactDigest: input.impactDigest ?? null,
    gateContractDigest: input.gateContractDigest ?? null,
  };
}

export function computeSpecialistRoutingDigest(input: SpecialistRoutingInput): string {
  return sha256Hex(JSON.stringify(canonicalInput(input)));
}

export function computeSpecialistGateContractDigest(gates: Array<{ id: string; reason: string }>): string {
  return sha256Hex(
    JSON.stringify(
      gates.map((gate) => ({
        ...gate,
        definition: gateDef(gate.id) ?? null,
      })),
    ),
  );
}

export function computeSpecialistWorkOrderDigest(input: Pick<SpecialistRoutingInput, "objective" | "constraints" | "inScope" | "outOfScope" | "acceptanceCriteria" | "requiredEvidence" | "dependencyInfo">): string {
  return sha256Hex(JSON.stringify({
    objective: input.objective,
    constraints: sortedUnique(input.constraints),
    inScope: sortedUnique(input.inScope),
    outOfScope: sortedUnique(input.outOfScope),
    acceptanceCriteria: sortedUnique(input.acceptanceCriteria),
    requiredEvidence: sortedUnique(input.requiredEvidence),
    dependencyInfo: sortedUnique(input.dependencyInfo ?? []),
  }));
}

function riskAtLeast(actual: SpecialistRoutingInput["riskLevel"], minimum: SpecialistRoutingInput["riskLevel"]): boolean {
  return (RISK_ORDER.get(actual) ?? 0) >= (RISK_ORDER.get(minimum) ?? 0);
}

function activationMatches(profile: SpecialistProfile, input: SpecialistRoutingInput): boolean {
  const activation = profile.activation;
  if (activation.scopeClasses && !activation.scopeClasses.includes(input.scopeClass)) return false;
  if (activation.minRisk && !riskAtLeast(input.riskLevel, activation.minRisk)) return false;
  const domainMatch = activation.domainAny?.some((domain) => input.domains.includes(domain));
  const riskSignalMatch = activation.riskSignalsAny?.some((signal) => input.riskSignals.includes(signal));
  const gateMatch = activation.gatesAny?.some((gate) => input.gates.includes(gate));
  const areaMatch = activation.affectedAreaAny?.some((area) => input.affectedAreas.includes(area));
  const constrained = [activation.domainAny, activation.riskSignalsAny, activation.gatesAny, activation.affectedAreaAny].some(Boolean);
  return !constrained || Boolean(domainMatch || riskSignalMatch || gateMatch || areaMatch);
}

function operationalEligible(profile: SpecialistProfile, input: SpecialistRoutingInput): { ok: boolean; reason?: string } {
  if (profile.status === "disabled") return { ok: false, reason: REASON.SPECIALIST_DISABLED };
  if (profile.status === "experimental" && !input.allowExperimental) return { ok: false, reason: REASON.SPECIALIST_EXPERIMENTAL_NOT_ALLOWED };
  if (!activationMatches(profile, input)) return { ok: false, reason: REASON.MINIMUM_SUFFICIENT_SET };
  return { ok: true };
}

function profileMap(registry: SpecialistRegistry): Map<string, SpecialistProfile> {
  return new Map(registry.profiles.map((profile) => [profile.specialistId, profile]));
}

function selectionOf(profile: SpecialistProfile, required: boolean, reasonCodes: string[]): SpecialistSelection {
  return {
    specialistId: profile.specialistId,
    kind: profile.kind,
    role: profile.purpose,
    required,
    reasonCodes: sortedUnique(reasonCodes),
    coversDomains: sortedUnique(profile.coveredDomains) as DomainId[],
    coversGates: [],
    independenceClass: profile.independenceClass,
  };
}

function addSelection(
  selected: SpecialistSelection[],
  profile: SpecialistProfile,
  required: boolean,
  reasons: string[],
): void {
  const existing = selected.find((item) => item.specialistId === profile.specialistId);
  if (existing) {
    existing.reasonCodes = sortedUnique([...existing.reasonCodes, ...reasons]);
  } else {
    selected.push(selectionOf(profile, required, reasons));
  }
}

function addAssurance(
  assurance: SpecialistSelection[],
  profile: SpecialistProfile,
  reasons: string[],
): void {
  const existing = assurance.find((item) => item.specialistId === profile.specialistId);
  if (existing) {
    existing.reasonCodes = sortedUnique([...existing.reasonCodes, ...reasons]);
  } else {
    assurance.push(selectionOf(profile, true, reasons));
  }
}

function obligationEligibility(
  profile: SpecialistProfile,
  input: SpecialistRoutingInput,
  item: SpecialistObligation,
): { ok: boolean; reason?: string } {
  if (profile.status === "disabled") return { ok: false, reason: REASON.SPECIALIST_DISABLED };
  if (
    profile.status === "experimental" &&
    (!input.allowExperimental ||
      (input.riskLevel === "CRITICAL" &&
        (item.kind === "assurance" || profile.independenceClass === "assurance")))
  ) {
    return { ok: false, reason: REASON.SPECIALIST_EXPERIMENTAL_NOT_ALLOWED };
  }
  if (item.kind !== "gate" && item.kind !== "evidence" && item.kind !== "assurance" && item.kind !== "dependency") {
    if (!activationMatches(profile, input)) return { ok: false, reason: REASON.MINIMUM_SUFFICIENT_SET };
  }
  if (!profileCoversSpecialistObligation(profile, item)) {
    return { ok: false, reason: REASON.MINIMUM_SUFFICIENT_SET };
  }
  return { ok: true };
}

function selectionForProfile(
  profile: SpecialistProfile,
  selected: SpecialistSelection[],
  assurance: SpecialistSelection[],
  required: boolean,
  reasons: string[],
): void {
  const isAssurance =
    profile.kind === "assurance" ||
    profile.independenceClass === "assurance" ||
    profile.independenceClass === "independent-review";
  if (isAssurance) addAssurance(assurance, profile, reasons);
  else addSelection(selected, profile, required, reasons);
}

function applyCoverageToSelections(
  selections: SpecialistSelection[],
  coverage: SpecialistObligationCoverage[],
): void {
  for (const selection of selections) {
    const owned = coverage.filter((item) => item.specialistId === selection.specialistId);
    selection.reasonCodes = sortedUnique([
      ...selection.reasonCodes,
      ...owned.map((item) => item.reasonCode),
    ]);
    selection.coversGates = sortedUnique(
      owned.map((item) => item.gateId).filter((item): item is string => item !== null),
    );
  }
}

function buildAssignments(
  selections: SpecialistSelection[],
  profiles: Map<string, SpecialistProfile>,
  input: SpecialistRoutingInput,
  assurance: Set<string>,
  coverage: SpecialistObligationCoverage[],
): SpecialistAssignment[] {
  return selections.map((selection) => {
    const profile = profiles.get(selection.specialistId);
    if (!profile) throw new Error(`missing selected specialist profile: ${selection.specialistId}`);
    const relevantAffectedAreas = profile.activation.affectedAreaAny?.length
      ? sortedUnique(profile.activation.affectedAreaAny.filter((area) => input.affectedAreas.includes(area)))
      : sortedUnique(input.affectedAreas);
    const relevantFiles = sortedUnique(input.affectedAreas.filter((area) => !area.includes(":" ) && !area.startsWith("sidecar://") && !area.startsWith("http")));
    const isAssurance = assurance.has(profile.specialistId) || profile.independenceClass === "independent-review" || profile.independenceClass === "assurance";
    const dependencyGroup = isAssurance ? 5 : profile.mayImplement ? 4 : profile.kind === "domain" ? 2 : profile.functions.includes("testing") ? 3 : profile.functions.includes("planning") || profile.functions.includes("architecture") ? 2 : 1;
    const ownedEvidence = coverage
      .filter((item) => item.specialistId === profile.specialistId && item.evidenceId !== null)
      .map((item) => item.evidenceId as string);
    return {
      specialistId: profile.specialistId,
      role: profile.purpose,
      objective: input.objective,
      coveredDomains: sortedUnique(profile.coveredDomains) as DomainId[],
      relevantAffectedAreas,
      relevantFiles,
      relevantGates: sortedUnique(input.gates),
      evidenceObligations: sortedUnique([...profile.producesEvidence, ...ownedEvidence]),
      riskLevel: input.riskLevel,
      forbiddenScope: sortedUnique([
        "out-of-scope work",
        ...input.outOfScope,
        ...(isAssurance ? ["implementing product changes", "approving without independent evidence"] : []),
        ...(profile.notes ? [profile.notes] : []),
      ]),
      dependencyGroup,
      parallelEligible: !isAssurance && !profile.mayImplement && profile.kind === "domain" && dependencyGroup === 2,
    };
  }).sort((a, b) => a.specialistId.localeCompare(b.specialistId) || a.dependencyGroup - b.dependencyGroup);
}

function assertRegistryBinding(registry: SpecialistRegistry): void {
  if (registry.policyVersion !== SPECIALIST_POLICY_VERSION) throw new Error("specialist registry policy version mismatch");
  const recalculated = computeSpecialistRegistryDigest(registry.profiles);
  if (registry.registryDigest !== recalculated) throw new Error("specialist registry digest mismatch");
}

export function selectSpecialistPlan(input: SpecialistRoutingInput): SpecialistSelectionPlan {
  assertRegistryBinding(input.registry);
  const profiles = profileMap(input.registry);
  const selected: SpecialistSelection[] = [];
  const assurance: SpecialistSelection[] = [];
  const rejections: SpecialistSelectionPlan["rejections"] = [];
  const unmetCoverage: string[] = [];
  const conflicts: string[] = [];
  const requiredObligations = deriveSpecialistObligations(input, input.registry.profiles);

  const docsOnly = input.domains.length > 0 && input.domains.every((id) => id === "documentation" || id === "general");
  const styleOnly = input.scopeClass === "trivial" && input.riskLevel === "LOW" && input.domains.includes("frontend") && input.riskSignals.length === 0;
  const addCore = (id: string, reasons: string[]): void => {
    const profile = profiles.get(id);
    if (!profile) {
      unmetCoverage.push(`${REASON.NO_DOMAIN_COVERAGE}:${id}`);
      return;
    }
    const eligibility = operationalEligible(profile, input);
    if (!eligibility.ok) {
      rejections.push({ specialistId: id, reasonCodes: [eligibility.reason ?? REASON.MINIMUM_SUFFICIENT_SET], reasons: ["core profile is unavailable for this routing input"] });
      if (eligibility.reason === REASON.SPECIALIST_DISABLED || eligibility.reason === REASON.SPECIALIST_EXPERIMENTAL_NOT_ALLOWED) unmetCoverage.push(`${eligibility.reason}:${id}`);
      return;
    }
    addSelection(selected, profile, true, reasons);
  };

  addCore("repo-inspector", [REASON.CORE_REQUIRED]);
  addCore("implementation-planner", [REASON.CORE_REQUIRED]);
  addCore("checkpoint-manager", [REASON.CORE_REQUIRED]);
  if (input.scopeClass !== "trivial") addCore("requirements-engineer", [REASON.CORE_REQUIRED]);
  if (input.scopeClass === "architectural" || input.scopeClass === "cross-cutting" || input.domains.includes("architecture") || input.riskSignals.some((signal) => ["database-migration", "destructive", "infrastructure"].includes(signal))) {
    addCore("software-architect", [REASON.ARCHITECTURE_SCOPE]);
  }
  addCore("implementation-agent", [REASON.CORE_REQUIRED]);
  const requiresVerificationCore = requiredObligations.some((item) => item.kind === "gate" || item.kind === "evidence");
  if ((!docsOnly && !styleOnly) || requiresVerificationCore) addCore("test-engineer", [REASON.CORE_REQUIRED]);

  const chosenIds = (): Set<string> => new Set([...selected, ...assurance].map((item) => item.specialistId));
  const uncovered = (): SpecialistObligation[] => {
    const chosen = [...selected, ...assurance]
      .map((item) => profiles.get(item.specialistId))
      .filter((item): item is SpecialistProfile => item !== undefined);
    return requiredObligations.filter((item) => !chosen.some((profile) => profileCoversSpecialistObligation(profile, item)));
  };

  while (uncovered().length > 0) {
    const remaining = uncovered();
    const candidates = input.registry.profiles
      .filter((profile) => !chosenIds().has(profile.specialistId))
      .map((profile) => {
        const eligible = remaining.filter((item) => obligationEligibility(profile, input, item).ok);
        return { profile, eligible };
      })
      .filter((item) => item.eligible.length > 0)
      .sort(
        (a, b) =>
          b.eligible.length - a.eligible.length ||
          a.profile.priority - b.profile.priority ||
          a.profile.specialistId.localeCompare(b.profile.specialistId),
      );
    const candidate = candidates[0];
    if (!candidate) break;
    selectionForProfile(
      candidate.profile,
      selected,
      assurance,
      true,
      sortedUnique(candidate.eligible.map((item) => specialistObligationReasonCode(item))),
    );
  }

  selected.sort(
    (a, b) =>
      (profiles.get(a.specialistId)?.priority ?? 0) - (profiles.get(b.specialistId)?.priority ?? 0) ||
      a.specialistId.localeCompare(b.specialistId),
  );
  assurance.sort(
    (a, b) =>
      (profiles.get(a.specialistId)?.priority ?? 0) - (profiles.get(b.specialistId)?.priority ?? 0) ||
      a.specialistId.localeCompare(b.specialistId),
  );

  const chosenProfiles = [...selected, ...assurance]
    .map((item) => profiles.get(item.specialistId))
    .filter((item): item is SpecialistProfile => item !== undefined);
  const coveredObligations: SpecialistObligationCoverage[] = [];
  const unmetObligations: SpecialistUnmetObligation[] = [];
  for (const item of requiredObligations) {
    const owner = chosenProfiles.find((profile) => profileCoversSpecialistObligation(profile, item));
    if (owner) {
      coveredObligations.push({
        obligationId: item.obligationId,
        gateId: item.gateId,
        evidenceId: item.evidenceId,
        specialistId: owner.specialistId,
        reasonCode: specialistObligationReasonCode(item),
        coverageKind: item.kind,
      });
      continue;
    }

    const reasonCode =
      item.kind === "gate" || item.kind === "evidence"
        ? REASON.UNMET_REQUIRED_EVIDENCE
        : item.kind === "assurance"
          ? REASON.NO_ASSURANCE_COVERAGE
          : REASON.NO_DOMAIN_COVERAGE;
    unmetObligations.push({
      obligationId: item.obligationId,
      gateId: item.gateId,
      evidenceId: item.evidenceId,
      specialistId: item.specialistId,
      reasonCode,
      coverageKind: item.kind,
    });
    if (item.kind === "gate" || item.kind === "evidence") {
      unmetCoverage.push(`${REASON.UNMET_REQUIRED_EVIDENCE}:${item.evidenceId ?? item.obligationId}`);
    } else if (item.kind === "assurance") {
      unmetCoverage.push(`${REASON.NO_ASSURANCE_COVERAGE}:${item.specialistId ?? item.obligationId}`);
    } else if (item.kind === "domain") {
      unmetCoverage.push(`${REASON.NO_DOMAIN_COVERAGE}:${item.domainId ?? item.obligationId}`);
    } else {
      unmetCoverage.push(`${REASON.NO_DOMAIN_COVERAGE}:${item.obligationId}`);
    }

    const possibleProfiles = input.registry.profiles.filter((profile) => profileCoversSpecialistObligation(profile, item));
    if (possibleProfiles.length > 0 && possibleProfiles.every((profile) => profile.status === "disabled")) {
      unmetCoverage.push(`${REASON.SPECIALIST_DISABLED}:${possibleProfiles.map((profile) => profile.specialistId).sort().join(",")}`);
    } else if (
      possibleProfiles.length > 0 &&
      possibleProfiles.every(
        (profile) =>
          profile.status === "experimental" &&
          (!input.allowExperimental ||
            (input.riskLevel === "CRITICAL" &&
              (item.kind === "assurance" || profile.independenceClass === "assurance"))),
      )
    ) {
      unmetCoverage.push(`${REASON.SPECIALIST_EXPERIMENTAL_NOT_ALLOWED}:${possibleProfiles.map((profile) => profile.specialistId).sort().join(",")}`);
    }
  }

  const allChosen = [...selected, ...assurance];
  for (const item of allChosen) {
    const profile = profiles.get(item.specialistId);
    if (!profile) continue;
    for (const incompatible of profile.incompatibleWith) {
      if (allChosen.some((other) => other.specialistId === incompatible)) {
        conflicts.push(`${REASON.SPECIALIST_CONFLICT}:${item.specialistId}:${incompatible}`);
      }
    }
  }
  if (allChosen.length > SPECIALIST_POLICY.maxSelected) {
    conflicts.push(`${REASON.SPECIALIST_CONFLICT}:MAX_SELECTED:${SPECIALIST_POLICY.maxSelected}`);
  }
  applyCoverageToSelections(selected, coveredObligations);
  applyCoverageToSelections(assurance, coveredObligations);

  for (const profile of input.registry.profiles) {
    if (allChosen.some((item) => item.specialistId === profile.specialistId)) continue;
    const eligibility = operationalEligible(profile, input);
    rejections.push({
      specialistId: profile.specialistId,
      reasonCodes: [eligibility.reason ?? REASON.MINIMUM_SUFFICIENT_SET],
      reasons: [eligibility.reason === REASON.SPECIALIST_DISABLED ? "profile is disabled" : eligibility.reason === REASON.SPECIALIST_EXPERIMENTAL_NOT_ALLOWED ? "experimental profile is not permitted" : "profile is outside the minimum sufficient set"],
    });
  }

  const allSelections = [...selected, ...assurance];
  const assuranceIds = new Set(assurance.map((item) => item.specialistId));
  const assignments = buildAssignments(allSelections, profiles, input, assuranceIds, coveredObligations);
  const groups = new Map<number, string[]>();
  for (const assignment of assignments) groups.set(assignment.dependencyGroup, [...(groups.get(assignment.dependencyGroup) ?? []), assignment.specialistId]);
  const dependencyGroups = [...groups.entries()].sort(([a], [b]) => a - b).map(([, ids]) => ids.sort((a, b) => a.localeCompare(b)));
  const parallelEligibleGroups = assignments.filter((assignment) => assignment.parallelEligible).reduce<string[][]>((groupsList, assignment) => {
    const group = groupsList.find((ids) => assignments.find((item) => item.specialistId === ids[0])?.dependencyGroup === assignment.dependencyGroup);
    if (group) group.push(assignment.specialistId); else groupsList.push([assignment.specialistId]);
    return groupsList;
  }, []).filter((ids) => ids.length > 1).map((ids) => ids.sort((a, b) => a.localeCompare(b)));
  const workOrderDigest = computeSpecialistWorkOrderDigest(input);
  const routingDigest = computeSpecialistRoutingDigest(input);
  const registryDigest = input.registry.registryDigest;
  const baseIdentity = { projectId: input.projectId, workOrderDigest, routingDigest, registryDigest, policyDigest: SPECIALIST_POLICY_DIGEST, changeDigest: input.changeDigest ?? null, impactDigest: input.impactDigest ?? null, gateContractDigest: input.gateContractDigest ?? null };
  const selectionPlanId = `sp_${sha256Hex(JSON.stringify(baseIdentity)).slice(0, 16)}`;
  const status: SpecialistSelectionPlan["status"] =
    unmetObligations.length === 0 && unmetCoverage.length === 0 && conflicts.length === 0 ? "SELECTED" : "BLOCKED";
  const blockedReasonCodes = sortedUnique([
    ...unmetCoverage.map((item) => item.split(":", 1)[0] ?? REASON.NO_DOMAIN_COVERAGE),
    ...conflicts.map((item) => item.split(":", 1)[0] ?? REASON.SPECIALIST_CONFLICT),
  ]);
  const planWithoutDigest = {
    schema: "uads.specialist-selection-plan" as const,
    schemaVersion: "0.9.0" as const,
    selectionPlanId,
    projectId: input.projectId,
    workOrderId: input.workOrderId,
    workOrderDigest,
    routingDigest,
    registryDigest,
    policyDigest: SPECIALIST_POLICY_DIGEST,
    changeDigest: input.changeDigest ?? null,
    impactDigest: input.impactDigest ?? null,
    gateContractDigest: input.gateContractDigest ?? null,
    selected,
    assurance,
    assignments,
    rejections,
    unmetCoverage: sortedUnique(unmetCoverage),
    requiredObligations,
    coveredObligations,
    unmetObligations,
    conflicts: sortedUnique(conflicts),
    dispatch: { dependencyGroups, parallelEligibleGroups },
    status,
    blockedReasonCodes,
  };
  return { ...planWithoutDigest, selectionDigest: sha256Hex(JSON.stringify(planWithoutDigest)) };
}

export function isSpecialistSelectionPlanCurrent(plan: SpecialistSelectionPlan, input: SpecialistRoutingInput): boolean {
  try {
    if (plan.projectId !== input.projectId || plan.workOrderId !== input.workOrderId) return false;
    if (input.registry.policyVersion !== SPECIALIST_POLICY_VERSION) return false;
    if (plan.registryDigest !== input.registry.registryDigest || plan.policyDigest !== SPECIALIST_POLICY_DIGEST) return false;
    if (
      plan.workOrderDigest !== computeSpecialistWorkOrderDigest(input) ||
      plan.routingDigest !== computeSpecialistRoutingDigest(input)
    ) {
      return false;
    }
    const { selectionDigest, ...withoutDigest } = plan;
    if (selectionDigest !== sha256Hex(JSON.stringify(withoutDigest))) return false;
    const expected = selectSpecialistPlan(input);
    return plan.selectionPlanId === expected.selectionPlanId && plan.selectionDigest === expected.selectionDigest;
  } catch {
    return false;
  }
}

export function specialistProfileFromUnknown(raw: unknown): SpecialistProfile {
  return normalizeSpecialistProfile(raw);
}
