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
  classifyHostAdapterTarget,
  resolveLegacyV010HostTarget,
} from "../src/adapters/host-adapter-legacy.js";
import {
  environmentBindings,
  hasDoubleHiddenAdapterRoot,
  resolveHostRootInput,
} from "../src/adapters/host-adapter-root.js";
import {
  getHostAdapterStatePath,
  inspectHostAdapterOwnership,
  installHostAdapter,
  readHostAdapterState,
  uninstallHostAdapter,
} from "../src/adapters/host-adapter-install.js";
import { releaseTitle, assertReleaseTitleIsCurrent } from "../src/release/release-title.js";

const ROOT = process.cwd();

function hostHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-host-correction-"));
}

function uadsHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-correction-"));
}

function withIsolatedHome(home: string, run: () => void): void {
  const previous = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    UADS_CODEX_HOME: process.env.UADS_CODEX_HOME,
    UADS_AGENT_SKILLS_HOME: process.env.UADS_AGENT_SKILLS_HOME,
    UADS_CURSOR_HOME: process.env.UADS_CURSOR_HOME,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.UADS_CODEX_HOME;
  delete process.env.UADS_AGENT_SKILLS_HOME;
  delete process.env.UADS_CURSOR_HOME;
  try {
    run();
  } finally {
    process.env.HOME = previous.HOME;
    process.env.USERPROFILE = previous.USERPROFILE;
    if (previous.UADS_CODEX_HOME) process.env.UADS_CODEX_HOME = previous.UADS_CODEX_HOME;
    else delete process.env.UADS_CODEX_HOME;
    if (previous.UADS_AGENT_SKILLS_HOME) process.env.UADS_AGENT_SKILLS_HOME = previous.UADS_AGENT_SKILLS_HOME;
    else delete process.env.UADS_AGENT_SKILLS_HOME;
    if (previous.UADS_CURSOR_HOME) process.env.UADS_CURSOR_HOME = previous.UADS_CURSOR_HOME;
    else delete process.env.UADS_CURSOR_HOME;
  }
}

afterEach(() => {
  delete process.env.UADS_ADAPTER_INSTALL_FAULT;
});

