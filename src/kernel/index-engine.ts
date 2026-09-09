import fs from "node:fs";
import path from "node:path";
import { EXCLUDED_DIRECTORY_NAMES, MAX_REVIEW_FILE_BYTES } from "../lib/constants.js";
import { isBinaryFileName, isSensitiveDataFile } from "../lib/exclusions.js";
import { isPathInside, sha256Hex, toPosix } from "../lib/hash.js";
import { runProcess } from "../lib/exec.js";
import {
  gitPorcelain,
  listChangedEntries,
  listNameStatusBetween,
  pathHasExcludedSegment,
  worktreeContentDigest,
  type PorcelainEntry,
} from "./change-digest.js";
import { hasJsTsExportBoundary } from "./js-ts-lex.js";
import { extractorFor, isRelativeSpecifier, resolveRelativeModule } from "./js-ts-extractor.js";
import { persistIndexBundle, readIndexBundle } from "./intelligence-persist.js";
import { assertSafeRelativeProjectPath, isRelativeProjectPath } from "./safe-path.js";
import type {
  DependencyGraph,
  FileKind,
  GraphEdge,
  GraphNode,
  IndexBundle,
  IndexedFileRecord,
  IndexMode,
  IndexState,
  InterfaceContract,
  InterfaceMap,
  RepoIdentity,
  TestMap,
  TestRelation,
  UnresolvedReference,
} from "./intelligence-types.js";
import { INDEX_ENGINE_VERSION, JS_TS_EXTRACTOR_VERSION } from "./intelligence-types.js";

export const DEFAULT_MAX_INDEXED_FILES = 100_000;
export const DEFAULT_MAX_INDEX_DEPTH = 40;
export const MAX_INDEXED_FILES = DEFAULT_MAX_INDEXED_FILES;

export type DiscoveryLimits = {
  maxFiles?: number;
  maxDepth?: number;
};

export type ListedIndexFiles = {
  files: string[];
  truncated: boolean;
  truncationReason: string | null;
};

type IdentityProvider = (repoRoot: string) => RepoIdentity;

let identityProviderForTests: IdentityProvider | null = null;
let discoveryLimitsForTests: DiscoveryLimits | null = null;

export function setRepoIdentityProviderForTests(provider: IdentityProvider | null): void {
  identityProviderForTests = provider;
}

export function setDiscoveryLimitsForTests(limits: DiscoveryLimits | null): void {
  discoveryLimitsForTests = limits;
}

export type IndexScanTelemetry = {
  mode: IndexMode | null;
  filesParsed: number;
  filesReused: number;
  filesConsidered: number;
  hashedFiles: number;
};

export const lastIndexScan: IndexScanTelemetry = {
  mode: null,
  filesParsed: 0,
  filesReused: 0,
  filesConsidered: 0,
  hashedFiles: 0,
};

function recordTelemetry(partial: IndexScanTelemetry): void {
  lastIndexScan.mode = partial.mode;
  lastIndexScan.filesParsed = partial.filesParsed;
  lastIndexScan.filesReused = partial.filesReused;
  lastIndexScan.filesConsidered = partial.filesConsidered;
  lastIndexScan.hashedFiles = partial.hashedFiles;
}

