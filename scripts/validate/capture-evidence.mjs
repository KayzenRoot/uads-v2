#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNpm } from "../lib/exec.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist/lib/evidence.js");
if (!fs.existsSync(dist)) {
  const build = runNpm(["run", "build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const { captureFoundationEvidence } = await import("../../dist/lib/evidence.js");
const { computeProjectFingerprint } = await import("../../dist/lib/fingerprint.js");
const { readGitSummary } = await import("../../dist/lib/git.js");
const { ensureWorkspace } = await import("../../dist/lib/workspace.js");

const git = readGitSummary(root);
const fingerprint = computeProjectFingerprint({
  originUrl: git.originUrl,
  repoRoot: git.repoRoot ?? root,
});
const paths = ensureWorkspace(fingerprint.projectId, process.env.UADS_HOME);
const result = captureFoundationEvidence({ cwd: root, paths });
process.stdout.write(`evidence: ${result.evidenceDir}\n`);
process.stdout.write(`failed: ${result.failed}\n`);
process.exit(result.failed ? 1 : 0);
