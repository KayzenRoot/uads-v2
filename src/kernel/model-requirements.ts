import type { ContextPack } from "./intelligence-types.js";
import type { WorkOrder } from "./types.js";
import type {
  CapabilityClass,
  ModelCapability,
  ModelRoutingFailureSignals,
  ModelRoutingRequirements,
  ReasoningClass,
} from "./model-types.js";

const CLASS_ORDER: CapabilityClass[] = ["economy", "balanced", "strong", "critical"];
const REASONING_ORDER: ReasoningClass[] = ["basic", "standard", "advanced", "deep"];

export function capabilityRank(value: CapabilityClass): number {
  return CLASS_ORDER.indexOf(value);
}

export function reasoningRank(value: ReasoningClass): number {
  return REASONING_ORDER.indexOf(value);
}

export function maxCapability(a: CapabilityClass, b: CapabilityClass): CapabilityClass {
  return capabilityRank(a) >= capabilityRank(b) ? a : b;
}

function qualityFloorFor(workOrder: WorkOrder): { floor: CapabilityClass; reasons: string[] } {
  let floor = workOrder.tokenBudget.capabilityClass;
  const reasons: string[] = [];
  const riskFloor: CapabilityClass = workOrder.riskLevel === "CRITICAL"
    ? "critical"
    : workOrder.riskLevel === "HIGH"
      ? "strong"
      : workOrder.riskLevel === "MEDIUM"
        ? "balanced"
        : "economy";
  const scopeFloor: CapabilityClass = workOrder.scopeClass === "architectural"
    ? "strong"
    : workOrder.scopeClass === "cross-cutting"
      ? "balanced"
      : "economy";
  const text = `${workOrder.objective} ${workOrder.domains.join(" ")} ${workOrder.riskReasons.join(" ")} ${workOrder.qualityGates.join(" ")}`.toLowerCase();
  const sensitiveFloor: CapabilityClass = /destructive|security|financial|finance|web3|smart[- ]contract|wallet|payment|authentication|authorization/.test(text)
    ? "strong"
    : "economy";
  const floorBefore = floor;
  floor = maxCapability(floor, riskFloor);
  floor = maxCapability(floor, scopeFloor);
  floor = maxCapability(floor, sensitiveFloor);
  if (floor !== floorBefore) reasons.push(`QUALITY_FLOOR_RAISED:${floor}`);
  return { floor, reasons };
}

function minimumReasoning(capabilityClass: CapabilityClass): ReasoningClass {
  switch (capabilityClass) {
    case "economy": return "basic";
    case "balanced": return "standard";
    case "strong": return "advanced";
    case "critical": return "deep";
  }
}

export function minimumReasoningFor(capabilityClass: CapabilityClass): ReasoningClass {
  return minimumReasoning(capabilityClass);
}

function complexityFor(workOrder: WorkOrder): ModelRoutingRequirements["complexity"] {
  if (workOrder.riskLevel === "CRITICAL") return "critical";
  if (workOrder.scopeClass === "trivial") return "trivial";
  if (workOrder.riskLevel === "HIGH" || workOrder.scopeClass === "architectural" || workOrder.scopeClass === "cross-cutting") return "complex";
  return "moderate";
}

function uncertaintyFor(workOrder: WorkOrder): number {
  const text = `${workOrder.objective} ${workOrder.riskReasons.join(" ")} ${workOrder.recommendations.join(" ")}`.toLowerCase();
  let score = Math.min(60, workOrder.riskReasons.length * 8 + workOrder.affectedAreas.length * 4);
  if (/unknown|uncertain|ambigu|unresolved|explore|investigate/.test(text)) score += 20;
  if (workOrder.scopeClass === "architectural") score += 15;
  return Math.min(100, score);
}

function addCapability(capabilities: ModelCapability[], value: ModelCapability): void {
  if (!capabilities.includes(value)) capabilities.push(value);
}

