import { describe, expect, it } from "vitest";
import {
  containsAbsoluteHostPath,
  redactHostPaths,
  sanitizeReviewText,
} from "../src/lib/secrets.js";
import { createReviewBundle } from "../src/lib/review-bundle.js";
import { readZip } from "../src/lib/zip-read.js";
import { initRepo, tempDirs, writeFullEvidence } from "./helpers.js";
import fs from "node:fs";
import path from "node:path";

async function zipHaystack(zipPath: string): Promise<string> {
  const entries = await readZip(zipPath);
  return entries.map((entry) => `${entry.name}\n${entry.content.toString("utf8")}`).join("\n");
}

describe("host path privacy", () => {
  it("redacts Windows drive paths with both slash styles", () => {
    expect(redactHostPaths("failed at D:/Projects/uads/tests/foo.test.ts")).toContain("[REDACTED-PATH]");
    expect(redactHostPaths("failed at D:/Projects/uads/tests/foo.test.ts")).not.toContain("D:/Projects/uads");
    expect(redactHostPaths("failed at C:\\Projects\\uads\\src\\cli.ts")).toContain("[REDACTED-PATH]");
    expect(redactHostPaths("failed at C:\\Projects\\uads\\src\\cli.ts")).not.toContain("C:\\Projects\\uads");
  });

  it("redacts Windows user home paths", () => {
    expect(redactHostPaths("cwd C:/Users/example/project")).toBe("cwd [REDACTED-HOME]");
    expect(redactHostPaths("cwd C:\\Users\\example\\project")).toBe("cwd [REDACTED-HOME]");
  });

  it("redacts UNC paths", () => {
    expect(redactHostPaths("repo \\\\server\\share\\repo")).toContain("[REDACTED-UNC]");
    expect(redactHostPaths("repo \\\\server\\share\\repo")).not.toContain("\\\\server\\share\\repo");
  });

  it("redacts Unix home paths", () => {
    expect(redactHostPaths("file /home/example/repo/src/cli.ts")).toContain("[REDACTED-HOME]");
    expect(redactHostPaths("file /home/example/repo/src/cli.ts")).not.toContain("/home/example/repo");
    expect(redactHostPaths("file /Users/example/repo/src/cli.ts")).toContain("[REDACTED-HOME]");
    expect(redactHostPaths("file /Users/example/repo/src/cli.ts")).not.toContain("/Users/example/repo");
  });

  it("does not treat sidecar:// or https:// as Windows drive paths", () => {
    const sidecar = '{"sidecar":"sidecar://workspaces/abc123abc123abcd"}';
    expect(redactHostPaths(sidecar)).toContain("sidecar://workspaces/abc123abc123abcd");
    expect(redactHostPaths("origin https://github.com/KayzenRoot/uads")).toContain(
      "https://github.com/KayzenRoot/uads",
    );
    expect(containsAbsoluteHostPath(sidecar)).toBe(false);
  });

  it("detects unredacted host paths independently of the sanitizer", () => {
    expect(containsAbsoluteHostPath("D:/Projects/uads")).toBe(true);
    expect(containsAbsoluteHostPath("C:\\Projects\\uads")).toBe(true);
    expect(containsAbsoluteHostPath("/home/example/repo")).toBe(true);
    expect(containsAbsoluteHostPath("/Users/example/repo")).toBe(true);
    expect(containsAbsoluteHostPath("[REDACTED-PATH] [REDACTED-HOME] [REDACTED-UNC]")).toBe(false);
  });

  it("does not expose the real temporary repo path in the final ZIP", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    const probe = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const evidenceDir = path.join(home, "workspaces", probe.manifest.projectId, "evidence");
    const leaked = [
      `repo ${repo}`,
      `posix ${repo.replace(/\\/g, "/")}`,
      `home ${home}`,
      "ok tests.txt",
    ].join("\n");
    writeFullEvidence(evidenceDir, leaked);
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: true });
    const haystack = await zipHaystack(result.zipPath);
    expect(haystack).not.toContain(repo);
    expect(haystack).not.toContain(repo.replace(/\\/g, "/"));
    expect(haystack).not.toContain(home);
    expect(haystack).not.toContain(home.replace(/\\/g, "/"));
    expect(containsAbsoluteHostPath(haystack)).toBe(false);
    expect(sanitizeReviewText(leaked, [repo, home]).text).not.toContain(repo);
  });
});
