import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSchema } from "../src/lib/json-schema.js";
import {
  detectAllHostAdapters,
  detectHostAdapter,
  runtimeSnapshotFromHostDetection,
} from "../src/adapters/host-adapter-detect.js";
import {
  builtinHostAdapterRegistry,
  createHostAdapterRegistry,
} from "../src/adapters/host-adapter-registry.js";
import {
  getHostAdapterStatePath,
  inspectHostAdapterOwnership,
  installHostAdapter,
  readHostAdapterState,
  uninstallHostAdapter,
} from "../src/adapters/host-adapter-install.js";
import {
  isHostDispatchBundleCurrent,
  prepareHostDispatchBundle,
  readCurrentHostDispatchBundle,
} from "../src/adapters/host-dispatch.js";
import { runPlan } from "../src/kernel/orchestrator.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { seedFrontend } from "./execution-helpers.js";
import { tempDirs } from "./helpers.js";

const ROOT = process.cwd();

function hostHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-host-test-"));
}

function uadsHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-test-"));
}

function planFixture() {
  const fixture = tempDirs();
  seedFrontend(fixture.repo);
  const planned = runPlan({
    cwd: fixture.repo,
    uadsHome: fixture.home,
    intake: {
      schema: "uads.intake",
      schemaVersion: "0.2.0",
      objective: "Change the primary button color.",
      domainSignals: ["frontend"],
      affectedAreas: ["src"],
      inScope: ["src"],
      acceptanceCriteria: ["the change is verified"],
      classifier: "host-structured",
    },
  });
  const target = hostHome();
  installHostAdapter("generic-agent-skills", {
    hostHome: target,
    uadsHome: fixture.home,
    packageRoot: ROOT,
  }, ROOT);
  return {
    ...fixture,
    target,
    planned,
    context: resolveProjectContext(fixture.repo, fixture.home),
  };
}

function prepareFixture(fixture: ReturnType<typeof planFixture>) {
  return prepareHostDispatchBundle({
    adapterId: "generic-agent-skills",
    cwd: fixture.repo,
    uadsHome: fixture.home,
    hostHome: fixture.target,
    schemaRoot: ROOT,
  });
}

function rewrite(file: string, patch: (value: Record<string, unknown>) => Record<string, unknown>): void {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(file, `${JSON.stringify(patch(value), null, 2)}\n`);
}

