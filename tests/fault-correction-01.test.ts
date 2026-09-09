import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runFailureRecordCommand } from "../src/commands/failure.js";
import { runDispatch } from "../src/kernel/execution.js";
import { computeFailureAttemptDigest } from "../src/kernel/failure-binding.js";
import { markVerifiedResolution } from "../src/kernel/failure-memory.js";
import { readFailureMemory } from "../src/kernel/failure-persist.js";
import { diagnoseFailure, recordFailure } from "../src/kernel/fault-localization.js";
import { FailureStateError } from "../src/kernel/failure-types.js";
import { runPlan } from "../src/kernel/orchestrator.js";
import { findPackageRoot } from "../src/lib/version.js";
import { getUadsPaths } from "../src/lib/workspace.js";
import {
  recordPassingGatesAndFinalize,
  verifyCurrentChange,
} from "./execution-helpers.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";

function write(root: string, rel: string, contents: string | Buffer): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function seed(repo: string): void {
  initRepo(repo, "https://github.com/example/uads-fault-c01.git");
  write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("ok");\n`);
  write(repo, "src/ui/Button.test.tsx", `import { Button } from "./Button";\nexport const t = Button;\n`);
  write(repo, "src/ui/Card.tsx", `import { format } from "../util/format";\nexport const Card = () => format("card");\n`);
  write(repo, "src/util/format.ts", `export const format = (v: string) => v;\n`);
  write(repo, "package.json", `${JSON.stringify({ name: "fault-c01", version: "1.0.0" }, null, 2)}\n`);
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

function stack(repo: string, rel: string, fn = "run"): string {
  return `Error: boom\n    at ${fn} (${path.join(repo, rel)}:2:1)\n`;
}

function canCreateSymlink(dir: string): boolean {
  const target = path.join(dir, "symlink-cap-target.txt");
  const link = path.join(dir, "symlink-cap-link.txt");
  try {
    fs.writeFileSync(target, "cap\n");
    fs.symlinkSync(target, link, "file");
    return true;
  } catch {
    return false;
  }
}

describe("fault correction 01", { timeout: 180_000 }, () => {
  it("T3: same changed path with different bytes produces a different attempt digest", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("a");\n`);
    const first = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: stack(repo, "src/ui/Button.tsx"),
      schemaRoot: findPackageRoot(),
    });
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("b");\n`);
    const second = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: stack(repo, "src/ui/Button.tsx"),
      schemaRoot: findPackageRoot(),
    });
    expect(first.changeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(second.changeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(second.changeDigest).not.toBe(first.changeDigest);
    write(repo, "assets/blob.bin", Buffer.from([1, 2, 3, 4]));
    const binaryA = computeFailureAttemptDigest({
      repoRoot: repo,
      gitHead: second.repositoryHead,
      indexDigest: second.repositoryIndexDigest,
    });
    write(repo, "assets/blob.bin", Buffer.from([9, 8, 7, 6]));
    const binaryB = computeFailureAttemptDigest({
      repoRoot: repo,
      gitHead: second.repositoryHead,
      indexDigest: second.repositoryIndexDigest,
    });
    expect(binaryB).not.toBe(binaryA);
  });

  it("T4: unrelated completed execution cannot resolve a bound or standalone failure", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const plannedB = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(plannedB.workOrder.projectId, home);
    const dispatchedB = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("b-fix");\n`);
    verifyCurrentChange(repo, home);
    const completedB = recordPassingGatesAndFinalize(repo, home, plannedB);
    expect(completedB.run.status).toBe("completed");
    const standalone = recordFailure({
      repoRoot: repo,
      projectId: plannedB.workOrder.projectId,
      paths,
      source: "manual-evidence",
      text: stack(repo, "src/ui/Button.tsx"),
      schemaRoot: findPackageRoot(),
    });
    expect(standalone.executionRunId).toBeNull();
    expect(() =>
      markVerifiedResolution({
        paths,
        projectId: plannedB.workOrder.projectId,
        failureRecordId: standalone.failureRecordId,
        executionRunId: completedB.run.executionRunId,
        repoRoot: repo,
      }),
    ).toThrow(/standalone failure cannot claim verified resolution/i);
    gitCommit(repo, "complete B");
    const plannedA = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const dispatchedA = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    expect(dispatchedA.run.executionRunId).not.toBe(dispatchedB.run.executionRunId);
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("a-fail");\n`);
    const verifiedA = verifyCurrentChange(repo, home);
    const boundA = recordFailure({
      repoRoot: repo,
      projectId: plannedA.workOrder.projectId,
      paths,
      source: "runtime",
      text: stack(repo, "src/ui/Button.tsx"),
      workOrderId: dispatchedA.run.workOrderId,
      executionRunId: dispatchedA.run.executionRunId,
      changeDigest: verifiedA.run.currentChangeDigest,
      schemaRoot: findPackageRoot(),
    });
    expect(boundA.executionRunId).toBe(dispatchedA.run.executionRunId);
    expect(() =>
      markVerifiedResolution({
        paths,
        projectId: plannedA.workOrder.projectId,
        failureRecordId: boundA.failureRecordId,
        executionRunId: completedB.run.executionRunId,
        repoRoot: repo,
      }),
    ).toThrow(/not the failure's bound run/i);
  });

  it("T5-T7: correction metadata, empty root cause, post-fix reuse, dependency invalidation", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("broken");\n`);
    const failedVerify = verifyCurrentChange(repo, home);
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `${stack(repo, "src/ui/Button.tsx", "a")}${stack(repo, "src/ui/Card.tsx", "b")}`,
      workOrderId: dispatched.run.workOrderId,
      executionRunId: dispatched.run.executionRunId,
      changeDigest: failedVerify.run.currentChangeDigest,
      schemaRoot: findPackageRoot(),
    });
    const diagnosis = diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: record.failureRecordId,
    });
    expect(diagnosis.rankedCandidates.length).toBeGreaterThan(1);
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("fixed");\n`);
    verifyCurrentChange(repo, home);
    const finalized = recordPassingGatesAndFinalize(repo, home, planned);
    expect(finalized.run.status).toBe("completed");
    const memory = markVerifiedResolution({
      paths,
      projectId: planned.workOrder.projectId,
      failureRecordId: record.failureRecordId,
      executionRunId: dispatched.run.executionRunId,
      repoRoot: repo,
    });
    const entry = memory.entries.find((item) => item.failureSignature === record.signature);
    expect(entry?.verifiedRootCausePaths).toEqual([]);
    expect(entry?.verifiedCorrectionPaths).toContain("src/ui/Button.tsx");
    expect(entry?.validityBasisDigests["src/ui/Button.tsx"]).toMatch(/^[a-f0-9]{64}$/);
    expect(entry?.validityBasisPaths).toContain("src/util/format.ts");
    expect(entry?.resolutionExecutionRunId).toBe(dispatched.run.executionRunId);
    expect(entry?.lastOutcome).toBe("resolved");
    const reuse = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `${stack(repo, "src/ui/Button.tsx", "a")}${stack(repo, "src/ui/Card.tsx", "b")}`,
      schemaRoot: findPackageRoot(),
    });
    const reusable = diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: reuse.failureRecordId,
    });
    expect(reusable.memoryMatches.some((item) => item.kind === "reusable")).toBe(true);
    write(repo, "src/util/format.ts", `export const format = (v: string) => v.toUpperCase();\n`);
    const dep = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: `${stack(repo, "src/ui/Button.tsx", "a")}${stack(repo, "src/ui/Card.tsx", "b")}`,
      schemaRoot: findPackageRoot(),
    });
    const historical = diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: dep.failureRecordId,
    });
    expect(historical.memoryMatches.some((item) => item.kind === "reusable")).toBe(false);
    expect(historical.memoryMatches.some((item) => item.kind === "historical")).toBe(true);
    const after = readFailureMemory(paths, planned.workOrder.projectId);
    expect(after.entries.find((item) => item.failureSignature === record.signature)?.lastOutcome).toBe("historical");
  });

  it("T8: supplied execution/work-order id that does not match authoritative state is rejected", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    write(repo, "fail.txt", stack(repo, "src/ui/Button.tsx"));
    expect(() =>
      runFailureRecordCommand({
        cwd: repo,
        uadsHome: home,
        source: "runtime",
        inputPath: path.join(repo, "fail.txt"),
        executionRun: "er_not_authoritative",
      }),
    ).toThrow(/missing or corrupt|does not match/i);
    expect(() =>
      runFailureRecordCommand({
        cwd: repo,
        uadsHome: home,
        source: "runtime",
        inputPath: path.join(repo, "fail.txt"),
        workOrder: "wo_not_authoritative",
      }),
    ).toThrow(/missing, corrupt, or cross-project|does not match/i);
    expect(dispatched.run.executionRunId).toMatch(/^er_/);
  });

  it("T9: symlink --input that escapes the repo/sidecar is rejected and never read", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    if (!canCreateSymlink(repo)) {
      return;
    }
    const secret = `outside-secret-${Date.now()}-uads`;
    const outside = path.join(os.tmpdir(), `uads-outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, `${secret}\nat run (src/ui/Button.tsx:1:1)\n`);
    const link = path.join(repo, "escaped-input.txt");
    fs.symlinkSync(outside, link, "file");
    expect(() =>
      runFailureRecordCommand({
        cwd: repo,
        uadsHome: home,
        source: "runtime",
        inputPath: link,
      }),
    ).toThrow(/symlink escape|failure input/i);
    const sidecar = getUadsPaths(planned.workOrder.projectId, home).workspace;
    expect(walkTexts(sidecar).some((text) => text.includes(secret))).toBe(false);
    expect(fs.readFileSync(outside, "utf8")).toContain(secret);
  });

  it("fails closed when no Git identity and no index identity exist", () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "uads-nogit-"));
    expect(() => computeFailureAttemptDigest({ repoRoot: bare, gitHead: null, indexDigest: null })).toThrow(
      FailureStateError,
    );
  });
});

function walkTexts(root: string): string[] {
  const out: string[] = [];
  const stackDirs = [root];
  while (stackDirs.length > 0) {
    const dir = stackDirs.pop();
    if (!dir) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stackDirs.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        out.push(fs.readFileSync(abs, "utf8"));
      } catch {
        // skip
      }
    }
  }
  return out;
}
