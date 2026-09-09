import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSchema } from "../lib/json-schema.js";
import { sha256Hex } from "../lib/hash.js";
import { findPackageRoot } from "../lib/version.js";
import {
  builtinHostAdapterRegistry,
  createHostAdapterRegistry,
  getHostAdapterDefinition,
} from "../adapters/host-adapter-registry.js";
import {
  detectHostAdapter,
  resolveHostTarget,
  runtimeSnapshotFromHostDetection,
} from "../adapters/host-adapter-detect.js";
import { resolveLegacyV010HostTarget } from "../adapters/host-adapter-legacy.js";
import {
  computeTargetRootDigest,
  environmentBindings,
  hasDoubleHiddenAdapterRoot,
  resolveHostRootInput,
  validateHostRootBinding,
} from "../adapters/host-adapter-root.js";
import {
  getHostAdapterStatePath,
  installHostAdapter,
  inspectHostAdapterOwnership,
  readHostAdapterState,
  uninstallHostAdapter,
  getHostAdapterStatusSummary,
} from "../adapters/host-adapter-install.js";
import {
  hostDispatchBundleStatus,
  isHostDispatchBundleCurrent,
  prepareHostDispatchBundle,
  readCurrentHostDispatchBundle,
} from "../adapters/host-dispatch.js";
import type { HostAdapterId, HostAdapterState, HostDispatchBundle } from "../adapters/host-adapter-types.js";
import { runPlan } from "../kernel/orchestrator.js";
import { resolveProjectContext } from "../kernel/project-context.js";

type EvalCase = { id: string; name: string };

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

function legacyV1RootDigest(adapterId: HostAdapterId, targetRoot: string): string {
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

function rewriteAsLegacyV1(state: HostAdapterState, sidecar: string, targetRoot: string): void {
  const legacy = {
    ...state,
    rootBinding: {
      ...state.rootBinding!,
      targetRootDigest: legacyV1RootDigest(state.adapterId, targetRoot),
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

function caseSensitiveRoots(): { homeA: string; homeB: string } | null {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "uads-case-eval-"));
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

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "UADS Adapter Eval",
  GIT_AUTHOR_EMAIL: "uads-adapter-eval@example.com",
  GIT_COMMITTER_NAME: "UADS Adapter Eval",
  GIT_COMMITTER_EMAIL: "uads-adapter-eval@example.com",
};

function assertEval(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function initRepo(root: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: root, env: gitEnv });
  execFileSync(
    "git",
    ["-c", "user.email=uads-adapter-eval@example.com", "-c", "user.name=UADS Adapter Eval", "config", "commit.gpgsign", "false"],
    { cwd: root, env: gitEnv },
  );
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/uads-adapter-eval.git"], {
    cwd: root,
    env: gitEnv,
  });
}

function commit(root: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: root, env: gitEnv });
  execFileSync(
    "git",
    ["-c", "user.email=uads-adapter-eval@example.com", "-c", "user.name=UADS Adapter Eval", "commit", "-m", message],
    { cwd: root, env: gitEnv },
  );
}

function hostFixture(): { hostHome: string; uadsHome: string; project: string } {
  return {
    hostHome: fs.mkdtempSync(path.join(os.tmpdir(), "uads-host-eval-")),
    uadsHome: fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-state-eval-")),
    project: fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-project-eval-")),
  };
}

function install(id: HostAdapterId): ReturnType<typeof installHostAdapter> & { hostHome: string; uadsHome: string; project: string } {
  const fixture = hostFixture();
  const state = installHostAdapter(
    id,
    { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() },
    findPackageRoot(),
  );
  return { ...fixture, ...state };
}

