import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAssuranceRecord, runAssuranceStart, runContextExpand, runDispatch, runVerify } from "../src/kernel/execution.js";
import { assertSchema } from "../src/lib/json-schema.js";
import { tempDirs } from "./helpers.js";
import { implement, planFrontend, recordGates, seedFrontend } from "./execution-helpers.js";

describe("execution reviewers and context", { timeout: 120_000 }, () => {
  it("rejects implementer self-review and same-session review", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo);
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    const assurance = runAssuranceStart({ cwd: repo, uadsHome: home });
    expect(assurance.packet.roleToGateMapping).toBeDefined();
    expect(assurance.packet.independentReviewInvariant).toMatch(/exact recognized role/i);
    expect(() => assertSchema("review-packet.schema.json", assurance.packet, process.cwd())).not.toThrow();
    expect(() =>
      runAssuranceRecord({
        cwd: repo,
        uadsHome: home,
        role: "implementation-agent",
        session: "rev-1",
        implementerSession: "imp-1",
        verdict: "APPROVED",
        summary: "self",
      }),
    ).toThrow(/self-review/i);
    expect(() =>
      runAssuranceRecord({
        cwd: repo,
        uadsHome: home,
        role: "independent-reviewer",
        session: "imp-1",
        implementerSession: "imp-1",
        verdict: "APPROVED",
        summary: "same session",
      }),
    ).toThrow(/same implementer\/reviewer session/i);
    expect(() =>
      runAssuranceRecord({
        cwd: repo,
        uadsHome: home,
        role: "independent-reviewer",
        session: "rev-2",
        implementerSession: "imp-1",
        verdict: "APPROVED",
        summary: "contradictory approval",
        findingsJson: JSON.stringify([{ severity: "HIGH", category: "security", message: "blocking" }]),
      }),
    ).toThrow(/APPROVAL_CONTRADICTS_HIGH_FINDING|assurance record rejected/i);
  });

  it("treats focused tests as supporting scope", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo);
    fs.mkdirSync(path.join(repo, "tests"), { recursive: true });
    fs.writeFileSync(path.join(repo, "tests", "button.test.ts"), "test('color', () => {});\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    expect(verified.run.changedFiles).toContain("tests/button.test.ts");
    expect(verified.run.scopeViolations).toEqual([]);
  });

  it("expands context one radius step and blocks C5 by default", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    planFrontend(repo, home);
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    const expanded = runContextExpand({ cwd: repo, uadsHome: home, reason: "need adjacent tests" });
    expect(expanded.run.contextRadius).not.toBe(dispatched.run.contextRadius);
    const order = ["C0", "C1", "C2", "C3", "C4", "C5"];
    expect(order.indexOf(expanded.run.contextRadius) - order.indexOf(dispatched.run.contextRadius)).toBe(1);
    let current = expanded.run.contextRadius;
    while (current !== "C4" && current !== "C5") {
      current = runContextExpand({ cwd: repo, uadsHome: home, reason: "step" }).run.contextRadius;
    }
    if (current === "C4") {
      expect(() => runContextExpand({ cwd: repo, uadsHome: home, reason: "jump" })).toThrow(/C5/i);
    }
  });
});
