import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getUadsPaths } from "../src/lib/workspace.js";
import { collectDiffFacts } from "../src/gef/git-facts.js";
import {
  assessImpactGraph,
  buildImpactGraph,
  classifyPath,
  isGraphCoveredPath,
  readImpactGraph,
  writeImpactGraph,
  type ImpactGraph,
} from "../src/gef/impact-graph.js";
import { computeTestImpact, validateImpactResult, type ImpactResult } from "../src/gef/test-impact.js";
import { computeImpactForRepo } from "../src/commands/gef-assurance.js";

const FINGERPRINT = "a".repeat(64);

type Fixture = { repo: string; home: string; projectId: string; paths: ReturnType<typeof getUadsPaths> };

function commit(repo: string, message: string): void {
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["-c", "user.name=GEF Test", "-c", "user.email=gef@example.invalid", "commit", "-m", message], { cwd: repo });
}

function write(repo: string, relative: string, contents: string): void {
  const target = path.join(repo, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function tempRepo(): Fixture {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w3-impact-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/gef-w3-impact.git"], { cwd: repo });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w3-impact-home-"));
  const projectId = "w3-impact-project";
  return { repo, home, projectId, paths: getUadsPaths(projectId, home) };
}

// Fixture layout mirrors the registered contract targets: a change to the
// shared module must reach every dependent test, and a change to the direct
// implementation must reach only its own test.
function impactFixture(): Fixture {
  const fixture = tempRepo();
  const { repo } = fixture;
  write(repo, "package.json", `{\n  "name": "w3-fixture",\n  "version": "1.0.0",\n  "type": "module"\n}\n`);
  write(repo, "package-lock.json", `{\n  "name": "w3-fixture",\n  "lockfileVersion": 3\n}\n`);
  write(repo, "tsconfig.json", `{\n  "compilerOptions": {\n    "module": "esnext"\n  }\n}\n`);
  write(repo, "vitest.config.ts", `export default {};\n`);
  write(repo, "schemas/gef-shared.schema.json", `{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "title": "fixture",\n  "type": "object"\n}\n`);
  write(repo, "src/gef/shared.ts", `export const shared = 1;\n`);
  write(repo, "src/gef/impact-graph.ts", `export const graphValue = 1;\n`);
  write(repo, "src/gef/other.ts", `export const otherValue = 1;\n`);
  write(repo, "src/gef/validated.ts", `import { shared } from "./shared.js";\nexport const SCHEMA_FILE = "gef-shared.schema.json";\nexport const use = shared;\n`);
  write(repo, "tests/gef-w3-impact.test.ts", `import { graphValue } from "../src/gef/impact-graph.js";\nimport { shared } from "../src/gef/shared.js";\nexport const t = graphValue + shared;\n`);
  write(repo, "tests/gef-w3-proof.test.ts", `import { otherValue } from "../src/gef/other.js";\nimport { shared } from "../src/gef/shared.js";\nexport const t = otherValue + shared;\n`);
  write(repo, "tests/gef-w3-assurance.test.ts", `import { SCHEMA_FILE } from "../src/gef/validated.js";\nexport const t = SCHEMA_FILE;\n`);
  write(repo, "tests/gef-w3-surface.test.ts", `export const t = 1;\n`);
  commit(repo, "fixture");
  return fixture;
}

function snapshot(fixture: Fixture): ImpactGraph {
  const graph = buildImpactGraph(fixture.repo, FINGERPRINT);
  writeImpactGraph(fixture.paths, fixture.projectId, graph, graph.nodes.length);
  return graph;
}

function assess(fixture: Fixture): ImpactResult {
  const facts = collectDiffFacts(fixture.repo, FINGERPRINT);
  const stored = readImpactGraph(fixture.paths, fixture.projectId, FINGERPRINT);
  const assessment = assessImpactGraph({ repoRoot: fixture.repo, graph: stored.graph, storeStatus: stored.status, changed: facts.changedFiles });
  return computeTestImpact({
    taskId: "w3-impact",
    projectFingerprint: FINGERPRINT,
    facts,
    graph: stored.graph,
    graphState: assessment.state,
    graphReasons: assessment.reasons,
  });
}

function selectedIds(result: ImpactResult): string[] {
  return result.selected.map((entry) => entry.commandId).sort();
}

function reasonFor(result: ImpactResult, commandId: string): string | undefined {
  return result.selected.find((entry) => entry.commandId === commandId)?.reason;
}

