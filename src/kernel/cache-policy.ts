import { isReviewGate } from "./gates.js";
import type { ReuseClass } from "./cache-types.js";

export const CACHE_POLICY_IDENTITY = "uads.cache-policy:0.6.0:gate-contract-strict";

const ELIGIBLE_GATES = new Set(["static", "unit-test", "contract-test", "build", "web3-unit"]);

export function reuseClassForGate(gateId: string): ReuseClass {
  if (isReviewGate(gateId)) {
    return "not-reusable";
  }
  if (gateId === "integration-test") {
    return "not-reusable";
  }
  if (ELIGIBLE_GATES.has(gateId)) {
    return "eligible";
  }
  return "not-reusable";
}

export function requiresEnvironmentIdentity(gateId: string): boolean {
  return gateId === "integration-test";
}

export function isCacheEligibleGate(gateId: string): boolean {
  return reuseClassForGate(gateId) === "eligible";
}

export function normalizeCommandIdentity(command: string | null | undefined): string | null {
  if (!command) {
    return null;
  }
  const normalized = command.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export function collectEnvironmentIdentity(gateId: string): string | null {
  if (!requiresEnvironmentIdentity(gateId)) {
    return `${process.platform}:${process.env.CI === "true" ? "ci" : "local"}`;
  }
  return null;
}

export const MANIFEST_BASIS_PATHS = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "tsconfig.build.json",
] as const;
