import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { computeProjectFingerprint } from "../../dist/lib/fingerprint.js";
import { readGitSummary } from "../../dist/lib/git.js";
import { buildDashboardSnapshot } from "../../dist/commands/dashboard.js";
import { persistOperationalEvent, readOperationalEvents, DEFAULT_OPERATIONAL_EVENT_RETENTION } from "../../dist/kernel/operational-events.js";
import { ensureWorkspace } from "../../dist/lib/workspace.js";

const sampleCount = 24;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-m30-benchmark-"));
const git = readGitSummary(process.cwd());
const projectId = computeProjectFingerprint({ originUrl: git.originUrl, repoRoot: git.repoRoot ?? process.cwd() }).projectId;
const paths = ensureWorkspace(projectId, home);
const durations = { writes: [], reads: [], snapshots: [] };

function event(index) {
  return {
    projectId,
    correlationId: `benchmark-${index}`,
    workOrderId: "UADS2-WO-003",
    executionRunId: null,
    reviewId: null,
    eventType: index % 3 === 0 ? "system.diagnostic" : "operation.activity",
    sourceComponent: "m30-benchmark",
    severity: index % 3 === 0 ? "warn" : "info",
    operationalState: index % 3 === 0 ? "DEGRADED" : null,
    occurredAt: new Date(Date.UTC(2026, 8, 9, 12, 0, 0, index)).toISOString(),
    message: `bounded benchmark event ${index}`,
  };
}

function measure(list, action) {
  const start = performance.now();
  action();
  list.push(performance.now() - start);
}

for (let index = 0; index < sampleCount; index += 1) {
  measure(durations.writes, () => persistOperationalEvent(paths, event(index)));
}
for (let index = 0; index < sampleCount; index += 1) {
  measure(durations.reads, () => readOperationalEvents(paths, { limit: 50 }));
}
for (let index = 0; index < sampleCount; index += 1) {
  measure(durations.snapshots, () => buildDashboardSnapshot(process.cwd(), home));
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return Number(sorted[position].toFixed(3));
}

function summary(values) {
  return { p50Ms: percentile(values, 50), p95Ms: percentile(values, 95), samples: values.length };
}

const retained = readOperationalEvents(paths, { limit: 200 }).health.validEventCount;
const retentionProbeCap = 8;
const retentionProbeProjectId = `${projectId}-retention-probe`;
const retentionProbePaths = ensureWorkspace(retentionProbeProjectId, home);
const retentionProbeEvents = [];
for (let index = 0; index < retentionProbeCap + 2; index += 1) {
  retentionProbeEvents.push(persistOperationalEvent(retentionProbePaths, { ...event(index), projectId: retentionProbeProjectId }, { retention: retentionProbeCap }));
}
const retentionProbeRead = readOperationalEvents(retentionProbePaths, { limit: 200 });
const retentionProbeIds = new Set(retentionProbeRead.events.map((item) => item.eventId));
const result = {
  schema: "uads.m30-benchmark",
  schemaVersion: "1.0.0",
  environment: { node: process.version, platform: process.platform, arch: process.arch, isolatedUadsHome: true },
  method: "synchronous local sidecar writes and bounded reads measured with performance.now()",
  sampleCount,
  writeThroughputEventsPerSecond: Number((sampleCount / (durations.writes.reduce((sum, value) => sum + value, 0) / 1000)).toFixed(2)),
  writeLatency: summary(durations.writes),
  boundedReadLatency: summary(durations.reads),
  dashboardSnapshotLatency: summary(durations.snapshots),
  retentionCap: DEFAULT_OPERATIONAL_EVENT_RETENTION,
  retainedEventCount: retained,
  retentionProbe: {
    configuredCap: retentionProbeCap,
    inputEventCount: retentionProbeEvents.length,
    retainedEventCount: retentionProbeRead.events.length,
    removedEventCount: retentionProbeEvents.length - retentionProbeRead.events.length,
    withinCap: retentionProbeRead.events.length <= retentionProbeCap,
    oldestRemoved: !retentionProbeIds.has(retentionProbeEvents[0].eventId),
    newestRetained: retentionProbeIds.has(retentionProbeEvents.at(-1).eventId),
    health: retentionProbeRead.health.status,
  },
  limitations: ["single Windows developer host", "no production SLO inferred", "synchronous filesystem path", "latency sample uses 24 events; retention probe uses an explicit bounded cap of 8 to exercise over-cap cleanup deterministically"],
};

const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArgument ? path.resolve(outputArgument.slice("--output=".length)) : null;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
