import { sha256Hex } from "../lib/hash.js";
import type { DomainId } from "./domains.js";
import type {
  SpecialistFunction,
  SpecialistIndependenceClass,
  SpecialistKind,
  SpecialistProfile,
  SpecialistSource,
} from "./specialist-types.js";

type BuiltinProfile = Omit<SpecialistProfile, "profileDigest">;

function profile(input: {
  specialistId: string;
  kind: SpecialistKind;
  purpose: string;
  coveredDomains: DomainId[];
  functions: SpecialistFunction[];
  mayImplement?: boolean;
  reviewOnly?: boolean;
  independenceClass: SpecialistIndependenceClass;
  activation?: BuiltinProfile["activation"];
  requiredInputs: string[];
  producesEvidence: string[];
  priority: number;
  notes: string;
}): BuiltinProfile {
  return {
    schema: "uads.specialist-profile",
    schemaVersion: "0.9.0",
    specialistId: input.specialistId,
    kind: input.kind,
    status: "enabled",
    purpose: input.purpose,
    coveredDomains: input.coveredDomains,
    functions: input.functions,
    mayImplement: input.mayImplement ?? false,
    reviewOnly: input.reviewOnly ?? true,
    independenceClass: input.independenceClass,
    activation: input.activation ?? {},
    requiredInputs: input.requiredInputs,
    producesEvidence: input.producesEvidence,
    incompatibleWith: [],
    priority: input.priority,
    source: "builtin" as SpecialistSource,
    notes: input.notes,
  };
}

