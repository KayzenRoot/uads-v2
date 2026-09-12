import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { containsAbsoluteHostPath, containsUnredactedSecret } from "../lib/secrets.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import { routeWorkOrder } from "./model-router.js";
import { MODEL_EXECUTION_PLAN_SCHEMA_VERSION, type ModelExecutionPlan } from "./model-types.js";

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

export type CurrentModelPlanRead =
  | { status: "CURRENT"; plan: ModelExecutionPlan }
  | { status: "LEGACY"; observedSchemaVersion: string | null; reasonCode: "PLAN_SCHEMA_LEGACY" }
  | { status: "UNAVAILABLE"; reasonCodes: string[]; message: string };

/**
 * Truthful current-plan read for status/cockpit surfaces. Never throws: a persisted plan
 * with a prior schema version degrades to LEGACY (no silent upcast) and unreadable or
 * invalid content degrades to UNAVAILABLE with explicit reason codes.
 */
export function readCurrentModelExecutionPlanState(paths: UadsPaths, schemaRoot?: string): CurrentModelPlanRead {
  const parsed = readJsonIfValid<unknown>(paths.currentModelRouting);
  if (!parsed.ok) {
    return { status: "UNAVAILABLE", reasonCodes: ["PLAN_UNAVAILABLE"], message: parsed.error };
  }
  try {
    assertSafeModelPlan(parsed.value);
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      reasonCodes: ["PLAN_UNAVAILABLE", "PLAN_UNSAFE_CONTENT"],
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const errors = validateAgainstSchema("model-execution-plan.schema.json", parsed.value, schemaRoot);
  if (errors.length > 0) {
    const observed = typeof parsed.value === "object" && parsed.value !== null
      ? (parsed.value as { schemaVersion?: unknown }).schemaVersion
      : null;
    if (observed !== MODEL_EXECUTION_PLAN_SCHEMA_VERSION) {
      return {
        status: "LEGACY",
        observedSchemaVersion: typeof observed === "string" ? observed : null,
        reasonCode: "PLAN_SCHEMA_LEGACY",
      };
    }
    return { status: "UNAVAILABLE", reasonCodes: ["PLAN_UNAVAILABLE", "PLAN_CORRUPT"], message: errors.join("; ") };
  }
  return { status: "CURRENT", plan: parsed.value as ModelExecutionPlan };
}

export function readCurrentModelExecutionPlan(paths: UadsPaths, schemaRoot?: string): ModelExecutionPlan | null {
  const read = readCurrentModelExecutionPlanState(paths, schemaRoot);
  return read.status === "CURRENT" ? read.plan : null;
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
