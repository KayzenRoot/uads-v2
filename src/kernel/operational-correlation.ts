import { sha256Hex } from "../lib/hash.js";
import { redactHostPaths } from "../lib/secrets.js";
import { sanitizeOperationalText } from "../lib/safe-persist.js";

export const SAFE_CORRELATION_TOKEN = /^[A-Za-z0-9._:-]{1,128}$/;
export const MAX_CORRELATION_ID_LENGTH = 48;

export const PSCF_REASON_CODES = {
  opaque: "OPAQUE_CORRELATION_ID",
  sanitized: "LABEL_SANITIZED",
  truncated: "LABEL_LENGTH_BOUNDED",
  replaced: "UNSAFE_LABEL_REPLACED",
  empty: "LABEL_MISSING",
} as const;

export function isSafeCorrelationToken(value: string): boolean {
  return SAFE_CORRELATION_TOKEN.test(value);
}

/**
 * Deterministic opaque correlation identifier.
 *
 * Parts are hashed and truncated; the raw values never appear in the id and the
 * result stays within a fixed bounded length.
 */
export function buildOpaqueCorrelationId(
  parts: ReadonlyArray<string | null | undefined>,
  options: { prefix?: string } = {},
): string {
  const prefix = options.prefix ?? "corr-";
  const normalized = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join("\u0000");
  const digest = sha256Hex(normalized.length > 0 ? normalized : "unbound");
  return `${prefix}${digest.slice(0, 32)}`.slice(0, MAX_CORRELATION_ID_LENGTH);
}

export type CorrelationLabelResult = {
  value: string;
  sanitized: boolean;
  reasonCode: string | null;
};

function stripControlCharacters(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Correlation labels are opaque, bounded and sanitized. A value that cannot be
 * reduced to a safe token is replaced by a deterministic opaque label rather
 * than persisted as free text.
 */
export function sanitizeCorrelationLabel(value: string, maxLength = 128): CorrelationLabelResult {
  const boundedMax = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 128;
  const stripped = stripControlCharacters(sanitizeOperationalText(String(value ?? "")));
  if (stripped.length === 0) {
    return { value: "label-unknown", sanitized: true, reasonCode: PSCF_REASON_CODES.empty };
  }
  const pathRedacted = redactHostPaths(stripped);
  if (!isSafeCorrelationToken(pathRedacted)) {
    return {
      value: `label-${sha256Hex(pathRedacted).slice(0, 12)}`,
      sanitized: true,
      reasonCode: PSCF_REASON_CODES.replaced,
    };
  }
  if (pathRedacted.length > boundedMax) {
    return {
      value: pathRedacted.slice(0, boundedMax),
      sanitized: true,
      reasonCode: PSCF_REASON_CODES.truncated,
    };
  }
  return { value: pathRedacted, sanitized: false, reasonCode: null };
}

/**
 * Operator display labels may contain human-readable text, but secrets and
 * sensitive host paths are always redacted and output stays bounded.
 */
export function sanitizeDisplayLabel(value: string, maxLength = 160): CorrelationLabelResult {
  const boundedMax = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 160;
  const stripped = stripControlCharacters(sanitizeOperationalText(String(value ?? "")));
  if (stripped.length === 0) {
    return { value: "UNAVAILABLE", sanitized: true, reasonCode: PSCF_REASON_CODES.empty };
  }
  const pathRedacted = redactHostPaths(stripped);
  const text = pathRedacted.length > boundedMax ? `${pathRedacted.slice(0, boundedMax)}\u2026` : pathRedacted;
  const sanitized = text !== String(value) ;
  return { value: text, sanitized, reasonCode: sanitized ? PSCF_REASON_CODES.sanitized : null };
}