export function readRepoIdentity(repoRoot: string): RepoIdentity {
  if (identityProviderForTests) {
    return identityProviderForTests(repoRoot);
  }
  try {
    gitPorcelain(repoRoot);
    const head = runProcess("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
    return {
      gitAvailable: true,
      gitHead: head.status === 0 ? (head.stdout ?? "").trim() || null : null,
      dirtyDigest: worktreeContentDigest(repoRoot),
    };
  } catch {
    return { gitAvailable: false, gitHead: null, dirtyDigest: "git-unavailable" };
  }
}

function classifyKind(relativePath: string): FileKind {
  const posix = toPosix(relativePath);
  const base = path.posix.basename(posix).toLowerCase();
  const ext = path.posix.extname(posix).toLowerCase();
  if (isBinaryFileName(posix)) return "binary";
  if (/\.(test|spec)\.(tsx?|jsx?|mjs|cjs)$/i.test(base)) return "test";
  if (posix.includes("/tests/") || posix.includes("/__tests__/")) return "test";
  if ((posix.includes("/schemas/") && ext === ".json") || base.endsWith(".schema.json")) return "schema";
  if (ext === ".md") return "docs";
  if (base === "package.json" || base === "tsconfig.json" || base.startsWith("vitest.config")) return "manifest";
  if ([".json", ".yml", ".yaml", ".toml"].includes(ext)) return "config";
  return "source";
}

function languageOf(relativePath: string): string | null {
  const ext = path.posix.extname(toPosix(relativePath)).toLowerCase();
  if ([".ts", ".tsx", ".mts", ".cts"].includes(ext)) return "typescript";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "javascript";
  return null;
}

function isTestPath(relativePath: string): boolean {
  return classifyKind(relativePath) === "test";
}

function shouldIndexPath(relativePath: string): boolean {
  if (!isRelativeProjectPath(relativePath) || isSensitiveDataFile(relativePath)) return false;
  const parts = toPosix(relativePath).split("/");
  if (parts.some((part) => EXCLUDED_DIRECTORY_NAMES.has(part) || part === ".git")) return false;
  const ext = path.posix.extname(toPosix(relativePath)).toLowerCase();
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json", ".md", ".yml", ".yaml", ".toml", ".css", ".html"].includes(ext);
}

function realPathInside(repoRoot: string, abs: string): string | null {
  if (!isPathInside(repoRoot, abs)) return null;
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) {
      const real = fs.realpathSync(abs);
      return isPathInside(repoRoot, real) ? real : null;
    }
    return abs;
  } catch {
    return null;
  }
}

export function listIndexedFiles(repoRoot: string, limits?: DiscoveryLimits): ListedIndexFiles {
  const maxFiles = limits?.maxFiles ?? discoveryLimitsForTests?.maxFiles ?? DEFAULT_MAX_INDEXED_FILES;
  const maxDepth = limits?.maxDepth ?? discoveryLimitsForTests?.maxDepth ?? DEFAULT_MAX_INDEX_DEPTH;
  const found: string[] = [];
  let truncated = false;
  let truncationReason: string | null = null;
  const markTruncated = (reason: string): void => {
    truncated = true;
    truncationReason = truncationReason ?? reason;
  };
  const visit = (absDir: string, depth: number): void => {
    if (found.length >= maxFiles) {
      markTruncated(`maxFiles:${maxFiles}`);
      return;
    }
    if (depth > maxDepth) {
      markTruncated(`maxDepth:${maxDepth}`);
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= maxFiles) {
        markTruncated(`maxFiles:${maxFiles}`);
        return;
      }
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORY_NAMES.has(entry.name) || entry.name === ".git" || (entry.name.startsWith(".") && entry.name !== ".github")) {
          continue;
        }
        if (entry.isSymbolicLink()) continue;
        visit(abs, depth + 1);
        continue;
      }
      if (entry.isSymbolicLink()) {
        const real = realPathInside(repoRoot, abs);
        if (!real) continue;
        try {
          if (!fs.statSync(real).isFile()) continue;
        } catch {
          continue;
        }
      } else if (!entry.isFile()) {
        continue;
      }
      const rel = toPosix(path.relative(repoRoot, abs));
      try {
        const safe = assertSafeRelativeProjectPath(rel);
        if (shouldIndexPath(safe)) found.push(safe);
      } catch {
        continue;
      }
    }
  };
  visit(repoRoot, 0);
  return {
    files: [...new Set(found)].sort((a, b) => a.localeCompare(b)),
    truncated,
    truncationReason,
  };
}

