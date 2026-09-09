import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isPathInside, toPosix } from "../lib/hash.js";
import { redactSecrets, sanitizeReviewText } from "../lib/secrets.js";
import { sanitizeOperationalText } from "../lib/safe-persist.js";
import { assertSafeRelativeProjectPath } from "./safe-path.js";
import type { FailureClass, FailureSource, FailingTest, StackFrame } from "./failure-types.js";

const NODE_FRAME = /(?:^|\n)\s*at\s+(?:(.*?)\s+\()?((?:[A-Za-z]:)?[^()\n]+):(\d+):(\d+)\)?/g;
const TSC_FRAME = /(.*?)\((\d+),(\d+)\):\s+error\s+(TS\d+)/gi;
const GENERIC_FRAME = /(?:^|[\s"'=(])((?:[A-Za-z]:)?[^\s"'():]+?\.(?:tsx?|jsx?|mjs|cjs|mts|cts)):(\d+)(?::(\d+))?/g;
const VITEST_FAIL = /^FAIL\s+(\S+\.(?:test|spec)\.(?:tsx?|jsx?|mjs|cjs))\s*(?:>\s*(.+))?$/gim;
const VITEST_POINTER = /[❯>]\s+(\S+\.(?:test|spec)\.(?:tsx?|jsx?|mjs|cjs)):(\d+)(?::(\d+))?/g;

export type NormalizedFailureText = {
  messageSummary: string;
  stackFrames: StackFrame[];
  failingTests: FailingTest[];
  failureClass: FailureClass;
  sanitization: { redacted: boolean; kinds: string[] };
};

function existsInRepo(repoRoot: string, relative: string): boolean {
  try {
    return fs.existsSync(path.resolve(repoRoot, relative));
  } catch {
    return false;
  }
}

export function toEvidencePath(repoRoot: string, raw: string, indexed: Set<string>): string | null {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed) return null;
  try {
    if (path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || raw.startsWith("\\\\")) {
      const abs = path.resolve(raw);
      if (!isPathInside(repoRoot, abs)) return null;
      const rel = assertSafeRelativeProjectPath(toPosix(path.relative(repoRoot, abs)));
      return existsInRepo(repoRoot, rel) || indexed.has(rel) ? rel : null;
    }
    const rel = assertSafeRelativeProjectPath(trimmed.replace(/^\.\//, ""));
    return existsInRepo(repoRoot, rel) || indexed.has(rel) ? rel : null;
  } catch {
    return null;
  }
}

function classifyFailure(source: FailureSource, text: string): FailureClass {
  if (/\bTS\d{3,5}\b/.test(text) || source === "typecheck") return "type";
  if (source === "lint" || /\beslint\b/i.test(text)) return "lint";
  if (source === "build" || /\berror TS\b/.test(text)) return "compile";
  if (/\btimeout\b/i.test(text)) return "timeout";
  if (source === "test" || /\bAssertionError\b|\bexpect\(/.test(text)) return "assertion";
  if (/\bError:|\bat\s+\S+\s+\(/.test(text)) return "exception";
  if (source === "gate" || source === "manual-evidence") return "command";
  return "unknown";
}

function pushFrame(out: StackFrame[], frame: StackFrame): void {
  if (!frame.inRepo || !frame.path) return;
  if (out.some((item) => item.path === frame.path && item.line === frame.line && item.functionName === frame.functionName)) {
    return;
  }
  out.push(frame);
}

export function normalizeFailureText(input: {
  repoRoot: string;
  text: string;
  source: FailureSource;
  indexed?: Set<string>;
}): NormalizedFailureText {
  const indexed = input.indexed ?? new Set<string>();
  const secrets = redactSecrets(input.text);
  const hostSanitized = sanitizeReviewText(secrets.text, [input.repoRoot, os.homedir()]);
  const working = hostSanitized.omit ? "[REDACTED:unsanitizable-failure-text]" : hostSanitized.text;
  const frames: StackFrame[] = [];
  const tests: FailingTest[] = [];
  const parseSource = input.text;

  for (const match of parseSource.matchAll(new RegExp(NODE_FRAME.source, "g"))) {
    const functionName = (match[1] ?? "").trim() || null;
    const fileRaw = match[2] ?? "";
    if (/^node:/.test(fileRaw) || fileRaw.includes("node_modules")) continue;
    const rel = toEvidencePath(input.repoRoot, fileRaw, indexed);
    pushFrame(frames, {
      path: rel,
      line: Number(match[3]) || null,
      column: Number(match[4]) || null,
      functionName: functionName ? sanitizeOperationalText(functionName) : null,
      inRepo: Boolean(rel),
    });
  }
  for (const match of parseSource.matchAll(new RegExp(TSC_FRAME.source, "gi"))) {
    const rel = toEvidencePath(input.repoRoot, match[1] ?? "", indexed);
    pushFrame(frames, {
      path: rel,
      line: Number(match[2]) || null,
      column: Number(match[3]) || null,
      functionName: match[4] ? sanitizeOperationalText(match[4]) : null,
      inRepo: Boolean(rel),
    });
  }
  for (const match of parseSource.matchAll(new RegExp(VITEST_FAIL.source, "gim"))) {
    const file = toEvidencePath(input.repoRoot, match[1] ?? "", indexed);
    const title = (match[2] ?? "").trim() || null;
    if (!file && !title) continue;
    const id = sanitizeOperationalText(`${file ?? match[1] ?? "test"}${title ? `::${title}` : ""}`);
    if (!tests.some((item) => item.id === id)) {
      tests.push({ id, file, title: title ? sanitizeOperationalText(title) : null });
    }
  }
  for (const match of parseSource.matchAll(new RegExp(VITEST_POINTER.source, "g"))) {
    const file = toEvidencePath(input.repoRoot, match[1] ?? "", indexed);
    if (file && !tests.some((item) => item.file === file)) {
      tests.push({ id: file, file, title: null });
    }
    if (file) {
      pushFrame(frames, {
        path: file,
        line: Number(match[2]) || null,
        column: Number(match[3]) || null,
        functionName: null,
        inRepo: true,
      });
    }
  }
  if (frames.length === 0) {
    for (const match of parseSource.matchAll(new RegExp(GENERIC_FRAME.source, "g"))) {
      const rel = toEvidencePath(input.repoRoot, match[1] ?? "", indexed);
      if (!rel) continue;
      pushFrame(frames, {
        path: rel,
        line: Number(match[2]) || null,
        column: Number(match[3]) || null,
        functionName: null,
        inRepo: true,
      });
    }
  }

  const kinds = new Set<string>([...secrets.kinds, ...hostSanitized.kinds]);
  if (/\[REDACTED-(?:PATH|HOME|UNC)\]/.test(working)) kinds.add("host-path");
  const summary = sanitizeOperationalText(working.replace(/\s+/g, " ").trim()).slice(0, 400);
  return {
    messageSummary: summary || "(empty failure text)",
    stackFrames: frames.slice(0, 40),
    failingTests: tests.slice(0, 40),
    failureClass: classifyFailure(input.source, working),
    sanitization: {
      redacted: secrets.redactionCount > 0 || hostSanitized.redactionCount > 0 || kinds.has("host-path"),
      kinds: [...kinds],
    },
  };
}
