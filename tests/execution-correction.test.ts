import { describe, expect, it } from "vitest";
import { runAssuranceRecord, runAssuranceStart, runDispatch, runFinalize, runVerify } from "../src/kernel/execution.js";
import { tempDirs } from "./helpers.js";
import { approveAll, implement, planFrontend, recordGates, seedFrontend } from "./execution-helpers.js";

describe("execution correction loop", { timeout: 120_000 }, () => {
  it("returns to implementation on CORRECTION_NEEDED and increments attempt", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo);
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    runAssuranceStart({ cwd: repo, uadsHome: home });
    const corrected = runAssuranceRecord({
      cwd: repo,
      uadsHome: home,
      role: "independent-reviewer",
      session: "rev-1",
      implementerSession: "imp-1",
      verdict: "CORRECTION_NEEDED",
      summary: "change the comment",
    });
    expect(corrected.run.status).toBe("correction_needed");
    expect(corrected.run.attempt).toBe(2);
    expect(corrected.run.phase).toBe("implement");
    implement(repo, "src/button.css", "button { color: purple; }\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    expect(verified.run.currentChangeDigest).not.toBe(corrected.record.changeDigest);
    recordGates(repo, home, planned.workOrder.qualityGates);
    approveAll(repo, home, planned.workOrder.assuranceReviewers);
    expect(runFinalize({ cwd: repo, uadsHome: home }).run.status).toBe("completed");
  });
});
