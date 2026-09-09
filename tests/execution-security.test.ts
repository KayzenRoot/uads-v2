import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDispatch, runEvidenceRecord, runVerify } from "../src/kernel/execution.js";
import { runPlan as plan } from "../src/kernel/orchestrator.js";
import { assertSafeRelativeProjectPath } from "../src/kernel/safe-path.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";
import { frontendIntake } from "./execution-helpers.js";

function seed(repo: string): void {
  initRepo(repo, "https://github.com/example/uads-exec-sec.git");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: blue; }\n");
  gitCommit(repo, "init");
}

describe("execution security", { timeout: 120_000 }, () => {
  it("rejects path traversal and does not persist absolute host paths", () => {
    expect(() => assertSafeRelativeProjectPath("../secret")).toThrow(/traversal/i);
    expect(() => assertSafeRelativeProjectPath("C:\\\\Windows\\\\x")).toThrow(/drive|absolute/i);
    expect(() => assertSafeRelativeProjectPath("\\\\server\\share")).toThrow(/UNC|absolute/i);
    const { repo, home } = tempDirs();
    seed(repo);
    plan({ cwd: repo, uadsHome: home, intake: frontendIntake });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    expect(() =>
      runEvidenceRecord({
        cwd: repo,
        uadsHome: home,
        gateId: "static",
        kind: "command",
        role: "test-engineer",
        command: "npm test",
        exitCode: 0,
        outputPath: path.join("..", "escape.txt"),
        summary: "nope",
      }),
    ).toThrow(/traversal/i);
  });

  it("redacts synthetic secrets in evidence summaries and does not execute recorded commands", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    plan({ cwd: repo, uadsHome: home, intake: frontendIntake });
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    expect(dispatched.run.projectId).toBeTruthy();
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    const pwned = path.join(repo, "PWNED.txt");
    const outputPath = path.join(home, "static-out.txt");
    fs.writeFileSync(outputPath, "static ok\n");
    const recorded = runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: "static",
      kind: "command",
      role: "test-engineer",
      command: `node -e "require('fs').writeFileSync('PWNED.txt','pwned')"`,
      exitCode: 0,
      outputPath,
      summary: `token ghp_${"a".repeat(36)}`,
    });
    expect(fs.existsSync(pwned)).toBe(false);
    expect(recorded.record.summary).toContain("[REDACTED:github-token]");
    expect(recorded.record.summary).not.toContain("ghp_");
    expect(JSON.stringify(recorded.record)).not.toMatch(/sidecar:\/\/[A-Za-z]:/);
    expect(recorded.record.outputRef ?? "sidecar://x").toMatch(/^sidecar:\/\//);
  });

  it("never calls git reset, stash, or clean from the execution engine", () => {
    const source =
      fs.readFileSync(path.join("src", "kernel", "execution.ts"), "utf8") +
      fs.readFileSync(path.join("src", "kernel", "change-digest.ts"), "utf8");
    expect(source).not.toMatch(/git["'\]].*reset/);
    expect(source).not.toMatch(/["']stash["']/);
    expect(source).not.toMatch(/["']clean["']/);
  });
});
