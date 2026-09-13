import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { redactSecrets } from "../lib/secrets.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest, normalizeRepoRelativePath } from "./upir.js";
import { allowedInclusionReasons, type ContextExpansion, type ContextExpansionReason, type SliceInclusionReason } from "./context-radius.js";
import type { UpirContextRadius } from "./upir.js";

export const CONTEXT_COMPILER_VERSION = "1.0.0" as const;
export const CONTEXT_PRODUCER_VERSION = "gef-context-compiler/1.0.1+radius-c0-c4/1.0.0" as const;
export const CONTEXT_TOOLCHAIN_BASIS = "node>=20+regex-ts/1.0.0" as const;
export const CONTEXT_SLICE_SCHEMA_FILE = "gef-context-slice.schema.json" as const;

export type SliceEntryKind = "function" | "class" | "interface" | "type" | "const" | "enum" | "file";

export type ContextSliceEntry = {
  path: string;
  symbol: string;
  kind: SliceEntryKind;
  contentDigest: string;
  signatures: string[];
  dependencies: string[];
  tests: string[];
  invariants: string[];
  fallback: boolean;
  inclusionReason: SliceInclusionReason;
  excerpt?: string;
};

export type ContextSlice = {
  schemaVersion: "0.1.0";
  taskId: string;
  radius: UpirContextRadius;
  compilerVersion: typeof CONTEXT_COMPILER_VERSION;
  producerVersion: string;
  toolchainBasis: string;
  entries: ContextSliceEntry[];
  expansions: ContextExpansion[];
  sliceDigest: string;
};

export type CompileContextInput = {
  taskId: string;
  repoRoot: string;
  targetSymbols: string[];
  radius: UpirContextRadius;
  expansions?: ContextExpansion[];
  invariants?: string[];
  architecturePaths?: string[];
  broadGovernancePaths?: string[];
  maxFilesScanned?: number;
  maxExcerptChars?: number;
  maxEntries?: number;
};

const IMPORT_LINE = /^\s*import\s+[^;]+from\s+["']([^"']+)["'];?\s*$/;
const NAMED_IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/;
const DEFAULT_GOVERNANCE_PATHS = ["AGENTS.md", "docs/v2/04-ARCHITECTURE.md"];
const C4_EXTRA_GOVERNANCE_PATHS = ["docs/v2/03-SCOPE.md", "docs/v2/13-REVIEW-PROTOCOL.md"];
const MAX_ARCHITECTURE_PATHS = 8;
const MAX_BROAD_GOVERNANCE_PATHS = 4;
const MAX_INTERFACES_PER_TARGET = 8;
const MAX_DEPENDENCIES_PER_TARGET = 8;
const MAX_SIBLING_FILES = 16;
const DEFAULT_MAX_ENTRIES = 24;
const GOVERNANCE_EXCERPT_CHARS = 2000;
const GOVERNANCE_READ_CHARS = 60000;

export type ScannedFiles = {
  files: string[];
  truncated: boolean;
  scanned: number;
  limit: number;
};

function listTypeScriptFiles(repoRoot: string, limit: number): ScannedFiles {
  const out: string[] = [];
  let truncated = false;
  const visit = (directory: string): void => {
    if (truncated) return;
    let names: string[];
    try {
      names = fs.readdirSync(directory).sort();
    } catch {
      return;
    }
    for (let index = 0; index < names.length; index += 1) {
      if (out.length >= limit) {
        truncated = true;
        return;
      }
      const name = names[index] ?? "";
      if (name === "node_modules" || name === ".git" || name === "dist") continue;
      const candidate = path.join(directory, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(candidate);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(candidate);
        if (truncated) return;
      } else if (stat.isFile() && (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".js"))) {
        out.push(candidate);
      }
    }
  };
  visit(repoRoot);
  return { files: out.sort(), truncated, scanned: out.length, limit };
}

function safeReadText(filePath: string, maxChars: number): string {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.length > maxChars ? raw.slice(0, maxChars) : raw;
}

