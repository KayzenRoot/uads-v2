import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectHostAdapter,
  resolveHostTarget,
} from "../src/adapters/host-adapter-detect.js";
import { getHostAdapterDefinition } from "../src/adapters/host-adapter-registry.js";
import {
  computeTargetRootDigest,
  validateHostRootBinding,
} from "../src/adapters/host-adapter-root.js";
import {
  getHostAdapterStatePath,
  inspectHostAdapterOwnership,
  installHostAdapter,
  readHostAdapterState,
  uninstallHostAdapter,
  getHostAdapterStatusSummary,
} from "../src/adapters/host-adapter-install.js";
import {
  hostDispatchBundleStatus,
  isHostDispatchBundleCurrent,
  prepareHostDispatchBundle,
} from "../src/adapters/host-dispatch.js";
import { sha256Hex } from "../src/lib/hash.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { runPlan } from "../src/kernel/orchestrator.js";
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
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-host-c03-"));
}

function uadsHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-c03-"));
}

function legacyUnboundState(state: HostAdapterState): Omit<HostAdapterState, "rootBinding"> {
  const legacy = { ...state };
  delete (legacy as Partial<HostAdapterState>).rootBinding;
  const { stateDigest: _ignored, ...withoutDigest } = legacy;
  const digest = sha256Hex(
    JSON.stringify(
      stableValue({
        ...withoutDigest,
        updatedAt: null,
        detection: { ...withoutDigest.detection, detectedAt: null },
      }),
    ),
  );
  return { ...legacy, stateDigest: digest };
}

