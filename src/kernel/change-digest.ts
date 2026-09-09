import fs from "node:fs";
import path from "node:path";
import { EXCLUDED_DIRECTORY_NAMES } from "../lib/constants.js";
import { isExcludedDirectoryName } from "../lib/exclusions.js";
import { runProcess } from "../lib/exec.js";
import { isPathInside, sha256Hex, toPosix } from "../lib/hash.js";
import { assertSafeRelativeProjectPath } from "./safe-path.js";

export type PorcelainEntry = {
  code: string;
  path: string;
  origPath?: string;
};

function runGit(args: string[], cwd: string, trim = true): string {
  const result = runProcess("git", args, { cwd });
  if (result.error || (result.status ?? 1) !== 0) {
    throw result.error ?? new Error((result.stderr || "git failed").trim());
  }
  const stdout = result.stdout ?? "";
  return trim ? stdout.trim() : stdout;
}

export function gitPorcelain(repoRoot: string): string {
  return runGit(["status", "--porcelain=v1", "-z", "-uall"], repoRoot, false);
}

export function isWorktreeDirty(repoRoot: string): boolean {
  return parseGitPorcelain(gitPorcelain(repoRoot)).length > 0;
}

export function gitDiffHead(repoRoot: string): string {
  return runGit(["diff", "HEAD"], repoRoot, false);
}

function isRenameOrCopy(code: string): boolean {
  return code.includes("R") || code.includes("C");
}

export function parseGitPorcelain(output: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  const parts = output.split("\0");
  let index = 0;
  while (index < parts.length) {
    const raw = parts[index] ?? "";
    index += 1;
    if (!raw) {
      continue;
    }
    if (raw.length < 3) {
      continue;
    }
    const code = raw.slice(0, 2);
    const firstPath = toPosix(raw.slice(3)).replace(/\\/g, "/");
    if (isRenameOrCopy(code)) {
      const destRaw = parts[index] ?? "";
      index += 1;
      const dest = toPosix(destRaw).replace(/\\/g, "/");
      entries.push({ code, path: dest, origPath: firstPath });
      continue;
    }
    entries.push({ code, path: firstPath });
  }
  return entries;
}

export function pathHasExcludedSegment(relativePath: string): boolean {
  return toPosix(relativePath)
    .split("/")
    .filter(Boolean)
    .some((part) => isExcludedDirectoryName(part) || EXCLUDED_DIRECTORY_NAMES.has(part));
}

export function listChangedEntries(repoRoot: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  for (const entry of parseGitPorcelain(gitPorcelain(repoRoot))) {
    const candidates = [entry.path, entry.origPath].filter((value): value is string => Boolean(value));
    let rejected = false;
    const safe: PorcelainEntry = { ...entry };
    try {
      safe.path = assertSafeRelativeProjectPath(entry.path);
      if (entry.origPath) {
        safe.origPath = assertSafeRelativeProjectPath(entry.origPath);
      }
    } catch {
      rejected = true;
    }
    if (rejected || candidates.some((item) => pathHasExcludedSegment(item))) {
      continue;
    }
    entries.push(safe);
  }
  return entries;
}

