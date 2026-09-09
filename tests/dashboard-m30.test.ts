import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureWorkspace } from "../src/lib/workspace.js";
import { createDashboardServer } from "../src/commands/dashboard.js";
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
      workOrderId: null,
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
    streamResponse.response.destroy();
    await dashboard.stop();
  });

  it("rejects non-loopback construction before opening a listener", () => {
    expect(() => createDashboardServer({ host: "0.0.0.0" })).toThrow(/only 127\.0\.0\.1/);
  });
});
