import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_REVIEW_FILE_BYTES } from "./constants.js";
import { listSidecarEvidence } from "./evidence.js";
import { collectOrchestrationSnapshot } from "../kernel/execution.js";
import {
  isBinaryFileName,
  isExcludedDirectoryName,
  isSensitiveDataFile,
  shouldExcludeFromReview,
} from "./exclusions.js";
import { computeProjectFingerprint } from "./fingerprint.js";
import { readGitSummary } from "./git.js";
import { sha256Hex, toPosix } from "./hash.js";
import { inspectReviewBundle, type InspectionResult } from "./inspect-review.js";
import { sanitizeRemoteUrl } from "./sanitize-url.js";
import { hostPathVariants, sanitizeReviewText } from "./secrets.js";
import { findPackageRoot, readUadsVersion } from "./version.js";
import { ensureWorkspace, readOrCreateProfile } from "./workspace.js";

export type ReviewManifest = {
  schema: "uads.review-manifest";
  schemaVersion: "0.1.0";
  generatedAt: string;
  uadsVersion: string;
  projectId: string;
  fingerprint: string;
  fingerprintSource: "remote" | "path";
  repositoryName: string;
  sidecar: string;
  zipFileName: string;
  git: {
    branch: string | null;
    head: string | null;
    originUrl: string | null;
    hasCommits: boolean;
  };
  includedFiles: string[];
  skipped: Array<{ path: string; reason: string }>;
  excludedDirectoryClasses: string[];
  evidenceIncluded: string[];
  reviewEvidenceIncluded: string[];
  exclusions: string[];
  inspection: {
    ok: boolean;
    errors: string[];
  };
};

export type ReviewBundleResult = {
  zipPath: string;
  checksumPath: string;
  sha256: string;
  manifest: ReviewManifest;
};

export class ReviewInspectionError extends Error {
  constructor(public readonly inspection: InspectionResult) {
    super(`review inspection failed: ${inspection.errors.join(", ")}`);
    this.name = "ReviewInspectionError";
  }
}

export function walkProjectFiles(repoRoot: string): string[] {
  return walkProject(repoRoot).candidates;
}

type WalkResult = {
  candidates: string[];
  skipped: Array<{ path: string; reason: string }>;
  excludedDirectoryClasses: string[];
};

type WalkProjectOptions = {
  excludeRootDirectories?: ReadonlySet<string>;
};

export function walkProject(repoRoot: string, options: WalkProjectOptions = {}): WalkResult {
  const candidates: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const excludedDirectoryClasses: string[] = [];

  const visit = (absDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = toPosix(path.relative(repoRoot, abs));

      if (entry.isDirectory()) {
        if (path.resolve(absDir) === path.resolve(repoRoot) && options.excludeRootDirectories?.has(entry.name)) {
          const klass = entry.name + "/";
          if (!excludedDirectoryClasses.includes(klass)) {
            excludedDirectoryClasses.push(klass);
          }
          continue;
        }
        if (isExcludedDirectoryName(entry.name)) {
          const klass = entry.name + "/";
          if (!excludedDirectoryClasses.includes(klass)) {
            excludedDirectoryClasses.push(klass);
          }
          continue;
        }
        visit(abs);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }
      if (rel.endsWith(".zip.sha256") || rel.includes("/reviews/")) {
        skipped.push({ path: rel, reason: "review-artifact" });
        continue;
      }
      if (isSensitiveDataFile(rel)) {
        skipped.push({ path: rel, reason: "sensitive-data-file" });
        continue;
      }
      if (shouldExcludeFromReview(rel)) {
        skipped.push({ path: rel, reason: "excluded-pattern" });
        continue;
      }
      candidates.push(rel);
    }
  };

  visit(repoRoot);
  candidates.sort((a, b) => a.localeCompare(b));
  excludedDirectoryClasses.sort((a, b) => a.localeCompare(b));
  return { candidates, skipped, excludedDirectoryClasses };
}

