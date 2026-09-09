import type { CapabilityClass, ContextRadius, NormalizedIntake, RepositoryMap, RiskLevel, ScopeClass } from "./types.js";
import { DOMAIN_IDS } from "./domains.js";
import { includesAny, unique } from "./ids.js";

export type ScopeDecision = {
  scopeClass: ScopeClass;
  reasons: string[];
  included: string[];
  outOfScope: string[];
  recommendations: string[];
};

export function classifyScopeSize(intake: NormalizedIntake): ScopeDecision {
  const text = `${intake.objective} ${intake.domainSignals.join(" ")} ${intake.riskSignals.join(" ")}`.toLowerCase();
  const reasons: string[] = [];
  let scopeClass: ScopeClass = "local";

  if (
    includesAny(text, ["typo", "wording", "spelling", "readme"]) ||
    (intake.domainSignals.length === 1 && intake.domainSignals[0] === "documentation")
  ) {
    scopeClass = "trivial";
    reasons.push("documentation/wording change");
  } else if (
    includesAny(text, ["button color", "primary button", "css", "stylesheet"]) &&
    !intake.riskSignals.length
  ) {
    scopeClass = "trivial";
    reasons.push("isolated presentation change");
  } else if (
    includesAny(text, ["architecture", "auth architecture", "storage model", "change the public contract", "public api contract"])
  ) {
    scopeClass = "architectural";
    reasons.push("public contract or core architecture is in play");
  } else if (
    intake.domainSignals.includes("database") ||
    intake.riskSignals.includes("database-migration") ||
    (intake.domainSignals.includes("api") && intake.domainSignals.includes("security")) ||
    intake.domainSignals.includes("smart-contracts")
  ) {
    scopeClass = "cross-cutting";
    reasons.push("change spans more than one module or contract surface");
  } else if (intake.affectedAreas.length <= 1 && intake.domainSignals.length <= 2) {
    scopeClass = "local";
    reasons.push("isolated module or component");
  }

  const included = intake.inScope.length > 0 ? intake.inScope : [intake.objective];
  const outOfScope = unique([
    ...intake.outOfScope,
    "unrelated architecture refactors",
    "unrelated Web3/tokenomics work",
    "unrelated marketplace or dashboard features",
  ]);
  const recommendations: string[] = [];
  if (scopeClass !== "trivial") {
    recommendations.push("Record focused tests as IMPORTANT if not already requested");
  }

  return { scopeClass, reasons, included, outOfScope, recommendations };
}

function sensitiveUncertainty(intake: NormalizedIntake): boolean {
  if (intake.uncertainties.length === 0) {
    return false;
  }
  const sensitive = new Set([
    "security",
    "authentication",
    "web3",
    "smart-contracts",
    "finance-economics",
    "payments",
    "tokenomics",
    "database",
    "destructive",
    "destructive-data",
  ]);
  const connected = [
    ...intake.domainSignals,
    ...intake.riskSignals,
    ...intake.destructiveSignals,
    ...intake.affectedAreas.map((area) => area.toLowerCase()),
  ];
  return connected.some((item) => sensitive.has(item) || item.includes("auth") || item.includes("contract"));
}

