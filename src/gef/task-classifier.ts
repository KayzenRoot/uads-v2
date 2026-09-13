import type { UpirTaskClass } from "./upir.js";

export const TASK_CLASSIFIER_VERSION = "1.0.0" as const;

export type TaskClassifierReason =
  | "EVIDENCE_ONLY"
  | "SINGLE_SYMBOL_FIX"
  | "SINGLE_FILE_BOUNDED"
  | "MULTI_FILE_MODULE"
  | "CROSS_MODULE_REFACTOR"
  | "ARCHITECTURE_DECISION"
  | "SOURCE_RECONCILIATION"
  | "OPEN_FINDINGS_REQUIRE_INVESTIGATION";

export type TaskClassification = {
  taskClass: UpirTaskClass;
  reasonCodes: TaskClassifierReason[];
  rationale: string;
  classifierVersion: typeof TASK_CLASSIFIER_VERSION;
};

export type ClassifyTaskInput = {
  sourceFilesChanged?: number;
  testFilesChanged?: number;
  targetSymbols?: number;
  hasArchitectureDecision?: boolean;
  hasSourceConflict?: boolean;
  openFindings?: number;
  evidenceOnly?: boolean;
};

export function classifyTask(input: ClassifyTaskInput): TaskClassification {
  const sourceFiles = input.sourceFilesChanged ?? 0;
  const symbols = input.targetSymbols ?? 0;
  const openFindings = input.openFindings ?? 0;
  if (input.evidenceOnly === true && sourceFiles === 0) {
    return { taskClass: "T0", reasonCodes: ["EVIDENCE_ONLY"], rationale: "No source change; evidence or documentation only.", classifierVersion: TASK_CLASSIFIER_VERSION };
  }
  if (input.hasSourceConflict === true) {
    return { taskClass: "T3", reasonCodes: ["SOURCE_RECONCILIATION"], rationale: "Source baseline conflict requires reconciliation before bounded execution.", classifierVersion: TASK_CLASSIFIER_VERSION };
  }
  if (input.hasArchitectureDecision === true || sourceFiles > 6) {
    const reasons: TaskClassifierReason[] = ["CROSS_MODULE_REFACTOR"];
    if (input.hasArchitectureDecision === true) reasons.unshift("ARCHITECTURE_DECISION");
    return { taskClass: "T3", reasonCodes: reasons, rationale: "Cross-module or architecture-owned change.", classifierVersion: TASK_CLASSIFIER_VERSION };
  }
  if (sourceFiles > 1 || symbols > 1 || openFindings > 2) {
    const reasons: TaskClassifierReason[] = ["MULTI_FILE_MODULE"];
    if (openFindings > 2) reasons.push("OPEN_FINDINGS_REQUIRE_INVESTIGATION");
    return { taskClass: "T2", reasonCodes: reasons, rationale: "Module-scoped change across bounded files or findings.", classifierVersion: TASK_CLASSIFIER_VERSION };
  }
  if (sourceFiles === 1 || symbols === 1) {
    return { taskClass: "T1", reasonCodes: sourceFiles === 1 ? ["SINGLE_FILE_BOUNDED"] : ["SINGLE_SYMBOL_FIX"], rationale: "Single bounded fix.", classifierVersion: TASK_CLASSIFIER_VERSION };
  }
  return { taskClass: "T1", reasonCodes: ["SINGLE_SYMBOL_FIX"], rationale: "Default smallest safe class for a bounded task.", classifierVersion: TASK_CLASSIFIER_VERSION };
}
