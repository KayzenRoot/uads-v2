import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";
import type { UadsPaths } from "../lib/workspace.js";
import { canonicalDigest, normalizeRepoRelativePath } from "./upir.js";
import { listCommandContracts, proofTypeForContract } from "./command-contract.js";
import { gefProjectDirectory } from "./storage.js";
import type { ChangedFileFact } from "./git-facts.js";

export const IMPACT_GRAPH_SCHEMA_VERSION = "0.1.0" as const;
export const IMPACT_GRAPH_SCHEMA_FILE = "gef-impact-graph.schema.json" as const;
export const IMPACT_GRAPH_VERSION = "1.0.0" as const;
export const IMPACT_GRAPH_PRODUCER = "gef-impact-graph/1.0.0+regex-ts/1.0.0" as const;
export const IMPACT_GRAPH_MAX_FILES = 4000 as const;
export const IMPACT_GRAPH_MAX_ENTITIES = 20000 as const;
export const IMPACT_GRAPH_MAX_SYMBOLS_PER_FILE = 8 as const;
export const IMPACT_GRAPH_MAX_IMPORTS_PER_FILE = 64 as const;
const IMPACT_GRAPH_READ_CHARS = 200000;

export type ImpactNodeKind =
  | "SOURCE_FILE"
  | "SYMBOL_OR_MODULE"
  | "CONFIG"
  | "LOCKFILE"
  | "SCHEMA"
  | "TEST"
  | "EVAL"
  | "COMMAND_CONTRACT"
  | "PROOF";

export type ImpactEdgeKind = "IMPORTS" | "IMPLEMENTS" | "VALIDATED_BY" | "CONFIGURES" | "GENERATED_FROM" | "REQUIRES" | "INVALIDATES_WITH";

export type ImpactNode = {
  id: string;
  kind: ImpactNodeKind;
  label: string;
  path: string | null;
  digest: string | null;
};

export type ImpactEdge = { from: string; to: string; relation: ImpactEdgeKind };

export type ImpactGraph = {
  schemaVersion: typeof IMPACT_GRAPH_SCHEMA_VERSION;
  projectFingerprint: string;
  graphVersion: typeof IMPACT_GRAPH_VERSION;
  producerVersion: string;
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  limits: { maxFiles: number; maxEntities: number };
  truncated: boolean;
  uncertainty: string[];
  graphDigest: string;
};

export type ImpactGraphMeta = {
  schemaVersion: string;
  projectFingerprint: string;
  graphVersion: string;
  producerVersion: string;
  graphDigest: string;
  builtAtMs: number;
  fileCount: number;
  truncated: boolean;
};

export type ImpactGraphLimits = { maxFiles?: number; maxEntities?: number };

