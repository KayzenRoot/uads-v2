import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installHostAdapter } from "../src/adapters/host-adapter-install.js";
import { readHostCapabilityProjection } from "../src/adapters/host-capability-consumer.js";

const ROOT = process.cwd();

function temp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("UADS2-WO-012 M03 proof-aware consumer boundary", () => {
  it("keeps declared Cursor enabling capabilities UNKNOWN without proof", () => {
    const hostHome = temp("uads-wo012-cursor-");
    const uadsHome = temp("uads-wo012-sidecar-");
    installHostAdapter("cursor", { hostHome, uadsHome, packageRoot: ROOT }, ROOT);

    const projected = readHostCapabilityProjection({
      adapterId: "cursor",
      detectionInput: { hostHome },
      schemaRoot: ROOT,
    });

    expect(projected.runtime.capabilities.parallelAgents).toBe("unknown");
    expect(projected.runtime.capabilities.subagents).toBe("unknown");
    expect(projected.runtime.provenance.confidence).toBe("unknown");
    expect(projected.subjectDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves current generic fixed negatives without writing proof state", () => {
    const hostHome = temp("uads-wo012-generic-");
    const uadsHome = temp("uads-wo012-sidecar-");
    installHostAdapter("generic-agent-skills", { hostHome, uadsHome, packageRoot: ROOT }, ROOT);
    const proofsRoot = path.join(uadsHome, "runtime-capabilities", "proofs");

    const projected = readHostCapabilityProjection({
      adapterId: "generic-agent-skills",
      detectionInput: { hostHome },
      schemaRoot: ROOT,
    });

    expect(projected.runtime.capabilities.parallelAgents).toBe(false);
    expect(projected.runtime.capabilities.subagents).toBe(false);
    expect(fs.existsSync(proofsRoot)).toBe(false);
  });

  it("is a read boundary and does not create a project-local footprint", () => {
    const hostHome = temp("uads-wo012-read-");
    const projectRoot = temp("uads-wo012-project-");
    const before = fs.readdirSync(projectRoot);

    readHostCapabilityProjection({
      adapterId: "cursor",
      detectionInput: { hostHome },
      schemaRoot: ROOT,
    });

    expect(fs.readdirSync(projectRoot)).toEqual(before);
  });
});
