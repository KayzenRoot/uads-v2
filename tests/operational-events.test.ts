import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgainstSchema } from "../src/lib/json-schema.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import {
  computeB001AnalysisMetrics,
  computeOperationalEventHash,
  createOperationalEvent,
  persistOperationalEvent,
  readOperationalEvents,
} from "../src/kernel/operational-events.js";
import type { OperationalEventInput } from "../src/kernel/operational-event-types.js";

function temporaryHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-m30-events-"));
}

function input(overrides: Partial<OperationalEventInput> = {}): OperationalEventInput {
  return {
    projectId: "project-m30",
    correlationId: "corr-m30",
    workOrderId: "UADS2-WO-003",
    executionRunId: null,
    reviewId: null,
    eventType: "operation.activity",
    sourceComponent: "m30-test",
    severity: "info",
    operationalState: null,
    occurredAt: "2026-09-09T12:00:00.000Z",
    message: "bounded activity",
    ...overrides,
  };
}

function analysisInput(overrides: Partial<OperationalEventInput> = {}): OperationalEventInput {
  return input({
    eventType: "review.analysis",
    sourceComponent: "m30-test-review-transport",
    gate: "focused-review",
    normalizedSubjectPath: "src/kernel/example.ts",
    normalizedFindingCode: "B-001",
    evidenceDigest: crypto.createHash("sha256").update("evidence").digest("hex"),
    ...overrides,
  });
}

describe("M30 operational event spine", () => {
  it("validates the closed contract and requires the complete B-001 bridge", () => {
    const event = createOperationalEvent(analysisInput());
    expect(validateAgainstSchema("operational-event.schema.json", event)).toEqual([]);
    expect(() => createOperationalEvent({ ...analysisInput(), gate: undefined })).toThrow(/operational-event/);
    expect(() => createOperationalEvent({ ...input(), severity: "invalid" as never })).toThrow(/operational-event/);
    expect(() => createOperationalEvent({ ...input(), unknownField: true } as never)).toThrow(/operational-event/);
    expect(validateAgainstSchema("operational-event.schema.json", { ...event, schemaVersion: "9.0.0" })).not.toEqual([]);
  });

  it("redacts sensitive text, creates stable hashes, and preserves immutable records", () => {
    const home = temporaryHome();
    const paths = ensureWorkspace("project-m30", home);
    const event = createOperationalEvent(input({
      message: "failed at C:\\Users\\example\\repo\\src\\secret.ts apiKey=ghp_1234567890abcdefghijklmnop",
    }));
    expect(event.message).toContain("[REDACTED");
    expect(event.message).not.toContain("C:\\Users\\example");
    expect(event.message).not.toContain("ghp_1234567890");
    const persisted = persistOperationalEvent(paths, event);
    const target = path.join(paths.observabilityEvents, `${event.eventId}.json`);
    expect(persisted.eventId).toBe(event.eventId);
    expect(fs.existsSync(target)).toBe(true);
    expect(() => persistOperationalEvent(paths, event)).toThrow(/immutable/);
    expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual(event);
    const read = readOperationalEvents(paths);
    expect(read.events).toHaveLength(1);
    const { eventHash: _hash, ...withoutHash } = read.events[0]!;
    expect(computeOperationalEventHash(withoutHash)).toBe(read.events[0]!.eventHash);
    expect(read.health.status).toBe("HEALTHY");
  });

  it("skips corrupt and hash-mismatched records with degraded health", () => {
    const home = temporaryHome();
    const paths = ensureWorkspace("project-m30", home);
    const valid = persistOperationalEvent(paths, input() as OperationalEventInput);
    fs.writeFileSync(path.join(paths.observabilityEvents, "corrupt.json"), "{not-json", "utf8");
    const tampered = { ...valid, message: "tampered" };
    fs.writeFileSync(path.join(paths.observabilityEvents, "tampered.json"), `${JSON.stringify(tampered)}\n`, "utf8");
    const read = readOperationalEvents(paths, { limit: 200 });
    expect(read.events.map((event) => event.eventId)).toEqual([valid.eventId]);
    expect(read.health.status).toBe("DEGRADED");
    expect(read.health.invalidEventCount).toBe(2);
  });

  it("enforces bounded retention and recomputes B-001 duplicate metrics deterministically", () => {
    const home = temporaryHome();
    const paths = ensureWorkspace("project-m30", home);
    const first = persistOperationalEvent(paths, analysisInput(), { retention: 2 });
    const second = persistOperationalEvent(paths, analysisInput({ occurredAt: "2026-09-09T12:00:01.000Z" }), { retention: 2 });
    const third = persistOperationalEvent(paths, analysisInput({ occurredAt: "2026-09-09T12:00:02.000Z" }), { retention: 2 });
    const files = fs.readdirSync(paths.observabilityEvents).filter((name) => name.endsWith(".json"));
    expect(files.length).toBe(2);
    const events = readOperationalEvents(paths, { limit: 200 }).events;
    const metrics = computeB001AnalysisMetrics([first, second, third]);
    expect(metrics.signature).toBe("normalized-structured-analysis-signature-v1");
    expect(metrics.denominator).toBe(3);
    expect(metrics.numerator).toBe(2);
    expect(metrics.rate).toBe(2 / 3);
    expect(metrics.rawEventHashes).toEqual([first, second, third].map((event) => event.eventHash).sort());
    expect(events.length).toBe(2);
  });
});