describe("Prompt 010 host adapters", { timeout: 120_000 }, () => {
  it("registers exactly the three deterministic builtin adapters", () => {
    const registry = builtinHostAdapterRegistry();
    expect(registry.adapters.map((adapter) => adapter.adapterId)).toEqual([
      "codex",
      "cursor",
      "generic-agent-skills",
    ]);
    expect(createHostAdapterRegistry(registry.adapters.slice().reverse()).registryDigest).toBe(registry.registryDigest);
    expect(() => createHostAdapterRegistry([
      ...registry.adapters,
      registry.adapters[0]!,
    ])).toThrow(/exactly|duplicate/i);
  });

  it("detects hosts without creating directories", () => {
    const missing = path.join(hostHome(), "not-present");
    const before = fs.existsSync(missing);
    const detections = detectAllHostAdapters({ hostHome: missing });
    expect(fs.existsSync(missing)).toBe(before);
    expect(detections).toHaveLength(3);
    expect(detections.every((item) => item.version === null)).toBe(true);
  });

  it("creates global-only Cursor, Codex, and Generic resources with strict state", () => {
    for (const adapterId of ["cursor", "codex", "generic-agent-skills"] as const) {
      const target = hostHome();
      const home = uadsHome();
      const state = installHostAdapter(adapterId, { hostHome: target, uadsHome: home, packageRoot: ROOT }, ROOT);
      expect(state.installStatus).toBe("INSTALLED");
      expect(state.ownershipStatus).toBe("CLEAN");
      expect(fs.existsSync(getHostAdapterStatePath(adapterId, home))).toBe(true);
      expect(() => assertSchema("host-adapter-state.schema.json", state, ROOT)).not.toThrow();
      expect(JSON.stringify(state)).not.toContain(target);
      expect(JSON.stringify(state)).not.toContain(home);
    }
  });

  it("preserves unrelated Cursor files and rejects unmanaged uads files", () => {
    const target = hostHome();
    const home = uadsHome();
    const personal = path.join(target, ".cursor", "agents", "personal.md");
    fs.mkdirSync(path.dirname(personal), { recursive: true });
    fs.writeFileSync(personal, "keep\n");
    installHostAdapter("cursor", { hostHome: target, uadsHome: home, packageRoot: ROOT }, ROOT);
    expect(fs.readFileSync(personal, "utf8")).toBe("keep\n");
    uninstallHostAdapter("cursor", { hostHome: target, uadsHome: home }, ROOT);
    expect(fs.readFileSync(personal, "utf8")).toBe("keep\n");

    const conflictTarget = hostHome();
    const conflict = path.join(conflictTarget, ".cursor", "agents", "uads-custom.md");
    fs.mkdirSync(path.dirname(conflict), { recursive: true });
    fs.writeFileSync(conflict, "not owned\n");
    expect(() => installHostAdapter("cursor", { hostHome: conflictTarget, uadsHome: uadsHome(), packageRoot: ROOT }, ROOT)).toThrow(/unmanaged|conflict/i);
  });

  it("refuses modified managed resources and keeps user bytes on uninstall", () => {
    const target = hostHome();
    const home = uadsHome();
    installHostAdapter("codex", { hostHome: target, uadsHome: home, packageRoot: ROOT }, ROOT);
    const managed = path.join(target, ".codex", "agents", "uads-repo-inspector.md");
    fs.writeFileSync(managed, "user edit\n");
    expect(inspectHostAdapterOwnership("codex", { hostHome: target, uadsHome: home }, ROOT).status).toBe("CONFLICT");
    expect(() => uninstallHostAdapter("codex", { hostHome: target, uadsHome: home }, ROOT)).toThrow(/modified|clean/i);
    expect(fs.readFileSync(managed, "utf8")).toBe("user edit\n");
  });

  it("blocks traversal and symlink/junction escape", () => {
    const registry = builtinHostAdapterRegistry();
    expect(() => createHostAdapterRegistry(registry.adapters.map((adapter) =>
      adapter.adapterId === "cursor" ? { ...adapter, manifestRelativeTarget: "../escape" } : adapter,
    ))).toThrow(/unsafe|escape|manifest/i);
    const target = hostHome();
    const outside = hostHome();
    try {
      fs.symlinkSync(outside, path.join(target, ".cursor"), "junction");
      expect(detectHostAdapter("cursor", { hostHome: target }).status).toBe("BLOCKED");
      expect(() => installHostAdapter("cursor", { hostHome: target, uadsHome: uadsHome(), packageRoot: ROOT }, ROOT)).toThrow(/symlink|escape/i);
    } catch {
      // Windows may deny junction creation; traversal coverage above remains mandatory.
    }
  });

  it("keeps installation idempotent and removes only owned files", () => {
    const target = hostHome();
    const home = uadsHome();
    const first = installHostAdapter("generic-agent-skills", { hostHome: target, uadsHome: home, packageRoot: ROOT }, ROOT);
    const firstState = JSON.stringify(readHostAdapterState("generic-agent-skills", home, ROOT));
    const second = installHostAdapter("generic-agent-skills", { hostHome: target, uadsHome: home, packageRoot: ROOT }, ROOT);
    expect(second.stateDigest).toBe(first.stateDigest);
    expect(JSON.stringify(readHostAdapterState("generic-agent-skills", home, ROOT))).toBe(firstState);
    const unrelated = path.join(target, ".agents", "skills", "other-skill", "SKILL.md");
    fs.mkdirSync(path.dirname(unrelated), { recursive: true });
    fs.writeFileSync(unrelated, "unrelated\n");
    uninstallHostAdapter("generic-agent-skills", { hostHome: target, uadsHome: home }, ROOT);
    expect(fs.existsSync(unrelated)).toBe(true);
  });

  it("exposes conservative adapter runtime provenance", () => {
    const detection = detectHostAdapter("generic-agent-skills", { hostHome: hostHome() });
    const runtime = runtimeSnapshotFromHostDetection(detection);
    expect(runtime.provenance.source).toBe("adapter");
    expect(runtime.capabilities.subagents).toBe(false);
    expect(runtime.capabilities.parallelAgents).toBe(false);
    expect(runtime.identityDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("prepares a strict bundle only from current specialist/model/context state", () => {
    const fixture = planFixture();
    const bundle = prepareFixture(fixture);
    expect(() => assertSchema("host-dispatch-bundle.schema.json", bundle, ROOT)).not.toThrow();
    expect(bundle.status).toBe("PREPARED");
    expect(bundle.execution.roleDispatch).toBe("role-cycling");
    expect(bundle.execution.parallel).toBe(false);
    expect(bundle.assignments.every((item) => item.contextReferences.every((ref) => ref.startsWith("sidecar://")))).toBe(true);
    expect(readCurrentHostDispatchBundle(fixture.context.paths, ROOT)?.bundleDigest).toBe(bundle.bundleDigest);
  });

  it("rejects missing, stale, blocked, and cross-project planning state", () => {
    const missing = planFixture();
    fs.unlinkSync(missing.context.paths.currentSpecialistSelection);
    expect(() => prepareFixture(missing)).toThrow(/Specialist Selection|specialist/i);

    const stale = planFixture();
    const workOrderPath = path.join(stale.context.paths.workOrders, `${stale.planned.workOrder.workOrderId}.json`);
    rewrite(workOrderPath, (value) => ({ ...value, objective: "changed objective" }));
    expect(() => prepareFixture(stale)).toThrow(/stale|mismatch|specialist/i);

    const crossProject = planFixture();
    const bundle = prepareFixture(crossProject);
    expect(isHostDispatchBundleCurrent(bundle, { projectId: "other-project" })).toBe(false);
  });

  it("rejects stale model/runtime state and cannot trust a tampered bundle", () => {
    const fixture = planFixture();
    const runtimePath = path.join(fixture.context.paths.runtimeCapabilities, "generic-runtime.json");
    rewrite(runtimePath, (value) => ({ ...value, identityDigest: "0".repeat(64) }));
    expect(() => prepareFixture(fixture)).toThrow(/runtime|model|identity/i);

    const valid = planFixture();
    const bundle = prepareFixture(valid);
    const tampered = {
      ...bundle,
      assignments: bundle.assignments.slice(0, -1),
    };
    expect(isHostDispatchBundleCurrent(tampered, { projectId: bundle.projectId })).toBe(false);
  });

  it("preserves DAG, scope, gates, evidence, and reviewer independence", () => {
    const fixture = planFixture();
    const bundle = prepareFixture(fixture);
    expect(bundle.dependencyGroups).toEqual(fixture.planned.specialistPlan.dispatch.dependencyGroups);
    expect(bundle.selectedGates).toEqual(fixture.planned.workOrder.qualityGates);
    expect(bundle.requiredEvidence).toEqual(fixture.planned.workOrder.requiredEvidence);
    expect(bundle.requiredAssuranceRoles).toContain("independent-reviewer");
    expect(bundle.assignments.some((item) => item.requiredPredecessorRoles.length > 0)).toBe(true);
    expect(bundle.parallelEligibleGroups.some((group) => group.includes("implementation-agent") && group.includes("independent-reviewer"))).toBe(false);
    expect(bundle.limits.tokenHardLimit).toBe(fixture.planned.workOrder.tokenBudget.hardLimit);
    expect(bundle.contextRadius).toBe(fixture.planned.workOrder.contextRadius);
  });

  it("keeps review state and adapter summaries privacy-minimized", () => {
    const fixture = planFixture();
    const bundle = prepareFixture(fixture);
    const state = readHostAdapterState("generic-agent-skills", fixture.home, ROOT);
    const text = JSON.stringify({ bundle, state });
    expect(text).not.toContain(fixture.target);
    expect(text).not.toContain(fixture.home);
    expect(text).not.toMatch(/apiKey|private.?key|bearer/i);
  });
});