function extractSymbolBlock(content: string, symbol: string): { kind: SliceEntryKind; signature: string; excerpt: string; found: boolean } {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declaration = new RegExp(`(^|\\n)\\s*(export\\s+)?(async\\s+)?(function|class|interface|type|enum)\\s+${escaped}\\b[^\\n]*|\\n\\s*export\\s+(const|let|var)\\s+${escaped}\\b[^\\n]*`);
  const match = declaration.exec(content);
  if (!match) return { kind: "file", signature: "", excerpt: "", found: false };
  const matchedText = match[0] ?? "";
  let kind: SliceEntryKind = "file";
  if (matchedText.includes("function")) kind = "function";
  else if (matchedText.includes("class")) kind = "class";
  else if (matchedText.includes("interface")) kind = "interface";
  else if (matchedText.includes("enum")) kind = "enum";
  else if (matchedText.includes("type")) kind = "type";
  else kind = "const";
  const lines = content.split("\n");
  let lineIndex = content.slice(0, match.index ?? 0).split("\n").length - 1;
  if (lineIndex < 0) lineIndex = 0;
  const end = Math.min(lines.length, lineIndex + 40);
  const excerptLines = lines.slice(lineIndex, end);
  return { kind, signature: (matchedText.trim().split("\n")[0] ?? "").slice(0, 500), excerpt: excerptLines.join("\n").slice(0, 4000), found: true };
}

function extractInterfaceSymbols(content: string): Array<{ name: string; kind: SliceEntryKind; signature: string }> {
  const found: Array<{ name: string; kind: SliceEntryKind; signature: string }> = [];
  const seen = new Set<string>();
  const pattern = /(^|\n)\s*export\s+(interface|type|class|enum)\s+([A-Za-z0-9_]+)[^\n]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const keyword = match[2] ?? "";
    const name = match[3] ?? "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const kind: SliceEntryKind = keyword === "interface" ? "interface" : keyword === "class" ? "class" : keyword === "enum" ? "enum" : "type";
    found.push({ name, kind, signature: (match[0] ?? "").trim().split("\n")[0]?.slice(0, 500) ?? "" });
    if (found.length >= 32) break;
  }
  return found;
}

function directDependencies(content: string): string[] {
  const deps: string[] = [];
  for (const line of content.split("\n")) {
    const match = IMPORT_LINE.exec(line.trim());
    if (match?.[1]) deps.push(match[1].slice(0, 300));
  }
  return deps.slice(0, 32);
}

function resolveRelativeImport(fromAbsolute: string, specifier: string, repoRoot: string): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const base = path.resolve(path.dirname(fromAbsolute), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  for (const candidate of candidates) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(candidate);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const resolved = path.resolve(candidate);
    const root = path.resolve(repoRoot);
    const relative = path.relative(root, resolved);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    if (resolved.endsWith(".test.ts") || resolved.endsWith(".test.tsx") || resolved.endsWith(".spec.ts")) continue;
    return resolved;
  }
  return null;
}

function namedImportsFor(content: string, specifier: string): string[] {
  const names: string[] = [];
  for (const line of content.split("\n")) {
    const match = NAMED_IMPORT.exec(line.trim());
    if (match && match[2] === specifier) {
      for (const part of (match[1] ?? "").split(",")) {
        const name = part.trim().split(/\s+/)[0] ?? "";
        if (/^[A-Za-z0-9_]+$/.test(name)) names.push(name);
      }
    }
  }
  return [...new Set(names)].sort().slice(0, 8);
}

function isTestRelativePath(relative: string): boolean {
  return relative.endsWith(".test.ts") || relative.endsWith(".test.tsx") || relative.endsWith(".spec.ts");
}

