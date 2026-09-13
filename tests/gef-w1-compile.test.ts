import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { buildUpir } from "../src/gef/upir.js";
import { buildPatchRecipe, checkPatchPreconditions } from "../src/gef/patch-recipe.js";
import { checkBudget } from "../src/gef/budget-governor.js";
import { compilePrompt } from "../src/gef/prompt-compiler.js";
import { buildExecutionPack } from "../src/gef/execution-pack.js";
import { runGefContextPrepare, runGefPackBuild, runGefTaskCompile } from "../src/commands/gef.js";
import { sha256Hex } from "../src/lib/hash.js";

const previousHome = process.env.UADS_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.UADS_HOME;
  else process.env.UADS_HOME = previousHome;
});

const SECRET_FIXTURE = `ghp_${"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd"}`;
const FROZEN = "Global-first / zero-project-footprint is mandatory.";
const STOP = "STOP at COMPLETE_CANDIDATE for independent HEDS.";

function baseUpir() {
  return buildUpir({
    schemaVersion: "0.1.0",
    taskId: "compile-test",
    projectFingerprint: "b".repeat(64),
    workOrder: "GEF-W1",
    taskClass: "T1",
    contextRadius: "C1",
    baseSha: "1".repeat(40),
    reviewedHeadSha: null,
    goal: "Fix bounded defect without expanding scope",
    acceptedFindings: ["accepted"],
    openFindings: ["open goal"],
    targetSymbols: ["targetSymbol"],
    frozenInvariants: [FROZEN, "W0 adoption remains SHADOW-only."],
    requiredProofs: ["focused W1 test"],
    budgets: {
      maxRepositorySearches: 12,
      maxExtraFilesOpened: 16,
      maxSourceFilesChanged: 8,
      maxTestFilesChanged: 4,
      maxSemanticLOC: 800,
      retryBudget: 1,
      targetInputTokens: null,
      targetOutputTokens: null,
      targetActiveSeconds: null,
    },
    stopConditions: [STOP],
  });
}

function tempGitRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-git-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w1-fixture.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "target.ts"), `export function targetSymbol(): number {\n  return 1;\n}\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "fixture"], { cwd: repo });
  return repo;
}

describe("GEF W1 budgets + prompt compiler + execution pack", () => {
  it("returns explicit expansion states when counters cross limits", () => {
    const budgets = baseUpir().budgets;
    expect(checkBudget(budgets, { searches: 13, extraFilesOpened: 0, sourceFilesChanged: 0, testFilesChanged: 0, semanticLOC: 0, retries: 0 }).status).toBe("SEARCH_BUDGET_EXPANSION_REQUIRED");
    expect(checkBudget(budgets, { searches: 0, extraFilesOpened: 0, sourceFilesChanged: 9, testFilesChanged: 0, semanticLOC: 0, retries: 0 }).status).toBe("PATCH_BUDGET_EXPANSION_REQUIRED");
    expect(checkBudget(budgets, { searches: 0, extraFilesOpened: 0, sourceFilesChanged: 0, testFilesChanged: 0, semanticLOC: 0, retries: 2 }).status).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(
      checkBudget(
        { ...budgets, targetInputTokens: 100 },
        { searches: 0, extraFilesOpened: 0, sourceFilesChanged: 0, testFilesChanged: 0, semanticLOC: 0, retries: 0, inputTokens: 101 },
      ).status,
    ).toBe("TOKEN_BUDGET_EXPANSION_REQUIRED");
    expect(checkBudget(budgets, { searches: 0, extraFilesOpened: 0, sourceFilesChanged: 0, testFilesChanged: 0, semanticLOC: 0, retries: 0 }).status).toBe("OK");
  });

  it("fails patch preconditions closed as SOURCE_CONFLICT", () => {
    const repo = tempGitRepo();
    const content = fs.readFileSync(path.join(repo, "target.ts"), "utf8");
    const recipe = buildPatchRecipe({
      schemaVersion: "0.1.0",
      taskId: "compile-test",
      targets: [{ path: "target.ts", symbol: "targetSymbol" }],
      structuralAnchors: ["export function targetSymbol"],
      preconditions: [{ kind: "CONTENT_DIGEST_MATCH", path: "target.ts", description: "content must match", expectedDigest: sha256Hex(content) }],
      transforms: [{ kind: "EDIT_SYMBOL", path: "target.ts", symbol: "targetSymbol", description: "bounded fix" }],
      preserve: ["existing behavior"],
      prove: ["focused test"],
      expectedPatchBudget: { maxSourceFilesChanged: 1, maxTestFilesChanged: 1, maxSemanticLOC: 50 },
    });
    expect(checkPatchPreconditions(recipe, repo).status).toBe("READY");
    const drifted = buildPatchRecipe({
      ...recipe,
      preconditions: [{ kind: "CONTENT_DIGEST_MATCH", path: "target.ts", description: "stale digest", expectedDigest: "0".repeat(64) }],
    });
    const conflict = checkPatchPreconditions(drifted, repo);
    expect(conflict.status).toBe("SOURCE_CONFLICT");
    expect(conflict.mismatches.length).toBeGreaterThan(0);
  });

  it("compiles generic and codex prompts deterministically", () => {
    const upir = baseUpir();
    const first = compilePrompt({ upir, mode: "correction", executor: "codex" });
    const second = compilePrompt({ upir, mode: "correction", executor: "codex" });
    expect(first.prompt).toBe(second.prompt);
    expect(first.promptDigest).toBe(second.promptDigest);
    const generic = compilePrompt({ upir, mode: "feature", executor: "generic" });
    const genericAgain = compilePrompt({ upir, mode: "feature", executor: "generic" });
    expect(generic.prompt).toBe(genericAgain.prompt);
    for (const section of ["HEADER", "ACCEPTED_AND_FROZEN", "OPEN_GOAL", "ROOT_CAUSE/DECISION", "PATCH_MAP", "PRESCRIBED_ALGORITHM", "FORBIDDEN", "REQUIRED_TESTS", "BUDGETS", "LOCAL_ASSURANCE", "PUBLICATION", "MACHINE_OUTPUT", "STOP"]) {
      expect(first.prompt).toContain(section);
    }
  });

  it("redacts configured secrets and keeps exact invariants and stop conditions", () => {
    const upir = baseUpir();
    const withSecret = { ...upir, goal: `Rotate credential ${SECRET_FIXTURE} in bounded scope` };
    const compiled = compilePrompt({ upir: withSecret, mode: "correction", executor: "codex" });
    expect(compiled.prompt).not.toContain(SECRET_FIXTURE);
    expect(compiled.prompt).toContain(FROZEN);
    expect(compiled.prompt).toContain(STOP);
    const plain = compilePrompt({ upir, mode: "correction", executor: "codex" });
    expect(plain.prompt).toContain(FROZEN);
    expect(plain.prompt).toContain(STOP);
  });

  it("builds deterministic execution pack digests", () => {
    const upir = baseUpir();
    const first = buildExecutionPack({ upir, executor: "codex", mode: "correction" });
    const second = buildExecutionPack({ upir, executor: "codex", mode: "correction" });
    expect(first.packDigest).toBe(second.packDigest);
    expect(first.promptDigest).toBe(second.promptDigest);
    expect(first.packDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.stopConditions).toContain(STOP);
    expect(first.frozenInvariants).toContain(FROZEN);
  });

  it("keeps W1 task artifacts in the global sidecar only", () => {
    const repo = tempGitRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-cli-"));
    process.env.UADS_HOME = home;
    const manifestPath = path.join(repo, "w1-manifest.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        taskId: "w1-cli-zero",
        workOrder: "GEF-W1",
        goal: "Bounded CLI check",
        targetSymbols: ["targetSymbol"],
        frozenInvariants: [FROZEN],
        stopConditions: [STOP],
        requiredProofs: ["focused test"],
      }),
    );
    const compiled = JSON.parse(runGefTaskCompile(manifestPath, { cwd: repo, json: true }));
    expect(compiled.taskId).toBe("w1-cli-zero");
    expect(compiled.zeroProjectFootprint).toBe(true);
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
    expect(fs.existsSync(path.join(home, "gef", "projects"))).toBe(true);
    const pack = JSON.parse(runGefPackBuild("w1-cli-zero", { cwd: repo, json: true, executor: "codex" }));
    expect(pack.mergeAllowed).toBe(false);
    expect(pack.packDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects unsafe architecture paths in the task manifest", () => {
    const repo = tempGitRepo();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-arch-unsafe-"));
    process.env.UADS_HOME = home;
    const manifestPath = path.join(repo, "w1-manifest-unsafe.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ taskId: "w1-arch-unsafe", targetSymbols: ["targetSymbol"], architecturePaths: ["/absolute/contract.md"] }),
    );
    expect(() => runGefTaskCompile(manifestPath, { cwd: repo, json: true })).toThrow();
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ taskId: "w1-arch-unsafe", targetSymbols: ["targetSymbol"], architecturePaths: ["../escape.md"] }),
    );
    expect(() => runGefTaskCompile(manifestPath, { cwd: repo, json: true })).toThrow();
  });
});

function nonUadsFixture(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-global-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-global-fixture.git"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "hello.ts"), `export function greetUser(name: string): string {\n  return name;\n}\n`);
  fs.mkdirSync(path.join(repo, "docs"), { recursive: true });
  fs.writeFileSync(path.join(repo, "docs", "architecture.md"), `# Service Architecture\nProject-specific contract context.\n`);
  fs.writeFileSync(path.join(repo, "docs", "overview.md"), `# Service Overview\nBroad project governance context.\n`);
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", "fixture"], { cwd: repo });
  return repo;
}

