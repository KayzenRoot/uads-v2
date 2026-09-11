import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readHostCapabilityProjection } from "../src/adapters/host-capability-consumer.js";
import { buildPassiveHostCapabilityBridge } from "../src/adapters/host-capability-passive.js";
import { runDispatchCommand } from "../src/commands/dispatch.js";
import { sha256Hex } from "../src/lib/hash.js";
import { type UadsPaths } from "../src/lib/workspace.js";
import { compileHostCapabilityProof, persistHostCapabilityProof } from "../src/kernel/host-capability-proof.js";
import { ExecutionBlockedError, runDispatch } from "../src/kernel/execution.js";
import { createModelProfileRegistry, normalizeModelProfile, persistModelProfileRegistry } from "../src/kernel/model-registry.js";
import {
  computeRuntimeIdentityDigest,
  conservativeRuntimeCapabilitySnapshot,
  persistRuntimeCapabilitySnapshot,
  readRuntimeCapabilitySnapshot,
} from "../src/kernel/model-runtime.js";
import { MODEL_ROUTING_SCHEMA_VERSION, type ModelCapability, type RuntimeCapabilities } from "../src/kernel/model-types.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { planFrontend, seedFrontend } from "./execution-helpers.js";
import { tempDirs } from "./helpers.js";

const ROOT = process.cwd();
const FIXTURE_PROVEN_CAPABILITIES: readonly ModelCapability[] = [
  "modelSelection",
  "toolCalling",
  "structuredOutput",
  "promptCache",
  "explicitCache",
  "persistentContext",
  "usageTelemetry",
];

type AdapterId = "cursor" | "codex" | "generic-agent-skills";

function hostDir(segment: string): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-wo026-dispatch-host-"));
  fs.mkdirSync(path.join(home, segment), { recursive: true });
  return home;
}

function plannedFixture(): { repo: string; home: string; context: ReturnType<typeof resolveProjectContext> } {
  const { repo, home } = tempDirs();
  seedFrontend(repo);
  planFrontend(repo, home);
  return { repo, home, context: resolveProjectContext(repo, home) };
}

function blockedError(run: () => unknown): ExecutionBlockedError {
  try {
    run();
  } catch (error) {
    if (error instanceof ExecutionBlockedError) return error;
    throw error;
  }
  throw new Error("expected ExecutionBlockedError");
}

function proofFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

function seedProofs(paths: UadsPaths, host: string, adapterId: AdapterId, capabilityIds: readonly ModelCapability[]): void {
  const fixture = buildPassiveHostCapabilityBridge({
    adapterId,
    detectionInput: { hostHome: host },
    persist: false,
    schemaRoot: ROOT,
  });
  for (const capabilityId of capabilityIds) {
    const basis = fixture.currentBasis[capabilityId];
    const proof = compileHostCapabilityProof(
      {
        capabilityId,
        state: "SUPPORTED",
        evidenceClass: "E2",
        subjectDigest: fixture.subject.subjectDigest,
        adapterId,
        runtimeVersion: basis.runtimeVersion,
        probeId: "fixture.wo026.dispatch.v1",
        validityBasis: { ...basis.validityBasis },
        observedAt: new Date(Date.now() - 60_000).toISOString(),
        validUntil: null,
        validityClass: "IDENTITY_BOUND",
        evidenceDigest: sha256Hex(`uads2-wo026-dispatch-${capabilityId}-v1`),
        negativeProofKind: null,
        reasonCodes: ["WO026_DISPATCH_FIXTURE"],
      },
      ROOT,
    );
    persistHostCapabilityProof(paths, proof, { schemaRoot: ROOT });
  }
}

function executionRunArtifacts(paths: UadsPaths): string[] {
  return fs.existsSync(paths.executionRuns) ? fs.readdirSync(paths.executionRuns).sort() : [];
}

