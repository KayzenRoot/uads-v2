/**
 * Deterministic JS/TS lexical masker. Comments, string literals, template
 * text, and regex bodies are replaced with spaces while newlines (and
 * `${ ... }` interpolations) are preserved so line numbers and executable
 * dependency syntax stay aligned.
 */
const IDENT = /[A-Za-z0-9_$]/;
const KEYWORDS_BEFORE_REGEX = new Set([
  "return",
  "throw",
  "typeof",
  "delete",
  "void",
  "case",
  "else",
  "in",
  "of",
  "new",
  "await",
  "yield",
  "instanceof",
]);

function spaceChar(ch: string): string {
  return ch === "\n" || ch === "\r" ? ch : " ";
}

function isIdentPart(ch: string): boolean {
  return IDENT.test(ch);
}

export function maskNonCodeJsTs(source: string): string {
  const out: string[] = new Array(source.length);
  let i = 0;
  let lastSignificant = "";
  let lastIdent = "";

  const peek = (offset = 0): string => source[i + offset] ?? "";

  const writeMasked = (from: number, to: number): void => {
    for (let k = from; k < to; k += 1) {
      out[k] = spaceChar(source[k] ?? " ");
    }
  };

  const copyCode = (ch: string): void => {
    out[i] = ch;
    if (!/\s/.test(ch)) {
      lastSignificant = ch;
      if (isIdentPart(ch)) {
        lastIdent += ch;
      } else {
        lastIdent = "";
      }
    }
    i += 1;
  };

  const regexLikely = (): boolean => {
    if (!lastSignificant) return true;
    if ("({[,;:?!~&|^=+-*%<>".includes(lastSignificant)) return true;
    if (lastSignificant === "}" || lastSignificant === ")") return false;
    return KEYWORDS_BEFORE_REGEX.has(lastIdent);
  };

  const maskLineComment = (): void => {
    const start = i;
    while (i < source.length && source[i] !== "\n" && source[i] !== "\r") i += 1;
    writeMasked(start, i);
  };

  const maskBlockComment = (): void => {
    const start = i;
    i += 2;
    while (i < source.length && !(source[i] === "*" && peek(1) === "/")) {
      i += 1;
    }
    if (i < source.length) i += 2;
    writeMasked(start, i);
  };

  const maskQuoted = (quote: "'" | '"'): void => {
    out[i] = quote;
    i += 1;
    const start = i;
    while (i < source.length) {
      const ch = source[i] ?? "";
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) break;
      if (ch === "\n" || ch === "\r") break;
      i += 1;
    }
    writeMasked(start, i);
    if (source[i] === quote) {
      out[i] = quote;
      i += 1;
    }
    lastSignificant = quote;
    lastIdent = "";
  };

  const maskRegex = (): void => {
    out[i] = "/";
    i += 1;
    const start = i;
    let inClass = false;
    while (i < source.length) {
      const ch = source[i] ?? "";
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "[" && !inClass) {
        inClass = true;
        i += 1;
        continue;
      }
      if (ch === "]" && inClass) {
        inClass = false;
        i += 1;
        continue;
      }
      if (ch === "/" && !inClass) {
        break;
      }
      if (ch === "\n" || ch === "\r") break;
      i += 1;
    }
    writeMasked(start, i);
    if (source[i] === "/") {
      out[i] = "/";
      i += 1;
    }
    while (i < source.length && /[a-zA-Z]/.test(source[i] ?? "")) {
      out[i] = source[i] ?? " ";
      i += 1;
    }
    lastSignificant = "/";
    lastIdent = "";
  };

  const maskTemplate = (): void => {
    out[i] = "`";
    i += 1;
    while (i < source.length) {
      const ch = source[i] ?? "";
      if (ch === "\\") {
        writeMasked(i, Math.min(i + 2, source.length));
        i += 2;
        continue;
      }
      if (ch === "`") {
        out[i] = "`";
        i += 1;
        lastSignificant = "`";
        lastIdent = "";
        return;
      }
      if (ch === "$" && peek(1) === "{") {
        out[i] = "$";
        out[i + 1] = "{";
        i += 2;
        maskCodeUntilBrace();
        continue;
      }
      out[i] = spaceChar(ch);
      i += 1;
    }
  };

  const maskCodeUntilBrace = (): void => {
    let depth = 1;
    while (i < source.length && depth > 0) {
      const ch = source[i] ?? "";
      const next = peek(1);
      if (ch === "'" || ch === '"') {
        maskQuoted(ch);
        continue;
      }
      if (ch === "`") {
        maskTemplate();
        continue;
      }
      if (ch === "/" && next === "/") {
        maskLineComment();
        continue;
      }
      if (ch === "/" && next === "*") {
        maskBlockComment();
        continue;
      }
      if (ch === "/" && regexLikely()) {
        maskRegex();
        continue;
      }
      if (ch === "{") {
        depth += 1;
        copyCode(ch);
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          out[i] = "}";
          i += 1;
          lastSignificant = "}";
          lastIdent = "";
          return;
        }
        copyCode(ch);
        continue;
      }
      copyCode(ch);
    }
  };

  while (i < source.length) {
    const ch = source[i] ?? "";
    const next = peek(1);
    if (ch === "'" || ch === '"') {
      maskQuoted(ch);
      continue;
    }
    if (ch === "`") {
      maskTemplate();
      continue;
    }
    if (ch === "/" && next === "/") {
      maskLineComment();
      continue;
    }
    if (ch === "/" && next === "*") {
      maskBlockComment();
      continue;
    }
    if (ch === "/" && regexLikely()) {
      maskRegex();
      continue;
    }
    copyCode(ch);
  }

  return out.map((ch) => ch ?? " ").join("");
}

export function hasJsTsExportBoundary(text: string): boolean {
  return /^\s*export(\s|{|\*|=)/m.test(maskNonCodeJsTs(text));
}
