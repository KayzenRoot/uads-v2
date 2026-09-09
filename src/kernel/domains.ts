export const DOMAIN_IDS = [
  "general",
  "requirements",
  "architecture",
  "frontend",
  "backend",
  "api",
  "database",
  "saas",
  "mobile",
  "cloud-devops",
  "security",
  "quality",
  "performance",
  "reliability",
  "data-ai",
  "web3",
  "smart-contracts",
  "wallets",
  "finance-economics",
  "tokenomics",
  "mathematics-simulation",
  "game-systems",
  "documentation",
  "release",
] as const;

export type DomainId = (typeof DOMAIN_IDS)[number];

export const EXTERNAL_INTEGRATION_DOMAINS = ["ugas", "game-assets"] as const;
