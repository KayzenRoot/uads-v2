import { sha256Hex } from "../lib/hash.js";
import { sanitizeOperationalText } from "../lib/safe-persist.js";
import type { FailureClass, FailureSource, FailingTest, StackFrame } from "./failure-types.js";

const VOLATILE = /\d{4}-\d{2}-\d{2}T[\d:.Z+-]+|\b\d{10,13}\b|:\d+(?::\d+)?/g;

function stableTokens(summary: string): string {
  return sanitizeOperationalText(summary)
    .replace(VOLATILE, " ")
    .replace(/\b[A-Za-z]:\\[^\s]+/g, " ")
    .replace(/\/(?:home|Users)\/[^\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function computeFailureSignature(input: {
  source: FailureSource;
  command: string | null;
  failureClass: FailureClass;
  stackFrames: StackFrame[];
  failingTests: FailingTest[];
  messageSummary: string;
}): string {
  const frames = input.stackFrames
    .filter((frame) => frame.inRepo && frame.path)
    .map((frame) => frame.path)
    .sort((a, b) => (a ?? "").localeCompare(b ?? ""));
  const tests = input.failingTests.map((item) => item.id).sort((a, b) => a.localeCompare(b));
  const command = input.command ? sanitizeOperationalText(input.command).replace(VOLATILE, " ").trim() : "";
  const codes = [...new Set((input.messageSummary.match(/\b(?:TS|E)\d{3,5}\b/g) ?? []).sort())];
  return sha256Hex(
    JSON.stringify({
      source: input.source,
      command,
      failureClass: input.failureClass,
      frames,
      tests,
      codes,
      tokens: stableTokens(input.messageSummary),
    }),
  );
}
