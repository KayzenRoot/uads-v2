import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExecutionBlockedError, runDispatch, runEvidenceRecord, runFinalize, runVerify } from "../src/kernel/execution.js";
import { runPlan as plan } from "../src/kernel/orchestrator.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";
import { frontendIntake } from "./execution-helpers.js";

function seed(repo: string): void {
  initRepo(repo, "https://github.com/example/uads-exec-gates.git");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: blue; }\n");
  gitCommit(repo, "init");
}

describe("execution gate evidence", { timeout: 120_000 }, () => {
  it("rejects PASS command evidence with a non-zero exit code and keeps FAIL visible", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = plan({ cwd: repo, uadsHome: home, intake: frontendIntake });
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "button.css"), "button { color: red; }\n");
    runVerify({ cwd: repo, uadsHome: home });
    expect(() =>
      runEvidenceRecord({
        cwd: repo,
        uadsHome: home,
        gateId: planned.workOrder.qualityGates[0] ?? "static",
        kind: "command",
        role: "test-engineer",
        command: "npm test",
        exitCode: 1,
        status: "PASS",
        summary: "lie",
      }),
    ).toThrow(/non-zero/i);
    const failed = runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: planned.workOrder.qualityGates[0] ?? "static",
      kind: "command",
      role: "test-engineer",
      command: "npm test",
      exitCode: 1,
      summary: "failed tests",
    });
    expect(failed.record.status).toBe("FAIL");
    expect(failed.gateStates.some((gate) => gate.status === "FAIL")).toBe(true);
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(ExecutionBlockedError);
  });

  it("does not let an unknown gate satisfy a selected gate", () => {
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
        gateId: "not-a-real-gate",
        kind: "command",
        role: "test-engineer",
        command: "true",
        exitCode: 0,
        summary: "spoof",
      }),
    ).toThrow(/unknown gate/i);
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/pending gate|finalize refused/i);
  });
});
