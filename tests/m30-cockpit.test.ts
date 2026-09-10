import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCockpitSnapshot,
  buildDashboardSnapshot,
  createDashboardServer,
  MAX_SSE_CLIENTS,
} from "../src/commands/dashboard.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import {
  buildLivingCockpitProjection,
  type LivingCockpitProjection,
} from "../src/kernel/operational-cockpit.js";
import { CONTINUITY_REASON_CODES } from "../src/kernel/operational-continuity.js";
import {
  createOperationalEvent,
  MAX_OPERATIONAL_EVENT_LIMIT,
  MAX_OPERATIONAL_EVENT_SCAN,
  persistOperationalEvent,
  readOperationalEvents,
} from "../src/kernel/operational-events.js";
import type { OperationalEventInput, OperationalHealth } from "../src/kernel/operational-event-types.js";

const FAKE_GITHUB_TOKEN = `ghp_${"a1b2c3d4e5".repeat(4)}`;
const FAKE_HOST_PATH = "C:\\Users\\csn19\\Documents\\secret-plan.md";

function temporaryHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-m30-cockpit-"));
}

function get(
  port: number,
  requestPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: requestPath, headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    request.on("error", reject);
  });
}

function openStream(
  port: number,
  requestPath = "/api/stream",
  headers: Record<string, string> = {},
): Promise<{ request: http.ClientRequest; response: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: requestPath, headers }, (response) => {
      response.once("data", () => resolve({ request, response }));
    });
    request.on("error", reject);
  });
}

function collectStream(
  port: number,
  requestPath: string,
  headers: Record<string, string> = {},
  settleMs = 250,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: requestPath, headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      setTimeout(() => {
        const text = Buffer.concat(chunks).toString("utf8");
        response.destroy();
        request.destroy();
        resolve(text);
      }, settleMs);
    });
    request.on("error", reject);
  });
}

function eventInput(projectId: string, overrides: Partial<OperationalEventInput> = {}): OperationalEventInput {
  return {
    projectId,
    correlationId: "cockpit-corr",
    workOrderId: "UADS2-WO-020",
    executionRunId: null,
    reviewId: null,
    eventType: "operation.activity",
    sourceComponent: "m30-cockpit-test",
    severity: "info",
    operationalState: null,
    occurredAt: "2026-09-10T12:00:00.000Z",
    message: "objective cockpit event",
    ...overrides,
  };
}

/**
 * Removes backtick template literals. The dashboard embeds its browser shell as
 * template literals, so a static check must ignore that same-origin client code
 * (which only calls /api routes from the user's browser) while still catching a
 * real node-runtime call on the server side.
 */
function stripTemplateLiterals(source: string): string {
  let stripped = "";
  let index = 0;
  while (index < source.length) {
    if (source.charAt(index) === "`") {
      index += 1;
      while (index < source.length) {
        if (source.charAt(index) === "\\") { index += 2; continue; }
        if (source.charAt(index) === "`") { index += 1; break; }
        index += 1;
      }
      stripped += '""';
      continue;
    }
    stripped += source.charAt(index);
    index += 1;
  }
  return stripped;
}

function unavailableHealth(): OperationalHealth {
  return {
    status: "UNAVAILABLE",
    validEventCount: 0,
    invalidEventCount: 0,
    rejectedEventCount: 0,
    scanSaturated: false,
    lastEventAt: null,
    reasonCodes: ["NO_OPERATIONAL_EVENTS"],
    updatedAt: "2026-09-10T12:00:00.000Z",
  };
}

function projectOnce(
  health: OperationalHealth,
  events: Parameters<typeof buildLivingCockpitProjection>[0]["observedEvents"] = [],
  overrides: Partial<Parameters<typeof buildLivingCockpitProjection>[0]> = {},
): LivingCockpitProjection {
  return buildLivingCockpitProjection({
    projectId: "project-test",
    health,
    observedEvents: events,
    continuityEvidence: {
      observedEventCount: health.validEventCount,
      rejectedRecordCount: health.rejectedEventCount,
      scanSaturated: health.scanSaturated,
      replayActive: false,
      baselineEstablished: health.validEventCount > 0 || health.lastEventAt !== null,
    },
    generatedAt: "2026-09-10T12:00:00.000Z",
    ...overrides,
  });
}

