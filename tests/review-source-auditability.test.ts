import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createReviewBundle } from "../src/lib/review-bundle.js";
import { readZip } from "../src/lib/zip-read.js";
import { initRepo, tempDirs } from "./helpers.js";

describe("source auditability", () => {
  it("includes ordinary source whose names mention secrets, tokens, passwords, or credentials", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.mkdirSync(path.join(repo, "src", "lib"), { recursive: true });
    fs.mkdirSync(path.join(repo, "src", "auth"), { recursive: true });
    fs.mkdirSync(path.join(repo, "tests"), { recursive: true });
    fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "lib", "secrets.ts"), "export const redact = true;\n");
    fs.writeFileSync(path.join(repo, "src", "auth", "token-service.ts"), "export const issue = true;\n");
    fs.writeFileSync(path.join(repo, "tests", "password-policy.test.ts"), "export const policy = true;\n");
    fs.writeFileSync(path.join(repo, "docs", "credential-handling.md"), "# credential handling\n");
    fs.writeFileSync(path.join(repo, ".env"), "SECRET=do-not-pack\n");
    fs.writeFileSync(path.join(repo, "id_rsa"), "fake-private-key\n");
    fs.writeFileSync(path.join(repo, "secrets.json"), "{\"token\":\"n\"}\n");

    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const names = (await readZip(result.zipPath)).map((entry) => entry.name);

    expect(names).toContain("project/src/lib/secrets.ts");
    expect(names).toContain("project/src/auth/token-service.ts");
    expect(names).toContain("project/tests/password-policy.test.ts");
    expect(names).toContain("project/docs/credential-handling.md");
    expect(names.some((name) => name.includes(".env"))).toBe(false);
    expect(names.some((name) => name.includes("id_rsa"))).toBe(false);
    expect(names.some((name) => name.endsWith("secrets.json"))).toBe(false);

    expect(result.manifest.includedFiles).toContain("src/lib/secrets.ts");
    expect(result.manifest.skipped.some((entry) => entry.path === ".env")).toBe(true);
    expect(result.manifest.skipped.some((entry) => entry.path === "id_rsa")).toBe(true);
    expect(result.manifest.skipped.some((entry) => entry.path === "secrets.json")).toBe(true);
    expect(JSON.stringify(result.manifest.skipped)).not.toContain("do-not-pack");
    expect(result.manifest.excludedDirectoryClasses).toContain(".git/");
  });
});
