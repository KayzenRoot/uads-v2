import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDispatch, runVerify } from "../src/kernel/execution.js";
import { tempDirs } from "./helpers.js";
import { planFrontend, seedFrontend } from "./execution-helpers.js";

describe("execution scope guard", { timeout: 120_000 }, () => {
  it("blocks out-of-scope and sensitive path completion", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.mkdirSync(path.join(repo, "unrelated"), { recursive: true });
    fs.writeFileSync(path.join(repo, "unrelated", "other.ts"), "export const x = 1;\n");
    expect(() => runVerify({ cwd: repo, uadsHome: home })).toThrow(/scope|sensitive|out-of-scope/i);

    const second = tempDirs();
    seedFrontend(second.repo);
    planFrontend(second.repo, second.home);
    runDispatch({ cwd: second.repo, uadsHome: second.home, session: "imp-1" });
    fs.writeFileSync(path.join(second.repo, ".env"), "SECRET=1\n");
    expect(() => runVerify({ cwd: second.repo, uadsHome: second.home })).toThrow(/sensitive|scope/i);
  });
});
