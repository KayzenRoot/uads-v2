import fs from "node:fs";
import path from "node:path";
import { runProcess } from "./exec.js";
import { sanitizeRemoteUrl } from "./sanitize-url.js";

export type GitSummary = {
  available: boolean;
  repoRoot: string | null;
  branch: string | null;
  head: string | null;
  originUrl: string | null;
  status: string;
  diff: string;
  log: string;
};

function runGit(args: string[], cwd: string): string {
  const result = runProcess("git", args, { cwd });
  if (result.error || (result.status ?? 1) !== 0) {
    throw result.error ?? new Error((result.stderr || "git failed").trim());
  }
  return (result.stdout || "").trim();
}

export function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    const gitPath = path.join(current, ".git");
    if (fs.existsSync(gitPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function gitAvailable(): boolean {
  try {
    runGit(["--version"], process.cwd());
    return true;
  } catch {
    return false;
  }
}

export function readGitSummary(cwd: string): GitSummary {
  const available = gitAvailable();
  const repoRoot = findGitRoot(cwd);

  if (!available || !repoRoot) {
    return {
      available,
      repoRoot,
      branch: null,
      head: null,
      originUrl: null,
      status: available ? "Not a git repository." : "git is not available on PATH.",
      diff: "",
      log: "",
    };
  }

  const safe = (args: string[]): string => {
    try {
      return runGit(args, repoRoot);
    } catch {
      return "";
    }
  };

  return {
    available,
    repoRoot,
    branch: safe(["rev-parse", "--abbrev-ref", "HEAD"]) || null,
    head: safe(["rev-parse", "HEAD"]) || null,
    originUrl: sanitizeRemoteUrl(safe(["remote", "get-url", "origin"]) || null),
    status: safe(["status", "--porcelain=v1", "-uall"]) || "(clean)",
    diff: safe(["diff", "HEAD"]),
    log: safe(["log", "-20", "--oneline"]) || "(no commits yet)",
  };
}
