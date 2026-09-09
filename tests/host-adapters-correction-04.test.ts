import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveHostTarget,
} from "../src/adapters/host-adapter-detect.js";
import { getHostAdapterDefinition } from "../src/adapters/host-adapter-registry.js";
import {
  canonicalTargetRootPath,
  computeTargetRootDigest,
} from "../src/adapters/host-adapter-root.js";
import {
  getHostAdapterStatePath,
  getHostAdapterStatusSummary,
  inspectHostAdapterOwnership,
  installHostAdapter,
  readHostAdapterState,
  uninstallHostAdapter,
} from "../src/adapters/host-adapter-install.js";
import {
  hostDispatchBundleStatus,
  prepareHostDispatchBundle,
} from "../src/adapters/host-dispatch.js";
import { sha256Hex } from "../src/lib/hash.js";
import { runPlan } from "../src/kernel/orchestrator.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { seedFrontend } from "./execution-helpers.js";
import { tempDirs } from "./helpers.js";
import type { HostAdapterState } from "../src/adapters/host-adapter-types.js";

const ROOT = process.cwd();

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function hostHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-host-c04-"));
}

function uadsHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-c04-"));
}

function legacyTargetRootDigest(adapterId: "cursor" | "codex" | "generic-agent-skills", targetRoot: string): string {
  const resolved = path.resolve(targetRoot);
  const parsed = path.parse(resolved);
  const segments = resolved
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  const root = parsed.root.replace(/\\/g, "/").toLowerCase();
  return sha256Hex(`uads-host-target-root-v1\0${adapterId}\0${root}/${segments.join("/")}`);
}

function writeStateAt(state: HostAdapterState, sidecar: string, targetRoot: string): void {
  const legacy = {
    ...state,
    rootBinding: {
      ...state.rootBinding!,
      targetRootDigest: legacyTargetRootDigest(state.adapterId, targetRoot),
      bindingVersion: "1" as const,
    },
  };
  const { stateDigest: _ignored, ...withoutDigest } = legacy;
  const stateDigest = sha256Hex(
    JSON.stringify(
      stableValue({
        ...withoutDigest,
        updatedAt: null,
        detection: { ...withoutDigest.detection, detectedAt: null },
      }),
    ),
  );
  fs.writeFileSync(
    getHostAdapterStatePath(state.adapterId, sidecar),
    `${JSON.stringify({ ...legacy, stateDigest }, null, 2)}\n`,
  );
}

function copyManagedTree(sourceRoot: string, destinationRoot: string): void {
  const visit = (relative: string): void => {
    const source = path.join(sourceRoot, relative);
    const destination = path.join(destinationRoot, relative);
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
      fs.mkdirSync(destination, { recursive: true });
      for (const entry of fs.readdirSync(source)) visit(path.join(relative, entry));
      return;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  };
  visit(".");
}

function caseSensitiveRoots(): { homeA: string; homeB: string } | null {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "uads-case-c04-"));
  const homeA = path.join(parent, "UADS-Case-Root");
  const homeB = path.join(parent, "uads-case-root");
  fs.mkdirSync(homeA);
  let createdB = false;
  try {
    fs.mkdirSync(homeB);
    createdB = true;
  } catch {
    // Case-insensitive filesystems report the first directory as existing.
  }
  if (!createdB || fs.realpathSync(homeA) === fs.realpathSync(homeB)) return null;
  return { homeA, homeB };
}

function plannedFixture(): ReturnType<typeof tempDirs> & { hostHome: string; projectId: string } {
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
  return { ...fixture, hostHome: hostHome(), projectId: planned.workOrder.projectId };
}