function plannedFixture(id: HostAdapterId = "generic-agent-skills") {
  const fixture = hostFixture();
  initRepo(fixture.project);
  fs.mkdirSync(path.join(fixture.project, "src"), { recursive: true });
  fs.writeFileSync(path.join(fixture.project, "src", "index.ts"), "export const value = 1;\n");
  commit(fixture.project, "fixture");
  const planned = runPlan({
    cwd: fixture.project,
    uadsHome: fixture.uadsHome,
    intake: {
      schema: "uads.intake",
      schemaVersion: "0.2.0",
      objective: "Change a bounded frontend behavior",
      domainSignals: ["frontend"],
      affectedAreas: ["src"],
      inScope: ["src"],
      acceptanceCriteria: ["the change is verified"],
      classifier: "host-structured",
    },
  });
  installHostAdapter(
    id,
    { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() },
    findPackageRoot(),
  );
  const context = resolveProjectContext(fixture.project, fixture.uadsHome);
  return { ...fixture, planned, context };
}

function rewriteJson(file: string, mutate: (value: Record<string, unknown>) => Record<string, unknown>): void {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(file, `${JSON.stringify(mutate(value), null, 2)}\n`);
}

function prepare(fixture: ReturnType<typeof plannedFixture>): HostDispatchBundle {
  return prepareHostDispatchBundle({
    adapterId: "generic-agent-skills",
    cwd: fixture.project,
    uadsHome: fixture.uadsHome,
    hostHome: fixture.hostHome,
    schemaRoot: findPackageRoot(),
  });
}

