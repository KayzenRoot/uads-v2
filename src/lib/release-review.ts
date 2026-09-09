import crypto from "node:crypto";
import { assertCiBinding } from "../release/ci-binding.js";
import { isCorrectedReleaseVersion } from "../github/security-proof.js";
import { validateDirectReviewEvidence } from "../github/direct-review.js";
import { validateGithubReviewIndex } from "../github/review-index.js";

export const CANONICAL_GITHUB_FILES = [
  "github/repository.json",
  "github/releases.json",
  "github/tags.json",
  "github/workflows.json",
  "github/main-protection.json",
  "github/security-summary.json",
  "github/labels.json",
  "github/release-vVERSION.json",
  "github/ci-final.json",
  "github/release-run-vVERSION.json",
] as const;

export const CANONICAL_RELEASE_FILES = [
  "release/release-manifest.json",
  "release/validation-report.json",
  "release/SHA256SUMS.txt",
  "release/uads-VERSION.spdx.json",
  "release/ci-binding.json",
  "release/verification-summary.json",
] as const;

export const DIRECT_REVIEW_RELEASE_FILES = [
  "github/github-direct-review-evidence.json",
  "github/direct-review-index.json",
  "release/github-direct-review-evidence.json",
  "release/github-direct-review-evidence-final.json",
  "release/github-direct-review-evidence-final.json.sha256",
  "release/github-review-index.json",
] as const;

type JsonMap = Map<string, string> | Record<string, string>;

function getFile(files: JsonMap, name: string): string | undefined {
  return files instanceof Map ? files.get(name) : files[name];
}

function parse(files: JsonMap, name: string, errors: string[]): any | null {
  const content = getFile(files, name);
  if (content === undefined) {
    errors.push("canonical-missing:" + name);
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    errors.push("canonical-invalid-json:" + name);
    return null;
  }
}

function stringAt(value: any, ...keys: string[]): string | null {
  let current = value;
  for (const key of keys) {
    current = current?.[key];
  }
  return typeof current === "string" ? current : null;
}

