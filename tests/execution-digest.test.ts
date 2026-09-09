import { describe, expect, it } from "vitest";
import { runDispatch, runFinalize, runVerify } from "../src/kernel/execution.js";
import { tempDirs } from "./helpers.js";
import { approveAll, implement, planFrontend, recordGates, seedFrontend } from "./execution-helpers.js";

describe("execution digest binding", { timeout: 120_000 }, () => {
  it("changes digest after edits and invalidates stale evidence/reviews", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo);
    const first = runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    approveAll(repo, home, planned.workOrder.assuranceReviewers);
    implement(repo, "src/button.css", "button { color: green; }\n");
    const second = runVerify({ cwd: repo, uadsHome: home });
    expect(second.changeSet.digest).not.toBe(first.changeSet.digest);
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/pending gate|missing independent review|finalize refused/i);
  });
});
