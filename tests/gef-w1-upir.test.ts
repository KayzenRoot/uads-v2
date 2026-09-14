import { describe, expect, it } from "vitest";
import { buildUpir, canonicalDigest, normalizeRepoRelativePath, normalizeRepoRelativePathDeterministic, validateUpir } from "../src/gef/upir.js";
import { classifyTask } from "../src/gef/task-classifier.js";
import { defaultRadiusFor, expandRadius } from "../src/gef/context-radius.js";
import { buildDecisionCapsule, validateDecisionCapsule } from "../src/gef/decision-capsule.js";

function baseUpirInput() {
  return {
    schemaVersion: "0.1.0" as const,
    taskId: "w1-test-task",
    projectFingerprint: "a".repeat(64),
    workOrder: "GEF-W1",
    taskClass: "T1" as const,
    contextRadius: "C1" as const,
    baseSha: "0".repeat(40),
    reviewedHeadSha: null,
    goal: "Fix bounded symbol",
    acceptedFindings: ["accepted finding"],
    openFindings: ["open finding"],
    targetSymbols: ["targetSymbol"],
    frozenInvariants: ["Global-first / zero-project-footprint is mandatory."],
    requiredProofs: ["focused test"],
    budgets: {
      maxRepositorySearches: 12,
      maxExtraFilesOpened: 16,
      maxSourceFilesChanged: 8,
      maxTestFilesChanged: 4,
      maxSemanticLOC: 800,
      retryBudget: 1,
      targetInputTokens: null,
      targetOutputTokens: null,
      targetActiveSeconds: null,
    },
    stopConditions: ["STOP at COMPLETE_CANDIDATE."],
  };
}

describe("GEF W1 UPIR + classifier + radius", () => {
  it("produces the same digest for the same canonical inputs", () => {
    const first = buildUpir(baseUpirInput());
    const second = buildUpir(baseUpirInput());
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalDigest({ b: 2, a: 1 })).toBe(canonicalDigest({ a: 1, b: 2 }));
  });

  it("rejects unknown or unsafe fields", () => {
    const candidate = { ...buildUpir(baseUpirInput()), unexpected: true };
    expect(validateUpir(candidate).length).toBeGreaterThan(0);
    expect(() => buildUpir({ ...baseUpirInput(), taskId: "../traversal" })).toThrow("TASK_ID_TRAVERSAL_REJECTED");
    expect(validateUpir({ ...baseUpirInput() }).length).toBeGreaterThan(0);
  });

  it("classifies into bounded T0-T3 with reason codes", () => {
    expect(classifyTask({ evidenceOnly: true, sourceFilesChanged: 0 }).taskClass).toBe("T0");
    expect(classifyTask({ sourceFilesChanged: 1, targetSymbols: 1 }).taskClass).toBe("T1");
    expect(classifyTask({ sourceFilesChanged: 2, targetSymbols: 2 }).taskClass).toBe("T2");
    expect(classifyTask({ sourceFilesChanged: 9 }).taskClass).toBe("T3");
    expect(classifyTask({ hasSourceConflict: true }).taskClass).toBe("T3");
    for (const result of [classifyTask({}), classifyTask({ sourceFilesChanged: 3 }), classifyTask({ hasArchitectureDecision: true })]) {
      expect(["T0", "T1", "T2", "T3"]).toContain(result.taskClass);
      expect(result.reasonCodes.length).toBeGreaterThan(0);
      expect(result.classifierVersion).toBe("1.0.0");
    }
  });

  it("defaults to the smallest safe radius and records expansion", () => {
    expect(defaultRadiusFor("T0")).toBe("C0");
    expect(defaultRadiusFor("T1")).toBe("C1");
    expect(defaultRadiusFor("C2" as never)).not.toBe("C0");
    expect(defaultRadiusFor("T2")).toBe("C2");
    const expansion = expandRadius("C0", "C1", "DIRECT_DEP_REQUIRED");
    expect(expansion).toEqual({ from: "C0", to: "C1", reason: "DIRECT_DEP_REQUIRED" });
    expect(() => expandRadius("C1", "C0", "DIRECT_DEP_REQUIRED")).toThrow();
  });

  it("rejects unbounded decision capsule fields", () => {
    const capsule = {
      schemaVersion: "0.1.0" as const,
      taskId: "w1-test-task",
      rootCause: "cause",
      chosenDecision: "decision",
      invariants: ["invariant"],
      forbiddenAlternatives: ["alt"],
      expectedPostconditions: ["post"],
      negativeCases: ["negative"],
      sourceRefs: [{ path: "src/gef/upir.ts", symbol: "buildUpir" }],
    };
    expect(validateDecisionCapsule(capsule).length).toBe(0);
    expect(buildDecisionCapsule(capsule).taskId).toBe("w1-test-task");
    expect(validateDecisionCapsule({ ...capsule, unexpected: true }).length).toBeGreaterThan(0);
    expect(validateDecisionCapsule({ ...capsule, rootCause: "x".repeat(5000) }).length).toBeGreaterThan(0);
  });

  it("normalizes Windows and Linux paths deterministically", () => {
    expect(normalizeRepoRelativePath("src\\gef\\upir.ts")).toBe("src/gef/upir.ts");
    expect(normalizeRepoRelativePath("src/gef/upir.ts")).toBe("src/gef/upir.ts");
    const compared = normalizeRepoRelativePathDeterministic("src\\gef\\upir.ts", "src/gef/upir.ts");
    expect(compared.equal).toBe(true);
    expect(compared.fromWindows).toBe(compared.fromPosix);
    expect(() => normalizeRepoRelativePath("../escape.ts")).toThrow("PATH_TRAVERSAL_REJECTED");
    expect(() => normalizeRepoRelativePath("/absolute/path.ts")).toThrow();
  });
});