export function listChangedRelativePaths(repoRoot: string): string[] {
  const paths = new Set<string>();
  for (const entry of listChangedEntries(repoRoot)) {
    paths.add(entry.path);
    if (entry.origPath) {
      paths.add(entry.origPath);
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function describeSymlinkChange(
  repoRoot: string,
  relativePath: string,
): { identity: string; blocked: boolean; reason?: string } {
  const abs = path.resolve(repoRoot, relativePath);
  if (!isPathInside(repoRoot, abs)) {
    return { identity: "escape", blocked: true, reason: "symlink path escape" };
  }
  const target = fs.readlinkSync(abs);
  if (path.isAbsolute(target) || /^[A-Za-z]:/.test(target) || target.startsWith("\\\\") || target.includes("..")) {
    return {
      identity: `symlink-blocked:${sha256Hex(target)}`,
      blocked: true,
      reason: "unsupported symlink target",
    };
  }
  return { identity: `symlink:${sha256Hex(target)}`, blocked: false };
}

export function fileContentIdentity(repoRoot: string, relativePath: string): string {
  const abs = path.resolve(repoRoot, relativePath);
  if (!isPathInside(repoRoot, abs)) {
    throw new Error("path traversal rejected");
  }
  if (!fs.existsSync(abs)) {
    return "deleted";
  }
  const stat = fs.lstatSync(abs);
  if (stat.isSymbolicLink()) {
    return describeSymlinkChange(repoRoot, relativePath).identity;
  }
  if (!stat.isFile()) {
    return `special:${stat.mode}`;
  }
  return sha256Hex(fs.readFileSync(abs));
}

export function hashUntrackedFile(repoRoot: string, relativePath: string): string {
  return fileContentIdentity(repoRoot, relativePath);
}

export function worktreeContentDigest(repoRoot: string): string {
  const entries = listChangedEntries(repoRoot);
  if (entries.length === 0) {
    return sha256Hex("worktree:empty");
  }
  const lines = [...entries]
    .sort((a, b) => `${a.origPath ?? ""}:${a.path}`.localeCompare(`${b.origPath ?? ""}:${b.path}`))
    .map((entry) => {
      const identity = fileContentIdentity(repoRoot, entry.path);
      const origIdentity = entry.origPath ? fileContentIdentity(repoRoot, entry.origPath) : "";
      return `${entry.code}\0${entry.path}\0${entry.origPath ?? ""}\0${identity}\0${origIdentity}`;
    });
  return sha256Hex(lines.join("\n"));
}

export function listNameStatusBetween(repoRoot: string, fromHead: string, toHead: string): PorcelainEntry[] | null {
  const result = runProcess("git", ["diff", "--name-status", "-z", fromHead, toHead], { cwd: repoRoot });
  if (result.error || (result.status ?? 1) !== 0) {
    return null;
  }
  return parseNameStatusZ(result.stdout ?? "");
}

export function parseNameStatusZ(output: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  const parts = output.split("\0");
  let index = 0;
  while (index < parts.length) {
    const status = (parts[index] ?? "").trim();
    index += 1;
    if (!status) {
      continue;
    }
    const code = status.slice(0, 1);
    if (code === "R" || code === "C") {
      const origPath = toPosix(parts[index] ?? "").replace(/\\/g, "/");
      index += 1;
      const pathName = toPosix(parts[index] ?? "").replace(/\\/g, "/");
      index += 1;
      if (origPath && pathName) {
        entries.push({ code: status.slice(0, 2) || code, path: pathName, origPath });
      }
      continue;
    }
    const pathName = toPosix(parts[index] ?? "").replace(/\\/g, "/");
    index += 1;
    if (pathName) {
      entries.push({ code, path: pathName });
    }
  }
  return entries;
}

export function computeLiveChangeDigest(repoRoot: string, entries?: PorcelainEntry[]): string {
  return computeChangeDigest(repoRoot, entries ?? listChangedEntries(repoRoot));
}

export function computeChangeDigest(repoRoot: string, entries: PorcelainEntry[]): string {
  const diff = gitDiffHead(repoRoot);
  const lines = [`diff:${sha256Hex(diff)}`];
  const seen = new Set<string>();
  const ordered = [...entries].sort((a, b) => {
    const left = `${a.origPath ?? ""}:${a.path}`;
    const right = `${b.origPath ?? ""}:${b.path}`;
    return left.localeCompare(right);
  });
  for (const entry of ordered) {
    const key = `${entry.code}:${entry.origPath ?? ""}:${entry.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const identity = fileContentIdentity(repoRoot, entry.path);
    const origIdentity = entry.origPath ? fileContentIdentity(repoRoot, entry.origPath) : "";
    lines.push(`${entry.path}:${entry.code}:${entry.origPath ?? ""}:${identity}:${origIdentity}`);
  }
  return sha256Hex(lines.join("\n"));
}
