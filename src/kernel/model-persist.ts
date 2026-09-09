import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import { routeWorkOrder } from "./model-router.js";
import type { ModelExecutionPlan } from "./model-types.js";

export class ModelRoutingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRoutingStateError";
  }
}

function assertSafeModelPlan(value: unknown): void {
  const text = JSON.stringify(value);
  if (containsUnredactedSecret(text) || containsAbsoluteHostPath(text)) {
    throw new ModelRoutingStateError("model execution plan contains secret-like or host-path data");
  }
}

export function persistModelExecutionPlan(paths: UadsPaths, plan: ModelExecutionPlan, schemaRoot?: string): ModelExecutionPlan {
  assertSafeModelPlan(plan);
  const sanitized = sanitizeOperationalValue(plan);
  assertSchema("model-execution-plan.schema.json", sanitized, schemaRoot);
  fs.mkdirSync(paths.modelRoutingHistory, { recursive: true });
  atomicWriteJson(sidecarJsonPath(paths.modelRoutingHistory, sanitized.planId), sanitized);
  atomicWriteJson(paths.currentModelRouting, sanitized);
  return sanitized;
}

export function readModelExecutionPlan(paths: UadsPaths, planId: string, schemaRoot?: string): ModelExecutionPlan {
  const parsed = readJsonIfValid<ModelExecutionPlan>(sidecarJsonPath(paths.modelRoutingHistory, planId));
  if (!parsed.ok) throw new ModelRoutingStateError("model execution plan missing or corrupt");
  assertSafeModelPlan(parsed.value);
  try {
    assertSchema("model-execution-plan.schema.json", parsed.value, schemaRoot);
  } catch (error) {
    throw new ModelRoutingStateError(`model execution plan failed schema validation: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parsed.value;
}

export function readCurrentModelExecutionPlan(paths: UadsPaths, schemaRoot?: string): ModelExecutionPlan | null {
  const parsed = readJsonIfValid<ModelExecutionPlan>(paths.currentModelRouting);
  if (!parsed.ok) return null;
  assertSafeModelPlan(parsed.value);
  try {
    assertSchema("model-execution-plan.schema.json", parsed.value, schemaRoot);
  } catch (error) {
    throw new ModelRoutingStateError(`current model execution plan is corrupt: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parsed.value;
}

export function routeAndPersistModelExecutionPlan(input: Parameters<typeof routeWorkOrder>[0]): ModelExecutionPlan {
  const plan = routeWorkOrder(input);
  return persistModelExecutionPlan(input.paths, plan, input.schemaRoot);
}

export function isModelExecutionPlanCurrent(input: {
  plan: ModelExecutionPlan;
  projectId: string;
  workOrderId: string;
  workOrderDigest: string;
  registryDigest: string;
  runtimeIdentityDigest: string;
  policyDigest: string;
  changeDigest?: string | null;
}): boolean {
  const plan = input.plan;
  return (
    plan.projectId === input.projectId &&
    plan.workOrderId === input.workOrderId &&
    plan.workOrderDigest === input.workOrderDigest &&
    plan.registryDigest === input.registryDigest &&
    plan.runtimeIdentityDigest === input.runtimeIdentityDigest &&
    plan.policyDigest === input.policyDigest &&
    (input.changeDigest === undefined || plan.changeDigest === input.changeDigest)
  );
}