function sha(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

export function validateCanonicalReleaseEvidence(
  files: JsonMap,
  version: string,
  reviewHead?: string | null,
): string[] {
  const errors: string[] = [];
  const githubFiles = CANONICAL_GITHUB_FILES.map((name) =>
    name.replace("VERSION", version),
  );
  const releaseFiles = CANONICAL_RELEASE_FILES.map((name) =>
    name.replace("VERSION", version),
  );
  const releaseManifestNames = (files instanceof Map ? [...files.keys()] : Object.keys(files))
    .filter((name) => name.startsWith("release/release-manifest"));
  if (releaseManifestNames.length !== 1 || releaseManifestNames[0] !== "release/release-manifest.json") {
    errors.push("conflicting-release-manifests");
  }
  for (const name of [...githubFiles, ...releaseFiles]) {
    if (getFile(files, name) === undefined) {
      errors.push("canonical-missing:" + name);
    }
  }
  if (requiresDirectReview(version)) {
    for (const name of DIRECT_REVIEW_RELEASE_FILES) {
      if (getFile(files, name) === undefined) errors.push("canonical-missing:" + name);
    }
  }

  const repository = parse(files, "github/repository.json", errors);
  const ci = parse(files, "github/ci-final.json", errors);
  const release = parse(files, "github/release-v" + version + ".json", errors);
  const releaseRun = parse(files, "github/release-run-v" + version + ".json", errors);
  const releaseManifest = parse(files, "release/release-manifest.json", errors);
  const validation = parse(files, "release/validation-report.json", errors);
  const binding = parse(files, "release/ci-binding.json", errors);
  const verification = parse(files, "release/verification-summary.json", errors);
  const directReview = requiresDirectReview(version) ? parse(files, "github/github-direct-review-evidence.json", errors) : null;
  const releaseDirectReview = requiresDirectReview(version) ? parse(files, "release/github-direct-review-evidence.json", errors) : null;
  const finalDirectReview = requiresDirectReview(version) ? parse(files, "release/github-direct-review-evidence-final.json", errors) : null;
  const reviewIndex = requiresDirectReview(version) ? parse(files, "release/github-review-index.json", errors) : null;
  const projectPackageText = getFile(files, "project/package.json");
  const projectVersionText = getFile(files, "project/VERSION");

  let projectPackage: any = null;
  if (projectPackageText === undefined) {
    errors.push("canonical-missing:project/package.json");
  } else {
    try {
      projectPackage = JSON.parse(projectPackageText);
    } catch {
      errors.push("canonical-invalid-json:project/package.json");
    }
  }
  if (projectVersionText === undefined) {
    errors.push("canonical-missing:project/VERSION");
  }

  const expectedTag = "v" + version;
  const mainSha =
    stringAt(repository, "defaultBranchSha") ??
    stringAt(repository, "mainBranchSha") ??
    stringAt(ci, "mainBranchSha");
  const ciHead = stringAt(ci, "headSha") ?? stringAt(ci, "finalCommitSha");
  const tagTarget =
    stringAt(release, "targetCommitSha") ??
    stringAt(release, "targetCommitish") ??
    stringAt(release, "commit");
  const manifestCommit = stringAt(releaseManifest, "commit");
  const validationCommit = stringAt(validation, "commit");
  const bindingHead = stringAt(binding, "headSha");
  const verificationHead = stringAt(verification, "headSha");

  const identities: Array<[string, string | null]> = [
    ["review-head", reviewHead ?? null],
    ["main-branch-sha", mainSha],
    ["ci-head-sha", ciHead],
    ["tag-target-sha", tagTarget],
    ["release-manifest-commit", manifestCommit],
    ["validation-report-commit", validationCommit],
    ["ci-binding-head-sha", bindingHead],
    ["verification-head-sha", verificationHead],
    ...(requiresDirectReview(version) ? [
      ["direct-review-commit-sha", stringAt(directReview, "commitSha")],
      ["release-direct-review-commit-sha", stringAt(releaseDirectReview, "commitSha")],
      ["final-direct-review-commit-sha", stringAt(finalDirectReview, "commitSha")],
      ["review-index-commit-sha", stringAt(reviewIndex, "commitSha")],
    ] as Array<[string, string | null]> : []),
  ];
  for (const [label, value] of identities) {
    if (!sha(value)) {
      errors.push("identity-invalid:" + label);
    }
  }
  const identityValues = identities.map((item) => item[1]).filter((value): value is string => Boolean(value));
  if (identityValues.length > 0 && new Set(identityValues).size !== 1) {
    errors.push("identity-mismatch");
  }

  if (projectPackage?.version !== version) {
    errors.push("version-mismatch:project/package.json");
  }
  if (projectVersionText?.trim() !== version) {
    errors.push("version-mismatch:project/VERSION");
  }
  if (releaseManifest?.version !== version || releaseManifest?.tag !== expectedTag) {
    errors.push("release-manifest-version-mismatch");
  }
  if (validation?.version !== version) {
    errors.push("validation-version-mismatch");
  }
  if (release?.tag_name !== expectedTag || release?.draft !== false || release?.prerelease !== true) {
    errors.push("github-release-metadata-mismatch");
  }
  if (releaseManifest?.ciBinding !== "ci-binding.json" || validation?.ciBinding !== "ci-binding.json") {
    errors.push("ephemeral-ci-binding-reference");
  }
  const artifactNames = new Set(
    Array.isArray(releaseManifest?.artifacts)
      ? releaseManifest.artifacts.map((artifact: any) => artifact?.name)
      : [],
  );
  for (const requiredArtifact of [
    "uads-" + version + ".tgz",
    "uads-" + version + ".spdx.json",
    "validation-report.json",
    "ci-binding.json",
    ...(requiresDirectReview(version) ? ["github-direct-review-evidence.json", "github-review-index.json"] : []),
  ]) {
    if (!artifactNames.has(requiredArtifact)) {
      errors.push("release-artifact-missing:" + requiredArtifact);
    }
  }
  try {
    assertCiBinding(binding, bindingHead ?? undefined, repository?.full_name ?? repository?.repository ?? undefined);
  } catch {
    errors.push("ci-binding-invalid");
  }
  if (ci?.status !== "completed" || ci?.conclusion !== "success") {
    errors.push("ci-final-not-success");
  }
  if (releaseRun?.status !== "completed" || releaseRun?.conclusion !== "success") {
    errors.push("release-run-not-success");
  }
  if (requiresDirectReview(version)) {
    validateDirectReviewIdentity(files, directReview, releaseDirectReview, finalDirectReview, reviewIndex, binding, release, releaseRun, releaseManifest, validation, errors);
    if (!String(release?.body ?? "").includes("### Review Evidence")) errors.push("release-review-evidence-block-missing");
  }
  if (verification?.version !== version || verification?.tag !== expectedTag) {
    errors.push("verification-version-mismatch");
  }
  if (verification?.historicalTagPreservation?.unchanged !== true) {
    errors.push("historical-tag-preservation-failed");
  }
  if (typeof getFile(files, "release/SHA256SUMS.txt") === "string") {
    verifyChecksums(files, releaseManifest, errors);
  }
  return [...new Set(errors)];
}

function requiresDirectReview(version: string): boolean {
  const [major = NaN, minor = NaN] = version.split(".").map(Number);
  return Number.isFinite(major) && Number.isFinite(minor) && (major > 0 || minor >= 8);
}

function validateDirectReviewIdentity(files: JsonMap, direct: any, releaseDirect: any, final: any, reviewIndex: any, binding: any, release: any, releaseRun: any, manifest: any, validation: any, errors: string[]): void {
  for (const [label, item] of [["audit", direct], ["release", releaseDirect], ["final", final]] as const) {
    if (item?.finalVerdict !== "PASS") errors.push("direct-review-not-pass:" + label);
    if (item?.schema !== "uads.github-direct-review-evidence" || !["0.8.0", "0.9.0"].includes(item?.schemaVersion)) errors.push("direct-review-schema-mismatch:" + label);
    const directErrors = validateDirectReviewEvidence(item);
    if (directErrors.length > 0) errors.push("direct-review-contract-invalid:" + label);
  }
  try { validateGithubReviewIndex(reviewIndex); } catch { errors.push("github-review-index-invalid"); }
  if (direct?.provenance?.sourceRunId !== binding?.runId || releaseDirect?.provenance?.sourceRunId !== binding?.runId || final?.provenance?.sourceRunId !== binding?.runId) errors.push("direct-review-ci-binding-run-mismatch");
  if (binding?.runAttempt && (direct?.provenance?.sourceRunAttempt !== binding.runAttempt || releaseDirect?.provenance?.sourceRunAttempt !== binding.runAttempt || final?.provenance?.sourceRunAttempt !== binding.runAttempt)) errors.push("direct-review-ci-binding-attempt-mismatch");
  if (final?.release?.tag !== release?.tag_name || final?.release?.tagTargetSha !== release?.targetCommitSha || final?.release?.releaseRunId !== releaseRun?.id) errors.push("direct-review-release-identity-mismatch");
  if (final?.release?.version !== manifest?.version || releaseDirect?.version !== manifest?.version || final?.release?.ciBindingAsset !== "ci-binding.json") errors.push("direct-review-release-metadata-mismatch");
  if (final?.release?.directReviewArtifactName !== direct?.artifact?.name) errors.push("direct-review-artifact-name-mismatch");
  if (reviewIndex?.ciRunId !== direct?.provenance?.sourceRunId || reviewIndex?.ciRunAttempt !== direct?.provenance?.sourceRunAttempt || reviewIndex?.directReviewRunId !== direct?.workflow?.runId || reviewIndex?.directReviewArtifactName !== direct?.artifact?.name) errors.push("github-review-index-run-identity-mismatch");
  if (reviewIndex?.expectedTagTargetSha !== release?.targetCommitSha || reviewIndex?.tag !== release?.tag_name || reviewIndex?.releaseRunId !== releaseRun?.id) errors.push("github-review-index-release-identity-mismatch");
  const directText = getFile(files, "github/github-direct-review-evidence.json");
  if (!directText || reviewIndex?.directReviewEvidenceSha256 !== crypto.createHash("sha256").update(directText).digest("hex")) errors.push("github-review-index-evidence-digest-mismatch");
  if (final?.release?.assetNames && !final.release.assetNames.includes("github-direct-review-evidence-final.json")) errors.push("direct-review-final-asset-not-indexed");
  if (final?.release?.assetNames && !final.release.assetNames.includes("github-direct-review-evidence-final.json.sha256")) errors.push("direct-review-final-checksum-not-indexed");
  if (isCorrectedReleaseVersion(manifest?.version)) {
    for (const [key, proof] of [["codeql", final?.securityWorkflows?.codeql?.proof], ["scorecard", final?.securityWorkflows?.scorecard?.proof], ["dependencyReview", final?.securityWorkflows?.dependencyReview?.proof]]) {
      if (proof?.proofDigest !== reviewIndex?.securityProofs?.[key]?.proofDigest) errors.push("security-proof-index-mismatch:" + key);
    }
  } else if (final?.securityWorkflows?.codeql?.outcome !== "success") {
    errors.push("direct-review-codeql-not-success");
  }
  if (manifest?.version === "0.11.0") {
    for (const label of ["audit", "release", "final"] as const) {
      const item = label === "audit" ? direct : label === "release" ? releaseDirect : final;
      for (const platform of ["linux", "windows"] as const) {
        if (item?.compatibility?.[platform]?.outcome !== "success" || item?.compatibility?.[platform]?.commitSha !== item?.commitSha) errors.push("direct-review-compatibility-not-proven:" + label + ":" + platform);
      }
    }
  }
  if (validation?.commit !== releaseDirect?.commitSha) errors.push("direct-review-validation-commit-mismatch");
  if (direct?.evidenceContractDigest !== releaseDirect?.evidenceContractDigest) errors.push("direct-review-exact-derivative-mismatch");
  if (final?.provenance?.sourceRunSha !== direct?.commitSha || final?.provenance?.sourceRunId !== binding?.runId || final?.provenance?.sourceRunAttempt !== direct?.provenance?.sourceRunAttempt) errors.push("direct-review-source-provenance-mismatch");
  const finalText = getFile(files, "release/github-direct-review-evidence-final.json");
  const finalChecksum = getFile(files, "release/github-direct-review-evidence-final.json.sha256");
  if (!finalText || !finalChecksum || !new RegExp(`^[0-9a-f]{64}  github-direct-review-evidence-final\\.json\\s*$`, "i").test(finalChecksum) || !finalChecksum.toLowerCase().startsWith(crypto.createHash("sha256").update(finalText).digest("hex"))) {
    errors.push("direct-review-final-checksum-mismatch");
  }
}

function verifyChecksums(files: JsonMap, manifest: any, errors: string[]): void {
  const checksumText = getFile(files, "release/SHA256SUMS.txt");
  if (checksumText === undefined || !Array.isArray(manifest?.artifacts)) {
    errors.push("checksum-manifest-missing");
    return;
  }
  const entries = new Map<string, string>();
  for (const line of checksumText.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/i);
    if (match?.[1] && match[2]) entries.set(match[2], match[1].toLowerCase());
  }
  for (const artifact of manifest.artifacts) {
    if (entries.get(artifact.name) !== artifact.sha256) {
      errors.push("checksum-mismatch:" + artifact.name);
    }
    const content = getFile(files, "release/" + artifact.name);
    if (content !== undefined && crypto.createHash("sha256").update(content).digest("hex") !== artifact.sha256) {
      errors.push("checksum-content-mismatch:" + artifact.name);
    }
  }
}