function hashFile(repoRoot: string, relativePath: string): { digest: string; bytes: number; text: string | null } | null {
  const real = realPathInside(repoRoot, path.resolve(repoRoot, relativePath));
  if (!real) return null;
  try {
    const buf = fs.readFileSync(real);
    const kind = classifyKind(relativePath);
    const text = kind === "binary" || buf.length > MAX_REVIEW_FILE_BYTES ? null : buf.toString("utf8");
    return { digest: sha256Hex(buf), bytes: buf.length, text };
  } catch {
    return null;
  }
}

function sortEdges(edges: GraphEdge[]): GraphEdge[] {
  return [...edges].sort((a, b) =>
    `${a.source}\0${a.target}\0${a.type}\0${a.method}`.localeCompare(`${b.source}\0${b.target}\0${b.type}\0${b.method}`),
  );
}

function conventionTestTarget(testPath: string, existing: Set<string>): string | null {
  const base = path.posix.basename(testPath);
  const stripped = base.replace(/\.(test|spec)\.(tsx?|jsx?|mjs|cjs)$/i, "");
  if (stripped === base) return null;
  const dir = path.posix.dirname(testPath);
  const candidates = [
    `${dir}/${stripped}.ts`,
    `${dir}/${stripped}.tsx`,
    `${dir}/${stripped}.js`,
    `${dir}/${stripped}.css`,
    `src/${stripped}.ts`,
    `src/${stripped}.tsx`,
    `src/${stripped}.css`,
    `src/ui/${stripped}.tsx`,
    `src/ui/${stripped}.css`,
  ].map((item) => toPosix(item));
  return candidates.find((item) => existing.has(item)) ?? null;
}

function buildDerivedMaps(
  projectId: string,
  indexDigest: string,
  generatedAt: string,
  files: IndexedFileRecord[],
  edges: GraphEdge[],
): { tests: TestMap; interfaces: InterfaceMap; extraEdges: GraphEdge[] } {
  const existing = new Set(files.map((file) => file.path));
  const relations: TestRelation[] = [];
  const extraEdges: GraphEdge[] = [];
  const byPath = new Map(files.map((file) => [file.path, file]));

  for (const edge of edges) {
    if (isTestPath(edge.source) && ["imports", "requires", "dynamic-import"].includes(edge.type) && !isTestPath(edge.target)) {
      relations.push({
        test: edge.source,
        source: edge.target,
        method: edge.method,
        confidence: Math.min(edge.confidence, 0.85),
        evidence: `test imports ${edge.target}`,
      });
      extraEdges.push({
        type: "test-of",
        source: edge.source,
        target: edge.target,
        method: "test-import",
        confidence: Math.min(edge.confidence, 0.85),
        evidence: `test file imports source ${edge.target}`,
        sourceDigest: byPath.get(edge.source)?.contentDigest ?? edge.sourceDigest,
      });
    }
  }

  for (const file of files) {
    if (!isTestPath(file.path)) continue;
    const target = conventionTestTarget(file.path, existing);
    if (!target || relations.some((rel) => rel.test === file.path && rel.source === target)) continue;
    relations.push({
      test: file.path,
      source: target,
      method: "filename-convention",
      confidence: 0.55,
      evidence: "test filename matches nearby source",
    });
    extraEdges.push({
      type: "test-of",
      source: file.path,
      target,
      method: "filename-convention",
      confidence: 0.55,
      evidence: "test filename convention; not a sufficiency claim",
      sourceDigest: file.contentDigest,
    });
  }

  const contracts: InterfaceContract[] = [];
  for (const file of files) {
    if (file.kind === "schema") {
      contracts.push({ path: file.path, kind: "schema", evidence: "schema file by path", confidence: 0.8 });
    } else if (file.path.endsWith("/cli.ts") || path.posix.basename(file.path) === "cli.ts") {
      contracts.push({ path: file.path, kind: "cli", evidence: "CLI command definition file", confidence: 0.7 });
    } else if (file.path.endsWith(".d.ts")) {
      contracts.push({ path: file.path, kind: "type", evidence: "TypeScript declaration file", confidence: 0.6 });
    } else if (file.hasExportBoundary) {
      contracts.push({ path: file.path, kind: "export", evidence: "explicit JS/TS export boundary", confidence: 0.7 });
    } else if (file.kind === "manifest" || file.kind === "config") {
      contracts.push({ path: file.path, kind: "config", evidence: "config/manifest contract", confidence: 0.65 });
    }
  }

  relations.sort((a, b) => `${a.test}\0${a.source}`.localeCompare(`${b.test}\0${b.source}`));
  contracts.sort((a, b) => a.path.localeCompare(b.path));
  return {
    tests: { schema: "uads.test-map", schemaVersion: "0.4.0", projectId, indexDigest, generatedAt, relations },
    interfaces: { schema: "uads.interface-map", schemaVersion: "0.4.0", projectId, indexDigest, generatedAt, contracts },
    extraEdges,
  };
}

