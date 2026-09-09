import { computeProjectFingerprint } from "../lib/fingerprint.js";
import { readGitSummary } from "../lib/git.js";
import { ensureWorkspace, type UadsPaths } from "../lib/workspace.js";
import { readOrCreateProfile } from "../lib/workspace.js";

export type ProjectContext = {
  repoRoot: string;
  projectId: string;
  fingerprint: ReturnType<typeof computeProjectFingerprint>;
  paths: UadsPaths;
};

export function resolveProjectContext(cwd: string, uadsHome?: string): ProjectContext {
  const git = readGitSummary(cwd);
  const repoRoot = git.repoRoot ?? cwd;
  const fingerprint = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot });
  const paths = ensureWorkspace(fingerprint.projectId, uadsHome);
  readOrCreateProfile(paths, {
    projectId: fingerprint.projectId,
    fingerprint: fingerprint.fingerprint,
    fingerprintSource: fingerprint.source,
    repoRoot,
  });
  return { repoRoot, projectId: fingerprint.projectId, fingerprint, paths };
}
