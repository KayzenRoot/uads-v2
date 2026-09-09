import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { computeChangeDigest, listChangedEntries, parseGitPorcelain } from "../src/kernel/change-digest.js";
import {
  deriveGateStates,
  runAssuranceRecord,
  runAssuranceStart,
  runDispatch,
  runEvidenceRecord,
  runFinalize,
  runVerify,
} from "../src/kernel/execution.js";
import { executionRunPaths } from "../src/kernel/execution-persist.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { tempDirs } from "./helpers.js";
import { approveAll, implement, planFrontend, recordGates, seedFrontend } from "./execution-helpers.js";

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "UADS Tests",
  GIT_AUTHOR_EMAIL: "uads@example.com",
};

function outputFile(home: string, name: string): string {
  const file = path.join(home, `${name}.txt`);
  fs.writeFileSync(file, `${name} ok\n`);
  return file;
}

function firstCommandGate(gates: string[]): string {
  return gates.find((id) => id !== "security-review" && id !== "performance-check") ?? "static";
}

describe("Prompt 003 Correction 01", { timeout: 120_000 }, () => {
  it("A: same-size untracked binary mutation changes digest and invalidates prior proof", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "blob.bin"), Buffer.alloc(32, 7));
    const first = runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    approveAll(repo, home, planned.workOrder.assuranceReviewers);
    fs.writeFileSync(path.join(repo, "src", "blob.bin"), Buffer.alloc(32, 9));
    const second = runVerify({ cwd: repo, uadsHome: home });
    expect(second.changeSet.digest).not.toBe(first.changeSet.digest);
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/pending gate|missing independent review|finalize refused/i);
  });

  it("A: parses spaces, unicode, and renames via NUL porcelain", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    const spaced = path.join(repo, "src", "primary button.css");
    fs.writeFileSync(spaced, "button { color: orange; }\n");
    const unicodeName = "coração.css";
    fs.writeFileSync(path.join(repo, "src", unicodeName), "button { color: gold; }\n");
    implement(repo);
    const verified = runVerify({ cwd: repo, uadsHome: home });
    expect(verified.run.changedFiles).toEqual(
      expect.arrayContaining(["src/button.css", "src/primary button.css", `src/${unicodeName}`]),
    );

    const renamed = path.join(repo, "src", "button-renamed.css");
    execFileSync("git", ["mv", "src/button.css", "src/button-renamed.css"], { cwd: repo, env: gitEnv });
    fs.writeFileSync(renamed, "button { color: navy; }\n");
    const afterRename = runVerify({ cwd: repo, uadsHome: home });
    expect(afterRename.changeSet.digest).not.toBe(verified.changeSet.digest);
    expect(afterRename.run.changedFiles.join("\n")).toMatch(/button-renamed\.css/);
    const parsed = parseGitPorcelain(
      "R  src/old file.css\0src/new file.css\0?? src/untracked.bin\0",
    );
    expect(parsed).toEqual([
      { code: "R ", path: "src/new file.css", origPath: "src/old file.css" },
      { code: "??", path: "src/untracked.bin" },
    ]);
    expect(computeChangeDigest(repo, listChangedEntries(repo))).toMatch(/^[a-f0-9]{64}$/);
  });

  it("B: dispatch requires implementer session and rejects rebind or reviewer backfill", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    expect(() => runDispatch({ cwd: repo, uadsHome: home })).toThrow(/implementer session/i);
    const first = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    expect(first.run.implementerSessionId).toBe("imp-1");
    const again = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    expect(again.run.executionRunId).toBe(first.run.executionRunId);
    expect(() => runDispatch({ cwd: repo, uadsHome: home, session: "imp-2" })).toThrow(/rebind|mismatch/i);
    implement(repo);
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);
    expect(() =>
      runAssuranceRecord({
        cwd: repo,
        uadsHome: home,
        role: "independent-reviewer",
        session: "rev-1",
        implementerSession: "imp-forged",
        verdict: "APPROVED",
        summary: "too early",
      }),
    ).toThrow(/review phase|assurance start/i);
    runAssuranceStart({ cwd: repo, uadsHome: home });
    expect(() =>
      runAssuranceRecord({
        cwd: repo,
        uadsHome: home,
        role: "independent-reviewer",
        session: "rev-1",
        implementerSession: "imp-forged",
        verdict: "APPROVED",
        summary: "forged",
      }),
    ).toThrow(/mismatch|implementer session/i);
    const recorded = runAssuranceRecord({
      cwd: repo,
      uadsHome: home,
      role: "independent-reviewer",
      session: "rev-independent",
      implementerSession: "imp-1",
      verdict: "APPROVED",
      summary: "ok",
    });
    expect(recorded.record.implementerSessionId).toBe("imp-1");
    expect(recorded.record.implementerSessionId).not.toBe(recorded.record.reviewSessionId);
  });

  it("C: assurance record cannot skip assurance start or incomplete gates", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo);
    runVerify({ cwd: repo, uadsHome: home });
    expect(() =>
      runAssuranceRecord({
        cwd: repo,
        uadsHome: home,
        role: "independent-reviewer",
        session: "rev-1",
        implementerSession: "imp-1",
        verdict: "APPROVED",
        summary: "early",
      }),
    ).toThrow(/review phase|assurance start/i);
    expect(() => runAssuranceStart({ cwd: repo, uadsHome: home })).toThrow(/non-review gates/i);
    recordGates(repo, home, planned.workOrder.qualityGates);
    const started = runAssuranceStart({ cwd: repo, uadsHome: home });
    expect(started.run.phase).toBe("review");
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/independent review|finalize refused/i);
  });

  it("D: gate contracts reject spoofed PASS and unsafe file evidence", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    fs.writeFileSync(path.join(repo, "src", "proof.txt"), "architecture ok\n");
    implement(repo);
    runVerify({ cwd: repo, uadsHome: home });
    const gate = firstCommandGate(planned.workOrder.qualityGates);
    expect(() =>
      runEvidenceRecord({
        cwd: repo,
        uadsHome: home,
        gateId: gate,
        kind: "invariant",
        role: "test-engineer",
        summary: "ok",
      }),
    ).toThrow(/kind|cannot satisfy/i);
    expect(() =>
      runEvidenceRecord({
        cwd: repo,
        uadsHome: home,
        gateId: gate,
        kind: "command",
        role: "test-engineer",
        command: "npm test",
        exitCode: 0,
        summary: "summary-only",
      }),
    ).toThrow(/output digest|command PASS/i);
    expect(() =>
      runEvidenceRecord({
        cwd: repo,
        uadsHome: home,
        gateId: "security-review",
        kind: "command",
        role: "test-engineer",
        command: "true",
        exitCode: 0,
        outputPath: outputFile(home, "sec"),
        summary: "spoof review",
      }),
    ).toThrow(/review gates|unselected gate|assurance/i);
    expect(() =>
      runEvidenceRecord({
        cwd: repo,
        uadsHome: home,
        gateId: gate,
        kind: "file",
        role: "test-engineer",
        file: "C:\\Windows\\notepad.exe",
        summary: "abs",
      }),
    ).toThrow(/absolute|drive|traversal/i);
    expect(() =>
      runEvidenceRecord({
        cwd: repo,
        uadsHome: home,
        gateId: gate,
        kind: "file",
        role: "test-engineer",
        file: "../outside.txt",
        summary: "escape",
      }),
    ).toThrow(/traversal/i);

    const selectedInvariant = planned.workOrder.qualityGates.find((id) => id === "architecture-conformance");
    if (selectedInvariant) {
      const fileRecord = runEvidenceRecord({
        cwd: repo,
        uadsHome: home,
        gateId: selectedInvariant,
        kind: "file",
        role: "software-architect",
        file: "src/proof.txt",
        summary: "conformance artifact",
      });
      expect(fileRecord.record.fileRef).toBe("src/proof.txt");
      expect(fileRecord.record.fileDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(fileRecord.record)).not.toContain("architecture ok");
    }
  });

  it("E: FAIL then PASS on the same digest stays FAIL until a new digest", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo);
    runVerify({ cwd: repo, uadsHome: home });
    const gate = firstCommandGate(planned.workOrder.qualityGates);
    const failed = runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: gate,
      kind: "command",
      role: "test-engineer",
      command: "npm test",
      exitCode: 1,
      summary: "failed",
    });
    expect(failed.gateStates.find((item) => item.gateId === gate)?.status).toBe("FAIL");
    const later = runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: gate,
      kind: "command",
      role: "test-engineer",
      command: "npm test",
      exitCode: 0,
      outputPath: outputFile(home, gate),
      summary: "now pass",
    });
    expect(later.gateStates.find((item) => item.gateId === gate)?.status).toBe("FAIL");
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/fail gate|finalize refused/i);

    const blocked = runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: gate,
      kind: "command",
      role: "test-engineer",
      command: "npm test",
      exitCode: 1,
      status: "BLOCKED",
      summary: "blocked",
    });
    expect(blocked.gateStates.find((item) => item.gateId === gate)?.status).toBe("BLOCKED");

    implement(repo, "src/button.css", "button { color: green; }\n");
    const next = runVerify({ cwd: repo, uadsHome: home });
    expect(next.run.currentChangeDigest).not.toBe(failed.record.changeDigest);
    const states = deriveGateStates({
      selectedGates: planned.workOrder.qualityGates,
      digest: next.run.currentChangeDigest,
      evidence: [],
      reviews: [],
    });
    expect(states.find((item) => item.gateId === gate)?.status).toBe("PENDING");
    recordGates(repo, home, planned.workOrder.qualityGates);
    approveAll(repo, home, planned.workOrder.assuranceReviewers);
    expect(runFinalize({ cwd: repo, uadsHome: home }).run.status).toBe("completed");
  });

  it("F: mismatched IDs and corrupt evidence/review JSON fail closed", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo);
    runVerify({ cwd: repo, uadsHome: home });
    recordGates(repo, home, planned.workOrder.qualityGates);

    const ctx = resolveProjectContext(repo, home);
    const runPaths = executionRunPaths(
      ctx.paths,
      (JSON.parse(fs.readFileSync(path.join(ctx.paths.state, "current-execution.json"), "utf8")) as { executionRunId: string })
        .executionRunId,
    );
    const run = JSON.parse(fs.readFileSync(runPaths.run, "utf8")) as {
      workOrderId: string;
      routingDecisionId: string;
      projectId: string;
      executionRunId: string;
    };
    fs.writeFileSync(runPaths.run, `${JSON.stringify({ ...run, workOrderId: "wo_other_valid_schema_id" }, null, 2)}\n`);
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/workOrderId|conflicting/i);
    fs.writeFileSync(runPaths.run, `${JSON.stringify(run, null, 2)}\n`);

    fs.writeFileSync(runPaths.run, `${JSON.stringify({ ...run, routingDecisionId: "rd_other_valid_schema_id" }, null, 2)}\n`);
    expect(() => runVerify({ cwd: repo, uadsHome: home })).toThrow(/routingDecisionId|conflicting/i);
    fs.writeFileSync(runPaths.run, `${JSON.stringify(run, null, 2)}\n`);

    fs.writeFileSync(runPaths.run, `${JSON.stringify({ ...run, projectId: "ffffffffffffffff" }, null, 2)}\n`);
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/projectId|conflicting/i);
    fs.writeFileSync(runPaths.run, `${JSON.stringify(run, null, 2)}\n`);

    fs.writeFileSync(path.join(runPaths.evidence, "ev_corrupt.json"), "{not-json");
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/corrupt evidence/i);
    fs.unlinkSync(path.join(runPaths.evidence, "ev_corrupt.json"));

    runAssuranceStart({ cwd: repo, uadsHome: home });
    const review = runAssuranceRecord({
      cwd: repo,
      uadsHome: home,
      role: "independent-reviewer",
      session: "rev-1",
      implementerSession: "imp-1",
      verdict: "APPROVED",
      summary: "ok",
    });
    fs.writeFileSync(path.join(runPaths.reviews, `${review.record.reviewId}.json`), "{broken");
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/corrupt review/i);
  });

  it("does not persist raw binary bytes in execution JSON", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    const payload = Buffer.from([0, 1, 2, 255, 254, 253, 10, 13]);
    fs.writeFileSync(path.join(repo, "src", "raw.bin"), payload);
    runVerify({ cwd: repo, uadsHome: home });
    const ctx = resolveProjectContext(repo, home);
    const pointer = JSON.parse(fs.readFileSync(path.join(ctx.paths.state, "current-execution.json"), "utf8")) as {
      executionRunId: string;
    };
    const runJson = fs.readFileSync(path.join(ctx.paths.executionRuns, pointer.executionRunId, "run.json"), "utf8");
    expect(runJson).not.toContain(payload.toString("latin1"));
    expect(runJson).toMatch(/"currentChangeDigest": "[a-f0-9]{64}"/);
  });
});
