import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { isPathInside, sha256Hex } from "../lib/hash.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import {
  computeSpecialistGateContractDigest,
  isSpecialistSelectionPlanCurrent,
} from "./specialist-router.js";
import { loadSpecialistRegistry } from "./specialist-registry.js";
import type { ContextPlan, RoutingDecision, WorkOrder } from "./types.js";
import type { SpecialistRegistry, SpecialistRoutingInput, SpecialistSelectionPlan } from "./specialist-types.js";

export class SpecialistSelectionPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecialistSelectionPersistenceError";
  }
}

function assertSafePath(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isPathInside(resolvedRoot, resolvedTarget)) throw new SpecialistSelectionPersistenceError("specialist selection path escape rejected");
  let current = resolvedRoot;
  for (const segment of path.relative(resolvedRoot, resolvedTarget).split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new SpecialistSelectionPersistenceError("specialist selection symlink escape rejected");
  }
}

function validatePlan(plan: SpecialistSelectionPlan, schemaRoot?: string): SpecialistSelectionPlan {
  try {
    assertSchema("specialist-selection-plan.schema.json", plan, schemaRoot);
    const { selectionDigest, ...withoutDigest } = plan;
    if (selectionDigest !== sha256Hex(JSON.stringify(withoutDigest))) {
      throw new Error("specialist selection digest mismatch");
    }
  } catch (error) {
    throw new SpecialistSelectionPersistenceError(error instanceof Error ? error.message : String(error));
  }
  return plan;
}

export function persistSpecialistSelectionPlan(
  paths: UadsPaths,
  plan: SpecialistSelectionPlan,
  schemaRoot?: string,
): SpecialistSelectionPlan {
  const validated = validatePlan(plan, schemaRoot);
  assertSafePath(paths.home, paths.currentSpecialistSelection);
  assertSafePath(paths.home, paths.specialistSelectionHistory);
  fs.mkdirSync(paths.specialistSelectionHistory, { recursive: true });
  const safePlan = sanitizeOperationalValue(validated);
  atomicWriteJson(paths.currentSpecialistSelection, safePlan);
  atomicWriteJson(path.join(paths.specialistSelectionHistory, `${plan.selectionPlanId}.json`), safePlan);
  return validated;
}

export function readCurrentSpecialistSelectionPlan(paths: UadsPaths, schemaRoot?: string): SpecialistSelectionPlan | null {
  if (!fs.existsSync(paths.currentSpecialistSelection)) return null;
  assertSafePath(paths.home, paths.currentSpecialistSelection);
  const parsed = readJsonIfValid<SpecialistSelectionPlan>(paths.currentSpecialistSelection);
  if (!parsed.ok) throw new SpecialistSelectionPersistenceError("current specialist selection is corrupt");
  return validatePlan(parsed.value, schemaRoot);
}

export function assertCurrentSpecialistSelection(
  paths: UadsPaths,
  plan: SpecialistSelectionPlan,
  input: SpecialistRoutingInput,
  schemaRoot?: string,
): void {
  if (plan.status !== "SELECTED") throw new SpecialistSelectionPersistenceError(`specialist selection is blocked: ${plan.blockedReasonCodes.join(", ")}`);
  if (!isSpecialistSelectionPlanCurrent(plan, input)) throw new SpecialistSelectionPersistenceError("specialist selection is stale or bound to different project/routing inputs");
  validatePlan(plan, schemaRoot);
}

