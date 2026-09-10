import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureWorkspace } from "../src/lib/workspace.js";
import { createDashboardServer, MAX_SSE_CLIENTS } from "../src/commands/dashboard.js";
import { persistOperationalEvent } from "../src/kernel/operational-events.js";
import type { OperationalEventInput } from "../src/kernel/operational-event-types.js";

function temporaryHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-m30-dashboard-"));
}

function get(port: number, requestPath: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: requestPath }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
  });
}

function openStream(port: number): Promise<{ request: http.ClientRequest; response: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/api/stream" }, (response) => {
      response.once("data", () => resolve({ request, response }));
    });
    request.on("error", reject);
  });
}

describe("M30 dashboard operator surface", () => {
  it("is loopback-only, serves objective APIs, and emits persisted SSE events", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    const html = await get(address.port, "/");
    expect(html.status).toBe(200);
    expect(html.headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(html.headers["x-content-type-options"]).toBe("nosniff");
    expect(html.body).toContain("UADS V2 / M30");
    expect(html.body.toLowerCase()).not.toContain("mock");

    const snapshot = await get(address.port, "/api/snapshot");
    expect(snapshot.status).toBe(200);
    const snapshotBody = JSON.parse(snapshot.body) as { health: { status: string }; projectId: string };
    expect(snapshotBody.projectId).toBeTruthy();
    expect(snapshotBody.health.status).toBe("UNAVAILABLE");

    const bounded = await get(address.port, "/api/events?limit=9999");
    const boundedBody = JSON.parse(bounded.body) as { events: unknown[] };
    expect(bounded.status).toBe(200);
    expect(boundedBody.events.length).toBeLessThanOrEqual(200);
    expect((await get(address.port, "/../etc/passwd")).status).toBe(404);

    const streamResponse = await new Promise<{ response: http.IncomingMessage; first: string }>((resolve, reject) => {
      const request = http.get({ host: "127.0.0.1", port: address.port, path: "/api/stream" }, (response) => {
        response.once("data", (chunk: Buffer) => resolve({ response, first: chunk.toString("utf8") }));
      });
      request.on("error", reject);
    });
    expect(streamResponse.response.statusCode).toBe(200);
    expect(streamResponse.response.headers["content-type"]).toContain("text/event-stream");
    const nextEvent = new Promise<string>((resolve) => streamResponse.response.once("data", (chunk: Buffer) => resolve(chunk.toString("utf8"))));
    const paths = ensureWorkspace(snapshotBody.projectId, home);
    const event: OperationalEventInput = {
      projectId: snapshotBody.projectId,
      correlationId: "dashboard-corr",
      workOrderId: "UADS2-WO-003",
      executionRunId: null,
      reviewId: null,
      eventType: "system.diagnostic",
      sourceComponent: "m30-dashboard-test",
      severity: "warn",
      operationalState: "DEGRADED",
      occurredAt: "2026-09-09T12:00:00.000Z",
      message: "diagnostic event",
    };
    const persisted = persistOperationalEvent(paths, event);
    const chunk = await nextEvent;
    expect(chunk).toContain(persisted.eventId);
    persistOperationalEvent(paths, {
      ...event,
      eventId: undefined,
      correlationId: "dashboard-error-corr",
      eventType: "system.error",
      severity: "error",
      operationalState: "DEGRADED",
      message: "objective error event",
      occurredAt: "2026-09-09T12:00:01.000Z",
    });
    const populated = JSON.parse((await get(address.port, "/api/snapshot")).body) as {
      latestActivity: { workOrderId: string | null; correlationId: string };
      recentErrors: Array<{ message?: string }>;
      recentDiagnostics: Array<{ message?: string }>;
      cockpit: { schema: string; globalHealth: { status: string } };
    };
    expect(populated.latestActivity.workOrderId).toBe("UADS2-WO-003");
    expect(populated.latestActivity.correlationId).toBe("dashboard-error-corr");
    expect(populated.recentErrors.some((item) => item.message === "objective error event")).toBe(true);
    expect(populated.recentDiagnostics.some((item) => item.message === "diagnostic event")).toBe(true);
    expect(populated.cockpit.schema).toBe("uads.living-cockpit");
    expect(populated.cockpit.globalHealth.status).not.toBe("UNAVAILABLE");
    const cockpitResponse = await get(address.port, "/api/cockpit");
    expect(cockpitResponse.status).toBe(200);
    const cockpit = JSON.parse(cockpitResponse.body) as {
      schema: string;
      truthClass: string;
      continuity: { state: string };
      stream: { activeClients: number; maxClients: number };
    };
    expect(cockpit.schema).toBe("uads.living-cockpit");
    expect(cockpit.truthClass).toBe("DERIVED");
    expect(cockpit.continuity.state).toBe("CONTIGUOUS");
    expect(cockpit.stream.activeClients).toBeGreaterThanOrEqual(1);
    expect(cockpit.stream.maxClients).toBe(MAX_SSE_CLIENTS);
    const populatedHtml = await get(address.port, "/");
    expect(populatedHtml.body).toContain("Work Order and correlation");
    expect(populatedHtml.body).toContain("Existing UADS status");
    expect(populatedHtml.body).toContain("Truth cockpit");
    streamResponse.response.destroy();
    await dashboard.stop();
  });

  it("enforces the SSE client bound and cleans up disconnected clients", async () => {
    const home = temporaryHome();
    const dashboard = createDashboardServer({ cwd: process.cwd(), uadsHome: home, host: "127.0.0.1", port: 0 });
    const address = await dashboard.start();
    const clients = await Promise.all(Array.from({ length: MAX_SSE_CLIENTS }, () => openStream(address.port)));
    const rejected = await get(address.port, "/api/stream");
    expect(rejected.status).toBe(503);
    expect(rejected.body).toContain("sse-client-limit");
    await new Promise<void>((resolve) => {
      const response = clients[0]?.response;
      if (!response) {
        resolve();
        return;
      }
      response.once("close", resolve);
      response.destroy();
      clients[0]?.request.destroy();
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const replacement = await openStream(address.port);
    expect(replacement.response.statusCode).toBe(200);
    for (const client of [...clients.slice(1), replacement]) {
      client.response.destroy();
      client.request.destroy();
    }
    await dashboard.stop();
  });

  it("rejects non-loopback construction before opening a listener", () => {
    expect(() => createDashboardServer({ host: "0.0.0.0" })).toThrow(/only 127\.0\.0\.1/);
  });
});
