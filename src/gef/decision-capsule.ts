import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import { assertSafeTaskId } from "./upir.js";

export const DECISION_CAPSULE_VERSION = "0.1.0" as const;
export const DECISION_CAPSULE_SCHEMA_FILE = "gef-decision-capsule.schema.json" as const;

export type DecisionSourceRef = {
  path: string;
  symbol?: string;
  digest?: string;
};

export type DecisionCapsule = {
  schemaVersion: typeof DECISION_CAPSULE_VERSION;
  taskId: string;
  rootCause: string;
  chosenDecision: string;
  invariants: string[];
  forbiddenAlternatives: string[];
  expectedPostconditions: string[];
  negativeCases: string[];
  sourceRefs: DecisionSourceRef[];
};

export function validateDecisionCapsule(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(DECISION_CAPSULE_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}

export function assertDecisionCapsule(data: unknown, schemaRoot?: string): asserts data is DecisionCapsule {
  assertSchema(DECISION_CAPSULE_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
  assertSafeTaskId((data as DecisionCapsule).taskId);
}

export function buildDecisionCapsule(input: DecisionCapsule, schemaRoot?: string): DecisionCapsule {
  assertSafeTaskId(input.taskId);
  const errors = validateDecisionCapsule(input, schemaRoot);
  if (errors.length > 0) throw new Error(`DECISION_CAPSULE_REJECTED: ${errors.join("; ")}`);
  return { ...input, sourceRefs: [...input.sourceRefs] };
}
