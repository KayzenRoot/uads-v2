import type { EvidenceKind } from "./execution-types.js";

export type GateContractKind = "command" | "artifact" | "invariant" | "review";

export type GateDef = {
  id: string;
  evidence: string;
  purpose: string;
  contractKind: GateContractKind;
  allowedEvidenceKinds: EvidenceKind[];
  requiresExitCodeZero: boolean;
  requiresOutputDigest: boolean;
  reviewerRole?: string;
};

function commandGate(id: string, evidence: string, purpose: string): GateDef {
  return {
    id,
    evidence,
    purpose,
    contractKind: "command",
    allowedEvidenceKinds: ["command"],
    requiresExitCodeZero: true,
    requiresOutputDigest: true,
  };
}

function invariantGate(id: string, evidence: string, purpose: string): GateDef {
  return {
    id,
    evidence,
    purpose,
    contractKind: "invariant",
    allowedEvidenceKinds: ["invariant", "file", "command"],
    requiresExitCodeZero: true,
    requiresOutputDigest: false,
  };
}

function reviewGate(id: string, evidence: string, purpose: string, reviewerRole: string): GateDef {
  return {
    id,
    evidence,
    purpose,
    contractKind: "review",
    allowedEvidenceKinds: ["review"],
    requiresExitCodeZero: false,
    requiresOutputDigest: false,
    reviewerRole,
  };
}

export const GATE_REGISTRY: GateDef[] = [
  commandGate("static", "gate:static", "static analysis"),
  commandGate("unit-test", "gate:unit-test", "focused unit/smoke tests"),
  commandGate("integration-test", "gate:integration-test", "integration coverage"),
  commandGate("contract-test", "gate:contract-test", "public contract assertions"),
  commandGate("build", "gate:build", "compile/build"),
  reviewGate("security-review", "gate:security-review", "independent security review", "security-reviewer"),
  commandGate("dependency-audit", "gate:dependency-audit", "dependency/supply-chain audit"),
  reviewGate("performance-check", "gate:performance-check", "hot-path regression check", "performance-reviewer"),
  invariantGate("architecture-conformance", "gate:architecture-conformance", "architecture conformance"),
  commandGate("database-migration", "gate:database-migration", "migration test"),
  commandGate("rollback-validation", "gate:rollback-validation", "rollback/integrity validation"),
  commandGate("web3-unit", "gate:web3-unit", "contract unit tests"),
  commandGate("web3-fuzz", "gate:web3-fuzz", "contract fuzzing"),
  invariantGate("web3-invariant", "gate:web3-invariant", "contract invariants"),
  invariantGate("financial-numerical-validation", "gate:financial-numerical-validation", "numerical validation"),
  invariantGate("simulation-invariant", "gate:simulation-invariant", "simulation invariants"),
  commandGate("release-check", "gate:release-check", "release readiness"),
];

export const MANDATORY_GATE_IDS = GATE_REGISTRY.map((gate) => gate.id);

export function gateEvidence(id: string): string {
  return GATE_REGISTRY.find((gate) => gate.id === id)?.evidence ?? `gate:${id}`;
}

export function gateDef(id: string): GateDef | undefined {
  return GATE_REGISTRY.find((gate) => gate.id === id);
}

export function assertUniqueGateIds(): void {
  if (new Set(MANDATORY_GATE_IDS).size !== MANDATORY_GATE_IDS.length) {
    throw new Error("gate registry contains duplicate IDs");
  }
}

export const REVIEW_GATE_ROLES: Record<string, string> = Object.fromEntries(
  GATE_REGISTRY.filter((gate) => gate.reviewerRole).map((gate) => [gate.id, gate.reviewerRole as string]),
);

export function isReviewGate(gateId: string): boolean {
  return Object.prototype.hasOwnProperty.call(REVIEW_GATE_ROLES, gateId);
}

export function isKnownGateId(gateId: string): boolean {
  return GATE_REGISTRY.some((gate) => gate.id === gateId);
}