export function compileContext(input: CompileContextInput): ContextSlice {
  if (input.targetSymbols.length === 0 || input.targetSymbols.length > 32) throw new Error("CONTEXT_TARGET_BOUND_REJECTED");
  if ((input.expansions ?? []).length > 8) throw new Error("CONTEXT_EXPANSION_BOUND_REJECTED");
  if ((input.architecturePaths ?? []).length > MAX_ARCHITECTURE_PATHS) throw new Error("CONTEXT_ARCHITECTURE_BOUND_REJECTED");
  if ((input.broadGovernancePaths ?? []).length > MAX_BROAD_GOVERNANCE_PATHS) throw new Error("CONTEXT_ARCHITECTURE_BOUND_REJECTED");
  const maxEntries = input.maxEntries ?? DEFAULT_MAX_ENTRIES;
  if (maxEntries <= 0 || maxEntries > 200) throw new Error("CONTEXT_ENTRY_BOUND_REJECTED");
  const excerptLimit = input.maxExcerptChars ?? 4000;
  const scanLimit = input.maxFilesScanned ?? 200;

  const scan = listTypeScriptFiles(input.repoRoot, scanLimit);
  const files = scan.files;
  const fileContents = new Map<string, string>();
  const readCached = (absolute: string, maxChars = 200000): string | null => {
    const cached = fileContents.get(absolute);
    if (cached !== undefined) return cached;
    try {
      const content = safeReadText(absolute, maxChars);
      fileContents.set(absolute, content);
      return content;
    } catch {
      return null;
    }
  };

  const relatedTestsFor = (symbol: string): string[] =>
    files
      .filter((candidate) => candidate.endsWith(".test.ts") || candidate.endsWith(".spec.ts"))
      .filter((candidate) => (readCached(candidate, 60000) ?? "").includes(symbol))
      .map((candidate) => normalizeRepoRelativePath(path.relative(input.repoRoot, candidate)))
      .sort()
      .slice(0, 32);

  type PlacedTarget = { absolute: string; relative: string; content: string; block: ReturnType<typeof extractSymbolBlock> };
  const placed: PlacedTarget[] = [];
  for (const symbol of input.targetSymbols) {
    const declarationCandidates: string[] = [];
    const fallbackCandidates: string[] = [];
    for (const absolute of files) {
      const content = readCached(absolute);
      if (!content || !content.includes(symbol)) continue;
      const relative = normalizeRepoRelativePath(path.relative(input.repoRoot, absolute));
      if (isTestRelativePath(relative)) continue;
      if (extractSymbolBlock(content, symbol).found) declarationCandidates.push(absolute);
      else fallbackCandidates.push(absolute);
    }
    const selected = [...declarationCandidates.sort(), ...fallbackCandidates.sort()][0];
    if (!selected) {
      if (scan.truncated) {
        throw new Error(`CONTEXT_BUDGET_EXPANSION_REQUIRED:filesScanned(${scan.scanned}/${scan.limit})`);
      }
      throw new Error(`CONTEXT_SYMBOL_NOT_FOUND:${symbol}`);
    }
    const content = readCached(selected) ?? "";
    placed.push({
      absolute: selected,
      relative: normalizeRepoRelativePath(path.relative(input.repoRoot, selected)),
      content,
      block: extractSymbolBlock(content, symbol),
    });
  }

  const requireBudget = (entries: ContextSliceEntry[], additions: number): void => {
    if (entries.length + additions > maxEntries) {
      throw new Error(`CONTEXT_BUDGET_EXPANSION_REQUIRED:entries(${entries.length + additions})>max(${maxEntries})`);
    }
  };

  const invariants = [...(input.invariants ?? [])].slice(0, 16);
  const entries: ContextSliceEntry[] = [];

  // C0: target declaration/excerpt + direct test references only.
  for (let index = 0; index < placed.length; index += 1) {
    const target = placed[index];
    if (!target) throw new Error("CONTEXT_TARGET_BOUND_REJECTED");
    const symbol = input.targetSymbols[index] ?? "";
    requireBudget(entries, 1);
    entries.push({
      path: target.relative,
      symbol,
      kind: target.block.found ? target.block.kind : "file",
      contentDigest: sha256Hex(target.content),
      signatures: target.block.found && target.block.signature ? [target.block.signature] : [],
      dependencies: directDependencies(target.content),
      tests: input.radius === "C0" ? relatedTestsFor(symbol).slice(0, 4) : relatedTestsFor(symbol),
      invariants,
      fallback: !target.block.found,
      inclusionReason: "TARGET",
      excerpt: target.block.found ? redactSecrets(target.block.excerpt).text.slice(0, excerptLimit) || undefined : undefined,
    });
  }
  const c0Identities = new Set(entries.map((entry) => `${entry.path}::${entry.symbol}::${entry.inclusionReason}`));
  if (input.radius === "C0") return finalizeSlice(input, entries);

  // C1: C0 + direct imported/local dependency files + direct tests.
  const seenDepFiles = new Set<string>();
  for (const target of placed) {
    const specifiers = [...new Set(directDependencies(target.content))].sort().slice(0, MAX_DEPENDENCIES_PER_TARGET);
    for (const specifier of specifiers) {
      const resolved = resolveRelativeImport(target.absolute, specifier, input.repoRoot);
      if (!resolved || seenDepFiles.has(resolved)) continue;
      seenDepFiles.add(resolved);
      const content = readCached(resolved);
      if (!content) continue;
      const relative = normalizeRepoRelativePath(path.relative(input.repoRoot, resolved));
      const importedNames = namedImportsFor(target.content, specifier);
      requireBudget(entries, 1);
      entries.push({
        path: relative,
        symbol: importedNames.length > 0 ? (importedNames[0] ?? relative) : relative,
        kind: "file",
        contentDigest: sha256Hex(content),
        signatures: [],
        dependencies: directDependencies(content),
        tests: [],
        invariants,
        fallback: true,
        inclusionReason: "DIRECT_DEPENDENCY",
        excerpt: redactSecrets(content.split("\n").slice(0, 60).join("\n")).text.slice(0, Math.min(excerptLimit, 2000)) || undefined,
      });
    }
  }
  if (input.radius === "C1") return finalizeSlice(input, entries);

  // C2: C1 + same-module interfaces/types/contracts needed by the target.
  // Module boundary is the target directory; relevance is a reference from the
  // target file or its direct dependencies. Unreferenced siblings stay out.
  const seenInterfaces = new Set(entries.map((entry) => `${entry.path}::${entry.symbol}`));
  const referenceBasis = placed.map((target) => target.content).join("\n");
  const depContents: string[] = [];
  for (const entry of entries) {
    if (entry.inclusionReason !== "DIRECT_DEPENDENCY") continue;
    const content = readCached(path.join(input.repoRoot, ...entry.path.split("/")));
    if (content) depContents.push(content);
  }
  const basis = `${referenceBasis}\n${depContents.join("\n")}`;
  const siblingFiles = new Set<string>();
  for (const target of placed) {
    siblingFiles.add(target.absolute);
    let dirNames: string[];
    try {
      dirNames = fs.readdirSync(path.dirname(target.absolute)).sort();
    } catch {
      continue;
    }
    for (const name of [...dirNames].slice(0, MAX_SIBLING_FILES)) {
      if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
      const candidate = path.join(path.dirname(target.absolute), name);
      const relative = path.relative(input.repoRoot, candidate);
      if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
      if (isTestRelativePath(relative)) continue;
      siblingFiles.add(candidate);
    }
  }
  for (const target of placed) {
    const moduleFiles = new Set<string>([target.absolute]);
    for (const specifier of directDependencies(target.content)) {
      const resolved = resolveRelativeImport(target.absolute, specifier, input.repoRoot);
      if (resolved) moduleFiles.add(resolved);
    }
    for (const sibling of siblingFiles) moduleFiles.add(sibling);
    const interfaces: Array<{ file: string; name: string; kind: SliceEntryKind; signature: string }> = [];
    for (const file of [...moduleFiles].sort()) {
      const content = readCached(file);
      if (!content) continue;
      for (const item of extractInterfaceSymbols(content)) {
        if (item.name === target.block.signature) continue;
        if (!basis.includes(item.name)) continue;
        if (input.targetSymbols.includes(item.name)) continue;
        interfaces.push({ file, name: item.name, kind: item.kind, signature: item.signature });
      }
    }
    for (const item of interfaces.sort((left, right) => (left.name < right.name ? -1 : 1)).slice(0, MAX_INTERFACES_PER_TARGET)) {
      const relative = normalizeRepoRelativePath(path.relative(input.repoRoot, item.file));
      const key = `${relative}::${item.name}`;
      if (seenInterfaces.has(key)) continue;
      seenInterfaces.add(key);
      const content = readCached(item.file) ?? "";
      const block = extractSymbolBlock(content, item.name);
      requireBudget(entries, 1);
      entries.push({
        path: relative,
        symbol: item.name,
        kind: item.kind,
        contentDigest: sha256Hex(content),
        signatures: block.signature ? [block.signature] : item.signature ? [item.signature] : [],
        dependencies: [],
        tests: [],
        invariants,
        fallback: !block.found,
        inclusionReason: "MODULE_INTERFACE",
        excerpt: block.found ? redactSecrets(block.excerpt).text.slice(0, excerptLimit) || undefined : undefined,
      });
    }
  }
  if (input.radius === "C2") return finalizeSlice(input, entries);

  // C3/C4: bounded architecture/governance contracts, never a repo dump.
  // The path sets are project-specific operator inputs: they flow into slice
  // entries, so they are part of the slice digest/basis by construction.
  const configured = (input.architecturePaths ?? []).map((item) => normalizeRepoRelativePath(item));
  const broadConfigured = (input.broadGovernancePaths ?? []).map((item) => normalizeRepoRelativePath(item));
  const governanceBasis = configured.length > 0 ? configured : [...DEFAULT_GOVERNANCE_PATHS];
  const c3Paths = governanceBasis.slice(0, MAX_ARCHITECTURE_PATHS);
  for (const relative of c3Paths) {
    const absolute = path.join(input.repoRoot, ...relative.split("/"));
    let content: string;
    try {
      content = safeReadText(absolute, GOVERNANCE_READ_CHARS);
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.path === relative)) continue;
    requireBudget(entries, 1);
    entries.push({
      path: relative,
      symbol: relative.split("/").pop() ?? relative,
      kind: "file",
      contentDigest: sha256Hex(content),
      signatures: [],
      dependencies: [],
      tests: [],
      invariants,
      fallback: true,
      inclusionReason: "ARCHITECTURE_CONTRACT",
      excerpt: redactSecrets(content.slice(0, GOVERNANCE_EXCERPT_CHARS)).text || undefined,
    });
  }
  if (input.radius === "C3") return finalizeSlice(input, entries, c0Identities);

  const broadBasis = broadConfigured.length > 0 ? broadConfigured : [...C4_EXTRA_GOVERNANCE_PATHS];
  for (const relative of broadBasis.slice(0, MAX_BROAD_GOVERNANCE_PATHS)) {
    if (configured.includes(relative) || c3Paths.includes(relative)) continue;
    const absolute = path.join(input.repoRoot, ...relative.split("/"));
    let content: string;
    try {
      content = safeReadText(absolute, GOVERNANCE_READ_CHARS);
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.path === relative)) continue;
    requireBudget(entries, 1);
    entries.push({
      path: relative,
      symbol: relative.split("/").pop() ?? relative,
      kind: "file",
      contentDigest: sha256Hex(content),
      signatures: [],
      dependencies: [],
      tests: [],
      invariants,
      fallback: true,
      inclusionReason: "BROAD_GOVERNANCE",
      excerpt: redactSecrets(content.slice(0, GOVERNANCE_EXCERPT_CHARS)).text || undefined,
    });
  }
  return finalizeSlice(input, entries, c0Identities);
}

