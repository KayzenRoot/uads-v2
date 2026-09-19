import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExecutionBlockedError, runDispatch } from "../src/kernel/execution.js";
import { readModelRoutingState, setModelRoutingMode } from "../src/kernel/model-lock.js";
import { readCurrentModelExecutionPlan } from "../src/kernel/model-persist.js";
import { getUadsPaths } from "../src/lib/workspace.js";
import { tempDirs } from "./helpers.js";
import { planFrontend, seedFrontend } from "./execution-helpers.js";

function projectPaths(home: string) {
  const entries = fs.readdirSync(path.join(home, "workspaces"), { withFileTypes: true });
  const projectId = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()[0];
  if (!projectId) throw new Error("dispatch fixture workspace missing");
  return { projectId, paths: getUadsPaths(projectId, home) };
}

function expectRoutingUnavailableBlock(failure: unknown, firstPlanId: string, paths: ReturnType<typeof getUadsPaths>) {
  expect(failure).toBeInstanceOf(ExecutionBlockedError);
  const blocked = failure as ExecutionBlockedError;
  expect(blocked.message).toContain("model routing blocked dispatch");
  expect(blocked.blockers).toContain("ROUTING_STATE_UNAVAILABLE");
  // The previous SELECTED plan was re-derived fail-closed, never reused.
  const current = readCurrentModelExecutionPlan(paths);
  expect(current).not.toBeNull();
  expect(current?.status).toBe("BLOCKED");
  expect(current?.blockedReason).toBe("ROUTING_STATE_UNAVAILABLE");
  expect(current?.planId).not.toBe(firstPlanId);
  expect(current?.routingEnforcement).toEqual({ state: "UNKNOWN", reasonCodes: ["ROUTING_STATE_UNAVAILABLE"] });
}

describe("CR-01: UNAVAILABLE routing state invalidates plan reuse", { timeout: 180_000 }, () => {
  it("a corrupt routing-state file blocks dispatch instead of reusing the ABSENT autoroute plan", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    planFrontend(repo, home);
    const first = runDispatch({ adapterId: "generic-agent-skills", cwd: repo, uadsHome: home, session: "imp-1" });
    expect(first.run.phase).toBe("implement");
    const { paths } = projectPaths(home);
    expect(readModelRoutingState(paths, projectPaths(home).projectId)).toEqual({ status: "ABSENT" });
    const firstPlan = readCurrentModelExecutionPlan(paths);
    expect(firstPlan?.status).toBe("SELECTED");
    expect(firstPlan?.routingMode).toBe("QUALITY_FLOOR_AUTOROUTE");
    expect(firstPlan?.modelLock.revision).toBe(0);
    if (!firstPlan) throw new Error("unreachable");
    fs.writeFileSync(paths.modelLock, "{ corrupt", "utf8");
    const tampered = readModelRoutingState(paths, projectPaths(home).projectId);
    expect(tampered.status).toBe("UNAVAILABLE");
    let failure: unknown = null;
    try {
      runDispatch({ adapterId: "generic-agent-skills", cwd: repo, uadsHome: home, session: "imp-1" });
    } catch (error) {
      failure = error;
    }
    expectRoutingUnavailableBlock(failure, firstPlan.planId, paths);
  });

  it("a digest-invalid routing state blocks dispatch instead of reusing the previous plan", () => {
    const { repo, home } = tempDirs();
    seedFrontend(repo);
    planFrontend(repo, home);
    runDispatch({ adapterId: "generic-agent-skills", cwd: repo, uadsHome: home, session: "imp-1" });
    const { projectId, paths } = projectPaths(home);
    const firstPlan = readCurrentModelExecutionPlan(paths);
    expect(firstPlan?.status).toBe("SELECTED");
    if (!firstPlan) throw new Error("unreachable");
    setModelRoutingMode({ paths, projectId, mode: "QUALITY_FLOOR_AUTOROUTE" });
    const raw = JSON.parse(fs.readFileSync(paths.modelLock, "utf8")) as Record<string, unknown>;
    const digest = String(raw.stateDigest);
    raw.stateDigest = `${digest.slice(0, -1)}${digest.endsWith("0") ? "1" : "0"}`;
    fs.writeFileSync(paths.modelLock, JSON.stringify(raw), "utf8");
    const tampered = readModelRoutingState(paths, projectId);
    expect(tampered.status).toBe("UNAVAILABLE");
    if (tampered.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(tampered.reasonCodes).toContain("ROUTING_STATE_DIGEST_INVALID");
    let failure: unknown = null;
    try {
      runDispatch({ adapterId: "generic-agent-skills", cwd: repo, uadsHome: home, session: "imp-1" });
    } catch (error) {
      failure = error;
    }
    expectRoutingUnavailableBlock(failure, firstPlan.planId, paths);
  });
});