describe("GEF W3 impact graph and test impact", () => {
  it("builds a deterministic graph with bounded kinds and relation truth", () => {
    const fixture = impactFixture();
    const first = buildImpactGraph(fixture.repo, FINGERPRINT);
    const second = buildImpactGraph(fixture.repo, FINGERPRINT);
    expect(first.graphDigest).toBe(second.graphDigest);
    expect(first.nodes.map((node) => node.id)).toEqual(second.nodes.map((node) => node.id));
    expect(first.nodes.map((node) => node.id)).toEqual([...first.nodes.map((node) => node.id)].sort());

    const kinds = new Set(first.nodes.map((node) => node.kind));
    for (const kind of ["SOURCE_FILE", "CONFIG", "LOCKFILE", "SCHEMA", "TEST", "COMMAND_CONTRACT", "PROOF", "SYMBOL_OR_MODULE"]) {
      expect(kinds.has(kind as never)).toBe(true);
    }
    const relations = new Set(first.edges.map((edge) => edge.relation));
    for (const relation of ["IMPORTS", "VALIDATED_BY", "CONFIGURES", "GENERATED_FROM", "REQUIRES", "INVALIDATES_WITH"]) {
      expect(relations.has(relation as never)).toBe(true);
    }
    // Every edge endpoint exists: a dangling edge would be meaningless reach.
    const ids = new Set(first.nodes.map((node) => node.id));
    for (const edge of first.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
    // Path identity stays repo-relative POSIX: no host paths, no separators.
    for (const node of first.nodes) {
      if (node.path === null) continue;
      expect(node.path.includes("\\")).toBe(false);
      expect(node.path.startsWith("/")).toBe(false);
      expect(node.path.includes(":")).toBe(false);
    }
  });

  it("classifies covered paths and ignores unmodelled ones", () => {
    expect(classifyPath("src/gef/upir.ts")).toBe("SOURCE_FILE");
    expect(classifyPath("tests/gef-w3-impact.test.ts")).toBe("TEST");
    expect(classifyPath("schemas/gef-proof-record.schema.json")).toBe("SCHEMA");
    expect(classifyPath("package.json")).toBe("CONFIG");
    expect(classifyPath("package-lock.json")).toBe("LOCKFILE");
    expect(classifyPath("docs/v2/03-SCOPE.md")).toBeNull();
    expect(isGraphCoveredPath("docs/v2/03-SCOPE.md")).toBe(false);
  });

  it("selects the direct test for a direct source change and no unrelated test", () => {
    const fixture = impactFixture();
    snapshot(fixture);
    write(fixture.repo, "src/gef/impact-graph.ts", `export const graphValue = 2;\n`);
    const result = assess(fixture);
    expect(result.graphState).toBe("CURRENT");
    expect(selectedIds(result)).toContain("gef.work.test.w3.impact");
    expect(selectedIds(result)).not.toContain("gef.work.test.w3.proof");
    expect(selectedIds(result)).not.toContain("gef.work.test.w3.assurance");
    expect(reasonFor(result, "gef.work.test.w3.impact")).toBe("DIRECT_SOURCE_CHANGE");
    expect(result.skipped.map((entry) => entry.proofKey)).toContain("gef.work.test.w3.proof");
    expect(validateImpactResult(result)).toEqual([]);
  });

  it("fans a shared interface change out to every dependent test", () => {
    const fixture = impactFixture();
    snapshot(fixture);
    write(fixture.repo, "src/gef/shared.ts", `export const shared = 2;\n`);
    const result = assess(fixture);
    expect(selectedIds(result)).toContain("gef.work.test.w3.impact");
    expect(selectedIds(result)).toContain("gef.work.test.w3.proof");
    expect(reasonFor(result, "gef.work.test.w3.impact")).toBe("INTERFACE_DEPENDENCY");
    expect(result.minimumAssurance).toBe("A2");
  });

  it("fans a schema change out to the tests that depend on its consumer", () => {
    const fixture = impactFixture();
    snapshot(fixture);
    write(fixture.repo, "schemas/gef-shared.schema.json", `{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "title": "fixture changed",\n  "type": "object"\n}\n`);
    const result = assess(fixture);
    expect(selectedIds(result)).toContain("gef.work.test.w3.assurance");
    expect(reasonFor(result, "gef.work.test.w3.assurance")).toBe("SCHEMA_DEPENDENCY");
    expect(result.minimumAssurance).toBe("A2");
  });

  it("broadens conservatively when global config or lock state changes", () => {
    const fixture = impactFixture();
    snapshot(fixture);
    write(fixture.repo, "package-lock.json", `{\n  "name": "w3-fixture",\n  "lockfileVersion": 3,\n  "packages": {}\n}\n`);
    const result = assess(fixture);
    expect(selectedIds(result)).toEqual(
      ["gef.work.build", "gef.work.git.facts", "gef.work.test.w2", "gef.work.test.w3.assurance", "gef.work.test.w3.impact", "gef.work.test.w3.proof", "gef.work.test.w3.surface", "gef.work.typecheck"].sort(),
    );
    expect(reasonFor(result, "gef.work.typecheck")).toBe("LOCKFILE_CHANGE");
    expect(result.minimumAssurance).toBe("A2");
  });

  it("keeps previous-path dependents when a file is renamed", () => {
    const fixture = impactFixture();
    snapshot(fixture);
    execFileSync("git", ["mv", "src/gef/other.ts", "src/gef/moved.ts"], { cwd: fixture.repo });
    const result = assess(fixture);
    expect(selectedIds(result)).toContain("gef.work.test.w3.proof");
    expect(reasonFor(result, "gef.work.test.w3.proof")).toBe("PREVIOUS_PATH_DEPENDENCY");
    expect(result.limitations).toContain("RENAME_RESOLVED_VIA_PREVIOUS_IDENTITY");
    expect(result.uncertainty).not.toContain("GRAPH_NODE_MISSING");
  });

  it("expands assurance when the graph lost track of a changed file", () => {
    const fixture = impactFixture();
    snapshot(fixture);
    write(fixture.repo, "src/gef/brand-new.ts", `export const brandNew = 1;\n`);
    const result = assess(fixture);
    expect(result.graphState).toBe("INCOMPLETE");
    expect(result.expansionState).toBe("IMPACT_EXPANSION_REQUIRED");
    expect(selectedIds(result)).toContain("gef.work.test.w3.proof");
    expect(result.minimumAssurance).toBe("A2");
    expect(result.uncertainty).toContain("GRAPH_STATE_INCOMPLETE");
  });

  it("treats a changed import surface as a stale snapshot and expands", () => {
    const fixture = impactFixture();
    snapshot(fixture);
    write(fixture.repo, "src/gef/impact-graph.ts", `import { otherValue } from "./other.js";\nexport const graphValue = otherValue;\n`);
    const result = assess(fixture);
    expect(result.graphState).toBe("STALE");
    expect(result.expansionState).toBe("IMPACT_EXPANSION_REQUIRED");
    expect(result.uncertainty).toContain("GRAPH_STATE_STALE");
    expect(selectedIds(result)).toHaveLength(8);
  });

  it("expands rather than under-selecting when no snapshot exists", () => {
    const fixture = impactFixture();
    const result = assess(fixture);
    expect(result.graphState).toBe("MISSING");
    expect(result.expansionState).toBe("IMPACT_EXPANSION_REQUIRED");
    expect(selectedIds(result)).toHaveLength(8);
  });

  it("refreshes the snapshot and assesses later changes against it", () => {
    const fixture = impactFixture();
    const first = computeImpactForRepo({
      repoRoot: fixture.repo,
      projectFingerprint: FINGERPRINT,
      taskId: "w3-impact",
      facts: collectDiffFacts(fixture.repo, FINGERPRINT),
      paths: fixture.paths,
      projectId: fixture.projectId,
    });
    // Cold start: nothing to assess against, so assurance expands and the
    // snapshot is created for the next change.
    expect(first.impact.graphState).toBe("MISSING");
    const stored = readImpactGraph(fixture.paths, fixture.projectId, FINGERPRINT);
    expect(stored.status).toBe("VALID");
    expect(stored.graph?.graphDigest).toBe(first.graph.graphDigest);

    write(fixture.repo, "src/gef/impact-graph.ts", `export const graphValue = 3;\n`);
    const second = computeImpactForRepo({
      repoRoot: fixture.repo,
      projectFingerprint: FINGERPRINT,
      taskId: "w3-impact",
      facts: collectDiffFacts(fixture.repo, FINGERPRINT),
      paths: fixture.paths,
      projectId: fixture.projectId,
    });
    // The impact is assessed against the snapshot that existed when it ran, and
    // the refreshed snapshot is what the next change will be measured against.
    expect(second.impact.graphState).toBe("CURRENT");
    expect(second.impact.graphDigest).toBe(first.graph.graphDigest);
    expect(selectedIds(second.impact)).toContain("gef.work.test.w3.impact");
    expect(second.graph.graphDigest).not.toBe(first.graph.graphDigest);
    expect(readImpactGraph(fixture.paths, fixture.projectId, FINGERPRINT).graph?.graphDigest).toBe(second.graph.graphDigest);
  });

  it("records explicit uncertainty for unresolvable relations", () => {
    const fixture = impactFixture();
    write(fixture.repo, "src/gef/broken.ts", `import { missing } from "./does-not-exist.js";\nexport const b = missing;\n`);
    const graph = buildImpactGraph(fixture.repo, FINGERPRINT);
    expect(graph.uncertainty.some((entry) => entry.startsWith("UNRESOLVED_RELATIVE_IMPORT"))).toBe(true);
  });

  it("keeps the repository untouched while building and assessing", () => {
    const fixture = impactFixture();
    const before = execFileSync("git", ["status", "--porcelain"], { cwd: fixture.repo, encoding: "utf8" });
    snapshot(fixture);
    const result = assess(fixture);
    const after = execFileSync("git", ["status", "--porcelain"], { cwd: fixture.repo, encoding: "utf8" });
    expect(after).toBe(before);
    expect(result.candidateDigest).not.toBeNull();
    const stray = fs.readdirSync(fixture.repo).filter((name) => name.startsWith(".uads") || name.startsWith("gef"));
    expect(stray).toEqual([]);
  });
});
