import { describe, expect, it } from "vitest";
import { assertSchema } from "../src/lib/json-schema.js";
import {
  computeDirectReviewDigest,
  createDirectReviewEvidence,
  parseAuditSummary,
  parseEvalSummary,
  parseVitestSummary,
  validateDirectReviewEvidence,
} from "../src/github/direct-review.js";

const sha = "a".repeat(40);

function steps(outcome: string | Record<string, string> = "success"): Record<string, string> {
  const ids = [
    "install", "lint", "typecheck", "build", "action-pins", "tests", "eval-orchestrator", "eval-execution",
    "eval-context", "eval-fault", "eval-cost", "eval-model-routing", "eval-specialist-routing", "eval-adapters", "eval-assurance", "eval-fault-injection", "skills-validation", "validate", "npm-audit", "packaging",
  ];
  return Object.fromEntries(ids.map((id) => [id, typeof outcome === "string" ? outcome : outcome[id] ?? "success"]));
}

function evidence(overrides: Record<string, unknown> = {}) {
  return createDirectReviewEvidence({
    repository: "KayzenRoot/uads",
    branch: "main",
    commitSha: sha,
    gitTreeSha: sha,
    version: "0.8.0",
    event: "push",
    workflow: { runId: 123, runAttempt: 1, workflowName: "CI", jobName: "foundation", htmlUrl: "https://github.com/KayzenRoot/uads/actions/runs/123" },
    comparison: { baseSha: "b".repeat(40), headSha: sha, changedFileCount: 1, changedPaths: ["src/github/direct-review.ts"] },
    stepOutcomes: steps(),
    logs: {
      tests: "Test Files 38 passed (38)\nTests 240 passed (240)",
      "eval-orchestrator": "9 passed, 0 failed, 9 total",
      "eval-execution": "9 passed, 0 failed, 9 total",
      "eval-context": "19 passed, 0 failed, 19 total",
      "eval-fault": "18 passed, 0 failed, 18 total",
      "eval-cost": "27 passed, 0 failed, 27 total",
      "eval-model-routing": "20 passed, 0 failed, 20 total",
      "eval-specialist-routing": "26 passed, 0 failed, 26 total",
      "eval-adapters": "36 passed, 0 failed, 36 total",
      "eval-assurance": "16 passed, 0 failed, 16 total",
      "eval-fault-injection": "16 passed, 0 failed, 16 total",
      "npm-audit": "found 0 vulnerabilities",
    },
    artifactName: `uads-direct-review-${sha}`,
    generatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  });
}

describe("GitHub direct review evidence", () => {
  it("parses bounded test, eval, and audit summaries", () => {
    expect(parseVitestSummary("Test Files 38 passed (38)\nTests 240 passed (240)" )).toEqual({ testFilesPassed: 38, testsPassed: 240, testsFailed: 0 });
    expect(parseEvalSummary("20 passed, 0 failed, 20 total")).toEqual({ passed: 20, failed: 0, total: 20 });
    expect(parseEvalSummary("model routing eval 20/20")).toEqual({ passed: 20, failed: 0, total: 20 });
    expect(parseAuditSummary("found 0 vulnerabilities")).toEqual({ outcome: "success", highOrGreaterVulnerabilities: 0 });
    expect(parseAuditSummary("audit command failed")).toEqual({ outcome: "unknown", highOrGreaterVulnerabilities: null });
  });

  it("creates schema-valid PASS evidence only with a proven identity", () => {
    const item = evidence();
    expect(item.finalVerdict).toBe("PASS");
    expect(item.evidenceContractDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(validateDirectReviewEvidence(item)).toEqual([]);
    expect(() => assertSchema("github-direct-review-evidence.schema.json", item, process.cwd())).not.toThrow();
  });

  it("fails closed when a required gate fails", () => {
    const item = evidence({ stepOutcomes: steps({ tests: "failure" }) });
    expect(item.finalVerdict).toBe("FAIL");
    expect(item.reasonCodes).toContain("REQUIRED_GATE_NOT_SUCCESS:TESTS");
    expect(validateDirectReviewEvidence(item)).toEqual([]);
  });

  it("reports INCOMPLETE for unknown or malformed gate outcomes", () => {
    const unknown = evidence({ stepOutcomes: steps({ tests: "unknown" }) });
    expect(unknown.finalVerdict).toBe("INCOMPLETE");
    expect(unknown.reasonCodes).toContain("REQUIRED_GATE_NOT_SUCCESS:TESTS");
    const malformed = evidence({ stepOutcomes: "not-json" });
    expect(malformed.finalVerdict).toBe("INCOMPLETE");
    expect(malformed.reasonCodes).toContain("STEP_OUTCOME_MALFORMED");
  });

  it("does not fabricate counts when logs are absent", () => {
    const item = evidence({ logs: {} });
    expect(item.finalVerdict).toBe("PASS");
    expect(item.validation.testsPassed).toBeNull();
    expect(item.validation.orchestrator.total).toBeNull();
    expect(item.reasonCodes).toContain("COUNT_PARSE_UNAVAILABLE:TESTS");
    expect(item.reasonCodes).toContain("COUNT_PARSE_UNAVAILABLE:ORCHESTRATOR");
  });

  it("sanitizes paths, URLs, and identity fields without retaining host paths or secrets", () => {
    const item = evidence({
      commitSha: `C:\\Users\\owner\\${"a".repeat(40)}`,
      artifactName: "C:\\Users\\owner\\secret.json",
      comparison: { changedPaths: ["C:\\Users\\owner\\secret.txt", "src/github/direct-review.ts"] },
      workflow: { htmlUrl: "https://evil.example/run/123" },
    });
    expect(item.commitSha).toBeNull();
    expect(item.artifact.name).toBeNull();
    expect(item.comparison.changedPaths).toBeNull();
    expect(item.comparison.comparisonStatus).toBe("unavailable");
    expect(item.comparison.comparisonReasonCode).toBe("COMPARISON_METADATA_UNAVAILABLE");
    expect(item.workflow.htmlUrl).toBeNull();
    expect(item.finalVerdict).toBe("INCOMPLETE");
    expect(JSON.stringify(item)).not.toMatch(/Users|secret|evil\.example/i);
  });

  it("detects tampering through the contract digest", () => {
    const item = evidence();
    const tampered = { ...item, finalVerdict: "FAIL" as const };
    expect(validateDirectReviewEvidence(tampered)).toContain("evidence-digest-mismatch");
    expect(computeDirectReviewDigest(item)).toBe(item.evidenceContractDigest);
  });

  it("rejects schema extensions that could smuggle unreviewed fields", () => {
    expect(() => assertSchema("github-direct-review-evidence.schema.json", { ...evidence(), unexpected: "value" }, process.cwd())).toThrow(/additional properties/i);
  });

  it("uses an explicit finalizer provenance for release derivatives", () => {
    const item = createDirectReviewEvidence({ ...evidence(), generatedByScript: "finalizer" });
    expect(item.provenance.generatedByScript).toBe("scripts/github/finalize-direct-review-evidence.mjs");
    expect(validateDirectReviewEvidence(item)).toEqual([]);
    expect(() => assertSchema("github-direct-review-evidence.schema.json", item, process.cwd())).not.toThrow();
  });
});