describe("UADS2-WO-020 T3 TPSC authority separation (OP-008)", () => {
  it("projects DERIVED state over SOURCE-owned evidence and never writes domain truth", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    try {
      const firstSnapshot = JSON.parse((await get(address.port, "/api/snapshot")).body) as { projectId: string };
      const paths = ensureWorkspace(firstSnapshot.projectId, home);
      const persisted = [
        persistOperationalEvent(paths, eventInput(firstSnapshot.projectId, { correlationId: "corr-one" })),
        persistOperationalEvent(
          paths,
          eventInput(firstSnapshot.projectId, {
            correlationId: "corr-two",
            eventType: "system.diagnostic",
            severity: "warn",
            occurredAt: "2026-09-10T12:00:01.000Z",
          }),
        ),
      ];
      const listingBefore = fs.readdirSync(paths.observabilityEvents).sort();
      const bytesBefore = listingBefore.map((name) =>
        fs.readFileSync(path.join(paths.observabilityEvents, name), "utf8"),
      );

      const cockpitResponse = await get(address.port, "/api/cockpit");
      expect(cockpitResponse.status).toBe(200);
      const cockpit = JSON.parse(cockpitResponse.body) as LivingCockpitProjection;
      expect(cockpit.schema).toBe("uads.living-cockpit");
      expect(cockpit.truthClass).toBe("DERIVED");
      expect(cockpit.authorityNotice).toContain("read-only");
      expect(cockpit.freshness.truthClass).toBe("SOURCE");
      expect(cockpit.freshness.continuityState).toBe("CONTIGUOUS");
      expect(cockpit.globalHealth.sources.map((source) => source.truthClass)).toEqual([
        "SOURCE",
        "DERIVED",
        "SOURCE",
      ]);
      expect(cockpit.evidence.correlationId).toMatch(/^corr-[a-f0-9]{32}$/);
      expect(cockpit.evidence.refs.length).toBeLessThanOrEqual(8);
      expect(cockpit.evidence.refs).toContain(`event:${persisted[1]?.eventId ?? ""}`);

      const snapshot = JSON.parse((await get(address.port, "/api/snapshot")).body) as {
        cockpit: LivingCockpitProjection;
      };
      expect(snapshot.cockpit.schema).toBe("uads.living-cockpit");
      expect(snapshot.cockpit.globalHealth.status).toBe("CURRENT");

      const listingAfter = fs.readdirSync(paths.observabilityEvents).sort();
      const bytesAfter = listingAfter.map((name) =>
        fs.readFileSync(path.join(paths.observabilityEvents, name), "utf8"),
      );
      expect(listingAfter).toEqual(listingBefore);
      expect(bytesAfter).toEqual(bytesBefore);
    } finally {
      await dashboard.stop();
    }
  });

  it("renders absence as UNKNOWN/UNAVAILABLE instead of zero or success", () => {
    const projection = projectOnce(unavailableHealth());

    expect(projection.globalHealth.status).toBe("UNAVAILABLE");
    expect(projection.freshness.truthState).toBe("UNAVAILABLE");
    expect(projection.freshness.reasonCode).toBe("NO_SOURCE_EVIDENCE");
    expect(projection.continuity.state).toBe("UNAVAILABLE");
    expect(projection.economic.truthState).toBe("UNKNOWN");
    expect(projection.economic.reasonCode).toBe("NO_AUTHORITATIVE_ECONOMIC_SOURCE");
    expect(projection.economic.sourceOwnerModules).toEqual(["M07", "M24"]);
    expect(projection.economic.value).toBeNull();
    expect(projection.capability.truthState).toBe("UNAVAILABLE");
    expect(projection.capability.reasonCode).toBe("CAPABILITY_PROJECTION_UNAVAILABLE");
    expect(projection.stream.bufferLimitBytes).toBe(1024 * 1024);
    expect(projection.stream.activeClients).toBe(0);
    for (const state of [projection.globalHealth.status, projection.economic.truthState]) {
      expect(state).not.toBe("CURRENT");
    }
  });

  it("displays zero only with authoritative owner evidence", () => {
    const authoritative = projectOnce(unavailableHealth(), [], {
      economicTruth: {
        truthState: "CURRENT",
        reasonCode: "AUTHORITATIVE_SPEND_LEDGER_CURRENT",
        sourceOwnerModule: "M24",
        observedAt: "2026-09-10T11:59:00.000Z",
        lineageRefs: ["ledger:entry-1"],
        value: 0,
      },
    });
    expect(authoritative.economic.value).toBe(0);
    expect(authoritative.economic.truthState).toBe("CURRENT");
    expect(authoritative.economic.sourceOwnerModules).toEqual(["M24"]);

    const capabilities = projectOnce(unavailableHealth(), [], {
      capabilityTruth: {
        truthState: "UNKNOWN",
        reasonCode: "CAPABILITY_PROOF_UNKNOWN",
        adapters: [
          {
            adapterId: "codex",
            status: "SUPPORTED",
            truthState: "UNKNOWN",
            reasonCodes: ["NO_ACTIVE_PROOF"],
            subjectDigest: "a".repeat(64),
            adapterContractDigest: "b".repeat(64),
            observedAt: "2026-09-10T11:58:00.000Z",
          },
        ],
      },
    });
    expect(capabilities.capability.truthState).toBe("UNKNOWN");
    expect(capabilities.capability.adapters[0]?.subjectDigest).toHaveLength(16);
    expect(capabilities.capability.adapters[0]?.adapterContractDigest).toHaveLength(16);
  });

  it("keeps the dashboard render path free of model-bearing calls", () => {
    const projectionPathFiles = [
      "src/kernel/operational-events.ts",
      "src/kernel/operational-truth.ts",
      "src/kernel/operational-continuity.ts",
      "src/kernel/operational-budget.ts",
      "src/kernel/operational-correlation.ts",
      "src/kernel/operational-cockpit.ts",
      "src/commands/dashboard.ts",
    ];
    const forbiddenImport = /from\s+"[^"]*(model-router|model-runtime|intelligence|specialist-router|orchestrator)[^"]*"/;
    const remoteCall = /(https?\.request\(|\bfetch\(|http\.get\(|http\.request\()/;

    for (const file of projectionPathFiles) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, `${file} must not import a model-bearing module`).not.toMatch(forbiddenImport);
      expect(stripTemplateLiterals(source), `${file} must not perform node-runtime remote calls`).not.toMatch(
        remoteCall,
      );
    }
  });

  it("serves a same-origin-only dashboard shell with no external fetch", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    try {
      const html = (await get(address.port, "/")).body;
      expect(html).not.toContain("://");
      const targets = [...html.matchAll(/fetch\('([^']+)'\)/g)].map((match) => match[1] ?? "");
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target, "browser fetches must stay same-origin /api").toMatch(/^\/api\//);
      }
    } finally {
      await dashboard.stop();
    }
  });
});