export const BUILTIN_SPECIALIST_PROFILES: BuiltinProfile[] = [
  profile({ specialistId: "repo-inspector", kind: "core", purpose: "Inspect repository metadata and project identity", coveredDomains: ["general"], functions: ["inspect"], independenceClass: "support", requiredInputs: ["project identity"], producesEvidence: ["repository map"], priority: 10, notes: "Must not edit product files or execute discovered project code." }),
  profile({ specialistId: "requirements-engineer", kind: "core", purpose: "Normalize requirements and acceptance criteria", coveredDomains: ["requirements"], functions: ["requirements"], independenceClass: "support", requiredInputs: ["normalized intake"], producesEvidence: ["acceptance criteria"], priority: 20, notes: "Must not broaden scope beyond the accepted Work Order." }),
  profile({ specialistId: "software-architect", kind: "core", purpose: "Bound cross-cutting architecture decisions", coveredDomains: ["architecture"], functions: ["architecture"], independenceClass: "support", requiredInputs: ["intake and repository map"], producesEvidence: ["architecture bounds"], priority: 30, notes: "Must not approve its own implementation or invent external capabilities." }),
  profile({ specialistId: "implementation-planner", kind: "core", purpose: "Produce a bounded executable Work Order plan", coveredDomains: ["general"], functions: ["planning"], independenceClass: "support", requiredInputs: ["intake and routing evidence"], producesEvidence: ["Work Order plan"], priority: 40, notes: "Must not dispatch work outside the selected scope." }),
  profile({ specialistId: "implementation-agent", kind: "core", purpose: "Apply necessary in-scope product edits", coveredDomains: ["general"], functions: ["implementation"], mayImplement: true, reviewOnly: false, independenceClass: "implementation", requiredInputs: ["Work Order and execution packet"], producesEvidence: ["in-scope change"], priority: 50, notes: "Must not perform approval-gated actions or serve as the sole final reviewer." }),
  profile({ specialistId: "test-engineer", kind: "core", purpose: "Design and run focused verification", coveredDomains: ["quality"], functions: ["testing"], independenceClass: "support", requiredInputs: ["Work Order and selected gates"], producesEvidence: ["test evidence"], priority: 60, notes: "Must not self-approve implementation changes." }),
  profile({ specialistId: "independent-reviewer", kind: "core", purpose: "Independently review the implementation", coveredDomains: ["quality"], functions: ["independent-review"], independenceClass: "independent-review", requiredInputs: ["diff and gate evidence"], producesEvidence: ["independent review"], priority: 70, notes: "Must use an independent session and must not implement the reviewed change." }),
  profile({ specialistId: "security-reviewer", kind: "assurance", purpose: "Provide security assurance for sensitive changes", coveredDomains: ["security"], functions: ["security-assurance"], independenceClass: "assurance", activation: {}, requiredInputs: ["risk signals and relevant diff"], producesEvidence: ["security review"], priority: 80, notes: "Must not expose secrets or approve by implementing." }),
  profile({ specialistId: "performance-reviewer", kind: "assurance", purpose: "Provide performance assurance for hot paths", coveredDomains: ["performance"], functions: ["performance-assurance"], independenceClass: "assurance", activation: { domainAny: ["performance"], riskSignalsAny: ["performance-hot-path"] }, requiredInputs: ["hot-path scope and benchmarks"], producesEvidence: ["performance evidence"], priority: 90, notes: "Must not trade correctness or scope controls for a local benchmark result." }),
  profile({ specialistId: "reliability-reviewer", kind: "assurance", purpose: "Provide reliability and rollback assurance", coveredDomains: ["reliability"], functions: ["reliability-assurance"], independenceClass: "assurance", activation: { domainAny: ["reliability", "database", "cloud-devops"], riskSignalsAny: ["database-migration", "destructive", "infrastructure"] }, requiredInputs: ["dependency and rollback evidence"], producesEvidence: ["reliability review"], priority: 95, notes: "Must not approve irreversible operations without rollback evidence." }),
  profile({ specialistId: "checkpoint-manager", kind: "core", purpose: "Persist bounded resume and checkpoint state", coveredDomains: ["general"], functions: ["checkpoint"], independenceClass: "support", requiredInputs: ["Work Order and routing decision"], producesEvidence: ["atomic checkpoint"], priority: 100, notes: "Must persist only sanitized sidecar state outside the managed project." }),
  profile({ specialistId: "product-requirements-specialist", kind: "domain", purpose: "Translate product requirements into verifiable outcomes", coveredDomains: ["requirements"], functions: ["requirements"], independenceClass: "support", activation: { domainAny: ["requirements"] }, requiredInputs: ["objective and acceptance criteria"], producesEvidence: ["product requirement trace"], priority: 110, notes: "Must not alter technical scope without an explicit Work Order update." }),
  profile({ specialistId: "frontend-specialist", kind: "domain", purpose: "Handle frontend and interaction concerns", coveredDomains: ["frontend"], functions: ["frontend"], independenceClass: "support", activation: { domainAny: ["frontend"] }, requiredInputs: ["frontend scope and affected areas"], producesEvidence: ["frontend verification"], priority: 120, notes: "Must not introduce unrelated backend, Web3, or finance work." }),
  profile({ specialistId: "backend-api-specialist", kind: "domain", purpose: "Handle backend, API, and SaaS boundaries", coveredDomains: ["backend", "api", "saas"], functions: ["backend-api"], independenceClass: "support", activation: { domainAny: ["backend", "api", "saas"] }, requiredInputs: ["API or service contract"], producesEvidence: ["backend/API verification"], priority: 130, notes: "Must preserve authentication, contract, and data-boundary obligations." }),
  profile({ specialistId: "database-specialist", kind: "domain", purpose: "Handle database schema and migration safety", coveredDomains: ["database"], functions: ["database"], independenceClass: "support", activation: { domainAny: ["database"] }, requiredInputs: ["schema impact and migration plan"], producesEvidence: ["migration and rollback evidence"], priority: 140, notes: "Must not execute destructive production operations." }),
  profile({ specialistId: "mobile-client-specialist", kind: "domain", purpose: "Handle mobile client behavior and compatibility", coveredDomains: ["mobile"], functions: ["mobile"], independenceClass: "support", activation: { domainAny: ["mobile"] }, requiredInputs: ["mobile scope and supported clients"], producesEvidence: ["mobile compatibility evidence"], priority: 150, notes: "Must not assume desktop or server behavior is equivalent to mobile behavior." }),
  profile({ specialistId: "platform-cloud-specialist", kind: "domain", purpose: "Handle cloud, DevOps, and release platform concerns", coveredDomains: ["cloud-devops", "release"], functions: ["platform-cloud"], independenceClass: "support", activation: { domainAny: ["cloud-devops"] }, requiredInputs: ["platform scope and deployment constraints"], producesEvidence: ["platform readiness"], priority: 160, notes: "Must not deploy or change paid infrastructure without approval." }),
  profile({ specialistId: "reliability-specialist", kind: "domain", purpose: "Handle service reliability and operational resilience", coveredDomains: ["reliability"], functions: ["reliability-assurance"], independenceClass: "support", activation: { domainAny: ["reliability"] }, requiredInputs: ["failure modes and dependencies"], producesEvidence: ["reliability plan"], priority: 165, notes: "Must not replace independent assurance for high-risk changes." }),
  profile({ specialistId: "data-ai-specialist", kind: "domain", purpose: "Handle data and AI pipeline behavior", coveredDomains: ["data-ai"], functions: ["data-ai"], independenceClass: "support", activation: { domainAny: ["data-ai"] }, requiredInputs: ["data flow and quality obligations"], producesEvidence: ["data/AI validation"], priority: 170, notes: "Must not infer model or data-provider behavior without evidence." }),
  profile({ specialistId: "web3-contract-specialist", kind: "domain", purpose: "Handle Web3, smart contract, wallet, and token boundaries", coveredDomains: ["web3", "smart-contracts", "wallets", "tokenomics"], functions: ["web3-contract"], independenceClass: "support", activation: { domainAny: ["web3", "smart-contracts", "wallets", "tokenomics"] }, requiredInputs: ["contract scope and invariant obligations"], producesEvidence: ["contract unit, fuzz, and invariant evidence"], priority: 180, notes: "Must not execute on-chain transactions or move funds." }),
  profile({ specialistId: "finance-math-specialist", kind: "domain", purpose: "Handle finance, accounting, and numerical correctness", coveredDomains: ["finance-economics", "mathematics-simulation", "tokenomics"], functions: ["finance-math"], independenceClass: "support", activation: { domainAny: ["finance-economics", "mathematics-simulation", "tokenomics"] }, requiredInputs: ["financial rules and numerical examples"], producesEvidence: ["numerical and edge-case validation"], priority: 190, notes: "Must not hard-code vendor prices or authorize financial transfers." }),
  profile({ specialistId: "game-systems-specialist", kind: "domain", purpose: "Handle game systems and gameplay formulas", coveredDomains: ["game-systems"], functions: ["game-systems"], independenceClass: "support", activation: { domainAny: ["game-systems"] }, requiredInputs: ["gameplay rules and invariants"], producesEvidence: ["simulation evidence"], priority: 200, notes: "Must not create game-asset or UGAS integration work." }),
  profile({ specialistId: "documentation-dx-specialist", kind: "domain", purpose: "Handle documentation and developer experience", coveredDomains: ["documentation"], functions: ["documentation"], independenceClass: "support", activation: { domainAny: ["documentation"] }, requiredInputs: ["documentation scope"], producesEvidence: ["documentation verification"], priority: 210, notes: "Must not spawn unrelated technical stacks for a documentation-only change." }),
  profile({ specialistId: "release-specialist", kind: "domain", purpose: "Handle release readiness and provenance", coveredDomains: ["release"], functions: ["release"], independenceClass: "support", activation: { domainAny: ["release"], gatesAny: ["release-check"] }, requiredInputs: ["release contract and evidence index"], producesEvidence: ["release readiness evidence"], priority: 220, notes: "Must not publish packages or move historical tags without an authorized workflow." }),
  profile({ specialistId: "quality-specialist", kind: "domain", purpose: "Handle quality strategy and evidence obligations", coveredDomains: ["quality"], functions: ["quality"], independenceClass: "support", activation: { domainAny: ["quality"] }, requiredInputs: ["quality gates"], producesEvidence: ["quality evidence"], priority: 230, notes: "Must not replace independent review with a self-authored quality claim." }),
];

export const BUILTIN_SPECIALIST_CATALOG_DIGEST = sha256Hex(JSON.stringify(
  BUILTIN_SPECIALIST_PROFILES
    .slice()
    .sort((a, b) => a.specialistId.localeCompare(b.specialistId)),
));

export const BUILTIN_CORE_SPECIALIST_PROFILES = BUILTIN_SPECIALIST_PROFILES.filter((item) => item.kind === "core");