const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "coverage", ".cache"]);
const CONFIG_PATHS = ["package.json", "tsconfig.json", "vitest.config.ts"];
const LOCKFILE_PATHS = ["package-lock.json", "npm-shrinkwrap.json"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
const IMPORT_SPECIFIER = /from\s+["']([^"']+)["']/g;
const SCHEMA_REFERENCE = /["']([a-z0-9][a-z0-9-]*\.schema\.json)["']/g;
const EXPORTED_SYMBOL = /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(interface|type|class|enum|function|const)\s+([A-Za-z0-9_$]+)/;

export function impactGraphDirectory(paths: UadsPaths, projectId: string): string {
  return path.join(gefProjectDirectory(paths, projectId), "impact");
}

export function impactGraphPath(paths: UadsPaths, projectId: string): string {
  return path.join(impactGraphDirectory(paths, projectId), "graph.json");
}

export function impactGraphMetaPath(paths: UadsPaths, projectId: string): string {
  return path.join(impactGraphDirectory(paths, projectId), "graph.meta.json");
}

export function fileNodeId(kind: ImpactNodeKind, relative: string): string {
  return `${kind}:${normalizeRepoRelativePath(relative)}`;
}

export function symbolNodeId(relative: string, symbol: string): string {
  return `SYMBOL_OR_MODULE:${normalizeRepoRelativePath(relative)}#${symbol}`;
}

export function contractNodeId(contractId: string): string {
  return `COMMAND_CONTRACT:${contractId}`;
}

export function proofNodeId(contractId: string): string {
  return `PROOF:${contractId}`;
}

export function classifyPath(relative: string): ImpactNodeKind | null {
  const normalized = normalizeRepoRelativePath(relative);
  if (/^tests\/.+\.(test|spec)\.(ts|tsx)$/.test(normalized)) return "TEST";
  if (/^(src\/eval|evals)\//.test(normalized)) return "EVAL";
  if (LOCKFILE_PATHS.includes(normalized)) return "LOCKFILE";
  if (CONFIG_PATHS.includes(normalized)) return "CONFIG";
  if (/^schemas\/[a-z0-9][a-z0-9-]*\.schema\.json$/.test(normalized)) return "SCHEMA";
  if (SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) return "SOURCE_FILE";
  return null;
}

// Only paths the graph is expected to model: an unmapped source/config/test
// path is incomplete knowledge and must expand assurance rather than pass.
export function isGraphCoveredPath(relative: string): boolean {
  return classifyPath(relative) !== null;
}

type ScannedFile = { relative: string; absolute: string; kind: ImpactNodeKind; digest: string; content: string };

function scanRepository(repoRoot: string, maxFiles: number): { files: ScannedFile[]; truncated: boolean } {
  const files: ScannedFile[] = [];
  let truncated = false;
  const visit = (directory: string): void => {
    if (truncated) return;
    let names: string[];
    try {
      names = fs.readdirSync(directory).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (truncated) return;
      if (SKIP_DIRECTORIES.has(name)) continue;
      const absolute = path.join(directory, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolute);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!stat.isFile()) continue;
      const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
      let normalized: string;
      try {
        normalized = normalizeRepoRelativePath(relative);
      } catch {
        continue;
      }
      const kind = classifyPath(normalized);
      if (kind === null) continue;
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      let raw: Buffer;
      try {
        raw = fs.readFileSync(absolute);
      } catch {
        continue;
      }
      const text = raw.length > IMPACT_GRAPH_READ_CHARS ? raw.subarray(0, IMPACT_GRAPH_READ_CHARS).toString("utf8") : raw.toString("utf8");
      files.push({ relative: normalized, absolute, kind, digest: sha256Hex(raw), content: text });
    }
  };
  visit(repoRoot);
  return { files, truncated };
}

function resolveImport(fromRelative: string, specifier: string, nodeByPath: Map<string, ImpactNode>): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const fromDirectory = path.posix.dirname(fromRelative);
  const base = path.posix.normalize(path.posix.join(fromDirectory, specifier));
  // TypeScript ESM writes `./x.js` for `x.ts`, so the emitted-extension form is
  // resolved back to the source file before the plain candidates are tried.
  const emitted = /\.(js|mjs|cjs|jsx)$/.exec(base);
  const sourceForms = emitted ? [`${base.slice(0, -emitted[0].length)}.ts`, `${base.slice(0, -emitted[0].length)}.tsx`] : [];
  const candidates = [
    base,
    ...sourceForms,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
  for (const candidate of candidates) {
    let normalized: string;
    try {
      normalized = normalizeRepoRelativePath(candidate);
    } catch {
      continue;
    }
    if (nodeByPath.has(normalized)) return normalized;
  }
  return null;
}

function symbolsFor(content: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const line of content.split("\n")) {
    if (found.length >= IMPACT_GRAPH_MAX_SYMBOLS_PER_FILE) break;
    const match = EXPORTED_SYMBOL.exec(line);
    const name = match?.[2];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }
  return found;
}

export function buildImpactGraph(repoRoot: string, projectFingerprint: string, limits?: ImpactGraphLimits): ImpactGraph {
  const maxFiles = limits?.maxFiles ?? IMPACT_GRAPH_MAX_FILES;
  const maxEntities = limits?.maxEntities ?? IMPACT_GRAPH_MAX_ENTITIES;
  const scan = scanRepository(repoRoot, maxFiles);
  const uncertainty = new Set<string>();
  if (scan.truncated) uncertainty.add("GRAPH_FILE_LIMIT_REACHED");

  const nodes = new Map<string, ImpactNode>();
  const edges: ImpactEdge[] = [];
  const nodeByPath = new Map<string, ImpactNode>();
  for (const file of scan.files) {
    const node: ImpactNode = { id: fileNodeId(file.kind, file.relative), kind: file.kind, label: file.relative, path: file.relative, digest: file.digest };
    nodes.set(node.id, node);
    nodeByPath.set(file.relative, node);
  }

  const importTargets = new Map<string, number>();
  for (const file of scan.files) {
    const from = fileNodeId(file.kind, file.relative);
    const specifiers = [...file.content.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? "");
    for (const specifier of specifiers.slice(0, IMPACT_GRAPH_MAX_IMPORTS_PER_FILE)) {
      const target = resolveImport(file.relative, specifier, nodeByPath);
      if (target === null) {
        if (specifier.startsWith("./") || specifier.startsWith("../")) uncertainty.add(`UNRESOLVED_RELATIVE_IMPORT:${specifier.slice(0, 80)}`);
        continue;
      }
      if (target === file.relative) continue;
      edges.push({ from, to: fileNodeId(nodeByPath.get(target)?.kind ?? "SOURCE_FILE", target), relation: "IMPORTS" });
      importTargets.set(target, (importTargets.get(target) ?? 0) + 1);
    }
  }

  // Shared-interface identity: only symbols that actually cross a module
  // boundary are recorded, so the node set stays a real interface surface.
  for (const file of scan.files) {
    if ((importTargets.get(file.relative) ?? 0) === 0) continue;
    if (file.kind !== "SOURCE_FILE" && file.kind !== "EVAL") continue;
    for (const symbol of symbolsFor(file.content)) {
      // A symbol is not a file: only file kinds carry a path, so path lookups
      // stay unambiguous. The declaring file is in the label.
      const node: ImpactNode = { id: symbolNodeId(file.relative, symbol), kind: "SYMBOL_OR_MODULE", label: `${file.relative}#${symbol}`, path: null, digest: null };
      nodes.set(node.id, node);
      edges.push({ from: fileNodeId(file.kind, file.relative), to: node.id, relation: "IMPLEMENTS" });
    }
  }

  const schemaNodes = new Map<string, string>();
  for (const file of scan.files) {
    if (file.kind !== "SOURCE_FILE" && file.kind !== "EVAL") continue;
    const references = new Set([...file.content.matchAll(SCHEMA_REFERENCE)].map((match) => match[1] ?? ""));
    for (const reference of references) {
      const relative = `schemas/${reference}`;
      const known = nodes.get(fileNodeId("SCHEMA", relative));
      if (!known) {
        uncertainty.add(`SCHEMA_REFERENCE_UNMODELLED:${reference.slice(0, 80)}`);
        continue;
      }
      schemaNodes.set(relative, known.id);
      edges.push({ from: fileNodeId(file.kind, file.relative), to: known.id, relation: "VALIDATED_BY" });
    }
  }

  const contracts = listCommandContracts(false);
  const configNodes = new Map<string, string>();
  for (const relative of [...CONFIG_PATHS, ...LOCKFILE_PATHS]) {
    const node = nodeByPath.get(relative);
    if (node) configNodes.set(relative, node.id);
  }

  for (const contract of contracts) {
    const contractNode: ImpactNode = { id: contractNodeId(contract.id), kind: "COMMAND_CONTRACT", label: contract.id, path: null, digest: contract.contractDigest };
    const proofNode: ImpactNode = { id: proofNodeId(contract.id), kind: "PROOF", label: contract.id, path: null, digest: null };
    nodes.set(contractNode.id, contractNode);
    nodes.set(proofNode.id, proofNode);
    edges.push({ from: proofNode.id, to: contractNode.id, relation: "GENERATED_FROM" });
    for (const relevant of contract.relevantFiles) {
      const target = configNodes.get(relevant);
      if (!target) continue;
      edges.push({ from: contractNode.id, to: target, relation: "REQUIRES" });
    }
  }

  // Config/lock truth: build and typecheck are governed by the package/tsconfig
  // basis, test contracts by the package/vitest basis. Both are conservative by
  // construction: a config change reaches every contract it governs.
  for (const [relative, nodeId] of configNodes) {
    const lockOrPackage = relative === "package.json" || LOCKFILE_PATHS.includes(relative);
    for (const contract of contracts) {
      const proofType = proofTypeForContract(contract.id);
      const governed = lockOrPackage
        ? proofType === "TYPECHECK" || proofType === "BUILD" || proofType === "TEST" || proofType === "SCHEMA" || proofType === "STATIC"
        : proofType === "TYPECHECK" || proofType === "BUILD";
      if (!governed) continue;
      edges.push({ from: nodeId, to: contractNodeId(contract.id), relation: "CONFIGURES" });
      edges.push({ from: nodeId, to: proofNodeId(contract.id), relation: "INVALIDATES_WITH" });
    }
  }

  const sortedNodes = [...nodes.values()].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const sortedEdges = edges
    .filter((edge) => nodes.has(edge.from) && nodes.has(edge.to))
    .sort((left, right) =>
      left.from < right.from ? -1 : left.from > right.from ? 1 : left.to < right.to ? -1 : left.to > right.to ? 1 : left.relation < right.relation ? -1 : 1,
    );
  if (sortedNodes.length > maxEntities || sortedEdges.length > maxEntities) uncertainty.add("GRAPH_ENTITY_LIMIT_REACHED");

  const withoutDigest = {
    schemaVersion: IMPACT_GRAPH_SCHEMA_VERSION,
    projectFingerprint,
    graphVersion: IMPACT_GRAPH_VERSION,
    producerVersion: IMPACT_GRAPH_PRODUCER,
    nodes: sortedNodes.slice(0, maxEntities),
    edges: sortedEdges.slice(0, maxEntities),
    limits: { maxFiles, maxEntities },
    truncated: scan.truncated || sortedNodes.length > maxEntities || sortedEdges.length > maxEntities,
    uncertainty: [...uncertainty].sort(),
  };
  const graph: ImpactGraph = { ...withoutDigest, graphDigest: canonicalDigest(withoutDigest) };
  assertSchema(IMPACT_GRAPH_SCHEMA_FILE, graph, findPackageRoot());
  return graph;
}

export function validateImpactGraph(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(IMPACT_GRAPH_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}

export function verifyImpactGraph(data: unknown, expectedProjectFingerprint?: string): { ok: true; graph: ImpactGraph } | { ok: false; reason: string } {
  const errors = validateImpactGraph(data);
  if (errors.length > 0) return { ok: false, reason: `GRAPH_SCHEMA_INVALID:${errors[0] ?? "unknown"}` };
  const graph = data as ImpactGraph;
  if (expectedProjectFingerprint !== undefined && graph.projectFingerprint !== expectedProjectFingerprint) {
    return { ok: false, reason: "GRAPH_PROJECT_MISMATCH" };
  }
  const { graphDigest, ...rest } = graph;
  if (canonicalDigest(rest) !== graphDigest) return { ok: false, reason: "GRAPH_DIGEST_MISMATCH" };
  for (const edge of graph.edges) {
    if (!graph.nodes.some((node) => node.id === edge.from) || !graph.nodes.some((node) => node.id === edge.to)) {
      return { ok: false, reason: "GRAPH_DANGLING_EDGE" };
    }
  }
  if (graph.producerVersion !== IMPACT_GRAPH_PRODUCER || graph.graphVersion !== IMPACT_GRAPH_VERSION) {
    return { ok: false, reason: "GRAPH_PRODUCER_MISMATCH" };
  }
  return { ok: true, graph };
}

export function writeImpactGraph(paths: UadsPaths, projectId: string, graph: ImpactGraph, fileCount: number): { graphPath: string; metaPath: string } {
  const verified = verifyImpactGraph(graph, graph.projectFingerprint);
  if (!verified.ok) throw new Error(`IMPACT_GRAPH_STORE_REJECTED:${verified.reason}`);
  const graphPath = impactGraphPath(paths, projectId);
  const metaPath = impactGraphMetaPath(paths, projectId);
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  atomicWriteJson(graphPath, graph);
  const meta: ImpactGraphMeta = {
    schemaVersion: IMPACT_GRAPH_SCHEMA_VERSION,
    projectFingerprint: graph.projectFingerprint,
    graphVersion: graph.graphVersion,
    producerVersion: graph.producerVersion,
    graphDigest: graph.graphDigest,
    builtAtMs: Date.now(),
    fileCount,
    truncated: graph.truncated,
  };
  atomicWriteJson(metaPath, meta);
  return { graphPath, metaPath };
}

export function readImpactGraph(
  paths: UadsPaths,
  projectId: string,
  expectedProjectFingerprint?: string,
): { status: "VALID" | "MISSING" | "CORRUPT"; graph: ImpactGraph | null; reason: string | null } {
  const target = impactGraphPath(paths, projectId);
  const parsed = readJsonIfValid<ImpactGraph>(target);
  if (!parsed.ok) return { status: parsed.error === "missing" ? "MISSING" : "CORRUPT", graph: null, reason: parsed.error === "missing" ? null : "GRAPH_READ_FAILED" };
  const verified = verifyImpactGraph(parsed.value, expectedProjectFingerprint);
  if (!verified.ok) return { status: "CORRUPT", graph: null, reason: verified.reason };
  return { status: "VALID", graph: verified.graph, reason: null };
}

export type ImpactGraphState = "CURRENT" | "MISSING" | "STALE" | "INCOMPLETE" | "CORRUPT";

function currentImportTargets(graph: ImpactGraph, repoRoot: string, relative: string): string[] | null {
  let content: string;
  try {
    const raw = fs.readFileSync(path.join(repoRoot, ...relative.split("/")));
    content = raw.length > IMPACT_GRAPH_READ_CHARS ? raw.subarray(0, IMPACT_GRAPH_READ_CHARS).toString("utf8") : raw.toString("utf8");
  } catch {
    return null;
  }
  const nodeByPath = new Map<string, ImpactNode>();
  for (const candidate of graph.nodes) {
    if (candidate.path !== null) nodeByPath.set(candidate.path, candidate);
  }
  const targets = new Set<string>();
  for (const match of content.matchAll(IMPORT_SPECIFIER)) {
    const resolved = resolveImport(relative, match[1] ?? "", nodeByPath);
    if (resolved === null || resolved === relative) continue;
    const target = nodeByPath.get(resolved);
    if (target) targets.add(target.id);
  }
  return [...targets].sort();
}

// Freshness is about dependency knowledge, not about bytes changing: an edit
// that leaves a file's imports intact is exactly what the snapshot can assess,
// while a changed import surface, an unknown identity or a truncated snapshot
// means the graph no longer describes these bytes and assurance must expand.
export function assessImpactGraph(input: {
  repoRoot: string;
  graph: ImpactGraph | null;
  storeStatus: "VALID" | "MISSING" | "CORRUPT";
  changed: ChangedFileFact[];
}): { state: ImpactGraphState; reasons: string[]; identityMoved: boolean } {
  const reasons = new Set<string>();
  if (input.storeStatus !== "VALID" || input.graph === null) {
    const missing = input.storeStatus !== "CORRUPT";
    return { state: missing ? "MISSING" : "CORRUPT", reasons: [missing ? "GRAPH_MISSING" : "GRAPH_CORRUPT"], identityMoved: false };
  }
  const graph = input.graph;
  const nodeByPath = new Map<string, ImpactNode>();
  for (const node of graph.nodes) {
    if (node.path !== null) nodeByPath.set(node.path, node);
  }
  const recordedTargets = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.relation !== "IMPORTS") continue;
    const bucket = recordedTargets.get(edge.from);
    if (bucket) bucket.push(edge.to);
    else recordedTargets.set(edge.from, [edge.to]);
  }
  let stale = false;
  let incomplete = false;
  let identityMoved = false;
  for (const file of input.changed) {
    if (!isGraphCoveredPath(file.path)) continue;
    const node = nodeByPath.get(file.path);
    if (node === undefined) {
      // The path is unknown to the snapshot. A rename still carries the previous
      // identity, and dependents of that identity stay resolvable.
      const previous = file.previousPath === undefined ? undefined : nodeByPath.get(file.previousPath);
      if (previous) {
        identityMoved = true;
        continue;
      }
      incomplete = true;
      reasons.add("GRAPH_NODE_MISSING");
      continue;
    }
    if (node.kind !== "SOURCE_FILE" && node.kind !== "TEST" && node.kind !== "EVAL") continue;
    const current = currentImportTargets(graph, input.repoRoot, file.path);
    if (current === null) continue;
    const recorded = [...new Set(recordedTargets.get(node.id) ?? [])].sort();
    if (current.length !== recorded.length || current.some((id, index) => id !== recorded[index])) {
      stale = true;
      reasons.add("GRAPH_EDGE_DRIFT");
      reasons.add(`GRAPH_EDGE_DRIFT:${file.path}`);
    }
  }
  if (graph.truncated) {
    incomplete = true;
    reasons.add("GRAPH_TRUNCATED");
  }
  if (incomplete) return { state: "INCOMPLETE", reasons: [...reasons].sort(), identityMoved };
  if (stale) return { state: "STALE", reasons: [...reasons].sort(), identityMoved };
  return { state: "CURRENT", reasons: [...reasons].sort(), identityMoved };
}