export function deriveModelRequirements(input: {
  workOrder: WorkOrder;
  contextPack?: ContextPack | null;
  estimatedInputTokens?: number;
  requiredOutputTokens?: number;
  failureSignals?: ModelRoutingFailureSignals;
  allowExperimental?: boolean;
  preferredCapabilityClass?: CapabilityClass;
  blockedProviderIds?: string[];
}): ModelRoutingRequirements {
  const workOrder = input.workOrder;
  const qualityFloor = qualityFloorFor(workOrder);
  let requiredCapabilityClass = qualityFloor.floor;
  const escalationReasons: string[] = [...qualityFloor.reasons];
  const failures = input.failureSignals ?? {};
  const escalationCount = (failures.repeatedDistinctFailures ?? 0) + (failures.loopDetected ? 1 : 0) + (failures.unresolvedAmbiguity ? 1 : 0) + (failures.failedArchitectureReview ? 1 : 0) + (failures.explicitReasons?.length ?? 0);
  if (escalationCount > 0) {
    const nextRank = Math.min(CLASS_ORDER.length - 1, capabilityRank(requiredCapabilityClass) + Math.min(2, escalationCount));
    const escalated = CLASS_ORDER[nextRank] ?? "critical";
    if (escalated !== requiredCapabilityClass) {
      requiredCapabilityClass = escalated;
      escalationReasons.push("ESCALATION_SIGNAL_RAISED_FLOOR");
    }
  }
  if ((failures.loopDetected || (failures.repeatedDistinctFailures ?? 0) >= 2) && !escalationReasons.includes("REPEATED_FAILURE_ESCALATION")) {
    escalationReasons.push("REPEATED_FAILURE_ESCALATION");
  }
  if (failures.unresolvedAmbiguity) escalationReasons.push("UNRESOLVED_AMBIGUITY_ESCALATION");
  if (failures.failedArchitectureReview) escalationReasons.push("ARCHITECTURE_REVIEW_ESCALATION");
  for (const reason of failures.explicitReasons ?? []) {
    if (!escalationReasons.includes(reason)) escalationReasons.push(reason);
  }
  if (input.preferredCapabilityClass && capabilityRank(input.preferredCapabilityClass) > capabilityRank(requiredCapabilityClass)) {
    requiredCapabilityClass = input.preferredCapabilityClass;
    escalationReasons.push("EXPLICIT_PREFERENCE_RAISED_FLOOR");
  }

  const requiredCapabilities: ModelCapability[] = ["modelSelection"];
  const text = `${workOrder.objective} ${workOrder.domains.join(" ")} ${workOrder.qualityGates.join(" ")}`.toLowerCase();
  if (/tool[- ]?call|execute (a )?tool|shell|command execution|browser automation/.test(text)) addCapability(requiredCapabilities, "toolCalling");
  if (/structured output|json output|schema output|machine[- ]readable/.test(text)) addCapability(requiredCapabilities, "structuredOutput");
  if (/vision|image|screenshot|visual input/.test(text)) addCapability(requiredCapabilities, "visionInput");

  const estimatedInputTokens = Math.max(0, Math.floor(input.estimatedInputTokens ?? input.contextPack?.estimatedTokens ?? 0));
  const hardLimit = Math.max(0, workOrder.tokenBudget.hardLimit);
  const requiredOutputTokens = Math.max(
    0,
    Math.floor(input.requiredOutputTokens ?? Math.min(4096, Math.max(512, Math.floor(hardLimit * 0.25))),),
  );
  const reasons = [
    `risk=${workOrder.riskLevel}`,
    `scope=${workOrder.scopeClass}`,
    `quality-floor=${requiredCapabilityClass}`,
    `reasoning-floor=${minimumReasoning(requiredCapabilityClass)}`,
    `estimated-input=${estimatedInputTokens}`,
    ...escalationReasons,
  ];
  return {
    requiredCapabilityClass,
    requiredCapabilities,
    minimumReasoningClass: minimumReasoning(requiredCapabilityClass),
    estimatedInputTokens,
    requiredOutputTokens,
    requireProvenRuntime: true,
    allowExperimental: input.allowExperimental === true && workOrder.riskLevel !== "CRITICAL",
    explicitPreferenceFloor: input.preferredCapabilityClass,
    blockedProviderIds: [...new Set(input.blockedProviderIds ?? [])].sort(),
    complexity: complexityFor(workOrder),
    uncertainty: uncertaintyFor(workOrder),
    reasons,
  };
}