function copyManagedTree(sourceRoot: string, destinationRoot: string): void {
  const visit = (relative: string): void => {
    const source = path.join(sourceRoot, relative);
    const destination = path.join(destinationRoot, relative);
    if (!fs.existsSync(source)) return;
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

afterEach(() => {
  delete process.env.UADS_ADAPTER_INSTALL_FAULT;
  delete process.env.UADS_CODEX_HOME;
  delete process.env.CODEX_HOME;
});

describe("Prompt 010 correction 03", { timeout: 120_000 }, () => {
  it("T49 cross-root identical-byte replay is rejected", () => {
    const homeA = hostHome();
    const homeB = hostHome();
    const sidecar = uadsHome();
    installHostAdapter("codex", { hostHome: homeA, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const targetA = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: homeA });
    const targetB = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: homeB });
    fs.mkdirSync(targetB.targetRoot, { recursive: true });
    copyManagedTree(targetA.targetRoot, targetB.targetRoot);
    expect(targetA.targetRootDigest).not.toBe(targetB.targetRootDigest);
    const ownership = inspectHostAdapterOwnership("codex", { hostHome: homeB, uadsHome: sidecar }, ROOT);
    expect(ownership.status).toBe("CONFLICT");
    expect(ownership.reasonCodes).toContain("ROOT_BINDING_MISMATCH");
  });

  it("T50 cross-root uninstall preserves foreign identical bytes", () => {
    const homeA = hostHome();
    const homeB = hostHome();
    const sidecar = uadsHome();
    installHostAdapter("codex", { hostHome: homeA, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const targetA = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: homeA });
    const targetB = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: homeB });
    fs.mkdirSync(targetB.targetRoot, { recursive: true });
    copyManagedTree(targetA.targetRoot, targetB.targetRoot);
    const digestB = (relative: string) =>
      sha256Hex(fs.readFileSync(path.join(targetB.targetRoot, relative)));
    const beforeB = fs.readdirSync(targetB.resourceRoot).map((name) => digestB(path.join("agents", name)));
    expect(() => uninstallHostAdapter("codex", { hostHome: homeB, uadsHome: sidecar }, ROOT)).toThrow(/binding/i);
    const afterB = fs.readdirSync(targetB.resourceRoot).map((name) => digestB(path.join("agents", name)));
    expect(afterB).toEqual(beforeB);
    const state = readHostAdapterState("codex", sidecar, ROOT);
    expect(state?.rootBinding?.targetRootDigest).toBe(targetA.targetRootDigest);
    expect(fs.existsSync(path.join(targetA.resourceRoot, "uads-repo-inspector.md"))).toBe(true);
  });

  it("T51 host dispatch bundle becomes stale after root switch", () => {
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
    const projectId = planned.workOrder.projectId;
    const homeA = hostHome();
    const homeB = hostHome();
    installHostAdapter("generic-agent-skills", { hostHome: homeA, uadsHome: fixture.home, packageRoot: ROOT }, ROOT);
    const bundle = prepareHostDispatchBundle({
      adapterId: "generic-agent-skills",
      cwd: fixture.repo,
      uadsHome: fixture.home,
      hostHome: homeA,
      schemaRoot: ROOT,
    });
    const ctx = resolveProjectContext(fixture.repo, fixture.home);
    expect(
      hostDispatchBundleStatus(ctx.paths, projectId, ROOT, "generic-agent-skills", homeA),
    ).toBe("current");
    expect(
      hostDispatchBundleStatus(ctx.paths, projectId, ROOT, "generic-agent-skills", homeB),
    ).toBe("stale");
    expect(bundle.hostTargetRootDigest).toBe(
      resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: homeA }).targetRootDigest,
    );
    expect(bundle.hostTargetRootDigest).not.toBe(
      resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: homeB }).targetRootDigest,
    );
    expect(
      isHostDispatchBundleCurrent(bundle, {
        hostTargetRootDigest: resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: homeB })
          .targetRootDigest,
      }),
    ).toBe(false);
  });

  it("T52 root-binding tamper is rejected", () => {
    const home = hostHome();
    const sidecar = uadsHome();
    installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const state = readHostAdapterState("codex", sidecar, ROOT);
    expect(state).not.toBeNull();
    const tampered = {
      ...state!,
      rootBinding: {
        ...state!.rootBinding!,
        targetRootDigest: "a".repeat(64),
      },
    };
    fs.writeFileSync(getHostAdapterStatePath("codex", sidecar), `${JSON.stringify(tampered, null, 2)}\n`);
    expect(() => readHostAdapterState("codex", sidecar, ROOT)).toThrow(/digest|corrupt/i);
    expect(() => inspectHostAdapterOwnership("codex", { hostHome: home, uadsHome: sidecar }, ROOT)).toThrow(/corrupt/i);
  });

  it("T53 same physical root through equivalent valid sources shares digest", () => {
    const home = hostHome();
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    const previous = { ...process.env };
    process.env.UADS_CODEX_HOME = home;
    const viaUads = resolveHostTarget(getHostAdapterDefinition("codex"));
    delete process.env.UADS_CODEX_HOME;
    process.env.CODEX_HOME = codexRoot;
    const viaCodexHome = resolveHostTarget(getHostAdapterDefinition("codex"));
    process.env.UADS_CODEX_HOME = previous.UADS_CODEX_HOME;
    process.env.CODEX_HOME = previous.CODEX_HOME;
    expect(viaUads.targetRootDigest).toBe(viaCodexHome.targetRootDigest);
    expect(viaUads.sourceClass).not.toBe(viaCodexHome.sourceClass);
    expect(viaUads.targetRoot).toBe(viaCodexHome.targetRoot);
  });

  it("T54 legacy unbound state does not authorize destructive uninstall", () => {
    const home = hostHome();
    const sidecar = uadsHome();
    installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const bound = readHostAdapterState("codex", sidecar, ROOT);
    expect(bound).not.toBeNull();
    const legacy = legacyUnboundState(bound!);
    fs.writeFileSync(getHostAdapterStatePath("codex", sidecar), `${JSON.stringify(legacy, null, 2)}\n`);
    expect(() => uninstallHostAdapter("codex", { hostHome: home, uadsHome: sidecar }, ROOT)).toThrow(/binding/i);
    expect(fs.existsSync(path.join(home, ".codex", "agents", "uads-repo-inspector.md"))).toBe(true);
    const ownership = inspectHostAdapterOwnership("codex", { hostHome: home, uadsHome: sidecar }, ROOT);
    expect(ownership.status).toBe("STALE");
    expect(ownership.reasonCodes).toContain("ROOT_BINDING_REQUIRED");
  });

  it("T55 legacy unbound state safe adoption is non-destructive", () => {
    const home = hostHome();
    const sidecar = uadsHome();
    installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const bound = readHostAdapterState("codex", sidecar, ROOT);
    const target = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: home });
    const before = fs.readFileSync(path.join(target.resourceRoot, "uads-repo-inspector.md"));
    const legacy = legacyUnboundState(bound!);
    fs.writeFileSync(getHostAdapterStatePath("codex", sidecar), `${JSON.stringify(legacy, null, 2)}\n`);
    const adopted = installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    expect(adopted.rootBinding?.targetRootDigest).toBe(target.targetRootDigest);
    expect(fs.readFileSync(path.join(target.resourceRoot, "uads-repo-inspector.md"))).toEqual(before);
    expect(inspectHostAdapterOwnership("codex", { hostHome: home, uadsHome: sidecar }, ROOT).status).toBe("CLEAN");
    expect(validateHostRootBinding(adopted, target).status).toBe("BOUND_MATCH");
  });

  it("T56 privacy regression keeps raw host paths out of operational JSON", () => {
    const home = hostHome();
    const sidecar = uadsHome();
    const installed = installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const status = getHostAdapterStatusSummary("codex", { hostHome: home, uadsHome: sidecar }, ROOT);
    const serialized = JSON.stringify({ installed, status });
    expect(serialized).not.toContain(home);
    expect(serialized).not.toContain(path.join(home, ".codex"));
    expect(installed.rootBinding?.targetRootDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(detectHostAdapter("codex", { hostHome: home }).reasonCodes).not.toContain(home);
  });
});
