import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureWorkspace } from "../../dist/lib/workspace.js";
import { computeB001AnalysisMetrics, persistOperationalEvent, readOperationalEvents } from "../../dist/kernel/operational-events.js";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-m30-b001-"));
const projectId = "m30-b001-proof";
const paths = ensureWorkspace(projectId, home);
const evidenceDigest = createHash("sha256").update("m30-b001-evidence").digest("hex");
const base = {
  projectId,
  correlationId: "b001-proof-correlation",
  workOrderId: "UADS2-WO-003",
  executionRunId: null,
  reviewId: "review-transport-proof",
  eventType: "review.analysis",
  sourceComponent: "m30-b001-proof",
  severity: "info",
  operationalState: null,
  occurredAt: "2026-09-09T12:00:00.000Z",
  gate: "focused-review",
  normalizedSubjectPath: "src/kernel/operational-events.ts",
  normalizedFindingCode: "B-001",
  evidenceDigest,
};
const first = persistOperationalEvent(paths, base);
const second = persistOperationalEvent(paths, { ...base, correlationId: "b001-proof-correlation-2", occurredAt: "2026-09-09T12:00:01.000Z" });
const persisted = readOperationalEvents(paths, { limit: 200 }).events;
const metrics = computeB001AnalysisMetrics(persisted);
const result = {
  schema: "uads.m30-b001-proof",
  schemaVersion: "1.0.0",
  workOrder: "UADS2-WO-003",
  source: "two persisted review.analysis events reloaded from an isolated temporary UADS_HOME",
  transportOnly: true,
  notM08SemanticAnalysis: true,
  canonicalSignature: "eventType | gate | normalizedSubjectPath | normalizedFindingCode | evidenceDigest",
  signatureVersion: metrics.signature,
  persistedEvents: persisted.map((event) => ({
    eventId: event.eventId,
    eventHash: event.eventHash,
    eventType: event.eventType,
    gate: event.gate,
    normalizedSubjectPath: event.normalizedSubjectPath,
    normalizedFindingCode: event.normalizedFindingCode,
    evidenceDigest: event.evidenceDigest,
  })),
  metrics,
  assertions: {
    atLeastTwoPersistedEvents: persisted.length >= 2,
    denominatorNonZero: metrics.denominator > 0,
    duplicateNumeratorDeterministic: metrics.numerator === 1,
    rateDeterministic: metrics.rate === 0.5,
    hashesReloadedFromDisk: persisted.every((event) => event.eventHash === first.eventHash || event.eventHash === second.eventHash),
  },
  limitations: ["proves M30 transport/schema preservation only", "does not claim M08 semantic review integration", "temporary local sidecar evidence"],
};

const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArgument ? path.resolve(outputArgument.slice("--output=".length)) : null;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
