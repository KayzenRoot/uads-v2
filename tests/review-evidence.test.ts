import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  statusFromExit,
  writeValidationSummary,
  type ValidationSummary,
} from "../src/lib/evidence.js";
import { inspectReviewBundle } from "../src/lib/inspect-review.js";
import { createReviewBundle } from "../src/lib/review-bundle.js";
import { readZip } from "../src/lib/zip-read.js";
import { initRepo, tempDirs, writeFullEvidence } from "./helpers.js";

describe("review evidence", () => {
  it("includes sidecar validation artifacts under evidence/ with a truthful summary", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    const probe = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const evidenceDir = path.join(home, "workspaces", probe.manifest.projectId, "evidence");
    writeFullEvidence(evidenceDir);
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: true });
    const names = (await readZip(result.zipPath)).map((entry) => entry.name);
    expect(names).toContain("evidence/validation-summary.json");
    expect(names).toContain("evidence/npm-ci.txt");
    expect(names).toContain("evidence/lint.txt");
    expect(names).toContain("evidence/typecheck.txt");
    expect(names).toContain("evidence/build.txt");
    expect(names).toContain("evidence/tests.txt");
    expect(names).toContain("evidence/orchestrator-eval.txt");
    expect(names).toContain("evidence/execution-eval.txt");
    expect(names).toContain("evidence/context-eval.txt");
    expect(names).toContain("evidence/skills-validation.txt");
    expect(names).toContain("evidence/foundation-validation.txt");
    expect(names).toContain("evidence/npm-audit.txt");

    const summaryEntry = (await readZip(result.zipPath)).find(
      (entry) => entry.name === "evidence/validation-summary.json",
    );
    expect(summaryEntry).toBeTruthy();
    const summary = JSON.parse(summaryEntry!.content.toString("utf8")) as ValidationSummary;
    expect(summary.commands.length).toBeGreaterThan(0);
    for (const command of summary.commands) {
      expect(command.command.length).toBeGreaterThan(0);
      expect(command.status === "PASS" || command.status === "FAIL" || command.status === "NOT_RUN").toBe(true);
      if (command.status === "PASS") {
        expect(command.exitCode).toBe(0);
      }
    }

    const inspection = await inspectReviewBundle(result.zipPath, { requireEvidence: true });
    expect(inspection.ok).toBe(true);
  });

  it("cannot record PASS for a failed command", () => {
    expect(statusFromExit(1, true)).toBe("FAIL");
    expect(statusFromExit(0, true)).toBe("PASS");
    expect(statusFromExit(null, false)).toBe("NOT_RUN");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-summary-"));
    const summary: ValidationSummary = {
      schema: "uads.validation-summary",
      schemaVersion: "0.1.0",
      generatedAt: new Date().toISOString(),
      runtime: { node: "test", npm: "test", os: "test" },
      commands: [
        {
          id: "lint",
          command: "npm run lint",
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 1,
          exitCode: 1,
          status: "PASS",
          toolVersion: "test",
          outputArtifact: "evidence/lint.txt",
        },
      ],
    };
    expect(() => writeValidationSummary(dir, summary)).toThrow(/cannot record PASS/);
  });
});
