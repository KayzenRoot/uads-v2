import { randomUUID } from "node:crypto";
import { sha256Hex } from "../lib/hash.js";
import { findPackageRoot } from "../lib/version.js";
import { type UadsPaths } from "../lib/workspace.js";
import { writeGefReceipt } from "./storage.js";
import { type GefCommandReceipt } from "./types.js";

export function createGefCommandReceipt(input: Omit<GefCommandReceipt, "schema" | "schemaVersion" | "receiptId" | "validityDigest" | "createdAt"> & { validityInputs: string }): GefCommandReceipt {
  return {
    schema: "uads.gef-command-receipt",
    schemaVersion: "0.1.0",
    receiptId: randomUUID(),
    projectId: input.projectId,
    fingerprint: input.fingerprint,
    command: input.command,
    validityDigest: sha256Hex(input.validityInputs),
    status: input.status,
    exitCode: input.exitCode,
    durationMs: input.durationMs,
    outputSummary: input.outputSummary,
    createdAt: new Date().toISOString(),
  };
}

export function persistGefCommandReceipt(paths: UadsPaths, receipt: GefCommandReceipt): void {
  writeGefReceipt(paths, receipt, findPackageRoot());
}