function parseJsonLoose(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      return JSON.parse(stripped);
    } catch {
      return null;
    }
  }
}

function isGlobPath(value: string): boolean {
  return /[*?\[]/.test(value);
}

function detectExportBoundary(relativePath: string, text: string | null): boolean {
  if (!text || !languageOf(relativePath)) return false;
  return hasJsTsExportBoundary(text);
}

function resolveExplicitRepoPath(fromFile: string, specifier: string, existing: Set<string>): string | null {
  const raw = specifier.trim().replace(/^<|>$/g, "");
  if (!raw || isGlobPath(raw)) return null;
  const withoutHash = raw.split("#")[0]?.split("?")[0]?.trim() ?? "";
  if (!withoutHash) return null;
  if (/^(https?:|mailto:|data:)/i.test(withoutHash)) return null;
  if (withoutHash.startsWith("#")) return null;
  try {
    const fromDir = path.posix.dirname(toPosix(fromFile));
    const joined = withoutHash.startsWith("/")
      ? withoutHash.replace(/^\/+/, "")
      : path.posix.normalize(`${fromDir}/${withoutHash}`);
    const safe = assertSafeRelativeProjectPath(joined);
    return existing.has(safe) ? safe : null;
  } catch {
    return null;
  }
}

function collectManifestPaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const out: string[] = [];
  const push = (item: unknown): void => {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
  };
  for (const key of ["main", "module", "types", "typings"]) {
    push(record[key]);
  }
  if (typeof record.bin === "string") {
    push(record.bin);
  } else if (record.bin && typeof record.bin === "object" && !Array.isArray(record.bin)) {
    for (const nested of Object.values(record.bin as Record<string, unknown>)) {
      push(nested);
    }
  }
  push(record.exports);
  return out;
}

function extractStructuralEdges(
  relativePath: string,
  text: string | null,
  digest: string,
  existing: Set<string>,
): GraphEdge[] {
  if (!text) return [];
  const base = path.posix.basename(toPosix(relativePath)).toLowerCase();
  const edges: GraphEdge[] = [];
  const push = (type: GraphEdge["type"], target: string, method: string, evidence: string): void => {
    if (edges.some((item) => item.type === type && item.target === target && item.method === method)) return;
    edges.push({
      type,
      source: relativePath,
      target,
      method,
      confidence: 0.8,
      evidence,
      sourceDigest: digest,
    });
  };

  if (base === "package.json") {
    const parsed = parseJsonLoose(text);
    for (const spec of collectManifestPaths(parsed)) {
      const resolved = resolveExplicitRepoPath(relativePath, spec, existing);
      if (resolved) push("manifest-reference", resolved, "package-field", `package.json field path ${spec}`);
    }
    return edges;
  }

  if (base === "tsconfig.json" || (base.startsWith("tsconfig.") && base.endsWith(".json"))) {
    const parsed = parseJsonLoose(text);
    const files = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>).files : null;
    if (Array.isArray(files)) {
      for (const item of files) {
        if (typeof item !== "string" || isGlobPath(item)) continue;
        const resolved = resolveExplicitRepoPath(relativePath, item, existing);
        if (resolved) push("configures", resolved, "tsconfig-files", `tsconfig files entry ${item}`);
      }
    }
    return edges;
  }

  if (path.posix.extname(toPosix(relativePath)).toLowerCase() === ".md") {
    const link = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    for (const match of text.matchAll(link)) {
      const spec = match[1] ?? "";
      const resolved = resolveExplicitRepoPath(relativePath, spec, existing);
      if (resolved) push("documents", resolved, "markdown-link", `markdown link ${spec}`);
    }
  }
  return edges;
}