describe("UADS2-WO-020 T7 storage pressure and degraded evidence (PF-004)", () => {
  it("marks a corrupt persisted event as degraded and never healthy", () => {
    const health: OperationalHealth = {
      status: "DEGRADED",
      validEventCount: 2,
      invalidEventCount: 1,
      rejectedEventCount: 1,
      scanSaturated: false,
      lastEventAt: "2026-09-10T11:59:00.000Z",
      reasonCodes: ["EVENT_HASH_MISMATCH"],
      updatedAt: "2026-09-10T12:00:00.000Z",
    };
    const projection = projectOnce(health, [], {});

    expect(projection.freshness.truthState).toBe("DEGRADED");
    expect(projection.freshness.reasonCode).toBe("INTEGRITY_DEFECT");
    expect(projection.continuity.state).toBe("GAP_KNOWN");
    expect(projection.continuity.knownGapCount).toBe(1);
    expect(projection.globalHealth.status).toBe("DEGRADED");
    expect(projection.globalHealth.status).not.toBe("CURRENT");
  });

  it("degrades visibly on real corrupt storage without corrupting the domain workload", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    try {
      const snapshotBefore = JSON.parse((await get(address.port, "/api/snapshot")).body) as { projectId: string };
      const paths = ensureWorkspace(snapshotBefore.projectId, home);
      fs.mkdirSync(paths.observabilityEvents, { recursive: true });
      const corruptPath = path.join(paths.observabilityEvents, "corrupt-record.json");
      fs.writeFileSync(corruptPath, "{\"schema\":\"uads.operational-event\",", "utf8");

      const degraded = JSON.parse((await get(address.port, "/api/snapshot")).body) as {
        health: { status: string; invalidEventCount: number };
        cockpit: LivingCockpitProjection;
      };
      expect(degraded.health.invalidEventCount).toBeGreaterThanOrEqual(1);
      expect(degraded.cockpit.globalHealth.status).not.toBe("CURRENT");
      expect(degraded.cockpit.freshness.truthState).toBe("DEGRADED");
      expect(degraded.cockpit.continuity.state).toBe("GAP_KNOWN");
      expect(degraded.cockpit.globalHealth.reasonCodes.length).toBeGreaterThan(0);

      expect(fs.readFileSync(corruptPath, "utf8")).toBe("{\"schema\":\"uads.operational-event\",");

      const recovered = persistOperationalEvent(paths, eventInput(snapshotBefore.projectId, { correlationId: "post-corruption" }));
      const after = JSON.parse((await get(address.port, "/api/snapshot")).body) as {
        latestActivity: { eventId: string } | null;
      };
      expect(after.latestActivity?.eventId).toBe(recovered.eventId);
    } finally {
      await dashboard.stop();
    }
  });

  it("never renders stale evidence as CURRENT", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    try {
      const snapshotBefore = JSON.parse((await get(address.port, "/api/snapshot")).body) as { projectId: string };
      const paths = ensureWorkspace(snapshotBefore.projectId, home);
      const stale = persistOperationalEvent(
        paths,
        eventInput(snapshotBefore.projectId, {
          recordedAt: "2020-01-01T00:00:00.000Z",
          occurredAt: "2020-01-01T00:00:00.000Z",
          correlationId: "stale-corr",
        }),
      );

      const snapshot = JSON.parse((await get(address.port, "/api/snapshot")).body) as {
        health: { status: string };
        cockpit: LivingCockpitProjection;
      };
      expect(stale.eventId).toBeTruthy();
      expect(snapshot.health.status).toBe("HEALTHY");
      expect(snapshot.cockpit.freshness.truthState).toBe("STALE");
      expect(snapshot.cockpit.freshness.reasonCode).toBe("FRESHNESS_LEASE_EXPIRED");
      expect(snapshot.cockpit.globalHealth.status).toBe("STALE");
      expect(snapshot.cockpit.globalHealth.status).not.toBe("CURRENT");
      expect(snapshot.cockpit.globalHealth.reasonCodes).toContain("FRESHNESS_LEASE_EXPIRED");
    } finally {
      await dashboard.stop();
    }
  });
});

