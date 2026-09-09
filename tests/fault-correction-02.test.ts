import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runFailureRecordCommand, runFailureResolveCommand } from "../src/commands/failure.js";
import { computeLiveChangeDigest } from "../src/kernel/change-digest.js";
import { runDispatch } from "../src/kernel/execution.js";
import { markVerifiedResolution } from "../src/kernel/failure-memory.js";
import { failurePaths, listFailureRecords, readFailureMemory, readFailureRecord } from "../src/kernel/failure-persist.js";
import { diagnoseFailure, recordFailure } from "../src/kernel/fault-localization.js";
import { runPlan } from "../src/kernel/orchestrator.js";
import { findPackageRoot } from "../src/lib/version.js";
import { getUadsPaths } from "../src/lib/workspace.js";
import { recordPassingGatesAndFinalize, verifyCurrentChange } from "./execution-helpers.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";

function write(root: string, rel: string, contents: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function seed(repo: string): void {
  initRepo(repo, "https://github.com/example/uads-fault-c02.git");
  write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("ok");\n`);
  write(repo, "src/ui/Button.test.tsx", `import { Button } from "./Button";\nexport const t = Button;\n`);
  write(repo, "src/util/format.ts", `export const format = (v: string) => v;\n`);
  write(repo, "package.json", `${JSON.stringify({ name: "fault-c02", version: "1.0.0" }, null, 2)}\n`);
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

function stack(repo: string): string {
  return `Error: boom\n    at run (${path.join(repo, "src/ui/Button.tsx")}:2:1)\n`;
}

function snapshotState(paths: ReturnType<typeof getUadsPaths>, failureRecordId: string): {
  recordRaw: string;
  memoryRaw: string;
} {
  const recordPath = path.join(failurePaths(paths).records, `${failureRecordId}.json`);
  return {
    recordRaw: fs.readFileSync(recordPath, "utf8"),
    memoryRaw: fs.existsSync(failurePaths(paths).memory) ? fs.readFileSync(failurePaths(paths).memory, "utf8") : "",
  };
}

describe("fault correction 02", { timeout: 180_000 }, () => {
  it("T11: active execution cannot record a failure against a stale digest", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("d1");\n`);
    const verifiedD1 = verifyCurrentChange(repo, home);
    const digestD1 = verifiedD1.run.currentChangeDigest;
    expect(digestD1).toMatch(/^[a-f0-9]{64}$/);
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("d2");\n`);
    expect(computeLiveChangeDigest(repo)).not.toBe(digestD1);
    const inputPath = path.join(paths.workspace, "fail-input.txt");
    fs.writeFileSync(inputPath, stack(repo));
    expect(() =>
      runFailureRecordCommand({
        cwd: repo,
        uadsHome: home,
        source: "runtime",
        inputPath,
        executionRun: dispatched.run.executionRunId,
      }),
    ).toThrow(/live change digest differs from authoritative execution digest; run uads verify again/i);
    expect(listFailureRecords(paths).some((item) => item.changeDigest === digestD1)).toBe(false);
    const verifiedD2 = verifyCurrentChange(repo, home);
    const digestD2 = verifiedD2.run.currentChangeDigest;
    expect(digestD2).not.toBe(digestD1);
    const output = runFailureRecordCommand({
      cwd: repo,
      uadsHome: home,
      json: true,
      source: "runtime",
      inputPath,
    });
    const created = JSON.parse(output) as { failureRecordId: string };
    const persisted = readFailureRecord(paths, created.failureRecordId);
    expect(persisted.changeDigest).toBe(digestD2);
    expect(persisted.executionRunId).toBe(dispatched.run.executionRunId);
  });

  it("T12-T13: explicit resolve rejects post-finalize drift without mutating memory", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("broken");\n`);
    const failed = verifyCurrentChange(repo, home);
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: stack(repo),
      workOrderId: dispatched.run.workOrderId,
      executionRunId: dispatched.run.executionRunId,
      changeDigest: failed.run.currentChangeDigest,
      schemaRoot: findPackageRoot(),
    });
    diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: record.failureRecordId,
    });
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("fixed");\n`);
    verifyCurrentChange(repo, home);
    fs.rmSync(failurePaths(paths).current, { force: true });
    const finalized = recordPassingGatesAndFinalize(repo, home, planned);
    expect(finalized.run.status).toBe("completed");
    expect(readFailureRecord(paths, record.failureRecordId).status).not.toBe("resolved");
    const digestD1 = finalized.run.currentChangeDigest;
    expect(digestD1).toBeTruthy();
    markVerifiedResolution({
      paths,
      projectId: planned.workOrder.projectId,
      failureRecordId: record.failureRecordId,
      executionRunId: dispatched.run.executionRunId,
      repoRoot: repo,
    });
    const before = snapshotState(paths, record.failureRecordId);
    const resolved = readFailureRecord(paths, record.failureRecordId);
    const memoryD1 = readFailureMemory(paths, planned.workOrder.projectId);
    const entryD1 = memoryD1.entries.find((item) => item.failureSignature === record.signature);
    expect(resolved.status).toBe("resolved");
    expect(entryD1?.resolutionChangeDigest).toBe(digestD1);
    const basisD1 = { ...entryD1?.validityBasisDigests };
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("drift");\n`);
    expect(computeLiveChangeDigest(repo)).not.toBe(digestD1);
    expect(() =>
      runFailureResolveCommand({
        cwd: repo,
        uadsHome: home,
        failureRecordId: record.failureRecordId,
      }),
    ).toThrow(/repository state no longer matches the verified corrective digest/i);
    const after = snapshotState(paths, record.failureRecordId);
    expect(after.recordRaw).toBe(before.recordRaw);
    expect(after.memoryRaw).toBe(before.memoryRaw);
    const drifted = readFailureMemory(paths, planned.workOrder.projectId);
    const entryAfter = drifted.entries.find((item) => item.failureSignature === record.signature);
    expect(entryAfter?.validityBasisDigests).toEqual(basisD1);
    expect(entryAfter?.resolutionChangeDigest).toBe(digestD1);
    expect(entryAfter?.lastOutcome).toBe("resolved");
  });

  it("T14: automatic finalize resolution remains coherent when live digest matches", () => {
    const { repo, home } = tempDirs();
    seed(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, intake: intake() });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("broken");\n`);
    const failed = verifyCurrentChange(repo, home);
    const record = recordFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      source: "runtime",
      text: stack(repo),
      workOrderId: dispatched.run.workOrderId,
      executionRunId: dispatched.run.executionRunId,
      changeDigest: failed.run.currentChangeDigest,
      schemaRoot: findPackageRoot(),
    });
    diagnoseFailure({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      failureRecordId: record.failureRecordId,
    });
    write(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("fixed");\n`);
    const verified = verifyCurrentChange(repo, home);
    const finalized = recordPassingGatesAndFinalize(repo, home, planned);
    expect(finalized.run.status).toBe("completed");
    expect(finalized.run.currentChangeDigest).toBe(verified.run.currentChangeDigest);
    expect(computeLiveChangeDigest(repo)).toBe(finalized.run.currentChangeDigest);
    const resolved = readFailureRecord(paths, record.failureRecordId);
    expect(resolved.status).toBe("resolved");
    const memory = readFailureMemory(paths, planned.workOrder.projectId);
    const entry = memory.entries.find((item) => item.failureSignature === record.signature);
    expect(entry?.lastOutcome).toBe("resolved");
    expect(entry?.resolutionChangeDigest).toBe(finalized.run.currentChangeDigest);
    expect(Object.keys(entry?.validityBasisDigests ?? {}).length).toBeGreaterThan(0);
    expect(entry?.verifiedRootCausePaths).toEqual([]);
  });
});
