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
  HostAdapterRootError,
  resolveHostRootInput,
} from "../src/adapters/host-adapter-root.js";
import {
  getHostAdapterStatePath,
  installHostAdapter,
  readHostAdapterState,
  uninstallHostAdapter,
} from "../src/adapters/host-adapter-install.js";
import { getHostAdapterStatusSummary } from "../src/adapters/host-adapter-install.js";
import { prepareHostDispatchBundle } from "../src/adapters/host-dispatch.js";
import { runPlan } from "../src/kernel/orchestrator.js";
import { seedFrontend } from "./execution-helpers.js";
import { tempDirs } from "./helpers.js";

const ROOT = process.cwd();

function hostHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-host-c02-"));
}

function uadsHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-c02-"));
}

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

afterEach(() => {
  delete process.env.UADS_ADAPTER_INSTALL_FAULT;
  delete process.env.UADS_CODEX_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.UADS_CURSOR_HOME;
  delete process.env.CURSOR_USER_HOME;
  delete process.env.UADS_AGENT_SKILLS_HOME;
  delete process.env.AGENT_SKILLS_HOME;
});

describe("Prompt 010 correction 02", { timeout: 120_000 }, () => {
  it("T41 already-suffixed Codex override cannot double append", () => {
    const home = hostHome();
    const suffixed = path.join(home, ".codex");
    fs.mkdirSync(suffixed, { recursive: true });
    const detection = detectHostAdapter("codex", { hostHome: suffixed });
    expect(detection.status).toBe("BLOCKED");
    expect(detection.reasonCodes).toContain("DOUBLE_ADAPTER_ROOT_REJECTED");
    expect(() => installHostAdapter("codex", { hostHome: suffixed, uadsHome: uadsHome(), packageRoot: ROOT }, ROOT)).toThrow(
      /DOUBLE_ADAPTER_ROOT_REJECTED/i,
    );
    expect(hasDoubleHiddenAdapterRoot(path.join(suffixed, ".codex"), "codex")).toBe(true);
    expect(fs.existsSync(path.join(suffixed, ".codex"))).toBe(false);
  });

  it("T42 already-suffixed Cursor override cannot double append", () => {
    const home = hostHome();
    const suffixed = path.join(home, ".cursor");
    fs.mkdirSync(suffixed, { recursive: true });
    const detection = detectHostAdapter("cursor", { hostHome: suffixed });
    expect(detection.status).toBe("BLOCKED");
    expect(detection.reasonCodes).toContain("DOUBLE_ADAPTER_ROOT_REJECTED");
    expect(() => installHostAdapter("cursor", { hostHome: suffixed, uadsHome: uadsHome(), packageRoot: ROOT }, ROOT)).toThrow(
      /DOUBLE_ADAPTER_ROOT_REJECTED/i,
    );
  });

  it("T43 already-suffixed Generic override cannot double append", () => {
    const home = hostHome();
    const suffixed = path.join(home, ".agents");
    fs.mkdirSync(suffixed, { recursive: true });
    const detection = detectHostAdapter("generic-agent-skills", { hostHome: suffixed });
    expect(detection.status).toBe("BLOCKED");
    expect(detection.reasonCodes).toContain("DOUBLE_ADAPTER_ROOT_REJECTED");
  });

  it("T44 native Codex environment uses adapter-root semantics without double append", () => {
    const home = hostHome();
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    withEnv({ UADS_CODEX_HOME: undefined, CODEX_HOME: codexRoot }, () => {
      const target = resolveHostTarget(getHostAdapterDefinition("codex"));
      expect(target.rootKind).toBe("adapter-root");
      expect(target.targetRoot).toBe(codexRoot);
      expect(hasDoubleHiddenAdapterRoot(target.targetRoot, "codex")).toBe(false);
      expect(target.sourceLabel).toBe("codex-home");
    });
  });

  it("T45 environment precedence is deterministic", () => {
    const home = hostHome();
    const synthetic = path.join(home, "synthetic");
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(synthetic, { recursive: true });
    fs.mkdirSync(codexRoot, { recursive: true });
    withEnv({ UADS_CODEX_HOME: synthetic, CODEX_HOME: codexRoot }, () => {
      const target = resolveHostTarget(getHostAdapterDefinition("codex"));
      expect(target.targetRoot).toBe(path.join(synthetic, ".codex"));
      expect(target.sourceClass).toBe("uads-environment");
    });
    const bindings = environmentBindings("codex");
    expect(bindings[0]?.variable).toBe("UADS_CODEX_HOME");
    expect(bindings[1]?.variable).toBe("CODEX_HOME");
  });

  it("T46 invalid override is read-only", () => {
    const home = hostHome();
    const suffixed = path.join(home, ".codex");
    fs.mkdirSync(suffixed, { recursive: true });
    const sidecar = uadsHome();
    const beforeAgents = fs.existsSync(path.join(home, "agents"));
    const beforeSkills = fs.existsSync(path.join(home, "skills"));
    detectHostAdapter("codex", { hostHome: suffixed });
    try {
      installHostAdapter("codex", { hostHome: suffixed, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    } catch {
      // expected
    }
    expect(fs.existsSync(path.join(home, ".codex", "agents"))).toBe(false);
    expect(fs.existsSync(path.join(home, "agents"))).toBe(beforeAgents);
    expect(fs.existsSync(path.join(home, "skills"))).toBe(beforeSkills);
    expect(readHostAdapterState("codex", sidecar, ROOT)).toBeNull();
  });

  it("T47 legacy migration remains correct under new root typing", () => {
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
    fs.writeFileSync(getHostAdapterStatePath("codex", sidecar), `${JSON.stringify(savedState, null, 2)}\n`);
    installHostAdapter("codex", { hostHome: home, uadsHome: sidecar, packageRoot: ROOT }, ROOT);
    expect(fs.existsSync(path.join(home, ".codex", "agents", "uads-repo-inspector.md"))).toBe(true);
    expect(fs.existsSync(path.join(legacy.resourceRoot, "uads-repo-inspector.md"))).toBe(false);
  });

  it("T48 status/explain/prepare share canonical root identity semantics", () => {
    const fixture = tempDirs();
    seedFrontend(fixture.repo);
    runPlan({
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
    const host = hostHome();
    installHostAdapter("generic-agent-skills", { hostHome: host, uadsHome: fixture.home, packageRoot: ROOT }, ROOT);
    const input = { hostHome: host, uadsHome: fixture.home, packageRoot: ROOT };
    const detectTarget = resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), input);
    const status = getHostAdapterStatusSummary("generic-agent-skills", input, ROOT);
    const prepare = prepareHostDispatchBundle({
      adapterId: "generic-agent-skills",
      cwd: fixture.repo,
      uadsHome: fixture.home,
      hostHome: host,
      schemaRoot: ROOT,
    });
    expect(status.support).toBe(detectHostAdapter("generic-agent-skills", input).status);
    expect(prepare.adapterId).toBe("generic-agent-skills");
    expect(resolveHostRootInput(getHostAdapterDefinition("generic-agent-skills"), input).targetRoot).toBe(
      detectTarget.targetRoot,
    );
    expect(detectTarget.rootIdentityDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("explicit adapterRoot override is accepted without double append", () => {
    const home = hostHome();
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    const target = resolveHostTarget(getHostAdapterDefinition("codex"), { adapterRoot: codexRoot });
    expect(target.rootKind).toBe("adapter-root");
    expect(target.targetRoot).toBe(codexRoot);
    expect(hasDoubleHiddenAdapterRoot(target.targetRoot, "codex")).toBe(false);
  });

  it("rejects combining adapterRoot and hostHome", () => {
    expect(() =>
      resolveHostTarget(getHostAdapterDefinition("codex"), {
        hostHome: hostHome(),
        adapterRoot: path.join(hostHome(), ".codex"),
      }),
    ).toThrow(HostAdapterRootError);
  });
});
