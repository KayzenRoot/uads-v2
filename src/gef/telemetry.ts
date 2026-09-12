import { randomUUID } from "node:crypto";
import { findPackageRoot } from "../lib/version.js";
import { type UadsPaths } from "../lib/workspace.js";
import { writeGefTelemetry } from "./storage.js";
import { type GefTelemetryEvent } from "./types.js";

export function recordGefTelemetry(paths: UadsPaths, event: Omit<GefTelemetryEvent, "schema" | "schemaVersion" | "eventId" | "createdAt">): GefTelemetryEvent {
  const record: GefTelemetryEvent = {
    schema: "uads.gef-telemetry-event",
    schemaVersion: "0.1.0",
    eventId: randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  };
  writeGefTelemetry(paths, record, findPackageRoot());
  return record;
}
