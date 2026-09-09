import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sidecarJsonPath } from "../src/lib/atomic-write.js";
import { computeLayerDigest } from "../src/kernel/context-pack.js";
import { evaluateCache } from "../src/kernel/cache-engine.js";
import { cachePaths, markCacheRecordStatus, persistEvidenceCacheRecord, readEvidenceCacheRecord } from "../src/kernel/cache-persist.js";
import { evaluateTokenBudget } from "../src/kernel/cost-governor.js";
import { ExecutionBlockedError, deriveGateStates, runDispatch, runEvidenceRecord, runFinalize, runVerify } from "../src/kernel/execution.js";
import { validateCacheReuseEvidence } from "../src/kernel/cache-integrity.js";
import { resolveToolchainIdentity } from "../src/kernel/gate-reuse-contract.js";
import { persistEvidenceRecord } from "../src/kernel/execution-persist.js";
import { lastIndexScan } from "../src/kernel/index-engine.js";
import { buildImpactAndPack, currentOrRefreshIndex } from "../src/kernel/intelligence.js";
import { persistPlan } from "../src/kernel/persist.js";
import { runResume } from "../src/kernel/orchestrator.js";
import { runStatus } from "../src/commands/status.js";
import { listEvidenceRecords } from "../src/kernel/execution-persist.js";
import { findPackageRoot } from "../src/lib/version.js";
import { getUadsPaths } from "../src/lib/workspace.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../src/lib/secrets.js";
import { approveAll, implement, planFrontend, recordGates, seedFrontend, writeResolvedPackage } from "./execution-helpers.js";
import { gitCommit, tempDirs } from "./helpers.js";

const TOKEN = `ghp_${"c".repeat(36)}`;

function seedGraph(repo: string): void {
  seedFrontend(repo);
  fs.mkdirSync(path.join(repo, "src", "ui"), { recursive: true });
  fs.mkdirSync(path.join(repo, "src", "util"), { recursive: true });
  fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "src", "ui", "Button.tsx"),
    `import { format } from "../util/format";\nexport const Button = () => format("ok");\n`,
  );
  fs.writeFileSync(path.join(repo, "src", "util", "format.ts"), `export const format = (v: string) => v;\n`);
  fs.writeFileSync(path.join(repo, "docs", "README.md"), "# docs\n");
  gitCommit(repo, "graph");
}

function recordUnit(repo: string, home: string): void {
  const outputPath = path.join(home, "gate-unit-test.txt");
  fs.writeFileSync(outputPath, "unit-test captured output\n");
  runEvidenceRecord({
    cwd: repo,
    uadsHome: home,
    gateId: "unit-test",
    kind: "command",
    role: "test-engineer",
    command: "npm test :: vitest run",
    exitCode: 0,
    outputPath,
    summary: "unit-test recorded",
  });
}

