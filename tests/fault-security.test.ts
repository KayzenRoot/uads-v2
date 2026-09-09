import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPlan } from "../src/kernel/orchestrator.js";
import { diagnoseFailure, recordFailure } from "../src/kernel/fault-localization.js";
import { collectFailureSnapshot, failurePaths } from "../src/kernel/failure-persist.js";
import { createReviewBundle } from "../src/lib/review-bundle.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../src/lib/secrets.js";
import { readZip } from "../src/lib/zip-read.js";
import { getUadsPaths } from "../src/lib/workspace.js";
import { FIXTURE_GITHUB_TOKEN, FIXTURE_PRIVATE_KEY, gitCommit, initRepo, tempDirs } from "./helpers.js";

function write(root: string, rel: string, contents: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

describe("fault security", () => {
  it("redacts tokens and host paths from persist, diagnosis, memory, and review ZIP", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-fault-sec.git");
    write(repo, "src/ui/Button.tsx", `export const Button = () => "ok";\n`);
    write(repo, "src/ui/Button.test.tsx", `import { Button } from "./Button";\nexport const t = Button;\n`);
    write(repo, "package.json", `${JSON.stringify({ name: "fault-sec", version: "1.0.0" }, null, 2)}\n`);
    gitCommit(repo, "init");
    const planned = runPlan({
      cwd: repo,
      uadsHome: home,
      intake: {
        schema: "uads.intake",
        schemaVersion: "0.2.0",
        objective: "Change the primary button color.",
        domainSignals: ["frontend"],
        affectedAreas: ["src/ui"],
        inScope: ["src/ui"],
        outOfScope: [],
        acceptanceCriteria: ["ok"],
        classifier: "host-structured",
      },
    });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const abs = path.join(repo, "src/ui/Button.tsx");
    const unixHome = "/Users/secret-user/proj/src/ui/Button.tsx";
    const inputPath = path.join(paths.workspace, "incoming-fail.txt");
    const raw = [
      `token ${FIXTURE_GITHUB_TOKEN}`,
      FIXTURE_PRIVATE_KEY,
      `at run (${abs}:1:1)`,
      `also ${unixHome}`,
    ].join("\n");
    fs.writeFileSync(inputPath, raw);
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: raw,
    });
    const report = diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: record.failureRecordId,
    });
    const blobs = [
      JSON.stringify(record),
      JSON.stringify(report),
      fs.readFileSync(failurePaths(paths).memory, "utf8"),
      ...collectFailureSnapshot(paths).map((item) => item.content),
    ];
    for (const blob of blobs) {
      expect(blob).not.toContain(FIXTURE_GITHUB_TOKEN);
      expect(containsUnredactedSecret(blob)).toBe(false);
      expect(containsAbsoluteHostPath(blob)).toBe(false);
      expect(blob).not.toContain(unixHome);
      expect(record.signature).not.toContain(FIXTURE_GITHUB_TOKEN);
    }
    expect(fs.existsSync(inputPath)).toBe(true);
    expect(fs.existsSync(path.join(paths.workspace, "failures", "incoming-fail.txt"))).toBe(false);
    const zip = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    const entries = await readZip(zip.zipPath);
    const names = entries.map((entry) => entry.name);
    expect(names).toContain("failures/failure-summary.json");
    expect(names).toContain("failures/diagnosis-summary.json");
    expect(names).toContain("failures/memory-summary.json");
    expect(names.some((name) => name.includes("incoming-fail.txt"))).toBe(false);
    for (const name of ["failures/failure-summary.json", "failures/diagnosis-summary.json", "failures/memory-summary.json"]) {
      const text = entries.find((entry) => entry.name === name)?.content.toString("utf8") ?? "";
      expect(text).not.toContain(FIXTURE_GITHUB_TOKEN);
      expect(containsUnredactedSecret(text)).toBe(false);
      expect(containsAbsoluteHostPath(text)).toBe(false);
    }
  });
});