function writeManifest(repo: string, name: string, body: Record<string, unknown>): string {
  const manifestPath = path.join(repo, name);
  fs.writeFileSync(manifestPath, JSON.stringify(body));
  return manifestPath;
}

describe("GEF W1 project-specific architecture binding (CR-W1-02)", () => {
  it("carries manifest architecture paths through task compile into context prepare", () => {
    const repo = nonUadsFixture();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-global-home-"));
    process.env.UADS_HOME = home;
    expect(fs.existsSync(path.join(repo, "AGENTS.md"))).toBe(false);
    const manifest = writeManifest(repo, "w1-global.json", {
      taskId: "w1-global-c3",
      workOrder: "GEF-W1",
      goal: "Non-UADS bounded task",
      targetSymbols: ["greetUser"],
      contextRadius: "C3",
      frozenInvariants: [FROZEN],
      stopConditions: [STOP],
      requiredProofs: ["focused test"],
      architecturePaths: ["docs/architecture.md"],
      broadGovernancePaths: ["docs/overview.md"],
    });
    const compiled = JSON.parse(runGefTaskCompile(manifest, { cwd: repo, json: true }));
    expect(compiled.taskId).toBe("w1-global-c3");
    const prepared = JSON.parse(runGefContextPrepare("w1-global-c3", { cwd: repo, json: true }));
    expect(prepared.architectureBasis).toBe("explicit");
    expect(prepared.entries.some((entry: { path: string; inclusionReason: string }) => entry.path === "docs/architecture.md" && entry.inclusionReason === "ARCHITECTURE_CONTRACT")).toBe(true);
    expect(JSON.stringify(prepared)).not.toContain("AGENTS.md");
  });

  it("adds bounded broad governance context at C4 without UADS path dependency", () => {
    const repo = nonUadsFixture();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-global-c4-"));
    process.env.UADS_HOME = home;
    const manifest = writeManifest(repo, "w1-global-c4.json", {
      taskId: "w1-global-c4",
      workOrder: "GEF-W1",
      goal: "Non-UADS broad task",
      targetSymbols: ["greetUser"],
      contextRadius: "C4",
      frozenInvariants: [FROZEN],
      stopConditions: [STOP],
      requiredProofs: ["focused test"],
      architecturePaths: ["docs/architecture.md"],
      broadGovernancePaths: ["docs/overview.md"],
    });
    JSON.parse(runGefTaskCompile(manifest, { cwd: repo, json: true }));
    const prepared = JSON.parse(runGefContextPrepare("w1-global-c4", { cwd: repo, json: true }));
    expect(prepared.entries.some((entry: { path: string; inclusionReason: string }) => entry.path === "docs/overview.md" && entry.inclusionReason === "BROAD_GOVERNANCE")).toBe(true);
    expect(JSON.stringify(prepared)).not.toContain("AGENTS.md");
  });

  it("keeps pack digests deterministic for the same task and path basis", () => {
    const repo = nonUadsFixture();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-global-det-"));
    process.env.UADS_HOME = home;
    const manifest = writeManifest(repo, "w1-global-det.json", {
      taskId: "w1-global-det",
      workOrder: "GEF-W1",
      goal: "Deterministic global task",
      targetSymbols: ["greetUser"],
      contextRadius: "C3",
      frozenInvariants: [FROZEN],
      stopConditions: [STOP],
      requiredProofs: ["focused test"],
      architecturePaths: ["docs/architecture.md"],
    });
    JSON.parse(runGefTaskCompile(manifest, { cwd: repo, json: true }));
    const first = JSON.parse(runGefContextPrepare("w1-global-det", { cwd: repo, json: true }));
    const second = JSON.parse(runGefContextPrepare("w1-global-det", { cwd: repo, json: true }));
    expect(first.sliceDigest).toBe(second.sliceDigest);
    const packFirst = JSON.parse(runGefPackBuild("w1-global-det", { cwd: repo, json: true, executor: "codex" }));
    const packSecond = JSON.parse(runGefPackBuild("w1-global-det", { cwd: repo, json: true, executor: "codex" }));
    expect(packFirst.packDigest).toBe(packSecond.packDigest);
  });
});