type SpecialistSelectionArtifacts = {
  routing?: RoutingDecision | null;
  contextPlan?: ContextPlan | null;
  currentImpactDigest?: string | null;
  currentChangeDigest?: string | null;
};

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function sameStringSet(left: string[], right: string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function stableAssignments(value: unknown): string {
  const assignments = Array.isArray(value)
    ? value.slice().sort((left, right) => {
        const a = left && typeof left === "object" ? String((left as { specialistId?: unknown }).specialistId ?? "") : "";
        const b = right && typeof right === "object" ? String((right as { specialistId?: unknown }).specialistId ?? "") : "";
        return a.localeCompare(b);
      })
    : [];
  return JSON.stringify(stableValue(assignments));
}

export function assertSpecialistSelectionBoundToWorkOrder(
  paths: UadsPaths,
  workOrder: WorkOrder,
  schemaRoot?: string,
  artifacts: SpecialistSelectionArtifacts = {},
): SpecialistSelectionPlan {
  const plan = readCurrentSpecialistSelectionPlan(paths, schemaRoot);
  if (!plan) throw new SpecialistSelectionPersistenceError("current specialist selection is missing");
  if (plan.status !== "SELECTED") {
    throw new SpecialistSelectionPersistenceError(`specialist selection is blocked: ${plan.blockedReasonCodes.join(", ")}`);
  }
  if (
    plan.projectId !== workOrder.projectId ||
    plan.workOrderId !== workOrder.workOrderId ||
    plan.selectionPlanId !== workOrder.specialistSelectionPlanId ||
    plan.selectionDigest !== workOrder.specialistSelectionDigest ||
    plan.registryDigest !== workOrder.specialistRegistryDigest ||
    plan.policyDigest !== workOrder.specialistPolicyDigest ||
    plan.changeDigest !== workOrder.specialistChangeDigest ||
    plan.impactDigest !== workOrder.specialistImpactDigest ||
    plan.gateContractDigest !== workOrder.specialistGateContractDigest
  ) {
    throw new SpecialistSelectionPersistenceError("specialist selection is stale or not bound to the Work Order");
  }

  let registry: SpecialistRegistry;
  try {
    registry = loadSpecialistRegistry(paths, schemaRoot);
  } catch (error) {
    throw new SpecialistSelectionPersistenceError(
      `specialist registry is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (registry.registryDigest !== plan.registryDigest) {
    throw new SpecialistSelectionPersistenceError("specialist registry changed after selection");
  }

  const currentInput = specialistRoutingInputFromCurrentArtifacts({
    workOrder,
    registry,
    routing: artifacts.routing,
    contextPlan: artifacts.contextPlan,
    ...(Object.prototype.hasOwnProperty.call(artifacts, "currentImpactDigest")
      ? { currentImpactDigest: artifacts.currentImpactDigest }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(artifacts, "currentChangeDigest")
      ? { currentChangeDigest: artifacts.currentChangeDigest }
      : {}),
  });
  if (!isSpecialistSelectionPlanCurrent(plan, currentInput)) {
    throw new SpecialistSelectionPersistenceError("specialist selection is stale or semantically mismatched");
  }

  if (
    !sameStringSet(workOrder.specialists, plan.selected.map((item) => item.specialistId)) ||
    !sameStringSet(workOrder.assuranceReviewers, plan.assurance.map((item) => item.specialistId)) ||
    stableAssignments(workOrder.specialistAssignments) !== stableAssignments(plan.assignments)
  ) {
    throw new SpecialistSelectionPersistenceError("Work Order specialist IDs or assignments diverge from the current selection plan");
  }

  const routing = artifacts.routing;
  if (routing) {
    if (
      routing.projectId !== plan.projectId ||
      !sameStringSet(routing.specialists, plan.selected.map((item) => item.specialistId)) ||
      !sameStringSet(routing.assuranceSpecialists, plan.assurance.map((item) => item.specialistId)) ||
      !sameStringSet(routing.domains.map((item) => item.id), workOrder.domains) ||
      !sameStringSet(routing.gates.map((item) => item.id), workOrder.qualityGates) ||
      routing.scopeClass !== workOrder.scopeClass ||
      routing.riskLevel !== workOrder.riskLevel ||
      routing.specialistSelectionPlanId !== plan.selectionPlanId ||
      routing.specialistSelectionDigest !== plan.selectionDigest ||
      routing.specialistRegistryDigest !== plan.registryDigest ||
      routing.specialistPolicyDigest !== plan.policyDigest ||
      routing.specialistChangeDigest !== plan.changeDigest ||
      routing.specialistImpactDigest !== plan.impactDigest ||
      routing.specialistGateContractDigest !== plan.gateContractDigest ||
      !sameStringSet(routing.specialistRiskSignals ?? [], workOrder.specialistRiskSignals ?? []) ||
      JSON.stringify(stableValue(routing.specialistDependencySignals ?? null)) !==
        JSON.stringify(stableValue(workOrder.specialistDependencySignals ?? null))
    ) {
      throw new SpecialistSelectionPersistenceError("Routing Decision diverges from the current selection plan");
    }
    if (computeSpecialistGateContractDigest(routing.gates) !== plan.gateContractDigest) {
      throw new SpecialistSelectionPersistenceError("current routing gate contract differs from the selection plan");
    }
  }

  if (artifacts.contextPlan) {
    const contextImpactDigest = artifacts.contextPlan.indexDigest ?? null;
    if (!contextImpactDigest || !plan.impactDigest) {
      throw new SpecialistSelectionPersistenceError("current Context/Impact identity is missing");
    }
    if (contextImpactDigest !== plan.impactDigest) {
      throw new SpecialistSelectionPersistenceError("current Context/Impact identity differs from the selection plan");
    }
  }
  return plan;
}

export function specialistRoutingInputFromWorkOrder(
  workOrder: Pick<
    WorkOrder,
    | "projectId"
    | "workOrderId"
    | "objective"
    | "includedScope"
    | "outOfScope"
    | "acceptanceCriteria"
    | "constraints"
    | "domains"
    | "scopeClass"
    | "riskLevel"
    | "riskReasons"
    | "specialistRiskSignals"
    | "affectedAreas"
    | "qualityGates"
    | "requiredEvidence"
    | "dependencies"
    | "specialistChangeDigest"
    | "specialistImpactDigest"
    | "specialistGateContractDigest"
    | "specialistDependencySignals"
  >,
  registry: SpecialistRegistry,
): SpecialistRoutingInput {
  return {
    projectId: workOrder.projectId,
    workOrderId: workOrder.workOrderId,
    objective: workOrder.objective,
    constraints: workOrder.constraints ?? [],
    inScope: workOrder.includedScope,
    outOfScope: workOrder.outOfScope,
    acceptanceCriteria: workOrder.acceptanceCriteria,
    domains: workOrder.domains,
    scopeClass: workOrder.scopeClass,
    riskLevel: workOrder.riskLevel,
    riskSignals: workOrder.specialistRiskSignals ?? workOrder.riskReasons,
    riskReasons: workOrder.riskReasons,
    affectedAreas: workOrder.affectedAreas,
    gates: workOrder.qualityGates,
    requiredEvidence: workOrder.requiredEvidence,
    dependencyInfo: workOrder.dependencies,
    dependencySignals: workOrder.specialistDependencySignals ?? null,
    changeDigest: workOrder.specialistChangeDigest ?? null,
    impactDigest: workOrder.specialistImpactDigest ?? null,
    gateContractDigest: workOrder.specialistGateContractDigest ?? null,
    registry,
  };
}

export function specialistRoutingInputFromCurrentArtifacts(input: {
  workOrder: WorkOrder;
  registry: SpecialistRegistry;
  routing?: RoutingDecision | null;
  contextPlan?: ContextPlan | null;
  currentImpactDigest?: string | null;
  currentChangeDigest?: string | null;
}): SpecialistRoutingInput {
  const base = specialistRoutingInputFromWorkOrder(input.workOrder, input.registry);
  const hasCurrentImpact = Object.prototype.hasOwnProperty.call(input, "currentImpactDigest");
  const hasCurrentChange = Object.prototype.hasOwnProperty.call(input, "currentChangeDigest");
  return {
    ...base,
    impactDigest: hasCurrentImpact
      ? input.currentImpactDigest ?? null
      : input.contextPlan && input.contextPlan.indexDigest !== undefined
        ? input.contextPlan.indexDigest ?? null
        : base.impactDigest,
    changeDigest: hasCurrentChange ? input.currentChangeDigest ?? null : base.changeDigest,
    gateContractDigest: input.routing
      ? computeSpecialistGateContractDigest(input.routing.gates)
      : base.gateContractDigest,
  };
}
