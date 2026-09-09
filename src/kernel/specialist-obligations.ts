import { sha256Hex } from "../lib/hash.js";
import { DOMAIN_IDS } from "./domains.js";
import { GATE_REGISTRY, gateDef } from "./gates.js";
import type {
  SpecialistFunction,
  SpecialistObligation,
  SpecialistObligationKind,
  SpecialistProfile,
  SpecialistRoutingInput,
} from "./specialist-types.js";

export const SPECIALIST_OBLIGATION_POLICY_VERSION = "0.9.1" as const;

type GateRequirement = {
  functions: SpecialistFunction[];
  assurance: boolean;
  aliases: string[];
};

const GATE_REQUIREMENTS: Record<string, GateRequirement> = {
  static: { functions: ["testing"], assurance: false, aliases: ["test evidence"] },
  "unit-test": { functions: ["testing"], assurance: false, aliases: ["test evidence"] },
  "integration-test": { functions: ["testing"], assurance: false, aliases: ["test evidence"] },
  "contract-test": { functions: ["testing"], assurance: false, aliases: ["test evidence"] },
  build: { functions: ["testing"], assurance: false, aliases: ["test evidence"] },
  "dependency-audit": { functions: ["testing"], assurance: false, aliases: ["test evidence"] },
  "security-review": { functions: ["security-assurance"], assurance: true, aliases: ["security review"] },
  "performance-check": { functions: ["performance-assurance"], assurance: true, aliases: ["performance evidence"] },
  "architecture-conformance": { functions: ["architecture"], assurance: false, aliases: ["architecture bounds"] },
  "database-migration": { functions: ["database"], assurance: false, aliases: ["migration and rollback evidence"] },
  "rollback-validation": { functions: ["reliability-assurance"], assurance: true, aliases: ["reliability review"] },
  "web3-unit": { functions: ["web3-contract"], assurance: false, aliases: ["contract unit, fuzz, and invariant evidence"] },
  "web3-fuzz": { functions: ["web3-contract"], assurance: false, aliases: ["contract unit, fuzz, and invariant evidence"] },
  "web3-invariant": { functions: ["web3-contract"], assurance: false, aliases: ["contract unit, fuzz, and invariant evidence"] },
  "financial-numerical-validation": { functions: ["finance-math"], assurance: false, aliases: ["numerical and edge-case validation"] },
  "simulation-invariant": { functions: ["game-systems", "finance-math"], assurance: false, aliases: ["simulation evidence", "numerical and edge-case validation"] },
  "release-check": { functions: ["release"], assurance: false, aliases: ["release readiness evidence"] },
};

const FREEFORM_EVIDENCE_ALIASES: Record<string, string[]> = {
  "focused test evidence": ["test evidence"],
  "test output": ["test evidence"],
};

const OBLIGATION_REASON_CODES = {
  DOMAIN_COVERAGE: "DOMAIN_COVERAGE",
  GATE_REQUIRES_SPECIALIST: "GATE_REQUIRES_SPECIALIST",
  REQUIRED_EVIDENCE_COVERAGE: "REQUIRED_EVIDENCE_COVERAGE",
  INDEPENDENT_REVIEW_REQUIRED: "INDEPENDENT_REVIEW_REQUIRED",
  SECURITY_ASSURANCE_REQUIRED: "SECURITY_ASSURANCE_REQUIRED",
  PERFORMANCE_ASSURANCE_REQUIRED: "PERFORMANCE_ASSURANCE_REQUIRED",
  RELIABILITY_ASSURANCE_REQUIRED: "RELIABILITY_ASSURANCE_REQUIRED",
  AFFECTED_AREA_MATCH: "AFFECTED_AREA_MATCH",
  DEPENDENCY_CROSS_CUTTING: "DEPENDENCY_CROSS_CUTTING",
} as const;

const GATE_BY_EVIDENCE = new Map(
  GATE_REGISTRY.map((gate) => [normalizeSpecialistEvidenceToken(gate.evidence), gate.id]),
);

