import { describe, expect, it } from "vitest";
import { runDispatch, runFinalize, runVerify } from "../src/kernel/execution.js";
import { runResume } from "../src/kernel/orchestrator.js";
import { runStatus } from "../src/commands/status.js";
import { tempDirs } from "./helpers.js";
import { approveAll, assertZpf, implement, planFrontend, recordGates, seedFrontend } from "./execution-helpers.js";

describe("execution happy path", { timeout: 120_000 }, () => {
  it("runs plan -> dispatch -> verify -> review -> finalize on a clean fixture", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    expect(dispatched.run.phase).toBe("implement");
    implement(repo);
    const verified = runVerify({ cwd: repo, uadsHome: home });
    expect(verified.run.currentChangeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(verified.run.changedFiles).toContain("src/button.css");
    recordGates(repo, home, planned.workOrder.qualityGates);
    approveAll(repo, home, planned.workOrder.assuranceReviewers);
    const finalized = runFinalize({ cwd: repo, uadsHome: home });
    expect(finalized.run.status).toBe("completed");
    const resumed = runResume({ cwd: repo, uadsHome: home });
    expect(resumed.status).toBe("completed");
    expect(resumed.executionRunId).toBe(finalized.run.executionRunId);
    expect(runStatus(repo, { uadsHome: home, json: true })).toContain(finalized.run.executionRunId);
    assertZpf(repo);
  });
});