describe("Prompt 010 correction 04", { timeout: 120_000 }, () => {
  it("T57 case-distinct canonical roots do not collide", () => {
    const base = hostHome();
    const rootA = path.join(base, "RootA", ".codex");
    const rootB = path.join(base, "roota", ".codex");
    expect(canonicalTargetRootPath(rootA)).not.toBe(canonicalTargetRootPath(rootB));
    expect(computeTargetRootDigest("codex", rootA)).not.toBe(computeTargetRootDigest("codex", rootB));
  });

  it("T58 case-only cross-root ownership replay is rejected", () => {
    const roots = caseSensitiveRoots();
    if (!roots) {
      console.info("T58 filesystem-object replay portion skipped: filesystem is not case-sensitive");
      return;
    }
    const sidecar = uadsHome();
    installHostAdapter("codex", { hostHome: roots.homeA, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const targetA = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: roots.homeA });
    const targetB = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: roots.homeB });
    fs.mkdirSync(targetB.targetRoot, { recursive: true });
    copyManagedTree(targetA.targetRoot, targetB.targetRoot);
    expect(targetA.targetRootDigest).not.toBe(targetB.targetRootDigest);
    const ownership = inspectHostAdapterOwnership("codex", { hostHome: roots.homeB, uadsHome: sidecar }, ROOT);
    expect(ownership.status).toBe("CONFLICT");
    expect(ownership.reasonCodes).toContain("ROOT_BINDING_MISMATCH");
  });

  it("T59 case-only foreign uninstall preserves both roots", () => {
    const roots = caseSensitiveRoots();
    if (!roots) {
      console.info("T59 filesystem-object replay portion skipped: filesystem is not case-sensitive");
      return;
    }
    const sidecar = uadsHome();
    installHostAdapter("codex", { hostHome: roots.homeA, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const targetA = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: roots.homeA });
    const targetB = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: roots.homeB });
    fs.mkdirSync(targetB.targetRoot, { recursive: true });
    copyManagedTree(targetA.targetRoot, targetB.targetRoot);
    const fileA = path.join(targetA.resourceRoot, "uads-repo-inspector.md");
    const fileB = path.join(targetB.resourceRoot, "uads-repo-inspector.md");
    const beforeA = fs.readFileSync(fileA);
    const beforeB = fs.readFileSync(fileB);
    expect(() => uninstallHostAdapter("codex", { hostHome: roots.homeB, uadsHome: sidecar }, ROOT)).toThrow(/binding/i);
    expect(fs.readFileSync(fileA)).toEqual(beforeA);
    expect(fs.readFileSync(fileB)).toEqual(beforeB);
    expect(readHostAdapterState("codex", sidecar, ROOT)?.rootBinding?.targetRootDigest).toBe(targetA.targetRootDigest);
  });

  it("T60 lexically equivalent same root remains deterministic", () => {
    const base = hostHome();
    const direct = path.join(base, ".codex");
    const equivalent = `${base}${path.sep}nested${path.sep}..${path.sep}.codex${path.sep}`;
    expect(path.resolve(direct)).toBe(path.resolve(equivalent));
    expect(computeTargetRootDigest("codex", direct)).toBe(computeTargetRootDigest("codex", equivalent));
  });

  it("T61 adapter ID domain separation remains intact", () => {
    const root = path.join(hostHome(), ".codex");
    expect(computeTargetRootDigest("codex", root)).not.toBe(computeTargetRootDigest("cursor", root));
  });

  it("T62 v1 binding is readable but not trusted", () => {
    const fixture = plannedFixture();
    installHostAdapter("generic-agent-skills", { hostHome: fixture.hostHome, uadsHome: fixture.home, packageRoot: ROOT }, ROOT);
    const state = readHostAdapterState("generic-agent-skills", fixture.home, ROOT)!;
    const target = resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: fixture.hostHome });
    writeStateAt(state, fixture.home, target.targetRoot);
    const legacy = readHostAdapterState("generic-agent-skills", fixture.home, ROOT)!;
    expect(legacy.rootBinding?.bindingVersion).toBe("1");
    const ownership = inspectHostAdapterOwnership("generic-agent-skills", { hostHome: fixture.hostHome, uadsHome: fixture.home }, ROOT);
    expect(ownership.status).toBe("STALE");
    expect(ownership.reasonCodes).toContain("ROOT_BINDING_UPGRADE_REQUIRED");
    expect(() => uninstallHostAdapter("generic-agent-skills", { hostHome: fixture.hostHome, uadsHome: fixture.home }, ROOT)).toThrow(/binding/i);
    expect(() => prepareHostDispatchBundle({ adapterId: "generic-agent-skills", cwd: fixture.repo, uadsHome: fixture.home, hostHome: fixture.hostHome, schemaRoot: ROOT })).toThrow(/ownership|binding|clean/i);
  });

  it("T63 explicit v1 to v2 adoption is non-destructive", () => {
    const home = hostHome();
    const sidecar = uadsHome();
    const state = installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const target = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: home });
    const managed = path.join(target.resourceRoot, "uads-repo-inspector.md");
    const userFile = path.join(target.targetRoot, "user-owned.txt");
    const beforeManaged = fs.readFileSync(managed);
    fs.writeFileSync(userFile, "user bytes must survive adoption\n");
    writeStateAt(state, sidecar, target.targetRoot);
    const adopted = installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    expect(adopted.rootBinding?.bindingVersion).toBe("2");
    expect(fs.readFileSync(managed)).toEqual(beforeManaged);
    expect(fs.readFileSync(userFile, "utf8")).toBe("user bytes must survive adoption\n");
    expect(inspectHostAdapterOwnership("codex", { hostHome: home, uadsHome: sidecar }, ROOT).status).toBe("CLEAN");
  });

  it("T64 privacy and state/bundle v2 binding are preserved", () => {
    const fixture = plannedFixture();
    installHostAdapter("generic-agent-skills", { hostHome: fixture.hostHome, uadsHome: fixture.home, packageRoot: ROOT }, ROOT);
    const bundle = prepareHostDispatchBundle({ adapterId: "generic-agent-skills", cwd: fixture.repo, uadsHome: fixture.home, hostHome: fixture.hostHome, schemaRoot: ROOT });
    const state = readHostAdapterState("generic-agent-skills", fixture.home, ROOT)!;
    const status = getHostAdapterStatusSummary("generic-agent-skills", { hostHome: fixture.hostHome, uadsHome: fixture.home }, ROOT);
    const target = resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: fixture.hostHome });
    expect(state.rootBinding?.bindingVersion).toBe("2");
    expect(bundle.hostTargetRootDigest).toBe(target.targetRootDigest);
    expect(bundle.hostTargetRootDigest).toBe(computeTargetRootDigest("generic-agent-skills", target.targetRoot));
    const context = resolveProjectContext(fixture.repo, fixture.home);
    expect(hostDispatchBundleStatus(
      context.paths,
      fixture.projectId,
      ROOT,
      "generic-agent-skills",
      fixture.hostHome,
    )).toBe("current");
    expect(hostDispatchBundleStatus(
      context.paths,
      fixture.projectId,
      ROOT,
      "generic-agent-skills",
      hostHome(),
    )).toBe("stale");
    const serialized = JSON.stringify({ state, bundle, status });
    expect(serialized).not.toContain(fixture.hostHome);
    expect(serialized).not.toContain(fixture.home);
  });
});
