import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { EVIDENCE_FILE_NAMES } from "./evidence.js";
import { isUnsafeZipEntryName } from "./exclusions.js";
import { findPackageRoot } from "./version.js";
import { readZip } from "./zip-read.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "./secrets.js";
import { validateCanonicalReleaseEvidence } from "./release-review.js";

type ReviewManifest = {
  schema?: string;
  schemaVersion?: string;
  uadsVersion?: string;
  repoRoot?: unknown;
  workspace?: unknown;
  includedFiles?: string[];
  evidenceIncluded?: string[];
  reviewEvidenceIncluded?: string[];
  git?: {
    branch?: string | null;
    head?: string | null;
    hasCommits?: boolean;
  };
};

export const REQUIRED_REVIEW_ENTRIES = [
  "review-manifest.json",
  "repository-tree.txt",
  "git-status.txt",
  "git-diff.txt",
  "git-log.txt",
  "version.txt",
  "README.txt",
  ...EVIDENCE_FILE_NAMES.map((name) => `evidence/${name}`),
] as const;

const EXCLUDED_ENTRY_MARKERS = [
  "node_modules/",
  ".git/",
  "memory-bank/",
  "/dist/",
  "coverage/",
  ".uads/",
];

export type InspectionResult = {
  ok: boolean;
  errors: string[];
};

export type InspectOptions = {
  forbiddenSubstrings?: string[];
  requireEvidence?: boolean;
  requireGitHead?: boolean;
  requireCleanTree?: boolean;
  requireCanonicalEvidence?: boolean;
  canonicalReleaseVersion?: string;
  schemaRoot?: string;
};

function loadManifestSchema(schemaRoot?: string): Record<string, unknown> {
  const root = schemaRoot ?? findPackageRoot();
  const schemaPath = path.join(root, "schemas", "review-manifest.schema.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
}

function applyAjvFormats(ajv: Ajv2020): void {
  const imported = addFormatsImport as unknown as
    | ((instance: Ajv2020) => unknown)
    | { default?: (instance: Ajv2020) => unknown };
  const plugin = typeof imported === "function" ? imported : imported.default;
  if (!plugin) {
    throw new Error("ajv-formats plugin is unavailable");
  }
  plugin(ajv);
}

function validateManifestSchema(manifest: unknown, schemaRoot?: string): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  applyAjvFormats(ajv);
  const validate = ajv.compile(loadManifestSchema(schemaRoot));
  if (validate(manifest)) {
    return [];
  }
  return (validate.errors ?? []).map((error) => `schema:${error.instancePath || "/"} ${error.message ?? "invalid"}`);
}

