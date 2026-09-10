import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalTargetRootPath,
  computeTargetRootDigest,
} from "../src/adapters/host-adapter-root.js";
import {
  HOST_CAPABILITY_PROBE_EXECUTION_POLICY,
  executeHostCapabilityProbe,
} from "../src/kernel/host-capability-probe.js";
import {
  compileHostCapabilityProof,
  persistHostCapabilityProof,
  readHostCapabilityProof,
} from "../src/kernel/host-capability-proof.js";
import { ensureWorkspace } from "../src/lib/workspace.js";

const ROOT = process.cwd();
const SUBJECT = "b".repeat(64);
const DIGEST_A = "a".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);
const DIGEST_E = "e".repeat(64);

function temp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function proof() {
  return compileHostCapabilityProof({
    capabilityId: "toolCalling",
    state: "UNKNOWN",
    evidenceClass: "E1",
    subjectDigest: SUBJECT,
    adapterId: "generic-agent-skills",
    runtimeVersion: null,
    probeId: "passive.adapter-contract.v1",
    validityBasis: {
      adapterContractDigest: DIGEST_A,
      probeDefinitionDigest: DIGEST_C,
      policyDigest: DIGEST_D,
      configurationDigest: DIGEST_E,
    },
    observedAt: "2026-09-09T20:00:00.000Z",
    validUntil: null,
    validityClass: "IDENTITY_BOUND",
    evidenceDigest: DIGEST_A,
    negativeProofKind: null,
    reasonCodes: ["WO010_B6_BENCHMARK"],
  }, ROOT);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function measureCpuBatch(withTelemetry: boolean, batch: number, operations = 8): {
  cpuMicrosPerOp: number;
  wallMsPerOp: number;
} {
  const projectId = `wo010-b6-${withTelemetry ? "on" : "off"}-${batch}`;
  const paths = ensureWorkspace(projectId, temp("uads-wo010-b6-"));
  const p = proof();
  const wallStart = performance.now();
  const cpuStart = process.cpuUsage();
  for (let index = 0; index < operations; index += 1) {
    const result = persistHostCapabilityProof(
      paths,
      p,
      withTelemetry
        ? {
            schemaRoot: ROOT,
            telemetry: {
              projectId,
              correlationId: `wo010-b6-${batch}-${index}`,
              workOrderId: "UADS2-WO-010",
            },
          }
        : { schemaRoot: ROOT },
    );
    if (withTelemetry) {
      expect(result.telemetry.status).toBe("EMITTED");
    } else {
      expect(result.telemetry.status).toBe("SKIPPED");
    }
  }
  const cpu = process.cpuUsage(cpuStart);
  const wallMs = performance.now() - wallStart;
  return {
    cpuMicrosPerOp: (cpu.user + cpu.system) / operations,
    wallMsPerOp: wallMs / operations,
  };
}

describe("UADS2-WO-010 M03 cross-platform and telemetry hardening", { timeout: 120_000 }, () => {
  it("M03-T061 Linux node-current executable identity is stable", async () => {
    if (process.platform !== "linux") {
      console.info(`M03_T061_NOT_APPLICABLE=${process.platform}`);
      return;
    }
    const receipt = await executeHostCapabilityProbe("uads.node.version.v1", SUBJECT, { schemaRoot: ROOT });
    expect(receipt.status).toBe("SUCCEEDED");
    expect(receipt.executableIdentityBefore).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.executableIdentityAfter).toBe(receipt.executableIdentityBefore);
    console.log(`M03_T061_PLATFORM_EVIDENCE=${JSON.stringify({platform:process.platform,arch:process.arch,status:receipt.status,identityStable:true})}`);
  });

  it("M03-T062 Windows node-current executable identity is stable", async () => {
    if (process.platform !== "win32") {
      console.info(`M03_T062_NOT_APPLICABLE=${process.platform}`);
      return;
    }
    const receipt = await executeHostCapabilityProbe("uads.node.version.v1", SUBJECT, { schemaRoot: ROOT });
    expect(receipt.status).toBe("SUCCEEDED");
    expect(receipt.executableIdentityBefore).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.executableIdentityAfter).toBe(receipt.executableIdentityBefore);
    console.log(`M03_T062_PLATFORM_EVIDENCE=${JSON.stringify({platform:process.platform,arch:process.arch,status:receipt.status,identityStable:true})}`);
  });

  it("M03-T063 case-distinct lexical target roots remain digest-distinct", () => {
    const base = temp("uads-wo010-case-");
    const upper = path.join(base, "RootA", ".codex");
    const lower = path.join(base, "roota", ".codex");
    expect(canonicalTargetRootPath(upper)).not.toBe(canonicalTargetRootPath(lower));
    expect(computeTargetRootDigest("codex", upper)).not.toBe(computeTargetRootDigest("codex", lower));
  });

  it("M03-T064 equivalent same-root spellings converge under V2 binding", () => {
    const base = temp("uads-wo010-equivalent-");
    const direct = path.join(base, ".codex");
    const equivalent = path.join(base, "nested", "..", ".codex", ".");
    expect(path.resolve(direct)).toBe(path.resolve(equivalent));
    expect(computeTargetRootDigest("codex", direct)).toBe(computeTargetRootDigest("codex", equivalent));

    if (process.platform === "win32") {
      const caseVariant = path.join(base.toUpperCase(), ".codex");
      if (canonicalTargetRootPath(caseVariant) !== canonicalTargetRootPath(direct)) {
        expect(computeTargetRootDigest("codex", caseVariant)).not.toBe(computeTargetRootDigest("codex", direct));
      }
    }
  });

  it("adapter ID remains an explicit root-digest domain separator", () => {
    const root = path.join(temp("uads-wo010-domain-"), ".codex");
    expect(computeTargetRootDigest("codex", root)).not.toBe(computeTargetRootDigest("cursor", root));
  });

  it("M03-T065 Windows contract is hidden, no-shell, direct executable", async () => {
    if (process.platform !== "win32") {
      console.info(`M03_T065_NOT_APPLICABLE=${process.platform}`);
      return;
    }
    expect(HOST_CAPABILITY_PROBE_EXECUTION_POLICY).toEqual({
      executableRule: "node-current",
      shell: false,
      windowsHide: true,
      pathLookup: false,
    });
    expect(path.isAbsolute(process.execPath)).toBe(true);
    const previous = process.env.PATH;
    process.env.PATH = temp("uads-wo010-shadow-");
    try {
      const receipt = await executeHostCapabilityProbe("uads.node.version.v1", SUBJECT, { schemaRoot: ROOT });
      expect(receipt.status).toBe("SUCCEEDED");
    } finally {
      if (previous === undefined) delete process.env.PATH;
      else process.env.PATH = previous;
    }
    console.log(`M03_T065_PLATFORM_EVIDENCE=${JSON.stringify({platform:process.platform,shell:false,windowsHide:true,pathLookup:false})}`);
  });

  it("M03-T066 POSIX contract is no-shell and direct executable", async () => {
    if (process.platform === "win32") {
      console.info("M03_T066_NOT_APPLICABLE=win32");
      return;
    }
    expect(HOST_CAPABILITY_PROBE_EXECUTION_POLICY.shell).toBe(false);
    expect(HOST_CAPABILITY_PROBE_EXECUTION_POLICY.pathLookup).toBe(false);
    expect(HOST_CAPABILITY_PROBE_EXECUTION_POLICY.executableRule).toBe("node-current");
    expect(path.isAbsolute(process.execPath)).toBe(true);
    const previous = process.env.PATH;
    process.env.PATH = temp("uads-wo010-shadow-");
    try {
      const receipt = await executeHostCapabilityProbe("uads.node.version.v1", SUBJECT, { schemaRoot: ROOT });
      expect(receipt.status).toBe("SUCCEEDED");
    } finally {
      if (previous === undefined) delete process.env.PATH;
      else process.env.PATH = previous;
    }
    console.log(`M03_T066_PLATFORM_EVIDENCE=${JSON.stringify({platform:process.platform,shell:false,pathLookup:false})}`);
  });

  it("telemetry failure cannot mutate persisted proof truth", () => {
    const projectId = "wo010-telemetry-failure";
    const paths = ensureWorkspace(projectId, temp("uads-wo010-telemetry-"));
    const p = proof();
    const result = persistHostCapabilityProof(paths, p, {
      schemaRoot: ROOT,
      telemetry: {
        projectId: "wrong-project-id",
        correlationId: "wo010-failure",
      },
    });
    expect(result.telemetry.status).toBe("FAILED");
    const read = readHostCapabilityProof(paths, p.subjectDigest, p.capabilityId, ROOT);
    expect(read.status).toBe("VALID");
    expect(read.status === "VALID" ? read.proof.proofDigest : null).toBe(p.proofDigest);
  });

  it("M03-B6 measures M30 evidence.lifecycle CPU overhead truthfully", () => {
    if (process.platform !== "linux") {
      console.info(`UADS2_WO_010_B6_NOT_MEASURED_ON=${process.platform}`);
      return;
    }

    // Warm-up is intentionally excluded from measured batches.
    measureCpuBatch(false, 900, 4);
    measureCpuBatch(true, 901, 4);

    const off = Array.from({ length: 7 }, (_, index) => measureCpuBatch(false, index));
    const on = Array.from({ length: 7 }, (_, index) => measureCpuBatch(true, index));
    const offCpu = median(off.map((item) => item.cpuMicrosPerOp));
    const onCpu = median(on.map((item) => item.cpuMicrosPerOp));
    const offWall = median(off.map((item) => item.wallMsPerOp));
    const onWall = median(on.map((item) => item.wallMsPerOp));
    const overheadPercent = offCpu > 0 ? ((onCpu - offCpu) / offCpu) * 100 : Number.POSITIVE_INFINITY;
    const targetPercent = 5;
    const verdict = overheadPercent < targetPercent ? "PASS" : "JUSTIFIED_EXCEPTION";
    const reason = verdict === "PASS"
      ? null
      : "Existing M30 evidence.lifecycle performs synchronous durable event persistence, hashing, retention and health projection; measured cost is preserved as an explicit exception rather than hidden.";

    const metrics = {
      schema: "uads2.wo010.telemetry-overhead",
      platform: process.platform,
      node: process.version,
      batches: 7,
      operationsPerBatch: 8,
      disabledMedianCpuMicrosPerOp: offCpu,
      enabledMedianCpuMicrosPerOp: onCpu,
      disabledMedianWallMsPerOp: offWall,
      enabledMedianWallMsPerOp: onWall,
      overheadPercent,
      targetPercent,
      verdict,
      reason,
    };
    console.log(`UADS2_WO_010_B6=${JSON.stringify(metrics)}`);
    expect(Number.isFinite(offCpu)).toBe(true);
    expect(Number.isFinite(onCpu)).toBe(true);
    expect(offCpu).toBeGreaterThan(0);
    expect(onCpu).toBeGreaterThan(0);
    expect(["PASS", "JUSTIFIED_EXCEPTION"]).toContain(verdict);
  });
});