function runCase(id: string): void {
  if (id === "AD1") {
    const fixture = install("cursor");
    assertEval(fixture.resources.length === 25, "Cursor catalog was not installed globally");
    assertEval(!fs.existsSync(path.join(fixture.project, ".cursor")), "Cursor install touched the project");
    assertEval(fs.existsSync(getHostAdapterStatePath("cursor", fixture.uadsHome)), "Cursor ownership state is missing");
  } else if (id === "AD2") {
    const fixture = hostFixture();
    const unrelated = path.join(fixture.hostHome, ".cursor", "agents", "personal-reviewer.md");
    fs.mkdirSync(path.dirname(unrelated), { recursive: true });
    fs.writeFileSync(unrelated, "personal\n");
    installHostAdapter("cursor", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    uninstallHostAdapter("cursor", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome }, findPackageRoot());
    assertEval(fs.readFileSync(unrelated, "utf8") === "personal\n", "unrelated Cursor resource was changed");
  } else if (id === "AD3") {
    const unmanaged = hostFixture();
    const unmanagedFile = path.join(unmanaged.hostHome, ".cursor", "agents", "uads-custom.md");
    fs.mkdirSync(path.dirname(unmanagedFile), { recursive: true });
    fs.writeFileSync(unmanagedFile, "unmanaged\n");
    let unmanagedBlocked = false;
    try {
      installHostAdapter("cursor", { hostHome: unmanaged.hostHome, uadsHome: unmanaged.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    } catch {
      unmanagedBlocked = true;
    }
    assertEval(unmanagedBlocked, "unmanaged uads-* resource was accepted");

    const modified = install("cursor");
    const target = path.join(modified.hostHome, ".cursor", "agents", "uads-frontend-specialist.md");
    fs.writeFileSync(target, "user modified\n");
    let modifiedBlocked = false;
    try {
      installHostAdapter("cursor", { hostHome: modified.hostHome, uadsHome: modified.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    } catch {
      modifiedBlocked = true;
    }
    assertEval(modifiedBlocked, "modified managed resource was overwritten");
    assertEval(fs.readFileSync(target, "utf8") === "user modified\n", "modified managed bytes were lost");
  } else if (id === "AD4") {
    const base = builtinHostAdapterRegistry();
    let traversalBlocked = false;
    try {
      createHostAdapterRegistry(base.adapters.map((adapter) =>
        adapter.adapterId === "cursor" ? { ...adapter, manifestRelativeTarget: "../escape" } : adapter,
      ));
    } catch {
      traversalBlocked = true;
    }
    assertEval(traversalBlocked, "host manifest traversal was accepted");
    const fixture = hostFixture();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "uads-host-outside-"));
    let symlinkBlocked = false;
    try {
      fs.symlinkSync(outside, path.join(fixture.hostHome, ".cursor"), "junction");
      symlinkBlocked = detectHostAdapter("cursor", { hostHome: fixture.hostHome }).status === "BLOCKED";
    } catch {
      symlinkBlocked = true;
    }
    assertEval(symlinkBlocked, "host symlink escape was not blocked");
  } else if (id === "AD5") {
    const fixture = install("codex");
    assertEval(fs.existsSync(path.join(fixture.hostHome, ".codex", "agents", "uads-repo-inspector.md")), "Codex agents were not installed");
    assertEval(!fs.existsSync(path.join(fixture.project, "AGENTS.md")), "Codex install touched the project");
  } else if (id === "AD6") {
    const fixture = install("generic-agent-skills");
    assertEval(fs.existsSync(path.join(fixture.hostHome, ".agents", "skills", "uads-orchestrator", "SKILL.md")), "Generic skill was not installed");
    assertEval(!fs.existsSync(path.join(fixture.project, "skills")), "Generic install touched the project");
  } else if (id === "AD7") {
    const fixture = hostFixture();
    const missing = path.join(fixture.hostHome, "missing-host");
    const before = fs.existsSync(missing);
    const detection = detectHostAdapter("cursor", { hostHome: missing });
    assertEval(detection.status === "UNPROVEN" && fs.existsSync(missing) === before, "host detection mutated the filesystem");
  } else if (id === "AD8") {
    const fixture = hostFixture();
    const detection = detectHostAdapter("generic-agent-skills", { hostHome: path.join(fixture.hostHome, "missing") });
    assertEval(detection.status === "UNPROVEN", "unavailable generic host was marked supported");
    assertEval(detection.provenCapabilities.subagents === false && detection.provenCapabilities.parallelAgents === false, "generic capabilities were invented");
  } else if (id === "AD9") {
    const detection = detectHostAdapter("generic-agent-skills", { hostHome: hostFixture().hostHome });
    const runtime = runtimeSnapshotFromHostDetection(detection);
    assertEval(runtime.provenance.source === "adapter", "adapter provenance was not preserved");
    assertEval(runtime.schemaVersion === "0.8.0" && /^[a-f0-9]{64}$/.test(runtime.identityDigest), "runtime snapshot identity is invalid");
  } else if (id === "AD10") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    assertEval(bundle.execution.roleDispatch === "role-cycling" && !bundle.execution.parallel, "generic host did not use sequential fallback");
  } else if (id === "AD11") {
    const fixture = plannedFixture();
    fs.unlinkSync(fixture.context.paths.currentSpecialistSelection);
    expectPreparationToFail(fixture, "missing Specialist Selection Plan");
  } else if (id === "AD12") {
    const fixture = plannedFixture();
    const workOrderPath = path.join(fixture.context.paths.workOrders, `${fixture.planned.workOrder.workOrderId}.json`);
    rewriteJson(workOrderPath, (value) => ({ ...value, objective: "mutated after specialist planning" }));
    expectPreparationToFail(fixture, "stale Specialist Selection Plan was accepted");
  } else if (id === "AD13") {
    const fixture = plannedFixture();
    fs.unlinkSync(fixture.context.paths.currentModelRouting);
    expectPreparationToFail(fixture, "missing Model Execution Plan was accepted");
  } else if (id === "AD14") {
    const fixture = plannedFixture();
    const runtimePath = path.join(fixture.context.paths.runtimeCapabilities, "generic-runtime.json");
    rewriteJson(runtimePath, (value) => ({ ...value, identityDigest: "0".repeat(64) }));
    expectPreparationToFail(fixture, "stale runtime identity was accepted");
  } else if (id === "AD15") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    assertSchema("host-dispatch-bundle.schema.json", bundle, findPackageRoot());
    assertEval(bundle.projectId === fixture.planned.workOrder.projectId, "bundle project binding is wrong");
    assertEval(bundle.specialistSelectionDigest === fixture.planned.specialistPlan.selectionDigest, "bundle specialist binding is wrong");
    assertEval(bundle.modelPlanId !== null && bundle.runtimeIdentityDigest.length === 64, "bundle model/runtime binding is incomplete");
  } else if (id === "AD16") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    assertEval(!isHostDispatchBundleCurrent(bundle, { projectId: "other-project" }), "cross-project bundle replay was accepted");
  } else if (id === "AD17") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    assertEval(JSON.stringify(bundle.dependencyGroups) === JSON.stringify(fixture.planned.specialistPlan.dispatch.dependencyGroups), "dependency DAG changed");
    assertEval(bundle.assignments.some((item) => item.requiredPredecessorRoles.length > 0), "predecessor roles were not translated");
  } else if (id === "AD18") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    assertEval(bundle.requiredAssuranceRoles.includes("independent-reviewer"), "independent reviewer was removed");
    assertEval(!bundle.parallelEligibleGroups.some((group) => group.includes("implementation-agent") && group.includes("independent-reviewer")), "implementation/review parallelism was introduced");
  } else if (id === "AD19") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    const tampered = { ...bundle, assignments: bundle.assignments.filter((item) => item.specialistId !== "independent-reviewer") };
    assertEval(!isHostDispatchBundleCurrent(tampered, { projectId: bundle.projectId }), "tampered bundle remained current");
  } else if (id === "AD20") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    assertEval(bundle.contextRadius === fixture.planned.workOrder.contextRadius, "context radius changed");
    assertEval(bundle.limits.tokenHardLimit === fixture.planned.workOrder.tokenBudget.hardLimit, "token hard limit changed");
    assertEval(JSON.stringify(bundle.selectedGates) === JSON.stringify(fixture.planned.workOrder.qualityGates), "selected gates changed");
    assertEval(JSON.stringify(bundle.requiredEvidence) === JSON.stringify(fixture.planned.workOrder.requiredEvidence), "required evidence changed");
    assertEval(bundle.assignments.every((item) => item.contextReferences.every((ref) => ref.startsWith("sidecar://"))), "context content was dumped");
  } else if (id === "AD21") {
    const fixture = hostFixture();
    const first = installHostAdapter("cursor", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    const firstState = JSON.stringify(readHostAdapterState("cursor", fixture.uadsHome, findPackageRoot()));
    const second = installHostAdapter("cursor", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    assertEval(first.stateDigest === second.stateDigest && firstState === JSON.stringify(readHostAdapterState("cursor", fixture.uadsHome, findPackageRoot())), "repeated install changed ownership state");
    const removed = uninstallHostAdapter("cursor", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome }, findPackageRoot());
    assertEval(removed?.installStatus === "NOT_INSTALLED", "safe uninstall did not complete");
  } else if (id === "AD22") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    const state = readHostAdapterState("generic-agent-skills", fixture.uadsHome, findPackageRoot());
    const text = JSON.stringify({ bundle, state });
    assertEval(!text.includes(fixture.hostHome) && !text.includes(fixture.uadsHome) && !text.includes("apiKey"), "adapter summary leaked host data");
    assertEval(readCurrentHostDispatchBundle(fixture.context.paths, findPackageRoot())?.bundleDigest === bundle.bundleDigest, "bundle sidecar was not readable");
  } else if (id === "AD23") {
    const fixture = install("codex");
    assertEval(fs.existsSync(path.join(fixture.hostHome, ".codex", "agents", "uads-repo-inspector.md")), "Codex default target is not under .codex");
    assertEval(!fs.existsSync(path.join(fixture.hostHome, "agents")), "Codex wrote to bare home agents");
  } else if (id === "AD24") {
    const fixture = install("generic-agent-skills");
    assertEval(fs.existsSync(path.join(fixture.hostHome, ".agents", "skills", "uads-orchestrator", "SKILL.md")), "Generic default target is not under .agents");
    assertEval(!fs.existsSync(path.join(fixture.hostHome, "skills", "uads-orchestrator")), "Generic wrote to bare home skills");
  } else if (id === "AD25") {
    const home = hostFixture().hostHome;
    const codex = detectHostAdapter("codex", { hostHome: home });
    const generic = detectHostAdapter("generic-agent-skills", { hostHome: home });
    assertEval(codex.status !== "SUPPORTED" && generic.status !== "SUPPORTED", "missing adapter roots were marked supported");
    assertEval(!fs.existsSync(path.join(home, ".codex")) && !fs.existsSync(path.join(home, ".agents")), "detection created adapter roots");
  } else if (id === "AD26") {
    const home = hostFixture().hostHome;
    for (const adapterId of ["cursor", "codex", "generic-agent-skills"] as const) {
      const target = resolveHostTarget(getHostAdapterDefinition(adapterId), { hostHome: home });
      assertEval(target.rootKind === "synthetic-user-home", `${adapterId} explicit override is not synthetic user home`);
      assertEval(!hasDoubleHiddenAdapterRoot(target.targetRoot, adapterId), `${adapterId} produced a double-hidden root`);
    }
    const suffixed = path.join(home, ".codex");
    fs.mkdirSync(suffixed, { recursive: true });
    assertEval(
      detectHostAdapter("codex", { hostHome: suffixed }).reasonCodes.includes("DOUBLE_ADAPTER_ROOT_REJECTED"),
      "already-suffixed synthetic home was accepted",
    );
  } else if (id === "AD27") {
    const fixture = hostFixture();
    const canonicalRoot = path.join(fixture.uadsHome, "agents");
    fs.mkdirSync(canonicalRoot, { recursive: true });
    const canonicalFile = path.join(canonicalRoot, "uads-repo-inspector.md");
    fs.writeFileSync(canonicalFile, "canonical original\n");
    process.env.UADS_ADAPTER_INSTALL_FAULT = "after-canonical-sync";
    let failed = false;
    try {
      installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    } catch {
      failed = true;
    }
    delete process.env.UADS_ADAPTER_INSTALL_FAULT;
    assertEval(failed, "injected host install failure did not surface");
    assertEval(fs.readFileSync(canonicalFile, "utf8") === "canonical original\n", "canonical UADS resources were not restored");
  } else if (id === "AD28") {
    const fixture = hostFixture();
    const installed = installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    const savedState = readHostAdapterState("codex", fixture.uadsHome, findPackageRoot());
    const legacy = resolveLegacyV010HostTarget(getHostAdapterDefinition("codex"), fixture.hostHome)!;
    fs.mkdirSync(legacy.resourceRoot, { recursive: true });
    for (const resource of installed.resources) {
      const current = path.join(fixture.hostHome, ".codex", resource.relativeTarget);
      const legacyPath = path.join(legacy.targetRoot, resource.relativeTarget);
      fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
      fs.copyFileSync(current, legacyPath);
    }
    fs.copyFileSync(path.join(fixture.hostHome, ".codex", installed.manifestRelativeTarget), legacy.manifestPath);
    uninstallHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome }, findPackageRoot());
    fs.mkdirSync(path.dirname(getHostAdapterStatePath("codex", fixture.uadsHome)), { recursive: true });
    fs.writeFileSync(getHostAdapterStatePath("codex", fixture.uadsHome), `${JSON.stringify(savedState, null, 2)}\n`);
    installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    assertEval(fs.existsSync(path.join(fixture.hostHome, ".codex", "agents", "uads-repo-inspector.md")), "legacy clean state did not migrate");
    assertEval(!fs.existsSync(path.join(legacy.resourceRoot, "uads-repo-inspector.md")), "legacy managed file was orphaned");
  } else if (id === "AD29") {
    const home = hostFixture().hostHome;
    const suffixed = path.join(home, ".codex");
    fs.mkdirSync(suffixed, { recursive: true });
    assertEval(
      detectHostAdapter("codex", { hostHome: suffixed }).reasonCodes.includes("DOUBLE_ADAPTER_ROOT_REJECTED"),
      "already-suffixed codex root double-appended",
    );
    const agentsRoot = path.join(home, ".agents");
    fs.mkdirSync(agentsRoot, { recursive: true });
    assertEval(
      detectHostAdapter("generic-agent-skills", { hostHome: agentsRoot }).reasonCodes.includes("DOUBLE_ADAPTER_ROOT_REJECTED"),
      "already-suffixed generic root double-appended",
    );
  } else if (id === "AD30") {
    const home = hostFixture().hostHome;
    const codexRoot = path.join(home, ".codex");
    fs.mkdirSync(codexRoot, { recursive: true });
    const previous = { ...process.env };
    process.env.UADS_CODEX_HOME = path.join(home, "synthetic");
    process.env.CODEX_HOME = codexRoot;
    const target = resolveHostTarget(getHostAdapterDefinition("codex"));
    process.env.UADS_CODEX_HOME = previous.UADS_CODEX_HOME;
    process.env.CODEX_HOME = previous.CODEX_HOME;
    assertEval(target.targetRoot === path.join(home, "synthetic", ".codex"), "UADS_CODEX_HOME did not win precedence");
    assertEval(environmentBindings("generic-agent-skills").length === 1, "unproven AGENT_SKILLS_HOME was consumed");
  } else if (id === "AD31") {
    const fixture = hostFixture();
    const suffixed = path.join(fixture.hostHome, ".cursor");
    fs.mkdirSync(suffixed, { recursive: true });
    let failed = false;
    try {
      installHostAdapter("cursor", { hostHome: suffixed, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    } catch {
      failed = true;
    }
    assertEval(failed, "invalid override install did not fail");
    assertEval(!fs.existsSync(path.join(suffixed, ".cursor", "agents")), "invalid override created nested cursor root");
    assertEval(readHostAdapterState("cursor", fixture.uadsHome, findPackageRoot()) === null, "invalid override wrote sidecar state");
  } else if (id === "AD32") {
    const fixture = hostFixture();
    installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    const input = { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() };
    const detectTarget = resolveHostTarget(getHostAdapterDefinition("codex"), input);
    const status = getHostAdapterStatusSummary("codex", input, findPackageRoot());
    assertEval(
      resolveHostRootInput(getHostAdapterDefinition("codex"), input).targetRoot === detectTarget.targetRoot,
      "status/detect resolver drift",
    );
    assertEval(status.support === detectHostAdapter("codex", input).status, "status/detection support drift");
    assertEval(detectTarget.rootIdentityDigest.length === 64, "root identity digest missing");
    assertEval(detectTarget.targetRootDigest.length === 64, "target root digest missing");
  } else if (id === "AD33") {
    const fixture = hostFixture();
    const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "uads-ad33-b-"));
    installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    const targetA = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: fixture.hostHome });
    const targetB = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: homeB });
    fs.mkdirSync(targetB.targetRoot, { recursive: true });
    fs.cpSync(targetA.targetRoot, targetB.targetRoot, { recursive: true });
    assertEval(targetA.targetRootDigest !== targetB.targetRootDigest, "cross-root digests collided");
    const ownership = inspectHostAdapterOwnership("codex", { hostHome: homeB, uadsHome: fixture.uadsHome }, findPackageRoot());
    assertEval(ownership.status === "CONFLICT", "cross-root replay accepted");
    assertEval(ownership.reasonCodes.includes("ROOT_BINDING_MISMATCH"), "cross-root mismatch reason missing");
  } else if (id === "AD34") {
    const fixture = hostFixture();
    const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "uads-ad34-b-"));
    installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    const targetA = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: fixture.hostHome });
    const targetB = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: homeB });
    fs.mkdirSync(targetB.targetRoot, { recursive: true });
    fs.cpSync(targetA.targetRoot, targetB.targetRoot, { recursive: true });
    let failed = false;
    try {
      uninstallHostAdapter("codex", { hostHome: homeB, uadsHome: fixture.uadsHome }, findPackageRoot());
    } catch {
      failed = true;
    }
    assertEval(failed, "cross-root uninstall did not fail closed");
    assertEval(fs.existsSync(path.join(targetB.resourceRoot, "uads-repo-inspector.md")), "foreign bytes were deleted");
    const state = readHostAdapterState("codex", fixture.uadsHome, findPackageRoot());
    assertEval(state?.rootBinding?.targetRootDigest === targetA.targetRootDigest, "state rebound to foreign root");
  } else if (id === "AD35") {
    const fixture = plannedFixture();
    const homeA = fixture.hostHome;
    const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "uads-ad35-b-"));
    const bundle = prepare(fixture);
    const ctx = resolveProjectContext(fixture.project, fixture.uadsHome);
    assertEval(
      hostDispatchBundleStatus(ctx.paths, fixture.planned.workOrder.projectId, findPackageRoot(), "generic-agent-skills", homeA) === "current",
      "bundle not current for bound root",
    );
    assertEval(
      hostDispatchBundleStatus(ctx.paths, fixture.planned.workOrder.projectId, findPackageRoot(), "generic-agent-skills", homeB) === "stale",
      "bundle stayed current after root switch",
    );
    assertEval(
      !isHostDispatchBundleCurrent(bundle, {
        hostTargetRootDigest: resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: homeB })
          .targetRootDigest,
      }),
      "bundle accepted foreign root digest",
    );
  } else if (id === "AD36") {
    const fixture = hostFixture();
    installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    const bound = readHostAdapterState("codex", fixture.uadsHome, findPackageRoot());
    const target = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: fixture.hostHome });
    const legacy = legacyUnboundState(bound!);
    fs.writeFileSync(
      getHostAdapterStatePath("codex", fixture.uadsHome),
      `${JSON.stringify(legacy, null, 2)}\n`,
    );
    let uninstallFailed = false;
    try {
      uninstallHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome }, findPackageRoot());
    } catch {
      uninstallFailed = true;
    }
    assertEval(uninstallFailed, "legacy unbound uninstall was destructive");
    const adopted = installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    assertEval(validateHostRootBinding(adopted, target).status === "BOUND_MATCH", "legacy adoption did not bind root");
    assertEval(inspectHostAdapterOwnership("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome }, findPackageRoot()).status === "CLEAN", "legacy adoption not clean");
  } else if (id === "AD37") {
    const base = hostFixture().hostHome;
    const rootA = path.join(base, "RootA", ".codex");
    const rootB = path.join(base, "roota", ".codex");
    assertEval(computeTargetRootDigest("codex", rootA) !== computeTargetRootDigest("codex", rootB), "case-distinct roots were case-folded");
  } else if (id === "AD38") {
    const fixture = plannedFixture();
    const state = readHostAdapterState("generic-agent-skills", fixture.uadsHome, findPackageRoot());
    const target = resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: fixture.hostHome });
    rewriteAsLegacyV1(state!, fixture.uadsHome, target.targetRoot);
    assertEval(readHostAdapterState("generic-agent-skills", fixture.uadsHome, findPackageRoot())?.rootBinding?.bindingVersion === "1", "legacy v1 state was not readable");
    const ownership = inspectHostAdapterOwnership("generic-agent-skills", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome }, findPackageRoot());
    assertEval(ownership.status === "STALE" && ownership.reasonCodes.includes("ROOT_BINDING_UPGRADE_REQUIRED"), "legacy v1 state was treated as current");
    let uninstallFailed = false;
    try {
      uninstallHostAdapter("generic-agent-skills", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome }, findPackageRoot());
    } catch {
      uninstallFailed = true;
    }
    assertEval(uninstallFailed, "legacy v1 uninstall was destructive");
    expectPreparationToFail(fixture, "legacy v1 state authorized trusted preparation");
  } else if (id === "AD39") {
    const fixture = hostFixture();
    const state = installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    const target = resolveHostTarget(getHostAdapterDefinition("codex"), { hostHome: fixture.hostHome });
    const managed = path.join(target.resourceRoot, "uads-repo-inspector.md");
    const userFile = path.join(target.targetRoot, "user-owned.txt");
    const beforeManaged = fs.readFileSync(managed);
    fs.writeFileSync(userFile, "user bytes must survive adoption\n");
    rewriteAsLegacyV1(state, fixture.uadsHome, target.targetRoot);
    const adopted = installHostAdapter("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome, packageRoot: findPackageRoot() }, findPackageRoot());
    assertEval(adopted.rootBinding?.bindingVersion === "2", "legacy v1 adoption did not write v2");
    assertEval(fs.readFileSync(managed).equals(beforeManaged), "legacy v1 adoption rewrote managed bytes");
    assertEval(fs.readFileSync(userFile, "utf8") === "user bytes must survive adoption\n", "legacy v1 adoption changed unrelated bytes");
    assertEval(inspectHostAdapterOwnership("codex", { hostHome: fixture.hostHome, uadsHome: fixture.uadsHome }, findPackageRoot()).status === "CLEAN", "legacy v1 adoption did not end BOUND_MATCH");
  } else if (id === "AD40") {
    const fixture = plannedFixture();
    const bundle = prepare(fixture);
    const caseVariantHome = path.join(path.dirname(fixture.hostHome), path.basename(fixture.hostHome).toUpperCase());
    const variantTarget = resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: caseVariantHome });
    assertEval(bundle.hostTargetRootDigest === resolveHostTarget(getHostAdapterDefinition("generic-agent-skills"), { hostHome: fixture.hostHome }).targetRootDigest, "bundle did not use the v2 root identity");
    assertEval(bundle.hostTargetRootDigest !== variantTarget.targetRootDigest, "case-collision root digest was accepted");
    assertEval(hostDispatchBundleStatus(fixture.context.paths, fixture.planned.workOrder.projectId, findPackageRoot(), "generic-agent-skills", caseVariantHome) === "stale", "bundle remained current for case-variant root");
    assertEval(!isHostDispatchBundleCurrent(bundle, { hostTargetRootDigest: variantTarget.targetRootDigest }), "case-variant bundle replay was accepted");
  } else {
    throw new Error(`unknown adapter evaluation case ${id}`);
  }
}

function expectPreparationToFail(fixture: ReturnType<typeof plannedFixture>, message: string): void {
  let failed = false;
  try {
    prepare(fixture);
  } catch {
    failed = true;
  }
  assertEval(failed, message);
}

export function runAdapterEvals(): number {
  const casesPath = path.join(findPackageRoot(), "evals", "adapters", "cases.json");
  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as EvalCase[];
  let failures = 0;
  for (const item of cases) {
    try {
      runCase(item.id);
      process.stdout.write(`${item.id} PASS ${item.name}\n`);
    } catch (error) {
      failures += 1;
      process.stdout.write(`${item.id} FAIL ${item.name}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  process.stdout.write(`adapter eval ${cases.length - failures}/${cases.length}\n`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && path.normalize(path.resolve(process.argv[1])) === path.normalize(fileURLToPath(import.meta.url))) {
  process.exitCode = runAdapterEvals();
}
