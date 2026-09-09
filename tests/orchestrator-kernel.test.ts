import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { sidecarJsonPath } from "../src/lib/atomic-write.js";
import { atomicWriteJson } from "../src/lib/atomic-write.js";
import { validateAgainstSchema } from "../src/lib/json-schema.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import { runStatus } from "../src/commands/status.js";
import { inspectRepository } from "../src/kernel/inspector.js";
import { intakeFromRequest, normalizeIntake } from "../src/kernel/intake.js";
import { runInspect, runPlan, runResume } from "../src/kernel/orchestrator.js";
import { selectContextRadius } from "../src/kernel/policy.js";
import { assertIndependentReview, selectSpecialists } from "../src/kernel/routing.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";

const SECRET = "env-secret-value-SHOULD-NOT-LEAK-9f3a";
const repoRoot = path.resolve(".");
const cli = path.join(repoRoot, "dist", "cli.js");

function projectFiles(root: string): string[] {
  return fs.readdirSync(root);
}

function assertZeroProjectFootprint(project: string): void {
  const names = projectFiles(project);
  for (const forbidden of [".uads", "work-orders", "checkpoints", "reviews", "memory-bank", ".uads-cache"]) {
    expect(names, forbidden).not.toContain(forbidden);
  }
  expect(fs.existsSync(path.join(project, ".uads"))).toBe(false);
}