function isCanonicalUadsRepository(repoRoot: string): boolean {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      name?: unknown;
      repository?: { url?: unknown };
    };
    const repositoryUrl = typeof packageJson.repository?.url === "string" ? packageJson.repository.url : "";
    return (
      packageJson.name === "uads" &&
      /github\.com\/KayzenRoot\/uads(?:\.git)?$/i.test(repositoryUrl.replace(/^git\+/, "")) &&
      fs.existsSync(path.join(repoRoot, "src", "lib", "review-bundle.ts"))
    );
  } catch {
    return false;
  }
}

function listCanonicalReviewEvidence(root: string): Array<{ name: string; content: string }> {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files: Array<{ name: string; content: string }> = [];
  const visit = (directory: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(abs);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relative = toPosix(path.relative(root, abs));
      if (!/^(github|release)\//.test(relative) || isBinaryFileName(relative)) {
        continue;
      }
      try {
        files.push({ name: relative, content: fs.readFileSync(abs, "utf8") });
      } catch {
        continue;
      }
    }
  };
  visit(root);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildRepositoryTree(files: string[]): string {
  return files.length === 0 ? "(empty)\n" : `${files.join("\n")}\n`;
}

function classifySkip(rel: string, repoRoot: string): string | null {
  if (isBinaryFileName(rel)) {
    return "binary-extension";
  }
  const abs = path.join(repoRoot, rel);
  try {
    const stat = fs.statSync(abs);
    if (stat.size > MAX_REVIEW_FILE_BYTES) {
      return `too-large:${stat.size}`;
    }
  } catch {
    return "unreadable";
  }
  return null;
}