function isContractTarget(relativePath: string): boolean {
  return classifyKind(relativePath) === "schema" || relativePath.endsWith(".d.ts");
}

function extractFile(
  relativePath: string,
  text: string | null,
  digest: string,
  existing: Set<string>,
): { edges: GraphEdge[]; unresolved: UnresolvedReference[] } {
  const extractor = extractorFor(relativePath);
  const edges: GraphEdge[] = [];
  const unresolved: UnresolvedReference[] = [];
  if (extractor && text !== null) {
    for (const ref of extractor.extract({ path: relativePath, text })) {
      if (ref.resolved === false || ref.specifier === "(computed)" || !isRelativeSpecifier(ref.specifier)) {
        unresolved.push({
          source: relativePath,
          specifier: ref.specifier,
          reason: ref.specifier === "(computed)" ? "computed or non-literal specifier" : isRelativeSpecifier(ref.specifier) ? "unresolved-relative" : "external-or-unresolved",
          method: ref.method,
          confidence: ref.confidence,
          line: ref.line,
          sourceDigest: digest,
        });
        continue;
      }
      const resolved = resolveRelativeModule(relativePath, ref.specifier, existing);
      if (!resolved) {
        unresolved.push({
          source: relativePath,
          specifier: ref.specifier,
          reason: "unresolved-relative",
          method: ref.method,
          confidence: ref.confidence,
          line: ref.line,
          sourceDigest: digest,
        });
        continue;
      }
      edges.push({
        type: ref.type,
        source: relativePath,
        target: resolved,
        method: ref.method,
        confidence: ref.confidence,
        evidence: ref.evidence,
        line: ref.line,
        sourceDigest: digest,
      });
      if (isContractTarget(resolved)) {
        edges.push({
          type: "interface-reference",
          source: relativePath,
          target: resolved,
          method: ref.method,
          confidence: Math.min(ref.confidence, 0.85),
          evidence: `resolved import targets contract ${resolved}`,
          line: ref.line,
          sourceDigest: digest,
        });
      }
    }
  }
  edges.push(...extractStructuralEdges(relativePath, text, digest, existing));
  return { edges, unresolved };
}

function applyPorcelainToSets(entries: PorcelainEntry[], changed: Set<string>, removed: Set<string>): void {
  for (const entry of entries) {
    try {
      const safePath = assertSafeRelativeProjectPath(entry.path);
      if (pathHasExcludedSegment(safePath)) continue;
      changed.add(safePath);
      if (entry.origPath) {
        const orig = assertSafeRelativeProjectPath(entry.origPath);
        if (!pathHasExcludedSegment(orig)) {
          removed.add(orig);
          changed.add(orig);
        }
      }
      if (entry.code.includes("D") && !entry.code.includes("R") && !entry.code.includes("C")) {
        removed.add(safePath);
      }
    } catch {
      continue;
    }
  }
}

function indexDigestOf(files: IndexedFileRecord[]): string {
  return sha256Hex(
    JSON.stringify({
      extractorVersion: JS_TS_EXTRACTOR_VERSION,
      engineVersion: INDEX_ENGINE_VERSION,
      files: files.map((file) => ({ path: file.path, contentDigest: file.contentDigest })),
    }),
  );
}