function runtimeStateArtifacts(paths: UadsPaths): string[] {
  const root = paths.runtimeCapabilities;
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

function seedProfileRegistry(paths: UadsPaths): void {
  const profile = normalizeModelProfile({
    schema: "uads.model-profile",
    schemaVersion: MODEL_ROUTING_SCHEMA_VERSION,
    profileId: "wo026-binding",
    providerId: "wo026-provider",
    modelId: "wo026-model",
    status: "enabled",
    capabilityClass: "critical",
    reasoningClass: "deep",
    contextWindowTokens: 128000,
    maxOutputTokens: 16000,
    relativeCostClass: "unknown",
    relativeLatencyClass: "unknown",
    supports: {
      toolCalling: true,
      structuredOutput: true,
      vision: false,
      promptCache: true,
      explicitCache: true,
      persistentContext: true,
      usageTelemetry: true,
    },
    constraints: { maxConcurrency: 1 },
    notes: "deterministic WO-026 dispatch binding fixture",
    source: "builtin-fixture",
    adapterId: "wo026-fixture",
    adapterVersion: MODEL_ROUTING_SCHEMA_VERSION,
  });
  persistModelProfileRegistry(paths, createModelProfileRegistry([profile]));
}

function seedLegacyProvenSnapshot(paths: UadsPaths): void {
  const base = conservativeRuntimeCapabilitySnapshot({ runtimeId: "generic-runtime" });
  const capabilities = Object.fromEntries(
    Object.keys(base.capabilities).map((capabilityId) => [capabilityId, true]),
  ) as RuntimeCapabilities;
  const unsigned = {
    schema: base.schema,
    schemaVersion: base.schemaVersion,
    runtimeId: base.runtimeId,
    adapterId: "legacy-fixture",
    adapterVersion: base.adapterVersion,
    runtimeVersion: base.runtimeVersion,
    capabilities,
    provenance: { source: "test-fixture" as const, confidence: "proven" as const },
  };
  persistRuntimeCapabilitySnapshot(paths, { ...unsigned, identityDigest: computeRuntimeIdentityDigest(unsigned) }, ROOT);
}

describe("UADS2-WO-026 dispatch adapter identity binding", { timeout: 120_000 }, () => {
  it("P5 validates, records and applies explicit adapter identity without writing proof state", () => {
    const { repo, home, context } = plannedFixture();
    const host = hostDir(".cursor");
    const proofsRoot = path.join(context.paths.runtimeCapabilities, "proofs");
    seedProofs(context.paths, host, "cursor", FIXTURE_PROVEN_CAPABILITIES);
    const before = proofFiles(proofsRoot);
    expect(before.length).toBeGreaterThan(0);

    const dispatched = runDispatch({
      cwd: repo,
      uadsHome: home,
      session: "imp-1",
      adapterId: "cursor",
      hostHome: host,
    });

    expect(dispatched.run.phase).toBe("implement");
    expect(dispatched.run.status).toBe("ready");
    const persisted = readRuntimeCapabilitySnapshot(context.paths, "generic-runtime", ROOT);
    expect(persisted.adapterId).toBe("cursor");
    expect(persisted.runtimeId).toBe("generic-runtime");
    expect(persisted.capabilities.toolCalling).toBe(true);
    expect(persisted.capabilities.structuredOutput).toBe(true);
    expect(persisted.capabilities.subagents).toBe("unknown");
    expect(persisted.provenance.confidence).toBe("proven");
    expect(proofFiles(proofsRoot)).toEqual(before);
  });

  it("P5 blocks an ungoverned adapter identity visibly", () => {
    const { repo, home } = plannedFixture();
    const blocked = blockedError(() =>
      runDispatch({ cwd: repo, uadsHome: home, session: "imp-1", adapterId: "rogue-host" }),
    );
    expect(blocked.message).toMatch(/governed host adapter identity/);
    expect(blocked.blockers).toContain("CAPABILITY_TRUTH_ADAPTER_UNKNOWN:rogue-host");
  });

  it("P5 blocks a governed adapter identity whose host detection is BLOCKED", () => {
    const { repo, home } = plannedFixture();
    const host = fs.mkdtempSync(path.join(os.tmpdir(), "uads-wo026-dispatch-blocked-"));
    fs.writeFileSync(path.join(host, ".cursor"), "not-a-directory\n", "utf8");

    const projection = readHostCapabilityProjection({
      adapterId: "cursor",
      detectionInput: { hostHome: host },
      schemaRoot: ROOT,
    });
    expect(projection.detection.status).toBe("BLOCKED");
    expect(projection.detection.reasonCodes).toContain("HOST_TARGET_NOT_DIRECTORY");
    expect(projection.runtime.capabilities.toolCalling).toBe("unknown");
    expect(projection.runtime.provenance.confidence).toBe("unknown");

    const blocked = blockedError(() =>
      runDispatch({ cwd: repo, uadsHome: home, session: "imp-1", adapterId: "cursor", hostHome: host }),
    );
    expect(blocked.message).toMatch(/host detection validation/);
    expect(blocked.blockers).toContain("CAPABILITY_TRUTH_ADAPTER_BLOCKED");
  });

  it("P5 threads explicit adapter identity from the dispatch command layer", () => {
    const { repo, home } = plannedFixture();
    expect(() => runDispatchCommand({ cwd: repo, uadsHome: home, adapter: "rogue-host" })).toThrow(
      /governed host adapter identity/,
    );
  });

  it("P6 blocks absent adapter identity before routing when profiles and legacy state exist", () => {
    const { repo, home, context } = plannedFixture();
    seedProfileRegistry(context.paths);
    seedLegacyProvenSnapshot(context.paths);
    const seeded = readRuntimeCapabilitySnapshot(context.paths, "generic-runtime", ROOT);

    const blocked = blockedError(() => runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" }));
    expect(blocked.message).toMatch(/explicit governed adapter identity/);
    expect(blocked.blockers).toContain("CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED");

    const persisted = readRuntimeCapabilitySnapshot(context.paths, "generic-runtime", ROOT);
    expect(persisted.identityDigest).toBe(seeded.identityDigest);
    expect(persisted.adapterId).toBe("legacy-fixture");
    expect(fs.existsSync(path.join(context.paths.runtimeCapabilities, "proofs"))).toBe(false);
    expect(executionRunArtifacts(context.paths)).toEqual([]);
  });

  it("P6 blocks absent adapter identity and persists no runtime state when no profiles exist", () => {
    const { repo, home, context } = plannedFixture();
    const before = runtimeStateArtifacts(context.paths);

    const blocked = blockedError(() => runDispatch({ cwd: repo, uadsHome: home, session: "imp-1" }));
    expect(blocked.message).toMatch(/explicit governed adapter identity/);
    expect(blocked.blockers).toContain("CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED");

    expect(runtimeStateArtifacts(context.paths)).toEqual(before);
    expect(executionRunArtifacts(context.paths)).toEqual([]);
  });

  it("P6 blocks the dispatch command without adapter identity and does not advance", () => {
    const { repo, home, context } = plannedFixture();
    const before = runtimeStateArtifacts(context.paths);

    expect(() => runDispatchCommand({ cwd: repo, uadsHome: home, session: "imp-1" })).toThrow(
      /explicit governed adapter identity/,
    );

    expect(runtimeStateArtifacts(context.paths)).toEqual(before);
    expect(executionRunArtifacts(context.paths)).toEqual([]);
  });

  it("P7 keeps M05 dispatch on the IF-001 facade only", () => {
    const execution = fs.readFileSync(path.join(ROOT, "src", "kernel", "execution.ts"), "utf8");
    expect(execution).toContain('from "../adapters/host-capability-consumer.js"');
    expect(execution).not.toMatch(/host-capability-(proof|probe|active-evidence)/);
    expect(execution).not.toContain("readRuntimeCapabilitySnapshot");
  });

  it("P7 confines proof-store/probe imports to the M03 boundary and authorized fixtures", () => {
    const allowed = new Set([
      "src/adapters/host-capability-consumer.ts",
      "src/adapters/host-capability-passive.ts",
      "src/eval/execution.ts",
      "src/eval/fault-injection-normative.ts",
      "src/kernel/host-capability-active-evidence.ts",
      "src/kernel/host-capability-proof.ts",
      "src/kernel/host-capability-probe.ts",
      "src/kernel/host-capability-resolver.ts",
    ]);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;
        const relative = path.relative(ROOT, full).split(path.sep).join("/");
        if (allowed.has(relative)) continue;
        const source = fs.readFileSync(full, "utf8");
        if (/host-capability-(proof|probe|active-evidence)\.js/.test(source)) offenders.push(relative);
      }
    };
    walk(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);

    const consumer = fs.readFileSync(path.join(ROOT, "src", "adapters", "host-capability-consumer.ts"), "utf8");
    expect(consumer).toContain('from "../kernel/host-capability-resolver.js"');
    expect(consumer).not.toMatch(/host-capability-(proof|probe|active-evidence)/);
  });
});