function uniquePaths(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

export async function createReviewBundle(input: {
  cwd?: string;
  uadsHome?: string;
  uadsPackageRoot?: string;
  requireEvidence?: boolean;
  requireGitHead?: boolean;
  requireCleanTree?: boolean;
  requireCanonicalEvidence?: boolean;
  canonicalReleaseVersion?: string;
  forbiddenSubstrings?: string[];
}): Promise<ReviewBundleResult> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? cwd;
  const fingerprint = computeProjectFingerprint({
    originUrl: git.originUrl,
    repoRoot,
  });
  const paths = ensureWorkspace(fingerprint.projectId, input.uadsHome);
  readOrCreateProfile(paths, {
    projectId: fingerprint.projectId,
    fingerprint: fingerprint.fingerprint,
    fingerprintSource: fingerprint.source,
    repoRoot,
  });

  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const zipFileName = `uads-review-${fingerprint.projectId}-${stamp}.zip`;
  const zipPath = path.join(paths.reviews, zipFileName);
  const checksumPath = `${zipPath}.sha256`;
  const repositoryName = path.basename(repoRoot) || "repository";
  const hostPaths = uniquePaths([repoRoot, cwd, paths.home, paths.workspace, os.homedir()]);

  const prepareText = (
    text: string,
  ): { include: true; text: string } | { include: false; reason: string } => {
    const result = sanitizeReviewText(text, hostPaths);
    if (result.omit) {
      return { include: false, reason: "omitted-unsanitizable-secret" };
    }
    return { include: true, text: result.text };
  };

  const packageRoot = path.resolve(input.uadsPackageRoot ?? findPackageRoot());
  const excludeRootDirectories =
    isCanonicalUadsRepository(repoRoot) || path.resolve(repoRoot) === packageRoot
      ? new Set(["tmp", ".tmp", "release"])
      : new Set<string>();
  const walked = walkProject(repoRoot, { excludeRootDirectories });
  const includedFiles: string[] = [];
  const skipped = [...walked.skipped];
  const projectTexts = new Map<string, string>();

  for (const rel of walked.candidates) {
    const reason = classifySkip(rel, repoRoot);
    if (reason) {
      skipped.push({ path: rel, reason });
      continue;
    }

    const abs = path.join(repoRoot, rel);
    let raw: string;
    try {
      raw = fs.readFileSync(abs, "utf8");
    } catch {
      skipped.push({ path: rel, reason: "unreadable" });
      continue;
    }

    const prepared = prepareText(raw);
    if (!prepared.include) {
      skipped.push({ path: rel, reason: prepared.reason });
      continue;
    }
    includedFiles.push(rel);
    projectTexts.set(rel, prepared.text);
  }

  const gitStatus = prepareText(git.status);
  const gitDiff = prepareText(git.diff);
  const gitLog = prepareText(git.log);
  const treePrepared = prepareText(buildRepositoryTree(walked.candidates));

  const evidenceFiles = listSidecarEvidence(paths.evidence);
  const evidenceIncluded: string[] = [];
  const evidenceTexts = new Map<string, string>();
  for (const file of evidenceFiles) {
    const prepared = prepareText(file.content);
    if (!prepared.include) {
      skipped.push({ path: `evidence/${file.name}`, reason: prepared.reason });
      continue;
    }
    evidenceIncluded.push(file.name);
    evidenceTexts.set(file.name, prepared.text);
  }

  const reviewEvidenceFiles = listCanonicalReviewEvidence(paths.reviewEvidence);
  const reviewEvidenceIncluded: string[] = [];
  const reviewEvidenceTexts = new Map<string, string>();
  for (const file of reviewEvidenceFiles) {
    const prepared = prepareText(file.content);
    if (!prepared.include) {
      skipped.push({ path: file.name, reason: prepared.reason });
      continue;
    }
    reviewEvidenceIncluded.push(file.name);
    reviewEvidenceTexts.set(file.name, prepared.text);
  }

  const orchestrationTexts = new Map<string, string>();
  for (const file of collectOrchestrationSnapshot(paths)) {
    const prepared = prepareText(file.content);
    if (!prepared.include) {
      skipped.push({ path: file.name, reason: prepared.reason });
      continue;
    }
    orchestrationTexts.set(file.name, prepared.text);
  }

  const uadsVersion = readUadsVersion(input.uadsPackageRoot);
  const originUrl = sanitizeRemoteUrl(git.originUrl);
  const requireEvidence = input.requireEvidence ?? false;
  const requireGitHead = input.requireGitHead ?? false;
  const requireCleanTree = input.requireCleanTree ?? false;

  const manifestBase: Omit<ReviewManifest, "inspection"> = {
    schema: "uads.review-manifest",
    schemaVersion: "0.1.0",
    generatedAt,
    uadsVersion,
    projectId: fingerprint.projectId,
    fingerprint: fingerprint.fingerprint,
    fingerprintSource: fingerprint.source,
    repositoryName,
    sidecar: `sidecar://workspaces/${fingerprint.projectId}`,
    zipFileName,
    git: {
      branch: git.branch,
      head: git.head,
      originUrl,
      hasCommits: Boolean(git.head),
    },
    includedFiles,
    skipped,
    excludedDirectoryClasses: walked.excludedDirectoryClasses,
    evidenceIncluded,
    reviewEvidenceIncluded,
    exclusions: [
      "node_modules/",
      ".git/",
      "dist/",
      "coverage/",
      "memory-bank/",
      ".env*",
      "sensitive data files (keys, credential stores)",
      "review output directories",
      "generated UADS staging roots at repository root (tmp/, .tmp/, release/)",
      "canonical release evidence is staged in the sidecar and copied under github/ and release/",
      "absolute local host paths",
      "common binary and cache artifacts",
    ],
  };

  const readmePrepared = prepareText(
    [
      "UADS review bundle",
      `generatedAt: ${generatedAt}`,
      `projectId: ${fingerprint.projectId}`,
      `repositoryName: ${repositoryName}`,
      `uadsVersion: ${uadsVersion}`,
      "Shareable manifests are privacy-minimized and do not include host paths.",
      "Secrets, .git, node_modules, caches, memory-bank, and review outputs are excluded or redacted.",
      "Content scanning is defense-in-depth and is not a guarantee of complete secret detection.",
      "",
    ].join("\n"),
  );
  const readme = readmePrepared.include ? readmePrepared.text : "UADS review bundle\n";

  const inspectOptions = {
    requireEvidence,
    requireGitHead,
    requireCleanTree,
    requireCanonicalEvidence: input.requireCanonicalEvidence,
    canonicalReleaseVersion: input.canonicalReleaseVersion,
    forbiddenSubstrings: [...(input.forbiddenSubstrings ?? []), ...hostPaths.flatMap(hostPathVariants)],
    schemaRoot: packageRoot,
  };

  const payload = {
    tree: gitStatusTree(treePrepared),
    gitStatus: gitStatus.include ? gitStatus.text : "(omitted)\n",
    gitDiff: gitDiff.include ? gitDiff.text : "(omitted)\n",
    gitLog: gitLog.include ? gitLog.text : "(omitted)\n",
    readme,
    includedFiles,
    projectTexts,
    evidenceTexts,
    reviewEvidenceTexts,
    orchestrationTexts,
    uadsVersion,
  };

  const successfulManifest: ReviewManifest = {
    ...manifestBase,
    inspection: { ok: true, errors: [] },
  };
  const preparedSuccess = prepareText(`${JSON.stringify(successfulManifest, null, 2)}\n`);
  if (!preparedSuccess.include) {
    throw new Error("review manifest could not be sanitized");
  }

  writeZip(zipPath, { ...payload, manifestText: preparedSuccess.text });

  const inspection = await inspectReviewBundle(zipPath, inspectOptions);
  if (!inspection.ok) {
    const failedManifest: ReviewManifest = { ...manifestBase, inspection };
    const preparedFail = prepareText(`${JSON.stringify(failedManifest, null, 2)}\n`);
    if (preparedFail.include) {
      writeZip(zipPath, { ...payload, manifestText: preparedFail.text });
    }
    throw new ReviewInspectionError(inspection);
  }

  const sha256 = sha256Hex(fs.readFileSync(zipPath));
  fs.writeFileSync(checksumPath, `${sha256}  ${zipFileName}\n`, "utf8");

  return {
    zipPath,
    checksumPath,
    sha256,
    manifest: successfulManifest,
  };
}