export function buildOrRefreshIndex(input: {
  repoRoot: string;
  projectId: string;
  paths: import("../lib/workspace.js").UadsPaths;
  schemaRoot?: string;
  forceFull?: boolean;
}): IndexBundle {
  const started = Date.now();
  const identity = readRepoIdentity(input.repoRoot);
  const existing = input.forceFull ? null : readIndexBundle(input.paths, input.schemaRoot);
  const versionOk = Boolean(
    existing &&
      existing.state.engineVersion === INDEX_ENGINE_VERSION &&
      existing.state.extractorVersion === JS_TS_EXTRACTOR_VERSION,
  );
  if (
    existing &&
    versionOk &&
    existing.state.projectId === input.projectId &&
    existing.state.complete &&
    !existing.state.truncated &&
    !existing.state.stale &&
    identity.gitAvailable &&
    existing.state.gitAvailable &&
    existing.state.gitHead === identity.gitHead &&
    existing.state.dirtyDigest === identity.dirtyDigest
  ) {
    const reused: IndexBundle = {
      ...existing,
      state: {
        ...existing.state,
        mode: "reused",
        filesParsed: 0,
        filesReused: existing.state.files.length,
        filesRemoved: 0,
        filesConsidered: existing.state.files.length,
        durationMs: Date.now() - started,
        stale: false,
        staleReason: null,
      },
    };
    persistIndexBundle(input.paths, reused, input.schemaRoot);
    recordTelemetry({
      mode: "reused",
      filesParsed: 0,
      filesReused: existing.state.files.length,
      filesConsidered: existing.state.files.length,
      hashedFiles: 0,
    });
    return reused;
  }

  const discovery = listIndexedFiles(input.repoRoot);
  const listed = discovery.files;
  const listedSet = new Set(listed);
  const previous = new Map((existing?.state.files ?? []).map((file) => [file.path, file]));
  const previousEdges = existing?.graph.edges.filter((edge) => edge.type !== "test-of") ?? [];
  const changed = new Set<string>();
  const removed = new Set<string>();
  const canIncrement = Boolean(existing && versionOk && identity.gitAvailable && existing.state.gitAvailable && !input.forceFull);

  if (canIncrement && existing) {
    applyPorcelainToSets(listChangedEntries(input.repoRoot), changed, removed);
    if (existing.state.gitHead !== identity.gitHead) {
      if (!existing.state.gitHead || !identity.gitHead) {
        for (const pathName of listed) changed.add(pathName);
      } else {
        const between = listNameStatusBetween(input.repoRoot, existing.state.gitHead, identity.gitHead);
        if (between === null) {
          for (const pathName of listed) changed.add(pathName);
        } else {
          applyPorcelainToSets(between, changed, removed);
        }
      }
    }
    for (const pathName of previous.keys()) {
      if (!listedSet.has(pathName)) removed.add(pathName);
    }
  } else {
    for (const pathName of listed) changed.add(pathName);
    for (const pathName of previous.keys()) {
      if (!listedSet.has(pathName)) removed.add(pathName);
    }
  }

  const files: IndexedFileRecord[] = [];
  const edges: GraphEdge[] = [];
  const unresolved: UnresolvedReference[] = [];
  const reparsed = new Set<string>();
  let filesParsed = 0;
  let filesReused = 0;
  let hashedFiles = 0;

  for (const relativePath of listed) {
    const prev = previous.get(relativePath);
    const mustHash = changed.has(relativePath) || !prev || !identity.gitAvailable;
    if (!mustHash && prev) {
      files.push(prev);
      filesReused += 1;
      continue;
    }
    const hashed = hashFile(input.repoRoot, relativePath);
    hashedFiles += 1;
    if (!hashed) continue;
    const record: IndexedFileRecord = {
      path: relativePath,
      contentDigest: hashed.digest,
      kind: classifyKind(relativePath),
      language: languageOf(relativePath),
      bytes: hashed.bytes,
      hasExportBoundary: detectExportBoundary(relativePath, hashed.text),
    };
    files.push(record);
    if (prev && prev.contentDigest === hashed.digest) {
      filesReused += 1;
      continue;
    }
    const extracted = extractFile(relativePath, hashed.text, hashed.digest, listedSet);
    edges.push(...extracted.edges);
    unresolved.push(...extracted.unresolved);
    reparsed.add(relativePath);
    filesParsed += 1;
  }

  for (const edge of previousEdges) {
    if (removed.has(edge.source) || removed.has(edge.target) || !listedSet.has(edge.target)) continue;
    const source = files.find((file) => file.path === edge.source);
    if (!source) continue;
    if (reparsed.has(edge.source)) continue;
    if (changed.has(edge.source) && source.contentDigest !== edge.sourceDigest) continue;
    if (edges.some((item) => item.source === edge.source && item.target === edge.target && item.type === edge.type && item.method === edge.method)) {
      continue;
    }
    edges.push(edge);
  }

  if (existing) {
    for (const item of existing.graph.unresolved) {
      if (reparsed.has(item.source) || removed.has(item.source) || !listedSet.has(item.source)) continue;
      const source = files.find((file) => file.path === item.source);
      if (!source || source.contentDigest !== item.sourceDigest) continue;
      unresolved.push(item);
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const generatedAt = new Date().toISOString();
  const digest = indexDigestOf(files);
  const derived = buildDerivedMaps(input.projectId, digest, generatedAt, files, edges);
  const allEdges = sortEdges([...edges, ...derived.extraEdges]);
  const nodes: GraphNode[] = files.map((file) => ({ path: file.path, kind: file.kind, contentDigest: file.contentDigest }));
  unresolved.sort((a, b) => `${a.source}\0${a.specifier}`.localeCompare(`${b.source}\0${b.specifier}`));

  const incomplete = discovery.truncated;
  const staleReason = incomplete
    ? `index discovery truncated (${discovery.truncationReason ?? "limit"})`
    : identity.gitAvailable
      ? null
      : "git unavailable; freshness uses content digests only";
  const mode: IndexMode = existing ? "incrementalUpdate" : "fullBuild";
  const state: IndexState = {
    schema: "uads.index-state",
    schemaVersion: "0.4.0",
    projectId: input.projectId,
    indexDigest: digest,
    extractorVersion: JS_TS_EXTRACTOR_VERSION,
    engineVersion: INDEX_ENGINE_VERSION,
    generatedAt: existing?.state.generatedAt ?? generatedAt,
    updatedAt: generatedAt,
    gitHead: identity.gitHead,
    dirtyDigest: identity.gitAvailable ? identity.dirtyDigest : digest,
    gitAvailable: identity.gitAvailable,
    mode,
    confidence: incomplete || !identity.gitAvailable ? "reduced" : "high",
    stale: incomplete,
    staleReason,
    filesConsidered: listed.length,
    filesParsed,
    filesReused,
    filesRemoved: [...removed].filter((item) => previous.has(item)).length,
    durationMs: Date.now() - started,
    unresolvedCount: unresolved.length,
    nodeCount: nodes.length,
    edgeCount: allEdges.length,
    complete: !incomplete,
    truncated: incomplete,
    truncationReason: discovery.truncationReason,
    files,
  };
  const graph: DependencyGraph = {
    schema: "uads.dependency-graph",
    schemaVersion: "0.4.0",
    projectId: input.projectId,
    indexDigest: digest,
    generatedAt,
    extractorVersion: JS_TS_EXTRACTOR_VERSION,
    nodes,
    edges: allEdges,
    unresolved,
  };
  const bundle: IndexBundle = { state, graph, tests: derived.tests, interfaces: derived.interfaces };
  persistIndexBundle(input.paths, bundle, input.schemaRoot);
  recordTelemetry({ mode, filesParsed, filesReused, filesConsidered: listed.length, hashedFiles });
  return bundle;
}
