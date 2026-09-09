import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EVIDENCE_FILE_NAMES } from "../src/lib/evidence.js";
import type { ValidationSummary } from "../src/lib/evidence.js";

export const FIXTURE_PASSWORD = "SuperSecretPassw0rd";
export const FIXTURE_GITHUB_TOKEN = `ghp_${"a".repeat(36)}`;
export const FIXTURE_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAlwAAAAdzc2gtcn
UADSFAKEPRIVATEKEYMATERIALNOTAREALSECRETVALUEXXXXXXXXXXXX
-----END OPENSSH PRIVATE KEY-----`;

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "UADS Tests",
  GIT_AUTHOR_EMAIL: "uads@example.com",
  GIT_COMMITTER_NAME: "UADS Tests",
  GIT_COMMITTER_EMAIL: "uads@example.com",
};

export function initRepo(root: string, originUrl?: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: root, env: gitEnv });
  execFileSync("git", ["-c", "user.email=uads@example.com", "-c", "user.name=UADS Tests", "config", "commit.gpgsign", "false"], {
    cwd: root,
    env: gitEnv,
  });
  if (originUrl) {
    execFileSync("git", ["remote", "add", "origin", originUrl], { cwd: root, env: gitEnv });
  }
}

export function gitCommit(root: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: root, env: gitEnv });
  execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "user.email=uads@example.com", "-c", "user.name=UADS Tests", "commit", "-m", message],
    { cwd: root, env: gitEnv },
  );
}

export function tempDirs(): { repo: string; home: string } {
  return {
    repo: fs.mkdtempSync(path.join(os.tmpdir(), "uads-proj-")),
    home: fs.mkdtempSync(path.join(os.tmpdir(), "uads-home-")),
  };
}

export function writeFullEvidence(evidenceDir: string, extra = ""): void {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const summary: ValidationSummary = {
    schema: "uads.validation-summary",
    schemaVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, npm: "npm test", os: os.platform() },
    commands: EVIDENCE_FILE_NAMES.filter((name) => name !== "validation-summary.json").map((name) => ({
      id: name.replace(/\.txt$/, ""),
      command: `npm run ${name.replace(/\.txt$/, "")}`,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 1,
      exitCode: 0,
      status: "PASS",
      toolVersion: "npm test",
      outputArtifact: `evidence/${name}`,
    })),
  };
  fs.writeFileSync(path.join(evidenceDir, "validation-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  for (const name of EVIDENCE_FILE_NAMES) {
    if (name === "validation-summary.json") {
      continue;
    }
    fs.writeFileSync(path.join(evidenceDir, name), `ok ${name}\n${extra}`);
  }
}