function finalizeSlice(input: CompileContextInput, entries: ContextSliceEntry[], c0Identities?: Set<string>): ContextSlice {
  const allowed = new Set(allowedInclusionReasons(input.radius));
  for (const entry of entries) {
    if (!allowed.has(entry.inclusionReason)) throw new Error(`RADIUS_INCLUSION_REJECTED:${entry.inclusionReason}@${input.radius}`);
    if (input.radius === "C0" && entry.inclusionReason !== "TARGET" && entry.inclusionReason !== "DIRECT_TEST") {
      throw new Error(`RADIUS_INCLUSION_REJECTED:${entry.inclusionReason}@C0`);
    }
  }
  if (c0Identities) {
    const identities = new Set(entries.map((entry) => `${entry.path}::${entry.symbol}::${entry.inclusionReason}`));
    for (const identity of c0Identities) {
      if (!identities.has(identity)) throw new Error(`RADIUS_MONOTONICITY_VIOLATED:${identity}`);
    }
  }
  const sorted = [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : left.symbol < right.symbol ? -1 : left.symbol > right.symbol ? 1 : left.inclusionReason < right.inclusionReason ? -1 : 1,
  );
  const sliceWithoutDigest = {
    schemaVersion: "0.1.0" as const,
    taskId: input.taskId,
    radius: input.radius,
    compilerVersion: CONTEXT_COMPILER_VERSION,
    producerVersion: CONTEXT_PRODUCER_VERSION,
    toolchainBasis: CONTEXT_TOOLCHAIN_BASIS,
    entries: sorted,
    expansions: [...(input.expansions ?? [])],
  };
  const sliceDigest = canonicalDigest(sliceWithoutDigest);
  const slice: ContextSlice = { ...sliceWithoutDigest, sliceDigest };
  assertSchema(CONTEXT_SLICE_SCHEMA_FILE, slice, findPackageRoot());
  return slice;
}

export function recordExpansion(expansions: ContextExpansion[], from: UpirContextRadius, to: UpirContextRadius, reason: ContextExpansionReason): ContextExpansion[] {
  if (from === to) throw new Error("RADIUS_NOOP_REJECTED");
  return [...expansions, { from, to, reason }];
}

export function validateContextSlice(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(CONTEXT_SLICE_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}