export function classifyRisk(intake: NormalizedIntake, map: RepositoryMap): { level: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const signals = new Set([...intake.riskSignals, ...intake.destructiveSignals, ...intake.domainSignals]);
  const text = intake.objective.toLowerCase();
  const taskTouchesContracts = signals.has("web3") || signals.has("smart-contracts") || includesAny(text, ["defi", "withdrawal path"]);
  const taskTouchesMigrations =
    signals.has("database-migration") || signals.has("database") || includesAny(text, ["remove a production column"]);

  if (taskTouchesContracts) {
    reasons.push("funds/smart-contract path");
    if (map.signals.web3) {
      reasons.push("repository map corroborates smart-contract surface");
    }
    return { level: "CRITICAL", reasons };
  }
  if (signals.has("destructive") || signals.has("destructive-data") || includesAny(text, ["remove a production column"])) {
    reasons.push("destructive data or production mutation");
    if (map.signals.migrations || map.signals.database) {
      reasons.push("repository map corroborates database/migration presence");
    }
    return { level: "CRITICAL", reasons };
  }
  if (signals.has("financial-calculation") || signals.has("tokenomics") || signals.has("payments")) {
    reasons.push("financial/economic correctness");
    if (signals.has("authentication")) {
      reasons.push("authenticated access to financial data");
    }
    return { level: "HIGH", reasons };
  }
  if (signals.has("database-migration")) {
    reasons.push("schema/data migration");
    if (map.signals.migrations || map.signals.database) {
      reasons.push("repository map corroborates migration/database presence");
    }
    return { level: "HIGH", reasons };
  }
  if (signals.has("authentication") || signals.has("public-api") || signals.has("infrastructure")) {
    reasons.push("auth, public contract, or infrastructure signal");
    return { level: "MEDIUM", reasons };
  }
  if (signals.has("performance-hot-path")) {
    reasons.push("latency-sensitive path");
    return { level: "MEDIUM", reasons };
  }
  if (sensitiveUncertainty(intake)) {
    reasons.push("material uncertainty in a sensitive affected area");
    return { level: "MEDIUM", reasons };
  }
  if (taskTouchesMigrations && (map.signals.migrations || map.signals.database) && signals.has("database")) {
    reasons.push("repository map corroborates migration/database presence");
    return { level: "HIGH", reasons };
  }
  reasons.push("no high-risk structured signals in intake");
  return { level: "LOW", reasons };
}

export function selectDomains(intake: NormalizedIntake): Array<{ id: string; reason: string }> {
  const selected: Array<{ id: string; reason: string }> = [];
  const add = (id: string, reason: string): void => {
    if (!selected.some((item) => item.id === id)) {
      selected.push({ id, reason });
    }
  };

  for (const signal of intake.domainSignals) {
    const known = (DOMAIN_IDS as readonly string[]).includes(signal);
    add(signal, known ? `intake domain signal: ${signal}` : `unlisted domain signal: ${signal}`);
  }
  if (selected.length === 0) {
    add("general", "no stronger domain signal; default general");
  }
  if (intake.domainSignals.includes("documentation") && selected.length === 1) {
    add("documentation", "documentation-only request");
  }
  return selected;
}

export function selectContextRadius(scopeClass: ScopeClass, risk: RiskLevel): { radius: ContextRadius; reason: string } {
  if (risk === "CRITICAL" || scopeClass === "architectural") {
    return { radius: "C4", reason: "architectural/critical: connected subsystems, not repository-wide" };
  }
  if (risk === "HIGH" || scopeClass === "cross-cutting") {
    return { radius: "C3", reason: "cross-cutting or high risk: dependency neighborhood" };
  }
  if (scopeClass === "local") {
    return { radius: "C2", reason: "local module plus focused tests" };
  }
  if (scopeClass === "trivial") {
    return { radius: "C1", reason: "trivial change: named/affected files only" };
  }
  return { radius: "C2", reason: "default smallest sufficient module radius" };
}

export function selectCapabilityClass(risk: RiskLevel, scopeClass: ScopeClass): CapabilityClass {
  if (risk === "CRITICAL") return "critical";
  if (risk === "HIGH" || scopeClass === "architectural") return "strong";
  if (risk === "MEDIUM" || scopeClass === "cross-cutting") return "balanced";
  return "economy";
}

export const TOKEN_BUDGETS: Record<CapabilityClass, { softLimit: number; hardLimit: number }> = {
  economy: { softLimit: 8_000, hardLimit: 16_000 },
  balanced: { softLimit: 24_000, hardLimit: 48_000 },
  strong: { softLimit: 48_000, hardLimit: 96_000 },
  critical: { softLimit: 64_000, hardLimit: 128_000 },
};
