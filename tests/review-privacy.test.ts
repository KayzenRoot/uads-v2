import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createReviewBundle } from "../src/lib/review-bundle.js";
import { initRepo, tempDirs } from "./helpers.js";

describe("review privacy", () => {
  it("does not serialize absolute repo or sidecar paths in the shareable manifest", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    expect(result.manifest).not.toHaveProperty("repoRoot");
    expect(result.manifest).not.toHaveProperty("workspace");
    expect(result.manifest.sidecar).toBe(`sidecar://workspaces/${result.manifest.projectId}`);
    expect(result.manifest.repositoryName).toBe(path.basename(repo));
    const serialized = JSON.stringify(result.manifest);
    expect(serialized).not.toContain(repo);
    expect(serialized).not.toContain(home);
    expect(serialized).not.toMatch(/[A-Za-z]:\\/);
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/\/home\//);
  });
});
