import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeProjectFingerprint } from "../src/lib/fingerprint.js";
import { createReviewBundle } from "../src/lib/review-bundle.js";
import { sanitizeRemoteUrl } from "../src/lib/sanitize-url.js";
import { isPlaceholderSecret, redactSecrets } from "../src/lib/secrets.js";
import { readZip } from "../src/lib/zip-read.js";
import {
  FIXTURE_GITHUB_TOKEN,
  FIXTURE_PASSWORD,
  FIXTURE_PRIVATE_KEY,
  gitCommit,
  initRepo,
  tempDirs,
  writeFullEvidence,
} from "./helpers.js";

async function zipHaystack(zipPath: string): Promise<string> {
  const entries = await readZip(zipPath);
  return entries.map((entry) => `${entry.name}\n${entry.content.toString("utf8")}`).join("\n");
}

describe("review security", () => {
  it("sanitizes HTTPS remotes containing user:password", () => {
    const sanitized = sanitizeRemoteUrl(
      `https://user:${FIXTURE_PASSWORD}@github.com/KayzenRoot/uads.git`,
    );
    expect(sanitized).toBe("https://github.com/KayzenRoot/uads");
    expect(sanitized).not.toContain(FIXTURE_PASSWORD);
  });

  it("does not leak a token-bearing remote into the manifest or ZIP", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, `https://${FIXTURE_GITHUB_TOKEN}@github.com/KayzenRoot/uads.git`);
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    expect(result.manifest.git.originUrl).toBe("https://github.com/KayzenRoot/uads");
    expect(JSON.stringify(result.manifest)).not.toContain(FIXTURE_GITHUB_TOKEN);
    const haystack = await zipHaystack(result.zipPath);
    expect(haystack).not.toContain(FIXTURE_GITHUB_TOKEN);
    expect(computeProjectFingerprint({ originUrl: result.manifest.git.originUrl, repoRoot: repo }).source).toBe(
      "remote",
    );
  });

  it("redacts a private key block inside an innocently named text file", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(
      path.join(repo, "notes.txt"),
      `project notes for auditors\nkeep this surrounding text\n${FIXTURE_PRIVATE_KEY}\nmore notes after the block\n`,
    );
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const haystack = await zipHaystack(result.zipPath);
    expect(haystack).not.toContain("UADSFAKEPRIVATEKEYMATERIALNOTAREALSECRETVALUE");
    expect(haystack).toMatch(/REDACTED:private-key|omitted-unsanitizable-secret/);
  });

  it("redacts a high-confidence API token in an innocently named source file", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "config.ts"), `export const token = "${FIXTURE_GITHUB_TOKEN}";\n`);
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const haystack = await zipHaystack(result.zipPath);
    expect(haystack).not.toContain(FIXTURE_GITHUB_TOKEN);
    expect(haystack).toContain("[REDACTED:github-token]");
  });

  it("does not leak a secret from git diff", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "notes.txt"), "hello\n");
    gitCommit(repo, "initial");
    fs.appendFileSync(path.join(repo, "notes.txt"), `token=${FIXTURE_GITHUB_TOKEN}\n`);
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const haystack = await zipHaystack(result.zipPath);
    expect(haystack).not.toContain(FIXTURE_GITHUB_TOKEN);
  });

  it("does not leak a secret from captured validation output", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    const resultProbe = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const evidenceDir = path.join(home, "workspaces", resultProbe.manifest.projectId, "evidence");
    writeFullEvidence(evidenceDir, `leaked ${FIXTURE_GITHUB_TOKEN}\n`);
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: true });
    const haystack = await zipHaystack(result.zipPath);
    expect(haystack).not.toContain(FIXTURE_GITHUB_TOKEN);
    expect(haystack).toContain("evidence/tests.txt");
  });

  it("never echoes secret values into skipped reasons", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "only-key.txt"), `${FIXTURE_PRIVATE_KEY}\n`);
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const serialized = JSON.stringify(result.manifest.skipped);
    expect(serialized).not.toContain("UADSFAKEPRIVATEKEYMATERIALNOTAREALSECRETVALUE");
    expect(serialized).not.toContain(FIXTURE_GITHUB_TOKEN);
    expect(serialized).not.toContain(FIXTURE_PASSWORD);
  });

  it("leaves placeholder/example values alone unless they match a strong signature", () => {
    expect(isPlaceholderSecret("changeme")).toBe(true);
    expect(isPlaceholderSecret("${API_KEY}")).toBe(true);
    const result = redactSecrets("password=changeme\nAPI_KEY=example\n");
    expect(result.redactionCount).toBe(0);
  });
});
