import type { UpirContextRadius, UpirTaskClass } from "./upir.js";

export const CONTEXT_RADIUS_VERSION = "1.0.0" as const;

export type ContextExpansionReason =
  | "DIRECT_DEP_REQUIRED"
  | "INTERFACE_REQUIRED"
  | "ARCHITECTURE_CONTRACT_REQUIRED"
  | "SOURCE_CONFLICT_INVESTIGATION"
  | "TEST_COVERAGE_REQUIRED";

export type ContextExpansion = {
  from: UpirContextRadius;
  to: UpirContextRadius;
  reason: ContextExpansionReason;
};

const ORDER: UpirContextRadius[] = ["C0", "C1", "C2", "C3", "C4"];

export function defaultRadiusFor(taskClass: UpirTaskClass): UpirContextRadius {
  if (taskClass === "T0") return "C0";
  if (taskClass === "T1") return "C1";
  if (taskClass === "T2") return "C2";
  return "C3";
}

export function smallestSafeRadius(taskClass: UpirTaskClass, hasSourceConflict: boolean): UpirContextRadius {
  if (hasSourceConflict) return "C3";
  return defaultRadiusFor(taskClass);
}

export function expandRadius(from: UpirContextRadius, to: UpirContextRadius, reason: ContextExpansionReason): ContextExpansion {
  if (!ORDER.includes(from) || !ORDER.includes(to)) throw new Error("RADIUS_BOUND_REJECTED");
  if (ORDER.indexOf(to) < ORDER.indexOf(from)) throw new Error("RADIUS_CONTRACTION_REJECTED");
  if (ORDER.indexOf(to) === ORDER.indexOf(from)) throw new Error("RADIUS_NOOP_REJECTED");
  return { from, to, reason };
}

export function describeRadius(radius: UpirContextRadius): string {
  if (radius === "C0") return "target symbol + direct test";
  if (radius === "C1") return "target symbols + direct deps/tests";
  if (radius === "C2") return "module/interfaces";
  if (radius === "C3") return "related architecture/contracts";
  return "broad project architecture";
}