function seedRepo(repo: string): void {
  initRepo(repo, "https://github.com/example/uads-eval.git");
  fs.writeFileSync(
    path.join(repo, "package.json"),
    `${JSON.stringify({ name: "fixture", version: "1.0.0", scripts: { test: "echo test", build: "echo build" } }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(repo, "README.md"), "# fixture\n");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "index.ts"), "export const n = 1;\n");
  fs.writeFileSync(path.join(repo, ".env"), `API_TOKEN=${SECRET}\n`);
  gitCommit(repo, "init");
}

describe("orchestrator kernel", { timeout: 90_000 }, () => {
  it("rejects malformed work orders and routing decisions against JSON Schema", () => {
    expect(validateAgainstSchema("work-order.schema.json", { schema: "nope" }).length).toBeGreaterThan(0);
    expect(validateAgainstSchema("routing-decision.schema.json", { schema: "nope" }).length).toBeGreaterThan(0);
    expect(validateAgainstSchema("checkpoint.schema.json", { schema: "nope" }).length).toBeGreaterThan(0);
    expect(validateAgainstSchema("intake.schema.json", { schema: "uads.intake" }).length).toBeGreaterThan(0);
  });

  it("rejects chain-of-thought fields on intake and keeps schemas closed", () => {
    expect(() =>
      normalizeIntake({
        schema: "uads.intake",
        schemaVersion: "0.2.0",
        objective: "x",
        reasoning: "hidden",
      }),
    ).toThrow(/chain-of-thought/i);
    for (const name of ["intake.schema.json", "work-order.schema.json", "routing-decision.schema.json", "checkpoint.schema.json"]) {
      const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, "schemas", name), "utf8")) as {
        additionalProperties?: boolean;
        properties?: Record<string, unknown>;
      };
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties?.reasoning).toBeUndefined();
      expect(schema.properties?.chainOfThought).toBeUndefined();
      expect(schema.properties?.hiddenReasoning).toBeUndefined();
    }
  });

  it("rejects sidecar path traversal", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-side-"));
    expect(() => sidecarJsonPath(dir, "../escape")).toThrow(/unsafe sidecar identifier/);
    expect(() => sidecarJsonPath(dir, "foo/bar")).toThrow(/unsafe sidecar identifier/);
  });

  it("writes JSON atomically and reads it back", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-atomic-"));
    const target = path.join(dir, "state.json");
    atomicWriteJson(target, { ok: true });
    expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({ ok: true });
  });

  it("reuses the repository map until a key manifest changes", () => {
    const { repo, home } = tempDirs();
    seedRepo(repo);
    const first = runInspect({ cwd: repo, uadsHome: home });
    expect(first.fullWalk).toBe(true);
    const second = runInspect({ cwd: repo, uadsHome: home });
    expect(second.reused).toBe(true);
    expect(second.fullWalk).toBe(false);
    const pkg = path.join(repo, "package.json");
    fs.writeFileSync(pkg, `${fs.readFileSync(pkg, "utf8").trimEnd()}\n\n`);
    const third = runInspect({ cwd: repo, uadsHome: home });
    expect(third.reused).toBe(false);
    expect(third.fullWalk).toBe(true);
  });

  it("keeps inspect/plan/status/resume off the project tree and out of .env contents", () => {
    const { repo, home } = tempDirs();
    seedRepo(repo);
    runInspect({ cwd: repo, uadsHome: home });
    const planned = runPlan({ cwd: repo, uadsHome: home, request: "Change the primary button color." });
    runStatus(repo, { uadsHome: home });
    runResume({ cwd: repo, uadsHome: home });
    assertZeroProjectFootprint(repo);
    const wo = fs.readFileSync(
      path.join(home, "workspaces", planned.workOrder.projectId, "work-orders", `${planned.workOrder.workOrderId}.json`),
      "utf8",
    );
    const decision = fs.readFileSync(
      path.join(home, "workspaces", planned.workOrder.projectId, "decisions", `${planned.decision.routingDecisionId}.json`),
      "utf8",
    );
    expect(wo).not.toContain(SECRET);
    expect(decision).not.toContain(SECRET);
    expect(planned.workOrder.riskLevel).toBe("LOW");
    expect(planned.workOrder.domains).not.toContain("web3");
    expect(planned.workOrder.contextRadius).not.toBe("C5");
    expect(planned.workOrder.specialists).toContain("implementation-agent");
    expect(planned.workOrder.assuranceReviewers).toContain("independent-reviewer");
  });

  it("does not expand a simple frontend request into unrelated architecture or Web3 work", () => {
    const { repo, home } = tempDirs();
    seedRepo(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, request: "Change the primary button color." });
    expect(planned.workOrder.scopeClass).toBe("trivial");
    expect(planned.workOrder.qualityGates).not.toContain("web3-fuzz");
    expect(planned.workOrder.specialists.length + planned.workOrder.assuranceReviewers.length).toBeLessThanOrEqual(8);
    expect(planned.workOrder.outOfScope.some((item) => /web3/i.test(item))).toBe(true);
  });

  it("adds assurance for HIGH/CRITICAL plans and never defaults to C5", () => {
    const { repo, home } = tempDirs();
    seedRepo(repo);
    const planned = runPlan({
      cwd: repo,
      uadsHome: home,
      request: "Implement a withdrawal path for a DeFi vault smart contract.",
    });
    expect(planned.workOrder.riskLevel).toBe("CRITICAL");
    expect(planned.workOrder.assuranceReviewers).toEqual(
      expect.arrayContaining(["independent-reviewer", "security-reviewer"]),
    );
    expect(planned.workOrder.contextRadius).not.toBe("C5");
    expect(selectContextRadius("trivial", "LOW").radius).not.toBe("C5");
    expect(selectContextRadius("local", "LOW").radius).not.toBe("C5");
  });

  it("reports corrupt current state without guessing and recovers the prior checkpoint", () => {
    const { repo, home } = tempDirs();
    seedRepo(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, request: "Fix a typo in the README." });
    const current = path.join(home, "workspaces", planned.workOrder.projectId, "state", "current.json");
    fs.writeFileSync(current, "{not-json");
    const packet = runResume({ cwd: repo, uadsHome: home });
    expect(packet.status).toBe("invalid-state");
    expect(packet.workOrderId).toBe(planned.workOrder.workOrderId);
    expect(packet.blockers.join(" ")).toMatch(/invalid/i);
  });

  it("resumes from sidecar state in a fresh process without a full repository walk", () => {
    const { repo, home } = tempDirs();
    seedRepo(repo);
    const planned = runPlan({ cwd: repo, uadsHome: home, request: "Change the primary button color." });
    if (!fs.existsSync(cli)) {
      return;
    }
    const child = spawnSync(process.execPath, [cli, "resume", "--json"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, UADS_HOME: home },
    });
    expect(child.status, child.stderr).toBe(0);
    const packet = JSON.parse(child.stdout) as { workOrderId: string; nextAction: string };
    expect(packet.workOrderId).toBe(planned.workOrder.workOrderId);
    expect(packet.nextAction.length).toBeGreaterThan(0);
  });

  it("accepts structured intake and treats --request as a fallback classifier", () => {
    const { repo, home } = tempDirs();
    seedRepo(repo);
    const intake = normalizeIntake({
      schema: "uads.intake",
      schemaVersion: "0.2.0",
      objective: "Add an authenticated API endpoint that exposes a user's billing profile.",
      domainSignals: ["api", "security", "backend", "finance-economics"],
      riskSignals: ["authentication", "payments"],
      affectedAreas: ["api"],
      classifier: "host-structured",
    });
    const planned = runPlan({ cwd: repo, uadsHome: home, intake });
    expect(intake.classifier).toBe("host-structured");
    expect(["MEDIUM", "HIGH", "CRITICAL"]).toContain(planned.workOrder.riskLevel);
    expect(planned.workOrder.assuranceReviewers).toContain("security-reviewer");
    const fallback = intakeFromRequest("Change the primary button color.");
    expect(fallback.classifier).toBe("fallback-text");
  });

  it("never allows the implementer to be the sole reviewer", () => {
    const selected = selectSpecialists({
      intake: intakeFromRequest("Change the primary button color."),
      domains: ["frontend"],
      scopeClass: "trivial",
      risk: "LOW",
    });
    expect(selected.specialists).toContain("implementation-agent");
    expect(selected.assurance).toContain("independent-reviewer");
    expect(() => assertIndependentReview(selected.specialists, selected.assurance)).not.toThrow();
    expect(() => assertIndependentReview(["implementation-agent"], [])).toThrow(/sole final reviewer/);
  });

  it("does not execute discovered project files while inspecting", () => {
    const { repo, home } = tempDirs();
    seedRepo(repo);
    fs.writeFileSync(path.join(repo, "src", "hook.js"), "throw new Error('inspected code executed');\n");
    gitCommit(repo, "add bait");
    const inspected = inspectRepository({
      repoRoot: repo,
      projectId: "aaaaaaaaaaaaaaaa",
      paths: ensureWorkspace("aaaaaaaaaaaaaaaa", home),
      schemaRoot: repoRoot,
    });
    expect(inspected.map.projectId).toBe("aaaaaaaaaaaaaaaa");
  });
});
