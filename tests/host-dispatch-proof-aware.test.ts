import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installHostAdapter } from "../src/adapters/host-adapter-install.js";
import {
  prepareHostDispatchBundle,
  readCurrentHostDispatchArtifacts,
} from "../src/adapters/host-dispatch.js";
import { runPlan } from "../src/kernel/orchestrator.js";
import { resolveProjectContext } from "../src/kernel/project-context.js";
import { seedFrontend } from "./execution-helpers.js";
import { tempDirs } from "./helpers.js";

const ROOT = process.cwd();

function hostHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "uads-wo011-host-"));
}

function fixture(adapterId: "cursor" | "generic-agent-skills") {
  const base = tempDirs();
  seedFrontend(base.repo);
  runPlan({
    cwd: base.repo,
    uadsHome: base.home,
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
  installHostAdapter(adapterId, {
    hostHome: target,
    uadsHome: base.home,
    packageRoot: ROOT,
  }, ROOT);
  return {
    ...base,
    target,
    context: resolveProjectContext(base.repo, base.home),
  };
}

describe("UADS2-WO-011 proof-aware host dispatch", { timeout: 120_000 }, () => {
  it("does not promote Cursor declaration TRUE into dispatch truth", () => {
    const test = fixture("cursor");
    const proofsRoot = path.join(test.context.paths.runtimeCapabilities, "proofs");
    expect(fs.existsSync(proofsRoot)).toBe(false);

    const artifacts = readCurrentHostDispatchArtifacts({
      adapterId: "cursor",
      cwd: test.repo,
      uadsHome: test.home,
      hostHome: test.target,
      schemaRoot: ROOT,
    });

    expect(artifacts.hostRuntime.capabilities.parallelAgents).toBe("unknown");
    expect(artifacts.hostRuntime.capabilities.subagents).toBe("unknown");
    expect(fs.existsSync(proofsRoot)).toBe(false);

    const bundle = prepareHostDispatchBundle({
      adapterId: "cursor",
      cwd: test.repo,
      uadsHome: test.home,
      hostHome: test.target,
      schemaRoot: ROOT,
    });
    expect(bundle.execution.parallel).toBe(false);
    expect(bundle.execution.roleDispatch).toBe("role-cycling");
    expect(bundle.execution.reasonCodes).toContain("SEQUENTIAL_FALLBACK");
    expect(bundle.execution.reasonCodes).toContain("ROLE_CYCLING_FALLBACK");
    expect(fs.existsSync(proofsRoot)).toBe(false);
  });

  it("preserves current passive negative proof for generic fixed-false capabilities", () => {
    const test = fixture("generic-agent-skills");
    const artifacts = readCurrentHostDispatchArtifacts({
      adapterId: "generic-agent-skills",
      cwd: test.repo,
      uadsHome: test.home,
      hostHome: test.target,
      schemaRoot: ROOT,
    });

    expect(artifacts.hostRuntime.capabilities.parallelAgents).toBe(false);
    expect(artifacts.hostRuntime.capabilities.subagents).toBe(false);
    expect(fs.existsSync(path.join(test.context.paths.runtimeCapabilities, "proofs"))).toBe(false);
  });
});
