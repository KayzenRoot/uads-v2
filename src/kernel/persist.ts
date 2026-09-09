import path from "node:path";
import fs from "node:fs";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import type { Checkpoint, ContextPlan, RoutingDecision, WorkOrder } from "./types.js";

export function readContextPlan(paths: UadsPaths): ContextPlan | null {
  const parsed = readJsonIfValid<ContextPlan>(path.join(paths.context, "plan.json"));
  return parsed.ok ? parsed.value : null;
}

export class InvalidOrchestrationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrchestrationStateError";
  }
}

export function persistPlan(input: {
  paths: UadsPaths;
  workOrder: WorkOrder;
  decision: RoutingDecision;
  checkpoint: Checkpoint;
  contextPlan: ContextPlan;
  schemaRoot?: string;
}): { workOrder: WorkOrder; decision: RoutingDecision; checkpoint: Checkpoint; contextPlan: ContextPlan } {
  const workOrder = sanitizeOperationalValue(input.workOrder);
  const decision = sanitizeOperationalValue(input.decision);
  const checkpoint = sanitizeOperationalValue(input.checkpoint);
  const contextPlan = sanitizeOperationalValue(input.contextPlan);
  assertSchema("work-order.schema.json", workOrder, input.schemaRoot);
  assertSchema("routing-decision.schema.json", decision, input.schemaRoot);
  assertSchema("checkpoint.schema.json", checkpoint, input.schemaRoot);

  atomicWriteJson(sidecarJsonPath(input.paths.workOrders, workOrder.workOrderId), workOrder);
  atomicWriteJson(sidecarJsonPath(input.paths.decisions, decision.routingDecisionId), decision);
  atomicWriteJson(sidecarJsonPath(input.paths.checkpoints, checkpoint.checkpointId), checkpoint);
  atomicWriteJson(input.paths.currentState, checkpoint);
  atomicWriteJson(path.join(input.paths.context, "plan.json"), contextPlan);
  return { workOrder, decision, checkpoint, contextPlan };
}

export function readCurrentCheckpoint(paths: UadsPaths, schemaRoot?: string): Checkpoint | null {
  const current = readJsonIfValid<Checkpoint>(paths.currentState);
  if (current.ok) {
    const errors = (() => {
      try {
        assertSchema("checkpoint.schema.json", current.value, schemaRoot);
        return [];
      } catch (error) {
        return [error instanceof Error ? error.message : String(error)];
      }
    })();
    if (errors.length === 0) {
      return current.value;
    }
  }
  return recoverLatestCheckpoint(paths, schemaRoot);
}

export function recoverLatestCheckpoint(paths: UadsPaths, schemaRoot?: string): Checkpoint | null {
  if (!fs.existsSync(paths.checkpoints)) {
    return null;
  }
  const files = fs
    .readdirSync(paths.checkpoints)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(paths.checkpoints, name));
  const valid: Checkpoint[] = [];
  for (const file of files) {
    const parsed = readJsonIfValid<Checkpoint>(file);
    if (!parsed.ok) {
      continue;
    }
    try {
      assertSchema("checkpoint.schema.json", parsed.value, schemaRoot);
      valid.push(parsed.value);
    } catch {
      continue;
    }
  }
  valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return valid[0] ?? null;
}

export function readWorkOrder(paths: UadsPaths, workOrderId: string, schemaRoot?: string): WorkOrder | null {
  const parsed = readJsonIfValid<WorkOrder>(sidecarJsonPath(paths.workOrders, workOrderId));
  if (!parsed.ok) {
    return null;
  }
  try {
    assertSchema("work-order.schema.json", parsed.value, schemaRoot);
    return parsed.value;
  } catch {
    return null;
  }
}

export function readRoutingDecision(
  paths: UadsPaths,
  routingDecisionId: string,
  schemaRoot?: string,
): RoutingDecision | null {
  const parsed = readJsonIfValid<RoutingDecision>(sidecarJsonPath(paths.decisions, routingDecisionId));
  if (!parsed.ok) {
    return null;
  }
  try {
    assertSchema("routing-decision.schema.json", parsed.value, schemaRoot);
    return parsed.value;
  } catch {
    return null;
  }
}

export function inspectCurrentState(paths: UadsPaths): { valid: boolean; error?: string } {
  if (!fs.existsSync(paths.currentState)) {
    return { valid: true };
  }
  const parsed = readJsonIfValid<unknown>(paths.currentState);
  if (!parsed.ok) {
    return { valid: false, error: parsed.error };
  }
  try {
    assertSchema("checkpoint.schema.json", parsed.value);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}