describe("UADS2-WO-020 T6 SSE realtime behavior (PF-003)", () => {
  it("replays the bounded window and resumes explicitly from a cursor", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    try {
      const snapshot = JSON.parse((await get(address.port, "/api/snapshot")).body) as { projectId: string };
      const paths = ensureWorkspace(snapshot.projectId, home);
      const events = [0, 1, 2].map((index) =>
        persistOperationalEvent(
          paths,
          eventInput(snapshot.projectId, {
            correlationId: `bounded-${index}`,
            occurredAt: `2026-09-10T12:00:0${index}.000Z`,
            recordedAt: `2026-09-10T12:00:0${index}.000Z`,
          }),
        ),
      );

      const replay = await collectStream(address.port, "/api/stream");
      expect((replay.match(/event: operational/g) ?? []).length).toBe(events.length);
      for (const event of events) {
        expect(replay).toContain(`id: ${event.eventId}`);
      }

      const resumed = await collectStream(address.port, `/api/stream?cursor=${events[0]?.eventId ?? ""}`);
      expect(resumed).toContain("event: stream.resumed");
      expect(resumed).toContain("RESUMED_FROM_CURSOR");
      expect(resumed).not.toContain(`id: ${events[0]?.eventId ?? ""}`);
      expect(resumed).toContain(`id: ${events[2]?.eventId ?? ""}`);
      expect(resumed).not.toContain("event: stream.gap");

      const headerResume = await collectStream(address.port, "/api/stream", {
        "Last-Event-ID": events[1]?.eventId ?? "",
      });
      expect(headerResume).toContain("RESUMED_FROM_CURSOR");
      expect(headerResume).not.toContain(`id: ${events[1]?.eventId ?? ""}`);
      expect(headerResume).toContain(`id: ${events[2]?.eventId ?? ""}`);
    } finally {
      await dashboard.stop();
    }
  });

  it("reports an explicit gap instead of silently skipping when the cursor left the window", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    try {
      const snapshot = JSON.parse((await get(address.port, "/api/snapshot")).body) as { projectId: string };
      const paths = ensureWorkspace(snapshot.projectId, home);
      const event = persistOperationalEvent(paths, eventInput(snapshot.projectId, { correlationId: "gap-corr" }));

      const gapped = await collectStream(address.port, "/api/stream?cursor=unknown-cursor-value");
      expect(gapped).toContain("event: stream.gap");
      expect(gapped).toContain("CURSOR_OUTSIDE_BOUNDED_WINDOW");
      expect(gapped).toContain("GAP_KNOWN");
      expect(gapped).not.toContain("RESUMED_FROM_CURSOR");
      expect(gapped).toContain(`id: ${event.eventId}`);
    } finally {
      await dashboard.stop();
    }
  });

  it("keeps client work bounded and exposes truthful stream state", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    const clients: Array<{ request: http.ClientRequest; response: http.IncomingMessage }> = [];
    try {
      const snapshot = JSON.parse((await get(address.port, "/api/snapshot")).body) as { projectId: string };
      const paths = ensureWorkspace(snapshot.projectId, home);
      const anchor = persistOperationalEvent(paths, eventInput(snapshot.projectId, { correlationId: "anchor" }));

      clients.push(await openStream(address.port, `/api/stream?cursor=${anchor.eventId}`));
      clients.push(await openStream(address.port, `/api/stream?cursor=${anchor.eventId}`));

      const cockpit = JSON.parse((await get(address.port, "/api/cockpit")).body) as LivingCockpitProjection;
      expect(cockpit.stream.activeClients).toBe(2);
      expect(cockpit.stream.maxClients).toBe(MAX_SSE_CLIENTS);
      expect(cockpit.stream.reconnects).toBeGreaterThanOrEqual(2);
      expect(cockpit.stream.slowClientDrops).toBe(0);
      expect(cockpit.stream.lastDropReasonCode).toBeNull();
      expect(cockpit.stream.lastResumeState).toBe("RESUMED_FROM_CURSOR");
      expect(cockpit.stream.bufferLimitBytes).toBe(1024 * 1024);

      for (const client of clients) {
        client.response.destroy();
        client.request.destroy();
      }
      clients.length = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const after = JSON.parse((await get(address.port, "/api/cockpit")).body) as LivingCockpitProjection;
      expect(after.stream.activeClients).toBe(0);
    } finally {
      for (const client of clients) {
        client.response.destroy();
        client.request.destroy();
      }
      await dashboard.stop();
    }
  });
});

