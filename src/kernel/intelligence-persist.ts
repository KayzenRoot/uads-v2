import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid, sidecarJsonPath } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { sanitizeOperationalValue } from "../lib/safe-persist.js";
import type { UadsPaths } from "../lib/workspace.js";
import type { ContextPack, ImpactReport, IndexBundle, RepoIdentity } from "./intelligence-types.js";
import { IndexIncompleteError, IntelligenceStateError, StaleIndexError } from "./intelligence-types.js";

export function intelligencePaths(paths: UadsPaths): {
  indexState: string;
  dependencyGraph: string;
  testMap: string;
  interfaceMap: string;
  impactReports: string;
  contextPacks: string;
  currentPack: string;
} {
  return {
    indexState: path.join(paths.index, "index-state.json"),
    dependencyGraph: path.join(paths.index, "dependency-graph.json"),
    testMap: path.join(paths.index, "test-map.json"),
    interfaceMap: path.join(paths.index, "interface-map.json"),
    impactReports: path.join(paths.context, "impact-reports"),
    contextPacks: path.join(paths.context, "packs"),
    currentPack: path.join(paths.context, "current-pack.json"),
  };
}

export function readIndexBundle(paths: UadsPaths, schemaRoot?: string): IndexBundle | null {
  const locs = intelligencePaths(paths);
  const stateParsed = readJsonIfValid<IndexBundle["state"]>(locs.indexState);
  const graphParsed = readJsonIfValid<IndexBundle["graph"]>(locs.dependencyGraph);
  const testsParsed = readJsonIfValid<IndexBundle["tests"]>(locs.testMap);
  const interfacesParsed = readJsonIfValid<IndexBundle["interfaces"]>(locs.interfaceMap);
  if (!stateParsed.ok || !graphParsed.ok || !testsParsed.ok || !interfacesParsed.ok) {
    return null;
  }
  try {
    assertSchema("index-state.schema.json", stateParsed.value, schemaRoot);
    assertSchema("dependency-graph.schema.json", graphParsed.value, schemaRoot);
    assertSchema("test-map.schema.json", testsParsed.value, schemaRoot);
    assertSchema("interface-map.schema.json", interfacesParsed.value, schemaRoot);
  } catch {
    return null;
  }
  if (
    stateParsed.value.projectId !== graphParsed.value.projectId ||
    stateParsed.value.indexDigest !== graphParsed.value.indexDigest ||
    stateParsed.value.indexDigest !== testsParsed.value.indexDigest ||
    stateParsed.value.indexDigest !== interfacesParsed.value.indexDigest
  ) {
    return null;
  }
  return {
    state: stateParsed.value,
    graph: graphParsed.value,
    tests: testsParsed.value,
    interfaces: interfacesParsed.value,
  };
}

export function persistIndexBundle(paths: UadsPaths, bundle: IndexBundle, schemaRoot?: string): IndexBundle {
  const sanitized = sanitizeOperationalValue(bundle);
  assertSchema("index-state.schema.json", sanitized.state, schemaRoot);
  assertSchema("dependency-graph.schema.json", sanitized.graph, schemaRoot);
  assertSchema("test-map.schema.json", sanitized.tests, schemaRoot);
  assertSchema("interface-map.schema.json", sanitized.interfaces, schemaRoot);
  const locs = intelligencePaths(paths);
  fs.mkdirSync(paths.index, { recursive: true });
  fs.mkdirSync(locs.impactReports, { recursive: true });
  fs.mkdirSync(locs.contextPacks, { recursive: true });
  atomicWriteJson(locs.indexState, sanitized.state);
  atomicWriteJson(locs.dependencyGraph, sanitized.graph);
  atomicWriteJson(locs.testMap, sanitized.tests);
  atomicWriteJson(locs.interfaceMap, sanitized.interfaces);
  return sanitized;
}

export function assertIndexMatchesProject(bundle: IndexBundle, projectId: string): void {
  if (bundle.state.projectId !== projectId || bundle.graph.projectId !== projectId) {
    throw new IntelligenceStateError("cross-project index artifact rejected");
  }
}

export function assertIndexCurrent(bundle: IndexBundle, identity: RepoIdentity): void {
  if (bundle.state.complete === false || bundle.state.truncated) {
    throw new IndexIncompleteError(bundle.state.staleReason ?? bundle.state.truncationReason ?? "index is incomplete");
  }
  if (bundle.state.stale) {
    throw new StaleIndexError(bundle.state.staleReason ?? "index is marked stale");
  }
  if (!identity.gitAvailable || !bundle.state.gitAvailable) {
    throw new StaleIndexError("no-git index requires revalidation against current file contents");
  }
  if (bundle.state.gitHead !== identity.gitHead || bundle.state.dirtyDigest !== identity.dirtyDigest) {
    throw new StaleIndexError("index identity does not match current repository state");
  }
}

export function persistImpactReport(paths: UadsPaths, report: ImpactReport, schemaRoot?: string): ImpactReport {
  const sanitized = sanitizeOperationalValue(report);
  assertSchema("impact-report.schema.json", sanitized, schemaRoot);
  atomicWriteJson(sidecarJsonPath(intelligencePaths(paths).impactReports, sanitized.impactReportId), sanitized);
  return sanitized;
}

export function persistContextPack(paths: UadsPaths, pack: ContextPack, schemaRoot?: string): ContextPack {
  const sanitized = sanitizeOperationalValue(pack);
  assertSchema("context-pack.schema.json", sanitized, schemaRoot);
  const locs = intelligencePaths(paths);
  atomicWriteJson(sidecarJsonPath(locs.contextPacks, sanitized.contextPackId), sanitized);
  atomicWriteJson(locs.currentPack, {
    contextPackId: sanitized.contextPackId,
    impactReportId: sanitized.impactReportId,
    workOrderId: sanitized.workOrderId,
    indexDigest: sanitized.indexDigest,
    projectId: sanitized.projectId,
  });
  return sanitized;
}

export function readCurrentContextPack(paths: UadsPaths, schemaRoot?: string): ContextPack | null {
  const parsed = readJsonIfValid<{ contextPackId?: string }>(intelligencePaths(paths).currentPack);
  if (!parsed.ok || !parsed.value.contextPackId) {
    return null;
  }
  return readContextPack(paths, parsed.value.contextPackId, schemaRoot);
}

export function readContextPack(paths: UadsPaths, contextPackId: string, schemaRoot?: string): ContextPack | null {
  const parsed = readJsonIfValid<ContextPack>(sidecarJsonPath(intelligencePaths(paths).contextPacks, contextPackId));
  if (!parsed.ok) return null;
  try {
    assertSchema("context-pack.schema.json", parsed.value, schemaRoot);
    return parsed.value;
  } catch {
    return null;
  }
}

export function readImpactReport(paths: UadsPaths, impactReportId: string, schemaRoot?: string): ImpactReport | null {
  const parsed = readJsonIfValid<ImpactReport>(sidecarJsonPath(intelligencePaths(paths).impactReports, impactReportId));
  if (!parsed.ok) return null;
  try {
    assertSchema("impact-report.schema.json", parsed.value, schemaRoot);
    return parsed.value;
  } catch {
    return null;
  }
}