describe("Prompt 010 correction 01", { timeout: 120_000 }, () => {
  it("T31 default Codex target is fixed under .codex", () => {
    const home = hostHome();
    const target = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: home });
    expect(target.targetRoot).toBe(path.join(home, ".codex"));
    expect(target.resourceRoot).toBe(path.join(home, ".codex", "agents"));
    installHostAdapter("codex", { hostHome: home, uadsHome: uadsHome(), packageRoot: ROOT }, ROOT);
    expect(fs.existsSync(path.join(home, ".codex", "agents", "uads-repo-inspector.md"))).toBe(true);
    expect(fs.existsSync(path.join(home, "agents"))).toBe(false);
    expect(fs.existsSync(path.join(home, "uads-managed-agents.json"))).toBe(false);
  });

  it("T32 default Generic target is fixed under .agents", () => {
    const home = hostHome();
    const target = resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: home });
    expect(target.targetRoot).toBe(path.join(home, ".agents"));
    installHostAdapter("generic-agent-skills", { hostHome: home, uadsHome: uadsHome(), packageRoot: ROOT }, ROOT);
    expect(fs.existsSync(path.join(home, ".agents", "skills", "uads-orchestrator", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(home, "skills", "uads-orchestrator"))).toBe(false);
  });

  it("T33 missing default Codex structure is not SUPPORTED", () => {
    const home = hostHome();
    withIsolatedHome(home, () => {
      const detection = detectHostAdapter("codex");
      expect(detection.status).toBe("UNAVAILABLE");
      expect(fs.existsSync(path.join(home, ".codex"))).toBe(false);
    });
  });

  it("T34 missing default Generic structure is not SUPPORTED", () => {
    const home = hostHome();
    withIsolatedHome(home, () => {
      const detection = detectHostAdapter("generic-agent-skills");
      expect(detection.status).toBe("UNAVAILABLE");
      expect(fs.existsSync(path.join(home, ".agents"))).toBe(false);
    });
  });

  it("T35 synthetic user home appends exactly one fixed adapter segment", () => {
    const home = hostHome();
    for (const adapterId of ["cursor", "codex", "generic-agent-skills"] as const) {
      const target = resolveHostTarget(getHostAdapterDefinition(adapterId), { hostHome: home });
      expect(target.rootKind).toBe("synthetic-user-home");
      expect(target.targetRoot).not.toBe(home);
      expect(hasDoubleHiddenAdapterRoot(target.targetRoot, adapterId)).toBe(false);
    }
    const suffixed = path.join(home, ".codex");
    fs.mkdirSync(suffixed, { recursive: true });
    expect(detectHostAdapter("codex", { hostHome: suffixed }).reasonCodes).toContain("DOUBLE_ADAPTER_ROOT_REJECTED");
  });

  it("T36 canonical UADS resources roll back on host failure", () => {
    const home = hostHome();
    const sidecar = uadsHome();
    const canonicalRoot = path.join(sidecar, "agents");
    fs.mkdirSync(canonicalRoot, { recursive: true });
    const canonicalFile = path.join(canonicalRoot, "uads-repo-inspector.md");
    fs.writeFileSync(canonicalFile, "original canonical bytes\n");
    process.env.UADS_ADAPTER_INSTALL_FAULT = "after-canonical-sync";
    expect(() => installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT)).toThrow(/injected|fault/i);
    expect(fs.readFileSync(canonicalFile, "utf8")).toBe("original canonical bytes\n");
    expect(fs.existsSync(path.join(home, ".codex", "agents", "uads-repo-inspector.md"))).toBe(false);
    expect(readHostAdapterState("codex", sidecar, ROOT)).toBeNull();
  });

  it("T37 legacy clean v0.10.0 state migrates safely", () => {
    const home = hostHome();
    const sidecar = uadsHome();
    const installed = installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const savedState = readHostAdapterState("codex", sidecar, ROOT);
    const legacy = resolveLegacyV010HostTarget(getHostAdapterDefinition("codex"), home)!;
    fs.mkdirSync(legacy.resourceRoot, { recursive: true });
    for (const resource of installed.resources) {
      const current = path.join(home, ".codex", resource.relativeTarget);
      const legacyPath = path.join(legacy.targetRoot, resource.relativeTarget);
      fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
      fs.copyFileSync(current, legacyPath);
    }
    fs.copyFileSync(path.join(home, ".codex", installed.manifestRelativeTarget), legacy.manifestPath);
    uninstallHostAdapter("codex", { hostHome: home, uadsHome: sidecar }, ROOT);
    fs.mkdirSync(path.dirname(getHostAdapterStatePath("codex", sidecar)), { recursive: true });
    fs.writeFileSync(getHostAdapterStatePath("codex", sidecar), `${JSON.stringify(savedState, null, 2)}\n`);
    const current = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: home });
    expect(classifyHostAdapterTarget(current, legacy, savedState).classification).toBe("LEGACY_V010_TARGET_CLEAN");
    installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    expect(fs.existsSync(path.join(home, ".codex", "agents", "uads-repo-inspector.md"))).toBe(true);
    expect(fs.existsSync(path.join(legacy.resourceRoot, "uads-repo-inspector.md"))).toBe(false);
  });

  it("T38 legacy modified state fails closed", () => {
    const home = hostHome();
    const sidecar = uadsHome();
    const installed = installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    const savedState = readHostAdapterState("codex", sidecar, ROOT);
    const legacy = resolveLegacyV010HostTarget(getHostAdapterDefinition("codex"), home)!;
    fs.mkdirSync(legacy.resourceRoot, { recursive: true });
    for (const resource of installed.resources) {
      const current = path.join(home, ".codex", resource.relativeTarget);
      const legacyPath = path.join(legacy.targetRoot, resource.relativeTarget);
      fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
      fs.copyFileSync(current, legacyPath);
    }
    fs.copyFileSync(path.join(home, ".codex", installed.manifestRelativeTarget), legacy.manifestPath);
    uninstallHostAdapter("codex", { hostHome: home, uadsHome: sidecar }, ROOT);
    const legacyManaged = path.join(legacy.resourceRoot, "uads-repo-inspector.md");
    fs.writeFileSync(legacyManaged, "modified legacy byte\n");
    fs.mkdirSync(path.dirname(getHostAdapterStatePath("codex", sidecar)), { recursive: true });
    fs.writeFileSync(getHostAdapterStatePath("codex", sidecar), `${JSON.stringify(savedState, null, 2)}\n`);
    expect(() => installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT)).toThrow(/legacy/i);
    expect(fs.readFileSync(legacyManaged, "utf8")).toBe("modified legacy byte\n");
  });

  it("T39 release title is no longer hard-coded", () => {
    expect(releaseTitle("0.10.0")).toBe("UADS v0.10.0 - Runtime Adapters");
    expect(releaseTitle("0.10.1")).toBe("UADS v0.10.1 - Runtime Adapter Hardening");
    assertReleaseTitleIsCurrent("0.10.1", releaseTitle("0.10.1"));
    expect(releaseTitle("0.10.0")).not.toContain("GitHub Release Engineering");
  });

  it("T40 default target cannot escape into bare home", () => {
    const home = hostHome();
    for (const adapterId of ["codex", "generic-agent-skills"] as const) {
      const target = resolveHostTarget(getHostAdapterDefinition(adapterId), { hostHome: home });
      installHostAdapter(adapterId, { hostHome: home, uadsHome: uadsHome(), packageRoot: ROOT }, ROOT);
      const walk = (directory: string): string[] => {
        if (!fs.existsSync(directory)) return [];
        return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
          const absolute = path.join(directory, entry.name);
          if (entry.isDirectory()) return walk(absolute);
          if (entry.isFile()) return [absolute];
          return [];
        });
      };
      const managed = walk(target.targetRoot);
      expect(managed.length).toBeGreaterThan(0);
      expect(managed.every((absolute) => absolute.startsWith(target.targetRoot))).toBe(true);
      expect(managed.some((absolute) => path.dirname(absolute) === home)).toBe(false);
    }
  });
});
