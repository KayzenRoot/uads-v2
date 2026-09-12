import fs from "node:fs";
import path from "node:path";
import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { sha256Hex } from "../lib/hash.js";
import { readGitSummary } from "../lib/git.js";
import { assertSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { type GefSourceCheck, type GefSourceSnapshot } from "./types.js";

const POLICY_FILES = ["AGENTS.md", "docs/v2/03-SCOPE.md", "docs/v2/04-ARCHITECTURE.md", "docs/v2/13-REVIEW-PROTOCOL.md"];

function policyDigest(repoRoot: string): string {
  const material = POLICY_FILES.map((relativePath) => {
    const target = path.join(repoRoot, relativePath);
    return `${relativePath}:${fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "MISSING"}`;
  }).join("\n");
  return sha256Hex(material);
}

export function captureGefSourceSnapshot(cwd: string): GefSourceSnapshot {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? path.resolve(cwd);
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  const snapshot: GefSourceSnapshot = {
    schema: "uads.gef-source-snapshot",
    schemaVersion: "0.1.0",
    projectId: fingerprint.projectId,
    fingerprint: fingerprint.fingerprint,
    branch: git.branch,
    headSha: git.head,
    policyDigest: policyDigest(repoRoot),
    capturedAt: new Date().toISOString(),
  };
  assertSchema("gef-source-snapshot.schema.json", snapshot, findPackageRoot());
  return snapshot;
}

export function checkGefSource(
  cwd: string,
  expected: Partial<Pick<GefSourceSnapshot, "branch" | "headSha" | "policyDigest" | "fingerprint">> = {},
): GefSourceCheck {
  const snapshot = captureGefSourceSnapshot(cwd);
  const reasons: string[] = [];
  if (expected.branch !== undefined && expected.branch !== snapshot.branch) reasons.push("BRANCH_CHANGED");
  if (expected.headSha !== undefined && expected.headSha !== snapshot.headSha) reasons.push("HEAD_CHANGED");
  if (expected.policyDigest !== undefined && expected.policyDigest !== snapshot.policyDigest) reasons.push("POLICY_CHANGED");
  if (expected.fingerprint !== undefined && expected.fingerprint !== snapshot.fingerprint) reasons.push("PROJECT_FINGERPRINT_CHANGED");
  return { status: reasons.length === 0 ? "MATCH" : "SOURCE_CONFLICT", reasons, snapshot };
}