function ready(repo: string, home: string) {
  seedGraph(repo);
  const planned = planFrontend(repo, home);
  runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
  implement(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("red");\n`);
  runVerify({ cwd: repo, uadsHome: home });
  recordUnit(repo, home);
  return { planned, paths: getUadsPaths(planned.workOrder.projectId, home) };
}

describe("evidence cache and cost governor", () => {
  it("1: same paths with changed bytes invalidate", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    implement(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("bytes");\n`);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("STALE");
  });

  it("2: deleted validity-basis file invalidates", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.unlinkSync(path.join(repo, "src", "ui", "Button.tsx"));
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("STALE");
  });

  it("3: dependency-only change invalidates", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "src", "util", "format.ts"), `export const format = (v: string) => v + "!";\n`);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("STALE");
  });

  it("4: lockfile-only change invalidates command cache", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "package-lock.json"), `${JSON.stringify({ name: "exec-fixture", lockfileVersion: 3 }, null, 2)}\n`);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("STALE");
  });

  it("5: toolchain version mismatch invalidates", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    writeResolvedPackage(repo, "vitest", "2.0.0");
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("STALE");
    expect(decision.changedValidityInputs).toContain("toolIdentity");
  });

  it("6: incomplete index refuses reuse", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const bundle = currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
    bundle.state.complete = false;
    bundle.state.truncated = true;
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle,
    });
    expect(decision.maySatisfyGate).toBe(false);
    expect(["BLOCKED", "STALE", "MISS"]).toContain(decision.decision);
  });

  it("7: stale cache cannot be promoted after relevant change", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    implement(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("new");\n`);
    const verified = runVerify({ cwd: repo, uadsHome: home });
    expect(verified.pendingGates).toContain("unit-test");
    const evidence = listEvidenceRecords(paths, verified.run.executionRunId);
    expect(evidence.filter((item) => item.gateId === "unit-test" && item.changeDigest === verified.run.currentChangeDigest && item.source === "cache-reuse")).toHaveLength(0);
  });

  it("8: current-digest FAIL is not hidden by cached PASS", () => {
    const { repo, home } = tempDirs();
    const { planned } = ready(repo, home);
    const outputPath = path.join(home, "gate-unit-test-fail.txt");
    fs.writeFileSync(outputPath, "failed\n");
    runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: "unit-test",
      kind: "command",
      role: "test-engineer",
      command: "npm test :: vitest run",
      exitCode: 1,
      outputPath,
      summary: "unit-test failed",
    });
    const verified = runVerify({ cwd: repo, uadsHome: home });
    expect(verified.pendingGates).not.toContain("unit-test");
    const view = JSON.parse(runStatus(repo, { uadsHome: home, json: true })) as { failedGates: string[] };
    expect(view.failedGates).toContain("unit-test");
    void planned;
  });

  it("9-10: non-reusable gate and independent review stay required", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "security-review",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("NOT_REUSABLE");
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow(/independent review|pending gate|finalize refused/i);
  });

  it("11: cache id traversal is rejected", () => {
    const { repo, home } = tempDirs();
    const { paths } = ready(repo, home);
    expect(() => sidecarJsonPath(cachePaths(paths).evidence, "../escape")).toThrow(/unsafe sidecar identifier|sidecar path escape/i);
    expect(readEvidenceCacheRecord(paths, "../escape")).toBeNull();
  });

  it("12: malformed cache JSON fails closed", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.writeFileSync(cachePaths(paths).index, "{");
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.maySatisfyGate).toBe(false);
  });

  it("13-14: cache artifacts omit host paths and secrets", () => {
    const { repo, home } = tempDirs();
    seedGraph(repo);
    const planned = planFrontend(repo, home);
    runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    implement(repo, "src/ui/Button.tsx", `import { format } from "../util/format";\nexport const Button = () => format("red");\n`);
    runVerify({ cwd: repo, uadsHome: home });
    const outputPath = path.join(home, "secret-out.txt");
    fs.writeFileSync(outputPath, `ok ${TOKEN} ${home}\n`);
    runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: "unit-test",
      kind: "command",
      role: "test-engineer",
      command: "npm test :: vitest run",
      exitCode: 0,
      outputPath,
      summary: "unit-test recorded",
    });
    const evidenceDir = path.join(getUadsPaths(planned.workOrder.projectId, home).workspace, "cache", "evidence");
    for (const name of fs.readdirSync(evidenceDir)) {
      const text = fs.readFileSync(path.join(evidenceDir, name), "utf8");
      expect(containsUnredactedSecret(text)).toBe(false);
      expect(containsAbsoluteHostPath(text)).toBe(false);
    }
  });

  it("15: status and resume do not rescan the repository", () => {
    const { repo, home } = tempDirs();
    ready(repo, home);
    const parsed = lastIndexScan.filesParsed;
    runStatus(repo, { uadsHome: home, json: true });
    runResume({ cwd: repo, uadsHome: home });
    expect(lastIndexScan.filesParsed).toBe(parsed);
  });

  it("16: hard token budget blocks dispatch", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    persistPlan({
      paths: getUadsPaths(planned.workOrder.projectId, home),
      workOrder: { ...planned.workOrder, tokenBudget: { ...planned.workOrder.tokenBudget, hardLimit: 1 } },
      decision: planned.decision,
      checkpoint: planned.checkpoint,
      contextPlan: planned.contextPlan,
    });
    expect(() => runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" })).toThrow(ExecutionBlockedError);
    expect(evaluateTokenBudget(10, 5, 1)).toBe("hard-blocked");
  });

  it("17: unchanged Context Pack identity is reused", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    const planned = planFrontend(repo, home);
    const dispatched = runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const first = buildImpactAndPack({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      radius: dispatched.run.contextRadius,
      workOrder: planned.workOrder,
      executionRunId: dispatched.run.executionRunId,
    });
    const parsed = lastIndexScan.filesParsed;
    const second = buildImpactAndPack({
      repoRoot: repo,
      projectId: planned.workOrder.projectId,
      paths,
      radius: dispatched.run.contextRadius,
      workOrder: planned.workOrder,
      executionRunId: dispatched.run.executionRunId,
    });
    expect(second.pack.contextPackId).toBe(first.pack.contextPackId);
    expect(lastIndexScan.filesParsed).toBe(parsed);
  });

  it("18: dynamic layer change leaves static layer digest stable", () => {
    const staticDigest = computeLayerDigest(
      [
        { path: "docs/a.md", role: "docs", relation: "documentation", reason: "x", confidence: 1, contentDigest: "1", estimatedTokens: 1, layer: "static" },
        { path: "src/a.ts", role: "implementation", relation: "direct", reason: "x", confidence: 1, contentDigest: "2", estimatedTokens: 1, layer: "dynamic" },
      ],
      "static",
    );
    const after = computeLayerDigest(
      [
        { path: "docs/a.md", role: "docs", relation: "documentation", reason: "x", confidence: 1, contentDigest: "1", estimatedTokens: 1, layer: "static" },
        { path: "src/a.ts", role: "implementation", relation: "direct", reason: "x", confidence: 1, contentDigest: "changed", estimatedTokens: 1, layer: "dynamic" },
      ],
      "static",
    );
    const dynamicBefore = computeLayerDigest(
      [{ path: "src/a.ts", role: "implementation", relation: "direct", reason: "x", confidence: 1, contentDigest: "2", estimatedTokens: 1, layer: "dynamic" }],
      "dynamic",
    );
    const dynamicAfter = computeLayerDigest(
      [{ path: "src/a.ts", role: "implementation", relation: "direct", reason: "x", confidence: 1, contentDigest: "changed", estimatedTokens: 1, layer: "dynamic" }],
      "dynamic",
    );
    expect(after).toBe(staticDigest);
    expect(dynamicAfter).not.toBe(dynamicBefore);
  });

  it("19: cross-project cache injection is rejected", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const files = fs.readdirSync(cachePaths(paths).evidence);
    const original = JSON.parse(fs.readFileSync(path.join(cachePaths(paths).evidence, files[0] ?? ""), "utf8"));
    expect(() => persistEvidenceCacheRecord(paths, { ...original, projectId: "deadbeefdeadbeef" })).toThrow(
      /cross-project/,
    );
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.maySatisfyGate).toBe(false);
  });

  it("20: cache HIT is distinguishable from executed PASS", () => {
    const { repo, home } = tempDirs();
    const { planned } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "src", "ui", "orphan.css"), "/* unrelated to the cached unit basis */\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const evidence = listEvidenceRecords(paths, verified.run.executionRunId);
    const reused = evidence.filter((item) => item.source === "cache-reuse");
    const executed = evidence.filter((item) => item.source === "executed" && item.gateId === "unit-test");
    expect(executed.length).toBeGreaterThan(0);
    expect(reused.length).toBeGreaterThan(0);
    expect(reused.every((item) => item.sourceCacheRecordId && item.cacheDecisionId)).toBe(true);
    expect(executed.every((item) => item.source === "executed")).toBe(true);
  });

  it("does not write sidecar state into the managed repo", () => {
    const { repo, home } = tempDirs();
    ready(repo, home);
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
    expect(fs.existsSync(path.join(repo, "cache"))).toBe(false);
    void recordGates;
    void findPackageRoot;
  });

  it("21: command contract mismatch cannot HIT", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as { scripts: Record<string, string> };
    pkg.scripts.test = "vitest run other.test.ts";
    fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).not.toBe("HIT");
  });

  it("22: integration-test is not reusable by default", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "integration-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("NOT_REUSABLE");
  });

  it("26: vitest config-only change invalidates", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "vitest.config.ts"), "export default {};\n");
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("STALE");
  });

  it("27: cache-reuse evidence carries reuse proof digest", () => {
    const { repo, home } = tempDirs();
    const { planned } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "src", "ui", "orphan.css"), "/* unrelated */\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const reused = listEvidenceRecords(paths, verified.run.executionRunId).filter((item) => item.source === "cache-reuse");
    expect(reused[0]?.reuseProofDigest).toBeTruthy();
    expect(reused[0]?.gateReuseContractIdentity).toBeTruthy();
  });

  it("32: unknown producer toolchain is fresh-required", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    pkg.scripts.build = "mystery-bundler --production";
    fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    const outputPath = path.join(home, "gate-build.txt");
    fs.writeFileSync(outputPath, "build captured output\n");
    runEvidenceRecord({
      cwd: repo,
      uadsHome: home,
      gateId: "build",
      kind: "command",
      role: "test-engineer",
      command: "npm run build :: mystery-bundler --production",
      exitCode: 0,
      outputPath,
      summary: "build recorded",
    });
    const buildCaches = fs
      .readdirSync(cachePaths(paths).evidence)
      .map((name) => readEvidenceCacheRecord(paths, name.replace(/\.json$/, "")))
      .filter((record) => record?.gateId === "build");
    expect(buildCaches.length).toBe(0);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "build",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("NOT_REUSABLE");
    expect(decision.reasonCodes.some((code) => code.includes("TOOLCHAIN_UNPROVABLE"))).toBe(true);
  });

  it("33: supported producer with exact version can still HIT", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("HIT");
    expect(decision.maySatisfyGate).toBe(true);
  });

  it("34: actual resolved producer version change invalidates", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    writeResolvedPackage(repo, "vitest", "2.0.0");
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).toBe("STALE");
    expect(decision.changedValidityInputs).toContain("toolIdentity");
  });

  it("41: file dependency spec is not exact producer proof", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.rmSync(path.join(repo, "node_modules", "vitest"), { recursive: true, force: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as {
      devDependencies: Record<string, string>;
    };
    pkg.devDependencies.vitest = "file:../vitest";
    fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    const bundle = currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
    const result = resolveToolchainIdentity(repo, "npm test :: vitest run", bundle);
    expect(result.provable).toBe(false);
    expect(result.reasonCodes).toContain("PRODUCER_VERSION_UNRESOLVED");
  });

  it("42: historical source cache evidence cannot satisfy a gate", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "src", "ui", "orphan.css"), "/* unrelated */\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    const reused = listEvidenceRecords(paths, verified.run.executionRunId).find((item) => item.source === "cache-reuse");
    expect(reused).toBeTruthy();
    const cacheRecord = readEvidenceCacheRecord(paths, reused!.sourceCacheRecordId!);
    expect(cacheRecord).toBeTruthy();
    persistEvidenceCacheRecord(paths, {
      ...cacheRecord!,
      reusable: false,
      status: "historical",
      invalidationReason: "test-tamper",
    });
    const validation = validateCacheReuseEvidence({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      changeDigest: verified.run.currentChangeDigest,
      record: reused!,
    });
    expect(validation.valid).toBe(false);
  });

  it("43: malformed producer metadata is unprovable", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.rmSync(path.join(repo, "node_modules", "vitest"), { recursive: true, force: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as Record<string, unknown>;
    pkg.devDependencies = [];
    fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    const bundle = currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
    const result = resolveToolchainIdentity(repo, "npm test :: vitest run", bundle);
    expect(result.provable).toBe(false);
    expect(result.reasonCodes).toContain("PRODUCER_METADATA_INVALID");
  });

  it("44: contradictory exact producer specs are unprovable", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.rmSync(path.join(repo, "node_modules", "vitest"), { recursive: true, force: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as Record<string, unknown>;
    pkg.dependencies = { vitest: "1.0.0" };
    pkg.devDependencies = { vitest: "2.0.0" };
    fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    const bundle = currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths });
    const result = resolveToolchainIdentity(repo, "npm test :: vitest run", bundle);
    expect(result.provable).toBe(false);
    expect(result.reasonCodes).toContain("PRODUCER_VERSION_AMBIGUOUS");
  });

  it("35: forged cache-reuse evidence with missing provenance cannot satisfy gate", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const verified = runVerify({ cwd: repo, uadsHome: home });
    const forged = {
      schema: "uads.evidence-record" as const,
      schemaVersion: "0.3.0" as const,
      evidenceId: "ev_forgedmissing01",
      projectId: planned.workOrder.projectId,
      workOrderId: planned.workOrder.workOrderId,
      executionRunId: verified.run.executionRunId,
      changeDigest: verified.run.currentChangeDigest!,
      gateId: "unit-test",
      sourceRole: "forged",
      kind: "command" as const,
      createdAt: new Date().toISOString(),
      status: "PASS" as const,
      summary: "forged cache-reuse missing provenance",
      command: "npm test :: vitest run",
      exitCode: 0,
      outputRef: "sidecar://forged",
      outputDigest: "deadbeef",
      source: "cache-reuse" as const,
    };
    const evidence = listEvidenceRecords(paths, verified.run.executionRunId).filter(
      (item) => item.gateId !== "unit-test" || item.changeDigest !== verified.run.currentChangeDigest,
    );
    const gates = deriveGateStates({
      selectedGates: verified.run.selectedGates,
      digest: verified.run.currentChangeDigest,
      evidence: [...evidence, forged],
      reviews: [],
      validation: { paths, projectId: planned.workOrder.projectId },
    });
    expect(gates.find((gate) => gate.gateId === "unit-test")?.status).not.toBe("PASS");
    expect(validateCacheReuseEvidence({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      changeDigest: verified.run.currentChangeDigest,
      record: forged,
    }).valid).toBe(false);
  });

  it("36: forged provenance ids cannot satisfy a gate", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "src", "ui", "orphan.css"), "/* unrelated */\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    const reused = listEvidenceRecords(paths, verified.run.executionRunId).find((item) => item.source === "cache-reuse");
    expect(reused).toBeTruthy();
    const tampered = {
      ...reused!,
      evidenceId: "ev_forgedids01",
      sourceCacheRecordId: "ecr_tampered00001",
    };
    const evidence = listEvidenceRecords(paths, verified.run.executionRunId).filter(
      (item) => item.gateId !== "unit-test" || item.evidenceId === tampered.evidenceId,
    );
    const gates = deriveGateStates({
      selectedGates: verified.run.selectedGates,
      digest: verified.run.currentChangeDigest,
      evidence: [...evidence, tampered],
      reviews: [],
      validation: { paths, projectId: planned.workOrder.projectId },
    });
    expect(gates.find((gate) => gate.gateId === "unit-test")?.status).not.toBe("PASS");
  });

  it("37: reuse proof mismatch cannot satisfy a gate", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "src", "ui", "orphan.css"), "/* unrelated */\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    const reused = listEvidenceRecords(paths, verified.run.executionRunId).find((item) => item.source === "cache-reuse");
    expect(reused).toBeTruthy();
    const tampered = { ...reused!, evidenceId: "ev_forgedproof01", reuseProofDigest: "deadbeefproof" };
    fs.unlinkSync(path.join(paths.workspace, "execution-runs", verified.run.executionRunId, "evidence", `${reused!.evidenceId}.json`));
    persistEvidenceRecord({ paths, record: tampered });
    const gates = deriveGateStates({
      selectedGates: verified.run.selectedGates,
      digest: verified.run.currentChangeDigest,
      evidence: listEvidenceRecords(paths, verified.run.executionRunId),
      reviews: [],
      validation: { paths, projectId: planned.workOrder.projectId },
    });
    expect(gates.find((gate) => gate.gateId === "unit-test")?.status).not.toBe("PASS");
    expect(() => runFinalize({ cwd: repo, uadsHome: home })).toThrow();
  });

  it("38: gate-contract identity mismatch cannot satisfy a gate", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "src", "ui", "orphan.css"), "/* unrelated */\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    const reused = listEvidenceRecords(paths, verified.run.executionRunId).find((item) => item.source === "cache-reuse");
    expect(reused).toBeTruthy();
    const tampered = { ...reused!, evidenceId: "ev_forgedcontract01", gateReuseContractIdentity: "deadbeefcontract" };
    const evidence = listEvidenceRecords(paths, verified.run.executionRunId).filter(
      (item) => item.gateId !== "unit-test" || item.evidenceId === tampered.evidenceId,
    );
    const gates = deriveGateStates({
      selectedGates: verified.run.selectedGates,
      digest: verified.run.currentChangeDigest,
      evidence: [...evidence, tampered],
      reviews: [],
      validation: { paths, projectId: planned.workOrder.projectId },
    });
    expect(gates.find((gate) => gate.gateId === "unit-test")?.status).not.toBe("PASS");
  });

  it("39: wrong evidence kind cache candidate cannot report HIT", () => {
    const { repo, home } = tempDirs();
    const { planned, paths } = ready(repo, home);
    const evidenceDir = cachePaths(paths).evidence;
    for (const name of fs.readdirSync(evidenceDir)) {
      const record = readEvidenceCacheRecord(paths, name.replace(/\.json$/, ""));
      if (record?.gateId === "unit-test") {
        markCacheRecordStatus(paths, record.cacheRecordId, "stale", "test-setup");
      }
    }
    const firstName = fs.readdirSync(evidenceDir)[0];
    expect(firstName).toBeTruthy();
    const base = JSON.parse(fs.readFileSync(path.join(evidenceDir, firstName!), "utf8"));
    const wrongKind = structuredClone(base);
    wrongKind.cacheRecordId = "ecr_wrongkind0001";
    wrongKind.evidenceKind = "file";
    wrongKind.command = null;
    wrongKind.outputDigest = null;
    wrongKind.fileDigest = "filedigest01";
    persistEvidenceCacheRecord(paths, wrongKind);
    const indexPath = cachePaths(paths).index;
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      records: Array<{ cacheRecordId: string; gateId: string; reusable: boolean; status: string }>;
    };
    index.records = index.records.filter((row) => row.gateId !== "unit-test" || row.status === "stale");
    index.records.push({
      cacheRecordId: wrongKind.cacheRecordId,
      gateId: "unit-test",
      reusable: true,
      status: "reusable",
    });
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const decision = evaluateCache({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      repoRoot: repo,
      bundle: currentOrRefreshIndex({ repoRoot: repo, projectId: planned.workOrder.projectId, paths }),
    });
    expect(decision.decision).not.toBe("HIT");
    expect(decision.maySatisfyGate).not.toBe(true);
  });

  it("40: valid provenance chain survives status/verify/finalize", () => {
    const { repo, home } = tempDirs();
    const { planned } = ready(repo, home);
    fs.writeFileSync(path.join(repo, "src", "ui", "orphan.css"), "/* unrelated */\n");
    const verified = runVerify({ cwd: repo, uadsHome: home });
    const paths = getUadsPaths(planned.workOrder.projectId, home);
    const reused = listEvidenceRecords(paths, verified.run.executionRunId).filter((item) => item.source === "cache-reuse");
    expect(reused.length).toBeGreaterThan(0);
    const validation = validateCacheReuseEvidence({
      paths,
      projectId: planned.workOrder.projectId,
      gateId: "unit-test",
      changeDigest: verified.run.currentChangeDigest,
      record: reused[0]!,
    });
    expect(validation.valid).toBe(true);
    recordGates(
      repo,
      home,
      planned.workOrder.qualityGates.filter((gate) => gate !== "unit-test"),
    );
    approveAll(repo, home, planned.workOrder.assuranceReviewers);
    const finalized = runFinalize({ cwd: repo, uadsHome: home });
    expect(finalized.run.status).toBe("completed");
  });
});
