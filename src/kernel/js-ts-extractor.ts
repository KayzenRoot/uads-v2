import path from "node:path";
import type { ExtractedReference, LanguageExtractor } from "./intelligence-types.js";
import { JS_TS_EXTRACTOR_ID, JS_TS_EXTRACTOR_VERSION } from "./intelligence-types.js";
import { toPosix } from "../lib/hash.js";
import { isRelativeProjectPath } from "./safe-path.js";
import { maskNonCodeJsTs } from "./js-ts-lex.js";

const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const RESOLVE_EXT = [...SOURCE_EXT, ".json", ".d.ts"];

const IMPORT_FROM = /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s+["']([^"']+)["']/g;
const EXPORT_FROM = /\bexport\s+(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g;
const CJS_REQUIRE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_IMPORT_NONLITERAL = /\bimport\s*\(\s*(?!["'`])/;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function pushUnique(
  out: ExtractedReference[],
  item: ExtractedReference,
): void {
  if (out.some((existing) => existing.specifier === item.specifier && existing.method === item.method && existing.line === item.line)) {
    return;
  }
  out.push(item);
}

function originalCapture(original: string, match: RegExpMatchArray, group = 1): string | null {
  const grouped = match[group];
  if (grouped === undefined || match.index === undefined) return null;
  const startInMatch = match[0].indexOf(grouped);
  if (startInMatch < 0) return null;
  const captured = original.slice(match.index + startInMatch, match.index + startInMatch + grouped.length).trim();
  return captured || null;
}

function matchesOf(pattern: RegExp, text: string) {
  return text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
}

export function extractJsTsReferences(relativePath: string, text: string): ExtractedReference[] {
  const cleaned = maskNonCodeJsTs(text);
  const out: ExtractedReference[] = [];

  for (const match of matchesOf(EXPORT_FROM, cleaned)) {
    const specifier = originalCapture(text, match);
    if (!specifier) continue;
    pushUnique(out, {
      specifier,
      type: "imports",
      method: "export-from",
      confidence: 0.9,
      evidence: `export ... from ${specifier}`,
      line: lineOf(cleaned, match.index ?? 0),
    });
  }
  for (const match of matchesOf(SIDE_EFFECT_IMPORT, cleaned)) {
    const specifier = originalCapture(text, match);
    if (!specifier) continue;
    pushUnique(out, {
      specifier,
      type: "imports",
      method: "side-effect-import",
      confidence: 0.85,
      evidence: `import ${specifier}`,
      line: lineOf(cleaned, match.index ?? 0),
    });
  }
  for (const match of matchesOf(IMPORT_FROM, cleaned)) {
    const specifier = originalCapture(text, match);
    if (!specifier) continue;
    pushUnique(out, {
      specifier,
      type: "imports",
      method: "static-import",
      confidence: 0.9,
      evidence: `import from ${specifier}`,
      line: lineOf(cleaned, match.index ?? 0),
    });
  }
  for (const match of matchesOf(CJS_REQUIRE, cleaned)) {
    const specifier = originalCapture(text, match);
    if (!specifier) continue;
    pushUnique(out, {
      specifier,
      type: "requires",
      method: "cjs-require",
      confidence: 0.8,
      evidence: `require(${specifier})`,
      line: lineOf(cleaned, match.index ?? 0),
    });
  }
  for (const match of matchesOf(DYNAMIC_IMPORT, cleaned)) {
    const specifier = originalCapture(text, match);
    if (!specifier) continue;
    pushUnique(out, {
      specifier,
      type: "dynamic-import",
      method: "dynamic-import-literal",
      confidence: 0.7,
      evidence: `import(${specifier})`,
      line: lineOf(cleaned, match.index ?? 0),
    });
  }
  for (const match of matchesOf(DYNAMIC_IMPORT_NONLITERAL, cleaned)) {
    pushUnique(out, {
      specifier: "(computed)",
      type: "dynamic-import",
      method: "dynamic-import-computed",
      confidence: 0.2,
      evidence: "non-literal import() is not statically resolved",
      resolved: false,
      line: lineOf(cleaned, match.index ?? 0),
    });
  }

  void relativePath;
  return out;
}

export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

export function resolveRelativeModule(
  fromFile: string,
  specifier: string,
  existing: Set<string>,
): string | null {
  if (!isRelativeSpecifier(specifier)) {
    return null;
  }
  const fromDir = path.posix.dirname(fromFile);
  const joined = toPosix(path.posix.normalize(path.posix.join(fromDir, specifier)));
  if (!isRelativeProjectPath(joined) && joined !== path.posix.basename(joined)) {
    if (joined.startsWith("../") || joined === "..") {
      return null;
    }
  }
  const candidates: string[] = [joined];
  for (const ext of RESOLVE_EXT) {
    candidates.push(`${joined}${ext}`);
  }
  for (const ext of RESOLVE_EXT) {
    candidates.push(`${joined}/index${ext}`);
  }
  if (/\.(js|mjs|cjs)$/i.test(joined)) {
    candidates.push(joined.replace(/\.jsx?$/i, ".ts"), joined.replace(/\.jsx?$/i, ".tsx"), joined.replace(/\.mjs$/i, ".mts"), joined.replace(/\.cjs$/i, ".cts"));
  }
  for (const candidate of candidates) {
    const posix = toPosix(candidate).replace(/^\.\//, "");
    if (existing.has(posix)) {
      return posix;
    }
  }
  return null;
}

export const jsTsExtractor: LanguageExtractor = {
  id: JS_TS_EXTRACTOR_ID,
  version: JS_TS_EXTRACTOR_VERSION,
  match(relativePath: string): boolean {
    const ext = path.posix.extname(toPosix(relativePath)).toLowerCase();
    return SOURCE_EXT.includes(ext);
  },
  extract(input: { path: string; text: string }): ExtractedReference[] {
    return extractJsTsReferences(input.path, input.text);
  },
};

export const languageExtractors: LanguageExtractor[] = [jsTsExtractor];

export function extractorFor(relativePath: string): LanguageExtractor | null {
  return languageExtractors.find((extractor) => extractor.match(relativePath)) ?? null;
}
