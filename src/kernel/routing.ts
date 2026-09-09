import type { ActiveApprovalGatedAction, NormalizedIntake, RiskLevel, ScopeClass } from "./types.js";
import { IMPLEMENTER_ROLE, INDEPENDENT_REVIEWER_ROLE } from "./types.js";
import { unique } from "./ids.js";
import { GATE_REGISTRY } from "./gates.js";

export type SpecialistDef = {
  id: string;
  purpose: string;
  activation: string;
  domains: string[];
  mayImplement: boolean;
  reviewOnly: boolean;
  expectedInput: string;
  expectedOutput: string;
  incompatibleWith?: string[];
};

export const SPECIALISTS: SpecialistDef[] = [
  {
    id: "repo-inspector",
    purpose: "Inspect repository metadata",
    activation: "every plan",
    domains: ["general"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "repo root + sidecar cache key",
    expectedOutput: "compact repository map",
  },
  {
    id: "requirements-engineer",
    purpose: "Normalize acceptance criteria",
    activation: "non-trivial scope",
    domains: ["requirements"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "normalized intake",
    expectedOutput: "acceptance criteria and constraints",
  },
  {
    id: "software-architect",
    purpose: "Bound architecture decisions",
    activation: "cross-cutting or architectural scope",
    domains: ["architecture"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "intake + repository map",
    expectedOutput: "architecture bounds",
  },
  {
    id: "implementation-planner",
    purpose: "Produce an executable plan",
    activation: "every plan",
    domains: ["general"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "intake + routing inputs",
    expectedOutput: "Work Order draft inputs",
  },
  {
    id: "implementation-agent",
    purpose: "Apply in-scope product edits",
    activation: "planned implementation",
    domains: ["general"],
    mayImplement: true,
    reviewOnly: false,
    expectedInput: "Work Order",
    expectedOutput: "in-scope edits",
    incompatibleWith: ["independent-reviewer"],
  },
  {
    id: "test-engineer",
    purpose: "Design and run focused tests",
    activation: "non-docs non-style plans",
    domains: ["quality"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "Work Order + gates",
    expectedOutput: "focused tests/evidence",
  },
  {
    id: "independent-reviewer",
    purpose: "Independently review implementation",
    activation: "any plan that includes implementation-agent",
    domains: ["quality"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "diff + gates",
    expectedOutput: "independent review evidence",
    incompatibleWith: ["implementation-agent"],
  },
  {
    id: "security-reviewer",
    purpose: "Security assurance",
    activation: "HIGH/CRITICAL or authentication signals",
    domains: ["security"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "auth/API/Web3 plan",
    expectedOutput: "security review evidence",
  },
  {
    id: "performance-reviewer",
    purpose: "Performance assurance",
    activation: "performance-hot-path or performance domain",
    domains: ["performance"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "hot-path plan",
    expectedOutput: "performance check evidence",
  },
  {
    id: "reliability-reviewer",
    purpose: "Reliability and rollback assurance",
    activation: "database, destructive, infrastructure, or reliability signals",
    domains: ["reliability"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "dependencies + rollback evidence",
    expectedOutput: "reliability review evidence",
  },
  {
    id: "checkpoint-manager",
    purpose: "Persist resume state",
    activation: "every plan",
    domains: ["general"],
    mayImplement: false,
    reviewOnly: true,
    expectedInput: "Work Order + routing decision",
    expectedOutput: "atomic sidecar checkpoint",
  },
];

export function selectSpecialists(input: {
  intake: NormalizedIntake;
  domains: string[];
  scopeClass: ScopeClass;
  risk: RiskLevel;
}): { specialists: string[]; assurance: string[] } {
  const specialists: string[] = ["repo-inspector", "implementation-planner", "checkpoint-manager"];
  const assurance: string[] = [];
  const docsOnly = input.domains.length > 0 && input.domains.every((id) => id === "documentation" || id === "general");
  const styleOnly =
    input.scopeClass === "trivial" &&
    input.risk === "LOW" &&
    input.domains.includes("frontend") &&
    !input.intake.riskSignals.length;

  if (input.scopeClass !== "trivial") {
    specialists.push("requirements-engineer");
  }
  if (input.scopeClass === "architectural" || input.scopeClass === "cross-cutting") {
    specialists.push("software-architect");
  }
  specialists.push("implementation-agent");
  if (!docsOnly && !styleOnly) {
    specialists.push("test-engineer");
  }
  assurance.push(INDEPENDENT_REVIEWER_ROLE);
  if (input.risk === "HIGH" || input.risk === "CRITICAL" || input.intake.riskSignals.includes("authentication")) {
    assurance.push("security-reviewer");
  }
  if (input.intake.riskSignals.includes("performance-hot-path") || input.domains.includes("performance")) {
    assurance.push("performance-reviewer");
  }

  const uniqueSpecialists = unique(specialists);
  const uniqueAssurance = unique(assurance);
  if (uniqueSpecialists.includes(IMPLEMENTER_ROLE) && uniqueAssurance.length === 0) {
    uniqueAssurance.push(INDEPENDENT_REVIEWER_ROLE);
  }
  return { specialists: uniqueSpecialists, assurance: uniqueAssurance };
}

export function assertIndependentReview(specialists: string[], assurance: string[]): void {
  if (specialists.includes(IMPLEMENTER_ROLE)) {
    const reviewers = unique([...assurance, ...specialists.filter((id) => id !== IMPLEMENTER_ROLE && id.endsWith("reviewer"))]);
    if (!reviewers.includes(INDEPENDENT_REVIEWER_ROLE) && !reviewers.includes("security-reviewer")) {
      throw new Error("implementer cannot be the sole final reviewer");
    }
  }
}

export function selectGates(input: {
  domains: string[];
  risk: RiskLevel;
  scopeClass: ScopeClass;
  intake: NormalizedIntake;
}): Array<{ id: string; reason: string }> {
  const gates: Array<{ id: string; reason: string }> = [];
  const add = (id: string, reason: string): void => {
    if (!gates.some((gate) => gate.id === id)) {
      gates.push({ id, reason });
    }
  };

  add("static", "static analysis for every planned change");
  if (input.scopeClass !== "trivial" || input.domains.includes("frontend")) {
    add("unit-test", "focused tests or smoke for the requested change");
  }
  if (input.intake.domainSignals.includes("frontend") && input.scopeClass === "trivial") {
    add("build", "build if the project convention compiles UI assets");
    return gates;
  }
  if (input.domains.includes("documentation") && input.scopeClass === "trivial") {
    return gates;
  }
  if (
    input.intake.riskSignals.includes("dependency") ||
    input.intake.riskSignals.includes("supply-chain") ||
    input.intake.domainSignals.includes("release") && input.intake.riskSignals.includes("dependency")
  ) {
    add("dependency-audit", GATE_REGISTRY.find((gate) => gate.id === "dependency-audit")?.purpose ?? "dependency/supply-chain audit");
  }
  if (input.scopeClass === "architectural") {
    add("architecture-conformance", "architectural scope requires conformance evidence");
  }
  if (input.domains.includes("release") || input.intake.domainSignals.includes("release")) {
    add("release-check", "release-domain work requires release readiness evidence");
  }
  if (input.domains.includes("api") || input.intake.riskSignals.includes("authentication")) {
    add("integration-test", "authenticated/API path needs integration coverage");
    add("contract-test", "public API/contract assertions when applicable");
    add("security-review", "auth/API change requires security review");
    add("build", "compile the service");
  }
  if (input.intake.riskSignals.includes("database-migration") || input.domains.includes("database")) {
    add("database-migration", "migration test for schema change");
    add("rollback-validation", "rollback/integrity validation");
  }
  if (input.domains.includes("web3") || input.domains.includes("smart-contracts")) {
    add("web3-unit", "contract unit tests");
    add("web3-fuzz", "fuzz public contract paths");
    add("web3-invariant", "invariant checks for vault/fund accounting");
    add("security-review", "independent security review");
  }
  if (input.intake.riskSignals.includes("financial-calculation") || input.domains.includes("finance-economics")) {
    add("financial-numerical-validation", "numerical/edge-case validation");
  }
  if (input.domains.includes("mathematics-simulation") || input.domains.includes("game-systems")) {
    add("simulation-invariant", "simulation/invariant validation");
  }
  if (input.intake.riskSignals.includes("performance-hot-path") || input.domains.includes("performance")) {
    add("performance-check", "hot-path regression check");
  }
  if (input.risk === "HIGH" || input.risk === "CRITICAL") {
    add("security-review", "high/critical plans require security assurance");
  }
  return gates;
}

export const ACTIVE_APPROVAL_GATED_ACTIONS: readonly ActiveApprovalGatedAction[] = [
  "production deployment",
  "destructive production database operation",
  "spending money / material-cost external infrastructure action",
  "rotating real credentials",
  "destructive Git history rewrite",
  "publishing package/release when not already authorized",
  "transferring assets/funds",
  "on-chain transaction execution",
];

function normalizedApprovalText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function approvalCorpus(input: NormalizedIntake): string {
  return [
    input.objective,
    ...input.constraints,
    ...input.inScope,
    ...input.requestedArtifacts,
    ...input.acceptanceCriteria,
    ...input.domainSignals,
    ...input.riskSignals,
    ...input.destructiveSignals,
  ]
    .map(normalizedApprovalText)
    .filter(Boolean)
    .join(" ");
}

function hasApprovalTerm(corpus: string, terms: string[]): boolean {
  return terms.some((term) => {
    const normalized = normalizedApprovalText(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^| )${normalized}(?: |$)`).test(corpus);
  });
}

/**
 * Classifies only explicit, schema-closed approval intent in the current
 * requested work. The global policy catalog remains in requiresApproval;
 * this result is the current-handoff enforcement projection.
 */
export function classifyActiveApprovalGatedActions(input: NormalizedIntake): ActiveApprovalGatedAction[] {
  const corpus = approvalCorpus(input);
  const production = hasApprovalTerm(corpus, ["production", "prod"]);
  const databaseContext = hasApprovalTerm(corpus, ["database", "db", "postgres", "sql", "schema", "table", "migration"]);
  const web3Context = hasApprovalTerm(corpus, ["web3", "blockchain", "on chain", "onchain", "smart contract", "wallet", "solidity"]);
  const infrastructureContext = hasApprovalTerm(corpus, [
    "infrastructure",
    "external infrastructure",
    "cloud",
    "kubernetes",
    "terraform",
    "aws",
    "gcp",
    "azure",
  ]);
  const destructiveIntent = hasApprovalTerm(corpus, [
    "destructive",
    "drop",
    "truncate",
    "delete",
    "destroy",
    "wipe",
    "reset hard",
  ]);
  const deploymentIntent = hasApprovalTerm(corpus, [
    "deploy",
    "deployment",
    "rollout",
    "roll out",
    "promote",
    "promoting",
    "promotion",
  ]);
  const transferIntent = hasApprovalTerm(corpus, [
    "transfer",
    "transferring",
    "send",
    "withdraw",
    "withdrawal",
    "payout",
    "deposit",
    "bridge",
    "swap",
  ]);
  const assetOrFundContext = hasApprovalTerm(corpus, ["asset", "assets", "fund", "funds", "money", "token", "tokens"]);
  const onChainIntent = hasApprovalTerm(corpus, [
    "transaction",
    "execute",
    "submit",
    "sign",
    "broadcast",
    "mint",
    "burn",
    "transfer",
    "withdraw",
    "send",
    "swap",
    "deploy contract",
  ]);
  const credentialContext = hasApprovalTerm(corpus, [
    "credential",
    "credentials",
    "secret",
    "secrets",
    "api key",
    "api keys",
    "access key",
    "real credentials",
  ]);
  const gitContext = hasApprovalTerm(corpus, ["git", "git history", "force push", "rebase", "reset hard"]);
  const historyRewriteIntent = hasApprovalTerm(corpus, [
    "rewrite history",
    "history rewrite",
    "rewrite git history",
    "force push",
    "rebase",
    "reset hard",
    "filter branch",
  ]);
  const packageOrReleaseContext = hasApprovalTerm(corpus, ["package", "packages", "npm", "release", "releases", "registry"]);
  const releasePublicationIntent =
    hasApprovalTerm(corpus, ["publish", "publishing", "publication", "cut a release", "cut release"]) &&
    packageOrReleaseContext;
  const materialCostIntent = hasApprovalTerm(corpus, [
    "spend",
    "spending",
    "money",
    "cost",
    "costs",
    "paid",
    "billing",
    "budget",
    "material cost",
    "availability impact",
    "purchase",
  ]);

  const active = new Set<ActiveApprovalGatedAction>();
  if (production && deploymentIntent) active.add("production deployment");
  if (production && databaseContext && destructiveIntent) active.add("destructive production database operation");
  if (infrastructureContext && materialCostIntent) {
    active.add("spending money / material-cost external infrastructure action");
  }
  if (credentialContext && hasApprovalTerm(corpus, ["rotate", "rotation", "rotating", "regenerate"])) {
    active.add("rotating real credentials");
  }
  if (gitContext && historyRewriteIntent) active.add("destructive Git history rewrite");
  if (releasePublicationIntent) {
    active.add("publishing package/release when not already authorized");
  }
  if (transferIntent && assetOrFundContext) active.add("transferring assets/funds");
  if (web3Context && onChainIntent) active.add("on-chain transaction execution");

  return ACTIVE_APPROVAL_GATED_ACTIONS.filter((action) => active.has(action));
}

/**
 * Detects a sensitive request whose available canonical signals do not prove
 * one of the fixed approval classes. Such a task is blocked per-task rather
 * than making the global policy catalog block every normal handoff.
 */
export function isActiveApprovalIntentAmbiguous(input: NormalizedIntake): boolean {
  if (classifyActiveApprovalGatedActions(input).length > 0) return false;
  const corpus = approvalCorpus(input);
  const releasePublicationIntent =
    hasApprovalTerm(corpus, ["publish", "publishing", "publication", "cut a release", "cut release"]) &&
    hasApprovalTerm(corpus, ["package", "packages", "npm", "release", "releases", "registry"]);
  const sensitiveContext = hasApprovalTerm(corpus, [
    "production", "prod", "database", "db", "postgres", "sql", "schema", "table", "migration",
    "web3", "blockchain", "on chain", "onchain", "smart contract", "wallet", "solidity",
    "infrastructure", "external infrastructure", "cloud", "kubernetes", "terraform", "aws", "gcp", "azure",
    "credential", "credentials", "secret", "secrets", "api key", "access key",
    "git", "git history", "force push", "rebase",
    "package", "packages", "npm", "release", "releases", "registry",
    "asset", "assets", "fund", "funds", "money", "token", "tokens",
  ]);
  if (!sensitiveContext) return false;
  return hasApprovalTerm(corpus, [
    "change", "modify", "update", "alter", "operate", "execute", "run", "apply", "migrate",
    "remove", "delete", "drop", "deploy", "provision", "rotate", "rotation", "regenerate",
    "publish", "publishing", "publication", "transfer", "send", "spend", "spending",
    "rewrite", "reset", "sign", "broadcast", "create", "destroy", "wipe", "truncate",
    "cut release", "rollout", "promote", "promoting", "promotion", "swap", "withdraw", "payout", "deposit", "bridge", "purchase", "billing",
  ]);
}

export function autonomyBoundary(intake: NormalizedIntake): {
  safeAutonomous: string[];
  requiresApproval: string[];
  activeApprovalGatedActions: ActiveApprovalGatedAction[];
  activeApprovalIntentAmbiguous: boolean;
} {
  const requiresApproval: string[] = [];
  if (intake.destructiveSignals.length > 0 || intake.riskSignals.includes("destructive")) {
    requiresApproval.push("destructive production database operation");
  }
  if (intake.domainSignals.includes("web3") || intake.riskSignals.includes("web3")) {
    requiresApproval.push("transferring assets/funds");
    requiresApproval.push("on-chain transaction execution");
  }
  if (intake.riskSignals.includes("infrastructure")) {
    requiresApproval.push("production deployment");
    requiresApproval.push("changing external infrastructure with material cost/availability impact");
  }
  return {
    safeAutonomous: [
      "repository reads",
      "local code edits",
      "local tests",
      "lint/typecheck/build",
      "review-bundle generation",
      "non-destructive Git inspection",
      "normal commits/pushes in an authorized workflow",
    ],
    requiresApproval: unique([
      ...requiresApproval,
      "production deployment",
      "spending money",
      "rotating real credentials",
      "destructive Git history rewrite",
      "publishing packages/releases when not already authorized",
    ]),
    activeApprovalGatedActions: classifyActiveApprovalGatedActions(intake),
    activeApprovalIntentAmbiguous: isActiveApprovalIntentAmbiguous(intake),
  };
}
