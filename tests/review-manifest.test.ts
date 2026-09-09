import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createReviewBundle } from "../src/lib/review-bundle.js";

function initRepo(root: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "uads@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "UADS Tests"], { cwd: root });
}

describe("review manifest and bundle", () => {
  it("writes a manifest, zip, and checksum outside the project", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-review-proj-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-review-home-"));
    const resolvedPackageRoot = path.resolve(".");

    initRepo(repo);
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    fs.writeFileSync(path.join(repo, "VERSION"), "0.1.0\n");
    fs.writeFileSync(path.join(repo, ".env"), "SECRET=do-not-pack\n");
    fs.writeFileSync(path.join(repo, "id_rsa"), "fake-private-key\n");
    fs.mkdirSync(path.join(repo, "node_modules", "dep"), { recursive: true });
    fs.writeFileSync(path.join(repo, "node_modules", "dep", "index.js"), "module.exports = 1;\n");
    fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
    fs.writeFileSync(path.join(repo, "docs", "04-ARCHITECTURE.md"), "architecture freeze v0.2\n");

    const result = await createReviewBundle({
      cwd: repo,
      uadsHome: home,
      uadsPackageRoot: resolvedPackageRoot,
      requireEvidence: false,
    });

    expect(result.zipPath.startsWith(home)).toBe(true);
    expect(result.zipPath.includes(repo)).toBe(false);
    expect(fs.existsSync(result.zipPath)).toBe(true);
    expect(fs.existsSync(result.checksumPath)).toBe(true);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.readFileSync(result.checksumPath, "utf8")).toContain(result.sha256);

    expect(result.manifest.schema).toBe("uads.review-manifest");
    expect(result.manifest.projectId).toHaveLength(16);
    expect(result.manifest.sidecar).toMatch(/^sidecar:\/\//);
    expect(result.manifest).not.toHaveProperty("repoRoot");
    expect(result.manifest).not.toHaveProperty("workspace");
    expect(result.manifest.includedFiles).toContain("README.md");
    expect(result.manifest.includedFiles).toContain("docs/04-ARCHITECTURE.md");
    expect(result.manifest.includedFiles.some((file) => file.includes(".env"))).toBe(false);
    expect(result.manifest.includedFiles.some((file) => file.includes("id_rsa"))).toBe(false);
    expect(result.manifest.includedFiles.some((file) => file.includes("node_modules"))).toBe(false);
    expect(result.manifest.includedFiles.some((file) => file.startsWith(".git/"))).toBe(false);
  });
});
