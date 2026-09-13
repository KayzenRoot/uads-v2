import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { redactSecrets } from "../lib/secrets.js";
import { findPackageRoot } from "../lib/version.js";
import { canonicalDigest, normalizeRepoRelativePath } from "./upir.js";
import { type ContextExpansion, type ContextExpansionReason } from "./context-radius.js";
import type { UpirContextRadius } from "./upir.js";

export const CONTEXT_COMPILER_VERSION = "1.0.0" as const;
export const CONTEXT_PRODUCER_VERSION = "gef-context-compiler/1.0.0+regex-ts/1.0.0" as const;
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
  maxFilesScanned?: number;
  maxExcerptChars?: number;
};

const SYMBOL_DECLARATION = /(^|\n)\s*(export\s+)?(async\s+)?(function|class|interface|type|enum)\s+([A-Za-z0-9_]+)|(^|\n)\s*export\s+(const|let|var)\s+([A-Za-z0-9_]+)/g;
const IMPORT_LINE = /^\s*import\s+[^;]+from\s+["']([^"']+)["'];?\s*$/;

function listTypeScriptFiles(repoRoot: string, limit: number): string[] {
  const out: string[] = [];
  const visit = (directory: string): void => {
    if (out.length >= limit) return;
    let names: string[];
    try {
      names = fs.readdirSync(directory).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (out.length >= limit) return;
      if (name === "node_modules" || name === ".git" || name === "dist") continue;
      const candidate = path.join(directory, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(candidate);
      } catch {
        continue;
      }
      if (stat.isDirectory()) visit(candidate);
      else if (stat.isFile() && (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".js"))) {
        out.push(candidate);
      }
    }
  };
  visit(repoRoot);
  return out.sort();
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
  const start = Math.max(0, (match.index ?? 0) - 1);
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

function directDependencies(content: string): string[] {
  const deps: string[] = [];
  for (const line of content.split("\n")) {
    const match = IMPORT_LINE.exec(line.trim());
    if (match?.[1]) deps.push(match[1].slice(0, 300));
  }
  return deps.slice(0, 32);
}

export function compileContext(input: CompileContextInput): ContextSlice {
  if (input.targetSymbols.length === 0 || input.targetSymbols.length > 32) throw new Error("CONTEXT_TARGET_BOUND_REJECTED");
  if ((input.expansions ?? []).length > 8) throw new Error("CONTEXT_EXPANSION_BOUND_REJECTED");
  const files = listTypeScriptFiles(input.repoRoot, input.maxFilesScanned ?? 200);
  const entries: ContextSliceEntry[] = [];
  const fileContents = new Map<string, string>();
  const readCached = (absolute: string): string | null => {
    const cached = fileContents.get(absolute);
    if (cached !== undefined) return cached;
    try {
      const content = safeReadText(absolute, 200000);
      fileContents.set(absolute, content);
      return content;
    } catch {
      return null;
    }
  };
  for (const symbol of input.targetSymbols) {
    let placed = false;
    const declarationCandidates: string[] = [];
    const fallbackCandidates: string[] = [];
    for (const absolute of files) {
      const content = readCached(absolute);
      if (!content || !content.includes(symbol)) continue;
      const block = extractSymbolBlock(content, symbol);
      if (block.found) declarationCandidates.push(absolute);
      else fallbackCandidates.push(absolute);
    }
    const ordered = [...declarationCandidates, ...fallbackCandidates];
    for (const absolute of ordered) {
      const content = readCached(absolute);
      if (!content) continue;
      const relative = normalizeRepoRelativePath(path.relative(input.repoRoot, absolute));
      const block = extractSymbolBlock(content, symbol);
      const redactedExcerpt = redactSecrets(block.excerpt).text.slice(0, input.maxExcerptChars ?? 4000);
      const isTestFile = relative.endsWith(".test.ts") || relative.endsWith(".test.tsx") || relative.endsWith(".spec.ts");
      if (input.radius === "C0" && isTestFile && block.found === false) continue;
      const contentDigest = sha256Hex(content);
      const relatedTests = files
        .filter((candidate) => candidate.endsWith(".test.ts") || candidate.endsWith(".spec.ts"))
        .filter((candidate) => {
          try {
            return safeReadText(candidate, 60000).includes(symbol);
          } catch {
            return false;
          }
        })
        .map((candidate) => normalizeRepoRelativePath(path.relative(input.repoRoot, candidate)))
        .slice(0, 32);
      const entry: ContextSliceEntry = {
        path: relative,
        symbol,
        kind: block.found ? block.kind : "file",
        contentDigest,
        signatures: block.found && block.signature ? [block.signature] : [],
        dependencies: directDependencies(content),
        tests: input.radius === "C0" ? relatedTests.slice(0, 4) : relatedTests,
        invariants: [...(input.invariants ?? [])].slice(0, 16),
        fallback: !block.found,
        excerpt: redactedExcerpt.length > 0 ? redactedExcerpt : undefined,
      };
      entries.push(entry);
      placed = true;
      if (input.radius === "C0") break;
      if (input.radius === "C1" && entries.filter((item) => item.symbol === symbol).length >= 2) break;
      break;
    }
    if (!placed) throw new Error(`CONTEXT_SYMBOL_NOT_FOUND:${symbol}`);
  }
  const expansions: ContextExpansion[] = [...(input.expansions ?? [])];
  const sliceWithoutDigest = {
    schemaVersion: "0.1.0" as const,
    taskId: input.taskId,
    radius: input.radius,
    compilerVersion: CONTEXT_COMPILER_VERSION,
    producerVersion: CONTEXT_PRODUCER_VERSION,
    toolchainBasis: CONTEXT_TOOLCHAIN_BASIS,
    entries: entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : left.symbol < right.symbol ? -1 : 1)),
    expansions,
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