describe("UADS2-WO-020 T8 cockpit privacy and economic truth (ES-020, OP-009)", () => {
  it("leaks no raw secrets, prompts or host paths through any default surface", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    try {
      const snapshot = JSON.parse((await get(address.port, "/api/snapshot")).body) as { projectId: string };
      const paths = ensureWorkspace(snapshot.projectId, home);
      persistOperationalEvent(
        paths,
        eventInput(snapshot.projectId, {
          correlationId: "privacy-corr",
          message: `credential ${FAKE_GITHUB_TOKEN} stored at ${FAKE_HOST_PATH}`,
          payload: { note: `raw prompt with ${FAKE_GITHUB_TOKEN}`, location: FAKE_HOST_PATH },
        }),
      );

      const surfaces = [
        (await get(address.port, "/")).body,
        (await get(address.port, "/api/snapshot")).body,
        (await get(address.port, "/api/cockpit")).body,
        (await get(address.port, "/api/events")).body,
      ];
      for (const body of surfaces) {
        expect(body).not.toContain("ghp_");
        expect(body).not.toContain("csn19");
      }

      const cockpit = JSON.parse(surfaces[2] ?? "{}") as LivingCockpitProjection;
      expect(cockpit.economic.truthState).toBe("UNKNOWN");
      expect(cockpit.economic.value).toBeNull();
    } finally {
      await dashboard.stop();
    }
  });
});

