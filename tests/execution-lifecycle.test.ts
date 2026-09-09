import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listCanonicalAgentFiles } from "../src/adapters/cursor-agents.js";
import { SPECIALISTS } from "../src/kernel/routing.js";
import { ExecutionBlockedError, runDispatch, runFinalize, runVerify } from "../src/kernel/execution.js";
import { tempDirs } from "./helpers.js";
import { implement, planFrontend, recordGates, seedFrontend } from "./execution-helpers.js";

describe("execution lifecycle guards", { timeout: 120_000 }, () => {
  it("rejects dispatch without a plan and verify before dispatch", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    expect(() => runDispatch({ cwd: repo, uadsHome: home })).toThrow(/planned Work Order/i);
    expect(() => runVerify({ cwd: repo, uadsHome: home })).toThrow(/dispatch has not succeeded|no active execution run/i);
  });

  it("blocks dispatch on a pre-existing dirty worktree without mutating user files", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    planFrontend(repo, home);
    const dirty = path.join(repo, "src", "keep-me.css");
    fs.writeFileSync(dirty, "keep\n");
    expect(() => runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" })).toThrow(ExecutionBlockedError);
    expect(fs.readFileSync(dirty, "utf8")).toBe("keep\n");
    expect(fs.existsSync(dirty)).toBe(true);
  });

  it("refuses finalize before gates and before independent review", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo);
    runVerify({ cwd: repo, uadsHome: home });
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/pending gate|independent review|finalize refused/i);
    recordGates(repo, home, planned.workOrder.qualityGates);
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/independent review|finalize refused/i);
  });

  it("covers every selectable core specialist with a canonical agent file", () => {
    const files = listCanonicalAgentFiles(path.resolve("."));
    for (const specialist of SPECIALISTS) {
      expect(files).toContain(`uads-${specialist.id}.md`);
      expect(fs.existsSync(path.join("agents", `uads-${specialist.id}.md`))).toBe(true);
    }
  });
});
