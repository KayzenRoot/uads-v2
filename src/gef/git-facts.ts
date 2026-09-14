import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest, normalizeRepoRelativePath } from "./upir.js";

export const DIFF_FACTS_SCHEMA_VERSION = "0.1.0" as const;
export const DIFF_FACTS_SCHEMA_FILE = "gef-diff-facts.schema.json" as const;

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

function runGit(repoRoot: string, args: string[]): { stdout: Buffer; status: number } {
  const result = spawnSync("git", args, { cwd: repoRoot, shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw new Error(`GIT_FACTS_UNAVAILABLE:${(result.error as Error).message}`);
  return { stdout: (result.stdout ?? Buffer.alloc(0)) as Buffer, status: result.status ?? 1 };
}

function gitText(repoRoot: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: repoRoot, shell: false, windowsHide: true, encoding: "utf8" });
  if (result.error ?? (result.status ?? 1) !== 0) throw new Error("GIT_FACTS_UNAVAILABLE");
  return ((result.stdout ?? "") as string).trim();
}

function extractNumstatDestination(clean: string): string {
  if (!clean.includes(" => ")) return clean;
  const after = clean.split(" => ").pop() ?? clean;
  if (clean.includes("{") && !after.includes("/")) {
    return clean.replace(/\{[^}]* => [^}]*\}/, after);
  }
  return after;
}

function unquoteGitPath(raw: string): string {
  const quoted = raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1) : raw;
  if (!quoted.includes("\\")) return quoted;
  const bytes: number[] = [];
  let text = "";
  const flush = (): void => {
    if (bytes.length > 0) {
      text += Buffer.from(bytes).toString("utf8");
      bytes.length = 0;
    }
  };
  for (let index = 0; index < quoted.length; index += 1) {
    const char = quoted[index] ?? "";
    if (char !== "\\" || index + 1 >= quoted.length) {
      if (char === "\\") {
        flush();
        text += "\\";
      } else {
        bytes.push(...Buffer.from(char, "utf8"));
      }
      continue;
    }
    const next = quoted[index + 1] ?? "";
    const octal = quoted.slice(index + 1, index + 4);
    if (next >= "0" && next <= "7" && /^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
      continue;
    }
    flush();
    if (next === "n") text += "\n";
    else if (next === "t") text += "\t";
    else text += next;
    index += 1;
  }
  flush();
  return text;
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
function parsePorcelainZ(fields: string[]): ParsedPath[] {
  const parsed: ParsedPath[] = [];
  let cursor = 0;
  while (cursor < fields.length) {
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
    if (parsed.length >= 2000) break;
  }
  return parsed;
}

function parseNameStatusZ(fields: string[]): ParsedPath[] {
  // diff --name-status -z truth: <status> NUL <source> NUL <destination> NUL
  // for renames/copies (e.g. R100 NUL old NUL new NUL); plain add/modify/
  // delete records are <status> NUL <path> NUL. path is the destination for
  // R/C and previousPath is the source.
  const parsed: ParsedPath[] = [];
  let cursor = 0;
  while (cursor + 1 < fields.length) {
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
    if (parsed.length >= 2000) break;
  }
  return parsed;
}

function parseNumstat(text: string): Map<string, PathCounts> {
  const numstat = new Map<string, PathCounts>();
  for (const line of text.split("\n")) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(line);
    if (!match) continue;
    const clean = unquoteGitPath(match[3] ?? "");
    const destination = extractNumstatDestination(clean);
    try {
      const normalized = normalizeRepoRelativePath(destination);
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

function assertBaseUsable(repoRoot: string, base: string): void {
  const result = spawnSync("git", ["cat-file", "-e", `${base}^{commit}`], { cwd: repoRoot, shell: false, windowsHide: true });
  if (result.error ?? (result.status ?? 1) !== 0) {
    throw new Error(`DIFF_BASE_UNAVAILABLE:${base.slice(0, 100)}`);
  }
}

export function collectDiffFacts(repoRoot: string, projectFingerprint: string, baseSha?: string): DiffFacts {
  const headSha = gitText(repoRoot, ["rev-parse", "HEAD"]);
  const base = baseSha ?? headSha;

  // Committed candidate truth: deterministic base-to-HEAD delta. A clean
  // checkout at HEAD still reports these files while dirty stays false.
  const committed: ChangedFileFact[] = [];
  if (base !== headSha) {
    assertBaseUsable(repoRoot, base);
    const rangeStatus = splitNul(runGit(repoRoot, ["diff", "--name-status", "-z", "-M", "-C", base, headSha, "--"]).stdout);
    const rangeNumstat = parseNumstat(gitText(repoRoot, ["diff", "--numstat", "-M", "-C", base, headSha, "--"]));
    for (const parsed of parseNameStatusZ(rangeStatus)) {
      committed.push(toFact(repoRoot, parsed, rangeNumstat));
      if (committed.length >= 2000) break;
    }
  }

  // Dirty working-tree truth: local mutations overlaid on the candidate.
  const statusEntries = splitNul(runGit(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout);

  // numstat without -z: one LF-terminated record per file. Quoted C-style paths
  // are unquoted deterministically; rename destinations are extracted from
  // the "old => new" / "{a => b}c" forms. -z is intentionally not used
  // here because numstat -z rename token order is version-fragile.
  const numstat = parseNumstat(gitText(repoRoot, ["diff", "--numstat", "HEAD", "--"]));
  const dirtyParsed = parsePorcelainZ(statusEntries);
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
  const changed = [...merged.values()].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)).slice(0, 2000);

  const isDirty = dirty.length > 0;
  const worktreeDigest = isDirty ? canonicalDigest(dirty.map((item) => ({ path: item.path, status: item.status, digest: item.digest }))) : null;
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