for (const gate of GATE_REGISTRY) {
  if (!GATE_REQUIREMENTS[gate.id]) {
    throw new Error(`specialist obligation contract missing gate: ${gate.id}`);
  }
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function normalizeSpecialistEvidenceToken(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function boundedObligationId(prefix: string, value: string): string {
  const normalized = normalizeSpecialistEvidenceToken(value);
  return normalized.length <= 80 && /^[a-z0-9][a-z0-9:_-]*$/.test(normalized)
    ? `${prefix}:${normalized}`
    : `${prefix}:${sha256Hex(normalized).slice(0, 16)}`;
}

function boundedEvidenceId(value: string): string {
  const normalized = normalizeSpecialistEvidenceToken(value);
  return normalized.length <= 160 ? normalized : `evidence:${sha256Hex(normalized).slice(0, 16)}`;
}

function obligation(input: {
  obligationId: string;
  kind: SpecialistObligationKind;
  domainId?: string | null;
  gateId?: string | null;
  evidenceId?: string | null;
  affectedArea?: string | null;
  specialistId?: string | null;
}): SpecialistObligation {
  return {
    obligationId: input.obligationId,
    kind: input.kind,
    domainId: input.domainId ?? null,
    gateId: input.gateId ?? null,
    evidenceId: input.evidenceId ?? null,
    affectedArea: input.affectedArea ?? null,
    specialistId: input.specialistId ?? null,
  };
}

function addObligation(
  map: Map<string, SpecialistObligation>,
  item: SpecialistObligation,
): void {
  if (!map.has(item.obligationId)) map.set(item.obligationId, item);
}

function hasAny(input: SpecialistRoutingInput, values: string[]): boolean {
  return values.some((value) => input.domains.includes(value) || input.riskSignals.includes(value) || input.gates.includes(value));
}

function requestedDomains(input: SpecialistRoutingInput): string[] {
  const excluded = new Set(["general", "architecture", "quality", "security", "performance", "reliability"]);
  return sortedUnique(input.domains).filter((domain) => !excluded.has(domain));
}

function addGateObligation(
  map: Map<string, SpecialistObligation>,
  gateId: string,
): void {
  const definition = gateDef(gateId);
  addObligation(
    map,
    obligation({
      obligationId: boundedObligationId("gate", gateId),
      kind: "gate",
      gateId,
      evidenceId: definition?.evidence ?? `gate:${gateId}`,
    }),
  );
}

export function deriveSpecialistObligations(
  input: SpecialistRoutingInput,
  profiles: SpecialistProfile[],
): SpecialistObligation[] {
  const obligations = new Map<string, SpecialistObligation>();

  for (const domain of requestedDomains(input)) {
    addObligation(
      obligations,
      obligation({
        obligationId: boundedObligationId("domain", domain),
        kind: "domain",
        domainId: domain,
      }),
    );
  }

  for (const gateId of sortedUnique(input.gates)) {
    addGateObligation(obligations, gateId);
  }

  for (const evidence of sortedUnique(input.requiredEvidence)) {
    const normalized = normalizeSpecialistEvidenceToken(evidence);
    const gateId = GATE_BY_EVIDENCE.get(normalized);
    if (gateId) {
      addGateObligation(obligations, gateId);
      continue;
    }
    addObligation(
      obligations,
      obligation({
        obligationId: boundedObligationId("evidence", normalized),
        kind: "evidence",
        evidenceId: boundedEvidenceId(normalized),
      }),
    );
  }

  addObligation(
    obligations,
    obligation({
      obligationId: "assurance:independent-reviewer",
      kind: "assurance",
      evidenceId: "independent review",
      specialistId: "independent-reviewer",
    }),
  );

  const securityRequired =
    input.riskLevel === "HIGH" ||
    input.riskLevel === "CRITICAL" ||
    hasAny(input, ["security", "authentication", "web3", "smart-contracts", "wallets", "security-review"]);
  if (securityRequired) {
    addObligation(
      obligations,
      obligation({
        obligationId: "assurance:security-reviewer",
        kind: "assurance",
        evidenceId: "security review",
        specialistId: "security-reviewer",
      }),
    );
  }

  if (hasAny(input, ["performance", "performance-hot-path", "performance-check"])) {
    addObligation(
      obligations,
      obligation({
        obligationId: "assurance:performance-reviewer",
        kind: "assurance",
        evidenceId: "performance evidence",
        specialistId: "performance-reviewer",
      }),
    );
  }

  if (
    hasAny(input, [
      "reliability",
      "database",
      "cloud-devops",
      "database-migration",
      "destructive",
      "infrastructure",
      "rollback-validation",
    ])
  ) {
    addObligation(
      obligations,
      obligation({
        obligationId: "assurance:reliability-reviewer",
        kind: "assurance",
        evidenceId: "reliability review",
        specialistId: "reliability-reviewer",
      }),
    );
  }

  const affectedAreaTokens = sortedUnique(input.affectedAreas).map(normalizeSpecialistEvidenceToken);
  for (const area of affectedAreaTokens) {
    if (
      profiles.some((profile) =>
        profile.activation.affectedAreaAny?.some(
          (candidate) => normalizeSpecialistEvidenceToken(candidate) === area,
        ),
      )
    ) {
      addObligation(
        obligations,
        obligation({
          obligationId: boundedObligationId("affected-area", area),
          kind: "affected-area",
          affectedArea: area,
        }),
      );
    }
  }

  if (input.dependencySignals?.crossCutting) {
    addObligation(
      obligations,
      obligation({
        obligationId: "dependency:cross-cutting",
        kind: "dependency",
      }),
    );
  }

  return [...obligations.values()].sort((a, b) => a.obligationId.localeCompare(b.obligationId));
}

function producedEvidence(profile: SpecialistProfile): Set<string> {
  return new Set(profile.producesEvidence.map(normalizeSpecialistEvidenceToken));
}

function gateEvidenceMatches(profile: SpecialistProfile, gateId: string, evidenceId: string | null): boolean {
  const requirement = GATE_REQUIREMENTS[gateId];
  if (!requirement || !evidenceId) return false;
  const values = new Set([evidenceId, ...requirement.aliases].map(normalizeSpecialistEvidenceToken));
  const declared = producedEvidence(profile);
  return [...values].some((value) => declared.has(value));
}

function hasRequiredFunction(profile: SpecialistProfile, functions: SpecialistFunction[]): boolean {
  return functions.some((item) => profile.functions.includes(item));
}

export function profileCoversSpecialistObligation(
  profile: SpecialistProfile,
  item: SpecialistObligation,
): boolean {
  if (item.kind === "domain") {
    return item.domainId !== null && profile.coveredDomains.includes(item.domainId as (typeof DOMAIN_IDS)[number]);
  }

  if (item.kind === "gate") {
    if (!item.gateId) return false;
    const definition = gateDef(item.gateId);
    const requirement = GATE_REQUIREMENTS[item.gateId];
    if (!definition || !requirement) return false;
    if (definition.reviewerRole && profile.specialistId !== definition.reviewerRole) return false;
    if (requirement.assurance && profile.independenceClass !== "assurance") return false;
    return hasRequiredFunction(profile, requirement.functions) && gateEvidenceMatches(profile, item.gateId, item.evidenceId);
  }

  if (item.kind === "evidence") {
    if (item.evidenceId === null) return false;
    const normalized = normalizeSpecialistEvidenceToken(item.evidenceId);
    const values = [normalized, ...(FREEFORM_EVIDENCE_ALIASES[normalized] ?? [])].map(
      normalizeSpecialistEvidenceToken,
    );
    return values.some((value) => producedEvidence(profile).has(value));
  }

  if (item.kind === "assurance") {
    return (
      item.specialistId !== null &&
      profile.specialistId === item.specialistId &&
      profile.independenceClass !== "implementation" &&
      (profile.functions.includes("independent-review") ||
        profile.functions.includes("security-assurance") ||
        profile.functions.includes("performance-assurance") ||
        profile.functions.includes("reliability-assurance"))
    );
  }

  if (item.kind === "affected-area") {
    return (
      item.affectedArea !== null &&
      Boolean(
        profile.activation.affectedAreaAny?.some(
          (area) => normalizeSpecialistEvidenceToken(area) === item.affectedArea,
        ),
      )
    );
  }

  return profile.functions.includes("architecture");
}

export function specialistObligationReasonCode(item: SpecialistObligation): string {
  if (item.kind === "domain") return OBLIGATION_REASON_CODES.DOMAIN_COVERAGE;
  if (item.kind === "gate") return OBLIGATION_REASON_CODES.GATE_REQUIRES_SPECIALIST;
  if (item.kind === "evidence") return OBLIGATION_REASON_CODES.REQUIRED_EVIDENCE_COVERAGE;
  if (item.kind === "affected-area") return OBLIGATION_REASON_CODES.AFFECTED_AREA_MATCH;
  if (item.kind === "dependency") return OBLIGATION_REASON_CODES.DEPENDENCY_CROSS_CUTTING;
  if (item.specialistId === "security-reviewer") return OBLIGATION_REASON_CODES.SECURITY_ASSURANCE_REQUIRED;
  if (item.specialistId === "performance-reviewer") return OBLIGATION_REASON_CODES.PERFORMANCE_ASSURANCE_REQUIRED;
  if (item.specialistId === "reliability-reviewer") return OBLIGATION_REASON_CODES.RELIABILITY_ASSURANCE_REQUIRED;
  return OBLIGATION_REASON_CODES.INDEPENDENT_REVIEW_REQUIRED;
}

export function specialistObligationContractDigest(): string {
  return sha256Hex(
    JSON.stringify(
      GATE_REGISTRY.map((gate) => ({
        id: gate.id,
        evidence: gate.evidence,
        contractKind: gate.contractKind,
        reviewerRole: gate.reviewerRole ?? null,
        requirement: GATE_REQUIREMENTS[gate.id],
      })),
    ),
  );
}

export const SPECIALIST_OBLIGATION_CONTRACT_DIGEST = specialistObligationContractDigest();