function gitStatusTree(
  treePrepared: { include: true; text: string } | { include: false; reason: string },
): string {
  return treePrepared.include ? treePrepared.text : "(omitted)\n";
}

function writeZip(
  zipPath: string,
  payload: {
    manifestText: string;
    tree: string;
    gitStatus: string;
    gitDiff: string;
    gitLog: string;
    readme: string;
    includedFiles: string[];
    projectTexts: Map<string, string>;
    evidenceTexts: Map<string, string>;
    reviewEvidenceTexts: Map<string, string>;
    orchestrationTexts: Map<string, string>;
    uadsVersion: string;
  },
): void {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const zip = new AdmZip();
  zip.addFile("review-manifest.json", Buffer.from(payload.manifestText, "utf8"));
  zip.addFile("repository-tree.txt", Buffer.from(payload.tree, "utf8"));
  zip.addFile("git-status.txt", Buffer.from(`${payload.gitStatus}\n`, "utf8"));
  zip.addFile("git-diff.txt", Buffer.from(`${payload.gitDiff}\n`, "utf8"));
  zip.addFile("git-log.txt", Buffer.from(`${payload.gitLog}\n`, "utf8"));
  zip.addFile("version.txt", Buffer.from(`${payload.uadsVersion}\n`, "utf8"));
  zip.addFile("README.txt", Buffer.from(payload.readme, "utf8"));

  for (const [name, content] of payload.evidenceTexts) {
    zip.addFile(`evidence/${name}`, Buffer.from(content, "utf8"));
  }
  for (const [name, content] of payload.reviewEvidenceTexts) {
    zip.addFile(name, Buffer.from(content, "utf8"));
  }
  for (const [name, content] of payload.orchestrationTexts) {
    zip.addFile(name, Buffer.from(content, "utf8"));
  }
  for (const rel of payload.includedFiles) {
    const content = payload.projectTexts.get(rel);
    if (content === undefined) {
      continue;
    }
    zip.addFile(`project/${rel}`, Buffer.from(content, "utf8"));
  }

  zip.writeZip(zipPath);
}
