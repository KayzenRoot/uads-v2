import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest, normalizeRepoRelativePath } from "./upir.js";

export const DIFF_FACTS_SCHEMA_VERSION = "0.1.0" as const;
export const DIFF_FACTS_SCHEMA_FILE = "gef-diff-facts.schema.json" as const;
export const DIFF_FACTS_MAX_FILES = 2000 as const;

export type GitRunResult = { stdout: Buffer; status: number };
export type GitRunner = (repoRoot: string, args: string[]) => GitRunResult;

export type DiffFactsLimits = { maxFiles?: number; gitRunner?: GitRunner };

export type ChangedFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" | "typechange";

export type ChangedFileFact = {
  path: string;
  status: ChangedFileStatus;
  previousPath?: string;
  digest: string | null;
  binary: boolean;
  insertions: number;
  deletions: number;
};

export type DiffFacts = {
  schemaVersion: typeof DIFF_FACTS_SCHEMA_VERSION;
  projectFingerprint: string;
  baseSha: string | null;
  headSha: string | null;
  dirty: boolean;
  changedFiles: ChangedFileFact[];
  stats: { files: number; insertions: number; deletions: number };
  worktreeDigest: string | null;
  factsDigest: string;
};

// Bounded Git identity: only a validated subcommand token may reach an error
// code, so raw stderr, absolute host paths, credentials or arbitrary command
// text never persist in evidence or diagnostics.
function boundedGitToken(value: string | undefined, fallback: string): string {
  return value !== undefined && /^[a-z][a-z0-9-]{0,19}$/.test(value) ? value : fallback;
}

function spawnErrorLabel(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "SPAWN_ERROR";
}