describe("UADS2-WO-020 T2 TCL continuity saturation (OP-002)", () => {
  it(
    "projects GAP_UNKNOWN when the real bounded scan saturates and never fabricates rejected records",
    () => {
      const home = temporaryHome();
      const projectId = buildDashboardSnapshot(process.cwd(), home).projectId;
      const paths = ensureWorkspace(projectId, home);
      fs.mkdirSync(paths.observabilityEvents, { recursive: true });
      const fileCount = MAX_OPERATIONAL_EVENT_SCAN + 100;
      for (let index = 0; index < fileCount; index += 1) {
        const event = createOperationalEvent({
          ...eventInput(projectId, {
            correlationId: `saturation-${index}`,
            recordedAt: new Date(Date.now() - (fileCount - index)).toISOString(),
          }),
          eventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        });
        fs.writeFileSync(
          path.join(paths.observabilityEvents, `${event.eventId}.json`),
          `${JSON.stringify(event, null, 2)}\n`,
          "utf8",
        );
      }

      const read = readOperationalEvents(paths, { limit: MAX_OPERATIONAL_EVENT_LIMIT });
      expect(read.health.scanSaturated).toBe(true);
      expect(read.health.rejectedEventCount).toBe(0);
      expect(read.health.invalidEventCount).toBe(1);
      expect(read.health.status).toBe("DEGRADED");
      expect(read.health.validEventCount).toBe(MAX_OPERATIONAL_EVENT_SCAN);
      expect(read.events.length).toBe(MAX_OPERATIONAL_EVENT_LIMIT);

      const cockpit = buildCockpitSnapshot(process.cwd(), home);
      expect(cockpit.continuity.state).toBe("GAP_UNKNOWN");
      expect(cockpit.continuity.reasonCode).toBe(CONTINUITY_REASON_CODES.unknownRange);
      expect(cockpit.continuity.state).not.toBe("GAP_KNOWN");
      expect(cockpit.continuity.state).not.toBe("CONTIGUOUS");
      expect(cockpit.continuity.knownGapCount).toBe(0);
      expect(cockpit.freshness.truthState).toBe("CURRENT");
      expect(cockpit.freshness.reasonCode).toBe("FRESHNESS_LEASE_VALID");
      expect(cockpit.globalHealth.status).not.toBe("CURRENT");
      expect(cockpit.globalHealth.reasonCodes).toContain(CONTINUITY_REASON_CODES.unknownRange);

      const corruptPath = path.join(paths.observabilityEvents, "0-corrupt.json");
      fs.writeFileSync(corruptPath, "{not-json", "utf8");
      const mixed = buildCockpitSnapshot(process.cwd(), home);
      expect(mixed.continuity.state).toBe("GAP_UNKNOWN");
      expect(mixed.continuity.reasonCode).toBe(CONTINUITY_REASON_CODES.unknownRange);
      expect(mixed.continuity.knownGapCount).toBe(1);
      expect(mixed.freshness.truthState).toBe("DEGRADED");
      expect(mixed.freshness.reasonCode).toBe("INTEGRITY_DEFECT");
      expect(mixed.globalHealth.status).not.toBe("CURRENT");
    },
    120_000,
  );
});
