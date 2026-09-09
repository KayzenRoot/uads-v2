import { includesAny, unique } from "./ids.js";
import type { IntakeClassifier, NormalizedIntake } from "./types.js";
import { assertSchema } from "../lib/json-schema.js";

function emptyIntake(objective: string, classifier: IntakeClassifier): NormalizedIntake {
  return {
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective,
    constraints: [],
    requestedArtifacts: [],
    inScope: [],
    outOfScope: [],
    acceptanceCriteria: [],
    domainSignals: [],
    riskSignals: [],
    destructiveSignals: [],
    affectedAreas: [],
    uncertainties: [],
    approvedBoundaries: [],
    classifier,
  };
}

/**
 * Conservative CLI fallback. Host LLMs should supply structured intake instead.
 * This is not the authoritative semantic architecture.
 */
export function intakeFromRequest(request: string): NormalizedIntake {
  const objective = request.replace(/\s+/g, " ").trim();
  if (!objective) {
    throw new Error("request text is empty");
  }

  const intake = emptyIntake(objective, "fallback-text");
  const text = objective.toLowerCase();

  if (includesAny(text, ["button", "color", "css", "style", "stylesheet", "theme"])) {
    intake.domainSignals.push("frontend");
    intake.affectedAreas.push("ui");
  }
  if (includesAny(text, ["typo", "readme", "documentation", "docs", "wording", "spelling"])) {
    intake.domainSignals.push("documentation");
  }
  if (includesAny(text, ["auth", "authenticated", "oauth", "jwt", "rbac", "login", "permission"])) {
    intake.domainSignals.push("api", "security", "backend");
    intake.riskSignals.push("authentication");
    intake.affectedAreas.push("auth");
  }
  if (includesAny(text, ["billing", "payment", "invoice", "money", "payout"])) {
    intake.domainSignals.push("finance-economics", "saas");
    intake.riskSignals.push("payments");
  }
  if (includesAny(text, ["migration", "column", "schema", "postgres", "database", "sql"])) {
    intake.domainSignals.push("database", "reliability");
    intake.riskSignals.push("database-migration");
    intake.affectedAreas.push("database");
  }
  if (includesAny(text, ["remove a production", "drop table", "destructive", "delete production"])) {
    intake.destructiveSignals.push("destructive-data");
    intake.riskSignals.push("destructive");
  }
  if (includesAny(text, ["defi", "withdrawal", "smart contract", "vault", "web3", "solidity", "wallet"])) {
    intake.domainSignals.push("web3", "smart-contracts", "security", "finance-economics");
    intake.riskSignals.push("web3", "smart-contracts");
    intake.affectedAreas.push("contracts");
  }
  if (includesAny(text, ["tokenomics", "token economy"])) {
    intake.domainSignals.push("tokenomics", "finance-economics");
    intake.riskSignals.push("tokenomics");
  }
  if (includesAny(text, ["fee", "accrual", "rounding", "ledger", "financial"])) {
    intake.domainSignals.push("finance-economics", "backend");
    intake.riskSignals.push("financial-calculation");
  }
  if (includesAny(text, ["latency", "hot path", "performance", "p99"])) {
    intake.domainSignals.push("backend", "performance");
    intake.riskSignals.push("performance-hot-path");
  }
  if (includesAny(text, ["combat", "critical-hit", "damage scaling", "gameplay formula"])) {
    intake.domainSignals.push("game-systems", "mathematics-simulation");
    intake.riskSignals.push("simulation");
  }
  if (includesAny(text, ["deploy", "kubernetes", "infrastructure", "production config"])) {
    intake.domainSignals.push("cloud-devops");
    intake.riskSignals.push("infrastructure");
  }
  if (includesAny(text, ["api endpoint", "public api", "contract change"])) {
    intake.domainSignals.push("api");
    intake.riskSignals.push("public-api");
  }
  if (includesAny(text, ["dependency", "package update", "supply-chain", "upgrade npm"])) {
    intake.riskSignals.push("dependency", "supply-chain");
  }
  if (includesAny(text, ["cut a release", "prepare a release", "release checklist"])) {
    intake.domainSignals.push("release");
  }

  intake.domainSignals = unique(intake.domainSignals);
  intake.riskSignals = unique(intake.riskSignals);
  intake.destructiveSignals = unique(intake.destructiveSignals);
  intake.inScope = [objective];
  return normalizeIntake(intake);
}

export function normalizeIntake(input: unknown, schemaRoot?: string): NormalizedIntake {
  if (!input || typeof input !== "object") {
    throw new Error("intake must be an object");
  }
  const raw = input as Partial<NormalizedIntake> & { objective?: string; schema?: string; schemaVersion?: string };
  if (raw.schema && raw.schema !== "uads.intake") {
    throw new Error("intake.schema is invalid");
  }
  if (raw.schemaVersion && raw.schemaVersion !== "0.2.0") {
    throw new Error("intake.schemaVersion is invalid");
  }
  if (!raw.objective || typeof raw.objective !== "string") {
    throw new Error("intake.objective is required");
  }
  const intake: NormalizedIntake = {
    ...emptyIntake(raw.objective.trim(), raw.classifier === "fallback-text" ? "fallback-text" : "host-structured"),
    constraints: raw.constraints ?? [],
    requestedArtifacts: raw.requestedArtifacts ?? [],
    inScope: raw.inScope?.length ? raw.inScope : [raw.objective.trim()],
    outOfScope: raw.outOfScope ?? [],
    acceptanceCriteria: raw.acceptanceCriteria ?? [],
    domainSignals: unique(raw.domainSignals ?? []),
    riskSignals: unique(raw.riskSignals ?? []),
    destructiveSignals: unique(raw.destructiveSignals ?? []),
    affectedAreas: unique(raw.affectedAreas ?? []),
    uncertainties: raw.uncertainties ?? [],
    approvedBoundaries: raw.approvedBoundaries ?? [],
  };
  if ("reasoning" in (input as object) || "chainOfThought" in (input as object) || "hiddenReasoning" in (input as object)) {
    throw new Error("intake must not include chain-of-thought fields");
  }
  assertSchema("intake.schema.json", intake, schemaRoot);
  return intake;
}