const defaultGitRunner: GitRunner = (repoRoot, args) => {
  const result = spawnSync("git", args, { cwd: repoRoot, shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw new Error(`GIT_FACTS_UNAVAILABLE:${spawnErrorLabel(result.error)}`);
  return { stdout: (result.stdout ?? Buffer.alloc(0)) as Buffer, status: result.status ?? 1 };
};

// Authoritative facts are never produced from a failed subprocess: every
// non-zero exit status fails closed here, so no caller can forget to inspect
// status and publish partial facts from a command that did not succeed.
function runGit(repoRoot: string, args: string[], runner: GitRunner): Buffer {
  const { stdout, status } = runner(repoRoot, args);
  if (status !== 0) throw new Error(`GIT_FACTS_COMMAND_FAILED:${boundedGitToken(args[0], "command")}`);
  return stdout;
}

function gitText(repoRoot: string, args: string[], runner: GitRunner): string {
  return runGit(repoRoot, args, runner).toString("utf8").trim();
}

function splitNul(output: Buffer): string[] {
  return output.toString("utf8").split("\x00").filter((part) => part.length > 0);
}

type ParsedPath = { path: string; status: ChangedFileStatus; previousPath?: string };

type PathCounts = { insertions: number; deletions: number; binary: boolean };

// Porcelain v1 -z truth: each record is XY SP destination NUL, and rename/copy
// records carry a second NUL field (source) with no arrow token. The cursor
// consumes that second field as previousPath instead of treating it as a
// separate status record. -z paths are never C-quoted.
function parsePorcelainZ(fields: string[], maxFiles: number): ParsedPath[] {
  const parsed: ParsedPath[] = [];
  let cursor = 0;
  while (cursor < fields.length) {
    // The file cap never silently truncates authoritative facts: reaching it
    // with input still unconsumed fails closed for expansion.
    if (parsed.length >= maxFiles) throw new Error("DIFF_FILE_LIMIT_EXCEEDED");
    const entry = fields[cursor] ?? "";
    cursor += 1;
    if (entry.length < 4) continue;
    const indexStatus = entry[0] ?? " ";
    const worktreeStatus = entry[1] ?? " ";
    const code = indexStatus !== " " && indexStatus !== "?" ? indexStatus : worktreeStatus;
    const isRenameOrCopy = code === "R" || code === "C";
    let previousPath: string | undefined;
    if (isRenameOrCopy && cursor < fields.length) {
      const source = fields[cursor] ?? "";
      cursor += 1;
      try {
        previousPath = normalizeRepoRelativePath(source);
      } catch {
        previousPath = undefined;
      }
    }
    let normalized: string;
    try {
      normalized = normalizeRepoRelativePath(entry.slice(3));
    } catch {
      continue;
    }
    let status: ChangedFileStatus = "modified";
    if (code === "A") status = "added";
    else if (code === "D") status = "deleted";
    else if (code === "R") status = "renamed";
    else if (code === "C") status = "copied";
    else if (code === "T") status = "typechange";
    else if (code === "?") status = "untracked";
    parsed.push({ path: normalized, status, ...(previousPath ? { previousPath } : {}) });
  }
  return parsed;
}

function parseNameStatusZ(fields: string[], maxFiles: number): ParsedPath[] {
  // diff --name-status -z truth: <status> NUL <source> NUL <destination> NUL
  // for renames/copies (e.g. R100 NUL old NUL new NUL); plain add/modify/
  // delete records are <status> NUL <path> NUL. path is the destination for
  // R/C and previousPath is the source.
  const parsed: ParsedPath[] = [];
  let cursor = 0;
  while (cursor + 1 < fields.length) {
    if (parsed.length >= maxFiles) throw new Error("DIFF_FILE_LIMIT_EXCEEDED");
    const statusToken = fields[cursor] ?? "";
    const sourceToken = fields[cursor + 1] ?? "";
    cursor += 2;
    const code = statusToken[0] ?? " ";
    let destToken = sourceToken;
    let previousPath: string | undefined;
    if (code === "R" || code === "C") {
      if (cursor >= fields.length) continue;
      const destination = fields[cursor] ?? "";
      cursor += 1;
      try {
        previousPath = normalizeRepoRelativePath(sourceToken);
      } catch {
        previousPath = undefined;
      }
      destToken = destination;
    }
    let normalized: string;
    try {
      normalized = normalizeRepoRelativePath(destToken);
    } catch {
      continue;
    }
    let status: ChangedFileStatus = "modified";
    if (code === "A") status = "added";
    else if (code === "D") status = "deleted";
    else if (code === "R") status = "renamed";
    else if (code === "C") status = "copied";
    else if (code === "T") status = "typechange";
    else if (code === "U") status = "modified";
    parsed.push({ path: normalized, status, ...(previousPath ? { previousPath } : {}) });
  }
  return parsed;
}

// numstat -z truth: one NUL record per file, `<added> TAB <deleted> TAB <path>`,
// where -z paths are never C-quoted. Rename/copy records carry an empty path
// field followed by two more NUL fields (source, destination), so nested
// forms like src/{old => new}/file.ts resolve to src/new/file.ts exactly
// without brace-string reconstruction.
function parseNumstatZ(fields: string[]): Map<string, PathCounts> {
  const numstat = new Map<string, PathCounts>();
  let cursor = 0;
  while (cursor < fields.length) {
    const field = fields[cursor] ?? "";
    cursor += 1;
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(field);
    if (!match) continue;
    let target = match[3] ?? "";
    if (target.length === 0) {
      if (cursor + 1 >= fields.length) continue;
      cursor += 1;
      target = fields[cursor] ?? "";
      cursor += 1;
    }
    if (target.length === 0) continue;
    try {
      const normalized = normalizeRepoRelativePath(target);
      const binary = match[1] === "-" || match[2] === "-";
      numstat.set(normalized, {
        insertions: binary ? 0 : Number.parseInt(match[1] ?? "0", 10) || 0,
        deletions: binary ? 0 : Number.parseInt(match[2] ?? "0", 10) || 0,
        binary,
      });
    } catch {
      continue;
    }
  }
  return numstat;
}

function probeUntrackedBinary(repoRoot: string, normalized: string): boolean {
  try {
    const probe = Buffer.alloc(8192);
    const descriptor = fsSync.openSync(path.join(repoRoot, normalized), "r");
    try {
      const read = fsSync.readSync(descriptor, probe, 0, 8192, 0);
      return probe.subarray(0, read).includes(0);
    } finally {
      fsSync.closeSync(descriptor);
    }
  } catch {
    return false;
  }
}

function toFact(repoRoot: string, parsed: ParsedPath, counts: Map<string, PathCounts>): ChangedFileFact {
  const known = counts.get(parsed.path) ?? { insertions: 0, deletions: 0, binary: false };
  // digest is the SHA-256 of raw working-tree file bytes (not the Git blob
  // identity, which mixes in a header). Deleted or unreadable files bind null.
  let digest: string | null = null;
  let binary = known.binary;
  if (parsed.status !== "deleted") {
    try {
      digest = sha256Hex(fsSync.readFileSync(path.join(repoRoot, ...parsed.path.split("/"))));
    } catch {
      digest = null;
    }
    if (!binary && parsed.status === "untracked") {
      binary = probeUntrackedBinary(repoRoot, parsed.path);
    }
  }
  return {
    path: parsed.path,
    status: parsed.status,
    ...(parsed.previousPath ? { previousPath: parsed.previousPath } : {}),
    digest,
    binary,
    insertions: known.insertions,
    deletions: known.deletions,
  };
}

function assertBaseUsable(repoRoot: string, base: string, runner: GitRunner): void {
  const { status } = runner(repoRoot, ["cat-file", "-e", `${base}^{commit}`]);
  if (status !== 0) {
    throw new Error(`DIFF_BASE_UNAVAILABLE:${base.slice(0, 100)}`);
  }
}

function assertBaseAncestor(repoRoot: string, base: string, head: string, runner: GitRunner): void {
  if (base === head) return;
  const { status } = runner(repoRoot, ["merge-base", "--is-ancestor", base, head]);
  // Git reserves exit status 1 for the explicit NOT_ANCESTOR semantic; every
  // other non-zero status is an operational failure that stays distinguishable
  // from it and fails closed.
  if (status === 1) throw new Error(`DIFF_BASE_NOT_ANCESTOR:${base.slice(0, 100)}`);
  if (status !== 0) throw new Error("GIT_FACTS_COMMAND_FAILED:merge-base");
}

export function collectDiffFacts(repoRoot: string, projectFingerprint: string, baseSha?: string, limits?: DiffFactsLimits): DiffFacts {
  const runner = limits?.gitRunner ?? defaultGitRunner;
  const headSha = gitText(repoRoot, ["rev-parse", "HEAD"], runner);
  const base = baseSha ?? headSha;
  const maxFiles = limits?.maxFiles ?? DIFF_FACTS_MAX_FILES;

  // Committed candidate truth: deterministic base-to-HEAD delta. A clean
  // checkout at HEAD still reports these files while dirty stays false.
  // The base must be an ancestor of HEAD: an existing but divergent base
  // fails closed instead of producing an arbitrary divergent-tree diff.
  const committed: ChangedFileFact[] = [];
  if (base !== headSha) {
    assertBaseUsable(repoRoot, base, runner);
    assertBaseAncestor(repoRoot, base, headSha, runner);
    const rangeStatus = splitNul(runGit(repoRoot, ["diff", "--name-status", "-z", "-M", "-C", base, headSha, "--"], runner));
    const rangeNumstat = parseNumstatZ(splitNul(runGit(repoRoot, ["diff", "--numstat", "-z", "-M", "-C", base, headSha, "--"], runner)));
    for (const parsed of parseNameStatusZ(rangeStatus, maxFiles)) {
      committed.push(toFact(repoRoot, parsed, rangeNumstat));
    }
  }

  // Dirty working-tree truth: local mutations overlaid on the candidate.
  const statusEntries = splitNul(runGit(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], runner));

  // numstat -z: one NUL record per file with rename/copy destination tokens,
  // so nested-brace forms map to the destination path exactly.
  const numstat = parseNumstatZ(splitNul(runGit(repoRoot, ["diff", "--numstat", "-z", "HEAD", "--"], runner)));
  const dirtyParsed = parsePorcelainZ(statusEntries, maxFiles);
  const dirty: ChangedFileFact[] = dirtyParsed.map((parsed) => toFact(repoRoot, parsed, numstat));

  // One flattened candidate collection: committed delta first, dirty overlay
  // wins per path without losing a committed previousPath. dirty and
  // worktreeDigest stay separate so the head candidate is never confused
  // with local mutations.
  const merged = new Map<string, ChangedFileFact>();
  for (const entry of committed) merged.set(entry.path, entry);
  for (const entry of dirty) {
    const prior = merged.get(entry.path);
    merged.set(entry.path, prior ? { ...prior, ...entry, previousPath: entry.previousPath ?? prior.previousPath } : entry);
  }
  if (merged.size > maxFiles) throw new Error("DIFF_FILE_LIMIT_EXCEEDED");
  const changed = [...merged.values()].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  const isDirty = dirty.length > 0;
  // The dirty overlay digest binds the rename/copy source identity too: two
  // overlays that agree on destination path, status and content bytes are still
  // different observed states when they came from different previousPath
  // sources, and must never share cache validity.
  const worktreeDigest = isDirty
    ? canonicalDigest(
        [...dirty]
          .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
          .map((item) => ({ path: item.path, status: item.status, previousPath: item.previousPath ?? null, digest: item.digest })),
      )
    : null;
  const stats = {
    files: changed.length,
    insertions: changed.reduce((total, item) => total + item.insertions, 0),
    deletions: changed.reduce((total, item) => total + item.deletions, 0),
  };
  const withoutDigest = {
    schemaVersion: DIFF_FACTS_SCHEMA_VERSION,
    projectFingerprint,
    baseSha: base,
    headSha,
    dirty: isDirty,
    changedFiles: changed,
    stats,
    worktreeDigest,
  };
  const facts: DiffFacts = { ...withoutDigest, factsDigest: canonicalDigest(withoutDigest) };
  assertSchema(DIFF_FACTS_SCHEMA_FILE, facts, findPackageRoot());
  return facts;
}

export function validateDiffFacts(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(DIFF_FACTS_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}

export function worktreeBasisKey(facts: DiffFacts): string {
  return canonicalDigest({ headSha: facts.headSha, worktreeDigest: facts.worktreeDigest, dirty: facts.dirty });
}

export function posixChangedPaths(facts: DiffFacts): string[] {
  return facts.changedFiles.map((item) => normalizeRepoRelativePath(item.path));
}
