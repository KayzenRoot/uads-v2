export const REPOSITORY_DESCRIPTION =
  "Autonomous software engineering orchestration with evidence-first quality gates and cost-aware execution.";

export const REPOSITORY_TOPICS = [
  "ai-agents",
  "autonomous-agents",
  "agent-orchestration",
  "software-engineering",
  "developer-tools",
  "agent-skills",
  "typescript",
  "cli",
  "code-quality",
  "software-security",
  "context-engineering",
] as const;

export type RepositoryLabel = {
  name: string;
  color: string;
  description: string;
};

export const REPOSITORY_LABELS: readonly RepositoryLabel[] = Object.freeze([
  { name: "type:bug", color: "d73a4a", description: "A defect or regression" },
  { name: "type:feature", color: "a2eeef", description: "A new capability" },
  { name: "type:breaking", color: "b60205", description: "A breaking change" },
  { name: "type:security", color: "b60205", description: "Security-related work" },
  { name: "type:docs", color: "0075ca", description: "Documentation" },
  { name: "type:performance", color: "5319e7", description: "Performance work" },
  { name: "type:maintenance", color: "e4e669", description: "Maintenance and tooling" },
  { name: "priority:critical", color: "b60205", description: "Immediate priority" },
  { name: "priority:high", color: "d93f0b", description: "High priority" },
  { name: "priority:medium", color: "fbca04", description: "Medium priority" },
  { name: "priority:low", color: "0e8a16", description: "Low priority" },
  { name: "status:blocked", color: "7057ff", description: "Blocked by a dependency or decision" },
  { name: "status:needs-review", color: "fbca04", description: "Needs maintainer review" },
  { name: "good first issue", color: "7057ff", description: "Approachable contributor task" },
  { name: "help wanted", color: "008672", description: "Extra contributor help welcome" },
  { name: "dependencies", color: "0366d6", description: "Dependency update" },
  { name: "area:orchestrator", color: "c5def5", description: "Orchestrator area" },
  { name: "area:execution", color: "c5def5", description: "Execution area" },
  { name: "area:context", color: "c5def5", description: "Context area" },
  { name: "area:cost", color: "c5def5", description: "Cost area" },
  { name: "area:security", color: "c5def5", description: "Security area" },
  { name: "area:release", color: "c5def5", description: "Release area" },
]);

export const MAIN_PROTECTION = {
  required_status_checks: {
    strict: true,
    contexts: ["Foundation checks"],
  },
  enforce_admins: false,
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
    required_approving_review_count: 1,
    require_last_push_approval: false,
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false,
  required_conversation_resolution: true,
} as const;

export function repositoryConfigSnapshot(): {
  description: string;
  topics: string[];
  labels: RepositoryLabel[];
  mainProtection: typeof MAIN_PROTECTION;
} {
  return {
    description: REPOSITORY_DESCRIPTION,
    topics: [...REPOSITORY_TOPICS],
    labels: REPOSITORY_LABELS.map((label) => ({ ...label })),
    mainProtection: JSON.parse(JSON.stringify(MAIN_PROTECTION)) as typeof MAIN_PROTECTION,
  };
}