export async function inspectReviewBundle(
  zipPath: string,
  options: InspectOptions = {},
): Promise<InspectionResult> {
  const errors: string[] = [];
  const requireEvidence = options.requireEvidence ?? true;

  let entries;
  try {
    entries = await readZip(zipPath);
  } catch (error) {
    return { ok: false, errors: [`zip-unreadable: ${error instanceof Error ? error.message : String(error)}`] };
  }

  const names = entries.map((entry) => entry.name.replace(/\\/g, "/"));
  if (new Set(names).size !== names.length) {
    errors.push("duplicate-entry");
  }

  const nameSet = new Set(names);
  const required = requireEvidence
    ? REQUIRED_REVIEW_ENTRIES
    : REQUIRED_REVIEW_ENTRIES.filter((name) => !name.startsWith("evidence/"));

  for (const requiredName of required) {
    if (!nameSet.has(requiredName)) {
      errors.push(`missing-entry:${requiredName}`);
    }
  }

  for (const name of names) {
    if (isUnsafeZipEntryName(name)) {
      errors.push("unsafe-entry-path");
    }
    for (const marker of EXCLUDED_ENTRY_MARKERS) {
      if (name.includes(marker)) {
        errors.push(`excluded-path-present:${name}`);
      }
    }
  }

  const manifestEntry = entries.find((entry) => entry.name.replace(/\\/g, "/") === "review-manifest.json");
  if (!manifestEntry) {
    errors.push("missing-entry:review-manifest.json");
    return { ok: errors.length === 0, errors };
  }

  let manifest: ReviewManifest;
  try {
    manifest = JSON.parse(manifestEntry.content.toString("utf8")) as ReviewManifest;
  } catch {
    errors.push("manifest-invalid-json");
    return { ok: false, errors };
  }

  errors.push(...validateManifestSchema(manifest, options.schemaRoot));

  if ("repoRoot" in manifest) {
    errors.push("manifest-has-repoRoot");
  }
  if ("workspace" in manifest) {
    errors.push("manifest-has-workspace");
  }

  const projectFiles = names
    .filter((name) => name.startsWith("project/"))
    .map((name) => name.slice("project/".length))
    .sort();
  const listedFiles = [...(manifest.includedFiles ?? [])].sort();
  if (JSON.stringify(projectFiles) !== JSON.stringify(listedFiles)) {
    errors.push("includedFiles-mismatch");
  }
  if (options.requireCanonicalEvidence && projectFiles.some((name) => /^(tmp|\.tmp|release)\//.test(name))) {
    errors.push("generated-staging-in-project-snapshot");
  }

  const evidenceFiles = names
    .filter((name) => name.startsWith("evidence/"))
    .map((name) => name.slice("evidence/".length))
    .sort();
  const listedEvidence = [...(manifest.evidenceIncluded ?? [])].sort();
  if (requireEvidence && JSON.stringify(evidenceFiles) !== JSON.stringify(listedEvidence)) {
    errors.push("evidenceIncluded-mismatch");
  }

  const canonicalFiles = new Map<string, string>();
  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, "/");
    if (name.startsWith("github/") || name.startsWith("release/")) {
      canonicalFiles.set(name, entry.content.toString("utf8"));
    } else if (name === "project/package.json" || name === "project/VERSION") {
      canonicalFiles.set(name, entry.content.toString("utf8"));
    }
  }
  const listedReviewEvidence = [...(manifest.reviewEvidenceIncluded ?? [])].sort();
  const actualReviewEvidence = [...canonicalFiles.keys()]
    .filter((name) => name.startsWith("github/") || name.startsWith("release/"))
    .sort();
  if (options.requireCanonicalEvidence && JSON.stringify(actualReviewEvidence) !== JSON.stringify(listedReviewEvidence)) {
    errors.push("reviewEvidenceIncluded-mismatch");
  }
  if (options.requireCanonicalEvidence) {
    const version = options.canonicalReleaseVersion ?? manifest.uadsVersion ?? "";
    errors.push(...validateCanonicalReleaseEvidence(canonicalFiles, version, manifest.git?.head));
    const releaseManifestNames = names.filter((name) => name.startsWith("release/release-manifest"));
    if (releaseManifestNames.length !== 1 || releaseManifestNames[0] !== "release/release-manifest.json") {
      errors.push("conflicting-release-manifests");
    }
  }

  if (options.requireGitHead && !manifest.git?.head) {
    errors.push("git-head-missing");
  }

  if (options.requireCleanTree) {
    const statusEntry = entries.find((entry) => entry.name.replace(/\\/g, "/") === "git-status.txt");
    const status = statusEntry?.content.toString("utf8").trim() ?? "";
    if (status && status !== "(clean)") {
      errors.push("working-tree-dirty");
    }
  }

  const haystack = entries.map((entry) => entry.content.toString("utf8")).join("\n");
  if (containsAbsoluteHostPath(haystack) || containsAbsoluteHostPath(JSON.stringify(manifest))) {
    errors.push("absolute-host-path");
  }
  if (containsUnredactedSecret(haystack)) {
    errors.push("unredacted-secret");
  }
  for (const needle of options.forbiddenSubstrings ?? []) {
    if (needle && haystack.includes(needle)) {
      errors.push("forbidden-leak");
    }
  }

  return { ok: errors.length === 0, errors };
}
