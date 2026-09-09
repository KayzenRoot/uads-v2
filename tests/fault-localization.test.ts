import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPlan, runResume } from "../src/kernel/orchestrator.js";
import { runStatus } from "../src/commands/status.js";
import { diagnoseFailure, recordFailure, rankFaultCandidates, assertSafeEvidenceInput } from "../src/kernel/fault-localization.js";
import { normalizeFailureText, toEvidencePath } from "../src/kernel/failure-normalize.js";
import { computeFailureSignature } from "../src/kernel/failure-signature.js";
import { markVerifiedResolution } from "../src/kernel/failure-memory.js";
import {
  failurePaths,
  readFailureRecord,
  readFailureStatusFields,
} from "../src/kernel/failure-persist.js";
import { currentOrRefreshIndex } from "../src/kernel/intelligence.js";
import { IndexIncompleteError } from "../src/kernel/intelligence-types.js";
import { FailureStateError } from "../src/kernel/failure-types.js";
import { setDiscoveryLimitsForTests } from "../src/kernel/index-engine.js";
import { getUadsPaths } from "../src/lib/workspace.js";
import { findPackageRoot } from "../src/lib/version.js";
import { assertSchema } from "../src/lib/json-schema.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";

function write(root: string, rel: string, contents: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function seed(repo: string): void {
  initRepo(repo, "https://github.com/example/uads-fault.git");
  write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("ok");\n`);
  write(repo, "src/ui/Button.test.tsx", `import { Button } from "./Button";\nexport const t = Button;\n`);
  write(repo, "src/ui/Card.tsx", `import { format } from "../util/format";\nexport const Card = () => format("card");\n`);
  write(repo, "src/util/format.ts", `export const format = (v: string) => v;\n`);
  write(repo, "src/auth/login.ts", `export const login = () => "auth";\n`);
  write(repo, "package.json", `${JSON.stringify({ name: "fault-test", version: "1.0.0" }, null, 2)}\n`);
  gitCommit(repo, "init");
}

function intake() {
  return {
    schema: "uads.intake",
    schemaVersion: "0.2.0",
    objective: "Change the primary button color.",
    domainSignals: ["frontend"],
    affectedAreas: ["src/ui"],
    inScope: ["src/ui"],
    outOfScope: ["src/auth"],
    acceptanceCriteria: ["Button uses the new color"],
    classifier: "host-structured",
  };
}

describe("fault localization", () => {
  it("normalizes stacks, tests, and signatures deterministically", () => {
    const { repo } = tempDirs();
    seed(repo);
    const textA = `Error: 2026-08-30T00:00:00.000Z\n    at run (${path.join(repo, "src/ui/Button.tsx")}:2:1)\nFAIL src/ui/Button.test.tsx > color\n`;
    const textB = `Error: 2026-08-31T11:11:11.111Z\n    at run (${path.join(repo, "src/ui/Button.tsx")}:9:9)\nFAIL src/ui/Button.test.tsx > color\n`;
    const a = normalizeFailureText({ repoRoot: repo, text: textA, source: "test" });
    const b = normalizeFailureText({ repoRoot: repo, text: textB, source: "test" });
    expect(a.stackFrames[0]?.path).toBe("src/ui/Button.tsx");
    expect(a.failingTests[0]?.file).toBe("src/ui/Button.test.tsx");
    expect(
      computeFailureSignature({
        source: "test",
        command: "npx vitest run --at 2026-08-30T00:00:00.000Z",
        failureClass: a.failureClass,
        stackFrames: a.stackFrames,
        failingTests: a.failingTests,
        messageSummary: a.messageSummary,
      }),
    ).toBe(
      computeFailureSignature({
        source: "test",
        command: "npx vitest run --at 2026-08-31T11:11:11.111Z",
        failureClass: b.failureClass,
        stackFrames: b.stackFrames,
        failingTests: b.failingTests,
        messageSummary: b.messageSummary,
      }),
    );
    const other = normalizeFailureText({
      repoRoot: repo,
      text: "FAIL src/ui/Button.test.tsx > other\n",
      source: "test",
    });
    expect(
      computeFailureSignature({
        source: "test",
        command: null,
        failureClass: other.failureClass,
        stackFrames: other.stackFrames,
        failingTests: other.failingTests,
        messageSummary: other.messageSummary,
      }),
    ).not.toBe(
      computeFailureSignature({
        source: "test",
        command: null,
        failureClass: a.failureClass,
        stackFrames: a.stackFrames,
        failingTests: a.failingTests,
        messageSummary: a.messageSummary,
      }),
    );
  });

  it("rejects traversal and out-of-repo paths", () => {
    const { repo } = tempDirs();
    seed(repo);
    expect(toEvidencePath(repo, "../../outside.ts", new Set())).toBeNull();
    expect(toEvidencePath(repo, path.resolve(repo, "..", "outside.ts"), new Set())).toBeNull();
    const normalized = normalizeFailureText({
      repoRoot: repo,
      text: `at run (${path.resolve(repo, "..", "outside.ts")}:1:1)\n`,
      source: "runtime",
    });
    expect(normalized.stackFrames.every((frame) => frame.path !== "../outside.ts")).toBe(true);
  });

  it("ranks stack evidence first and keeps diagnostic radius tight", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("x");\n`);
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `Error: boom\n    at run (${path.join(repo, "src/ui/Button.tsx")}:2:1)\n`,
      schemaRoot: findPackageRoot(),
    });
    const report = diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: record.failureRecordId,
      schemaRoot: findPackageRoot(),
    });
    expect(report.rankedCandidates[0]?.path).toBe("src/ui/Button.tsx");
    expect(report.recommendedRadius).toBe("C1");
    expect(report.rankedCandidates.some((item) => item.path === "src/auth/login.ts")).toBe(false);
    assertSchema("failure-record.schema.json", record);
    assertSchema("diagnosis-report.schema.json", report);
    const status = JSON.parse(runStatus(repo, { uadsHome: home, json: true })) as { activeFailureId: string };
    expect(status.activeFailureId).toBe(record.failureRecordId);
    const resumed = runResume({ cwd: repo, uadsHome: home });
    expect(resumed.activeFailureId).toBe(record.failureRecordId);
    expect(resumed.diagnosisStatus).toBe(report.status);
  });

  it("treats equivalent candidates as ambiguous without inventing root cause", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const bundle = currentOrRefreshIndex({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
    });
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `at a (${path.join(repo, "src/ui/Button.tsx")}:1:1)\nat b (${path.join(repo, "src/ui/Card.tsx")}:1:1)\n`,
      schemaRoot: findPackageRoot(),
    });
    const ranked = rankFaultCandidates({ record, bundle, changedFiles: [] });
    expect(Math.abs((ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0))).toBeLessThanOrEqual(0.02);
    const report = diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: record.failureRecordId,
      schemaRoot: findPackageRoot(),
    });
    expect(report.status).toBe("ambiguous");
    expect(report.nextEvidence.length).toBeGreaterThan(0);
  });

  it("does not treat repeated diagnosis of one record as a failure loop", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("x");\n`);
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `at run (${path.join(repo, "src/ui/Button.tsx")}:2:1)\n`,
      schemaRoot: findPackageRoot(),
    });
    const first = diagnoseFailure({ repoRoot: repo, projectId: planned.workOrder.projectId, paths, failureRecordId: record.failureRecordId });
    diagnoseFailure({ repoRoot: repo, projectId: planned.workOrder.projectId, paths, failureRecordId: record.failureRecordId });
    const third = diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: record.failureRecordId,
    });
    expect(first.loopState.detected).toBe(false);
    expect(third.loopState.detected).toBe(false);
    expect(third.loopState.occurrences).toBe(1);
    expect(readFailureStatusFields(paths).loopDetected).toBe(false);
  });

  it("detects loops after three distinct same-signature same-digest observations", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("x");\n`);
    const text = `at run (${path.join(repo, "src/ui/Button.tsx")}:2:1)\n`;
    const ids: string[] = [];
    let last = null as ReturnType<typeof diagnoseFailure> | null;
    for (let i = 0; i < 3; i += 1) {
      const record = recordFailure({
        repoRoot: repo,
        projectId: planned.workOrder.projectId,
        paths,
        source: "runtime",
        text,
        schemaRoot: findPackageRoot(),
      });
      ids.push(record.failureRecordId);
      last = diagnoseFailure({
        repoRoot: repo,
        projectId: planned.workOrder.projectId,
        paths,
        failureRecordId: record.failureRecordId,
      });
    }
    expect(new Set(ids).size).toBe(3);
    expect(last?.loopState.detected).toBe(true);
    expect(last?.loopState.recommendedAction.includes("LOOP_DETECTED")).toBe(true);
    expect(readFailureStatusFields(paths).loopDetected).toBe(true);
  });

  it("fails closed on corrupt failure records and refuses summary-only resolution", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `at run (${path.join(repo, "src/ui/Button.tsx")}:2:1)\n`,
      schemaRoot: findPackageRoot(),
    });
    fs.writeFileSync(path.join(failurePaths(paths).records, `${record.failureRecordId}.json`), "{not-json");
    expect(() => readFailureRecord(paths, record.failureRecordId)).toThrow(FailureStateError);
    expect(() =>
      markVerifiedResolution({
        paths,
        projectId: planned.workOrder.projectId,
        failureRecordId: "missing",
        executionRunId: "er_missing",
        repoRoot: repo,
      }),
    ).toThrow(FailureStateError);
    expect(() => assertSafeEvidenceInput(path.join(repo, "..", "nope.txt"), repo, paths.workspace)).toThrow();
  });

  it("does not treat an incomplete index as diagnosable", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `at run (${path.join(repo, "src/ui/Button.tsx")}:2:1)\n`,
      schemaRoot: findPackageRoot(),
    });
    setDiscoveryLimitsForTests({ maxFiles: 2 });
    try {
      const indexState = path.join(paths.index, "index-state.json");
      const parsed = JSON.parse(fs.readFileSync(indexState, "utf8")) as { complete: boolean; truncated: boolean };
      parsed.complete = false;
      parsed.truncated = true;
      fs.writeFileSync(indexState, `${JSON.stringify(parsed, null, 2)}\n`);
      expect(() =>
        diagnoseFailure({
          repoRoot: repo,
          projectId: planned.workOrder.projectId,
          paths,
          failureRecordId: record.failureRecordId,
        }),
      ).toThrow(IndexIncompleteError);
    } finally {
      setDiscoveryLimitsForTests(null);
    }
  });
});
