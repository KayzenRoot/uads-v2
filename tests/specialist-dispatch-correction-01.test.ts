import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDispatch } from "../src/kernel/execution.js";
import { runPlan, runResume } from "../src/kernel/orchestrator.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { tempDirs } from "./helpers.js";
import { seedFrontend } from "./execution-helpers.js";

function planFixture() {
  const { repo, home } = tempDirs();
  seedFrontend(repo);
  const planned = runPlan({
    cwd: repo,
    uadsHome: home,
    request: "Change the primary button color.",
  });
  const ctx = resolveProjectContext(repo, home);
  return { repo, home, planned, ctx };
}

function rewriteWorkOrder(ctx: ReturnType<typeof resolveProjectContext>, workOrder: Record<string, unknown>): void {
  const file = path.join(ctx.paths.workOrders, `${String(workOrder.workOrderId)}.json`);
  fs.writeFileSync(file, `${JSON.stringify(workOrder, null, 2)}\n`);
}

describe("Prompt 009 Correction 01 specialist dispatch", { timeout: 120_000 }, () => {
  it("blocks dispatch and marks resume blocked after a semantic Work Order mutation", () => {
    const { repo, home, ctx } = planFixture();
    const workOrderPath = path.join(ctx.paths.workOrders, `${JSON.parse(fs.readFileSync(ctx.paths.currentState, "utf8")).workOrderId}.json`);
    const workOrder = JSON.parse(fs.readFileSync(workOrderPath, "utf8")) as Record<string, unknown>;
    rewriteWorkOrder(ctx, { ...workOrder, objective: "Tampered objective with unchanged specialist binding" });

    expect(() => runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" })).toThrow(
      /specialist routing state|stale|mismatch/i,
    );
    const resumed = runResume({ cwd: repo, uadsHome: home });
    expect(resumed.status).toBe("blocked");
    expect(resumed.specialistSelectionStatus).toBe("blocked-stale-or-mismatch");
    expect(resumed.blockers.join("\n")).toMatch(/specialist selection/i);
  });

  it("rejects current gate and context identity mutations before dispatch", () => {
    const { repo, home, ctx } = planFixture();
    const checkpoint = JSON.parse(fs.readFileSync(ctx.paths.currentState, "utf8")) as { workOrderId: string };
    const workOrderPath = path.join(ctx.paths.workOrders, `${checkpoint.workOrderId}.json`);
    const workOrder = JSON.parse(fs.readFileSync(workOrderPath, "utf8")) as Record<string, unknown>;
    rewriteWorkOrder(ctx, { ...workOrder, qualityGates: ["build"] });
    expect(() => runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" })).toThrow(
      /specialist routing state|stale|mismatch/i,
    );

    const second = planFixture();
    const contextPath = path.join(second.ctx.paths.context, "plan.json");
    const contextPlan = JSON.parse(fs.readFileSync(contextPath, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(contextPath, `${JSON.stringify({ ...contextPlan, indexDigest: "0".repeat(64) }, null, 2)}\n`);
    expect(() => runDispatch({ cwd: second.repo, uadsHome: second.home, session: "imp-1" })).toThrow(
      /specialist routing state|stale|mismatch|Context\/Impact/i,
    );
  });

  it("rejects Work Order specialist and assignment copies that diverge from the plan", () => {
    const first = planFixture();
    const checkpoint = JSON.parse(fs.readFileSync(first.ctx.paths.currentState, "utf8")) as { workOrderId: string };
    const workOrderPath = path.join(first.ctx.paths.workOrders, `${checkpoint.workOrderId}.json`);
    const workOrder = JSON.parse(fs.readFileSync(workOrderPath, "utf8")) as Record<string, unknown>;
    rewriteWorkOrder(first.ctx, { ...workOrder, specialists: ["implementation-agent"] });
    expect(() => runDispatch({ cwd: first.repo, uadsHome: first.home, session: "imp-1" })).toThrow(
      /specialist routing state|diverge|stale|mismatch/i,
    );

    const second = planFixture();
    const secondCheckpoint = JSON.parse(fs.readFileSync(second.ctx.paths.currentState, "utf8")) as { workOrderId: string };
    const secondWorkOrderPath = path.join(second.ctx.paths.workOrders, `${secondCheckpoint.workOrderId}.json`);
    const secondWorkOrder = JSON.parse(fs.readFileSync(secondWorkOrderPath, "utf8")) as Record<string, unknown>;
    const assignments = Array.isArray(secondWorkOrder.specialistAssignments)
      ? secondWorkOrder.specialistAssignments.slice(0, -1)
      : [];
    rewriteWorkOrder(second.ctx, { ...secondWorkOrder, specialistAssignments: assignments });
    expect(() => runDispatch({ cwd: second.repo, uadsHome: second.home, session: "imp-1" })).toThrow(
      /specialist routing state|diverge|stale|mismatch/i,
    );
  });
});
