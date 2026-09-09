import { stripCredentialUrls } from "./sanitize-url.js";

export type SecretKind =
  | "private-key"
  | "github-token"
  | "aws-access-key"
  | "stripe-live-key"
  | "jwt"
  | "slack-token"
  | "google-api-key";

export type RedactionResult = {
  text: string;
  redactionCount: number;
  omit: boolean;
  kinds: SecretKind[];
};

const PLACEHOLDER =
  /\b(example|changeme|placeholder|dummy|fake|sample|your[-_]?[a-z0-9]+|xxx+|insert[-_]?key|test[-_]?key)\b/i;

export const SECRET_PATTERNS: Array<{ kind: SecretKind; regex: RegExp }> = [
  {
    kind: "private-key",
    regex:
      /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]{0,40}PRIVATE KEY-----/g,
  },
  { kind: "github-token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g },
  { kind: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "stripe-live-key", regex: /\bsk_live_[A-Za-z0-9]{16,}\b/g },
  { kind: "jwt", regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
  { kind: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
];

export function isPlaceholderSecret(value: string): boolean {
  const trimmed = value.trim();
  if (/^\$\{?[A-Z0-9_]+\}?$/.test(trimmed)) {
    return true;
  }
  return PLACEHOLDER.test(trimmed);
}

export function redactSecrets(input: string): RedactionResult {
  let text = stripCredentialUrls(input);
  let redactionCount = 0;
  const kinds = new Set<SecretKind>();

  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    text = text.replace(regex, (match) => {
      if (pattern.kind !== "private-key" && isPlaceholderSecret(match)) {
        return match;
      }
      redactionCount += 1;
      kinds.add(pattern.kind);
      return `[REDACTED:${pattern.kind}]`;
    });
  }

  const omit = shouldOmit(text, redactionCount, kinds);
  return { text, redactionCount, omit, kinds: [...kinds] };
}

function shouldOmit(text: string, redactionCount: number, kinds: Set<SecretKind>): boolean {
  if (redactionCount === 0) {
    return false;
  }
  if (redactionCount > 20) {
    return true;
  }
  if (kinds.has("private-key")) {
    const remaining = text.replace(/\[REDACTED:[a-z-]+\]/g, "").trim();
    if (remaining.length < 40) {
      return true;
    }
  }
  return false;
}

const WINDOWS_DRIVE_PATH =
  /(?<![A-Za-z])[A-Za-z]:(?:\\[^\n\r"'<>|*?]+|\/(?!\/)[^\n\r"'<>|*?]*)/g;
const UNIX_HOME_PATH = /(?:^|[\s"'=(])(\/(?:home|Users)\/[A-Za-z0-9._-]+(?:\/[^\n\r"'<>|*?]*)?)/g;
const UNC_BACKSLASH = /\\\\[A-Za-z0-9._-]+\\[A-Za-z0-9._$-]+(?:\\[^\n\r"'<>|*?]*)?/g;
const UNC_SLASH = /(?:^|[\s"'=(])(\/\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+[^\n\r"'<>|*?]*)/g;
const FILE_URL_PATH = /file:\/\/\/[A-Za-z]:[^\n\r"'<>|*?\s]*/gi;

export function hostPathVariants(absPath: string): string[] {
  const trimmed = absPath.trim();
  if (trimmed.length < 4) {
    return [];
  }

  const posix = trimmed.replace(/\\/g, "/");
  const win = trimmed.replace(/\//g, "\\");
  const variants = new Set<string>();

  const add = (value: string): void => {
    if (value.length < 4) {
      return;
    }
    variants.add(value);
    if (value.includes(" ")) {
      variants.add(value.replace(/ /g, "%20"));
    }
  };

  add(trimmed);
  add(posix);
  add(win);

  const drive = /^([A-Za-z]):/.exec(posix);
  if (drive?.[1]) {
    const letter = drive[1];
    const rest = posix.slice(2);
    for (const cased of [letter.toUpperCase(), letter.toLowerCase()]) {
      add(`${cased}:${rest}`);
      add(`${cased}:${rest.replace(/\//g, "\\")}`);
      add(`file:///${cased}:${rest}`);
      add(`file:///${cased}:${rest}`.replace(/ /g, "%20"));
    }
  } else if (posix.startsWith("/")) {
    add(`file://${posix}`);
  }

  return [...variants].sort((a, b) => b.length - a.length);
}

export function redactKnownHostPaths(text: string, hostPaths: string[]): string {
  let out = text;
  const variants = hostPaths.flatMap((hostPath) => hostPathVariants(hostPath));
  for (const variant of variants) {
    if (!variant) {
      continue;
    }
    out = out.split(variant).join("[REDACTED-PATH]");
  }
  return out;
}

export function redactHostPaths(text: string): string {
  let out = text;
  out = out.replace(FILE_URL_PATH, "[REDACTED-PATH]");
  out = out.replace(UNC_BACKSLASH, "[REDACTED-UNC]");
  out = out.replace(UNC_SLASH, (full, captured: string) => full.replace(captured, "[REDACTED-UNC]"));
  out = out.replace(UNIX_HOME_PATH, (full, captured: string) => {
    const home = captured.startsWith("/Users/") || captured.startsWith("/home/");
    return full.replace(captured, home ? "[REDACTED-HOME]" : "[REDACTED-PATH]");
  });
  out = out.replace(WINDOWS_DRIVE_PATH, (match) => {
    if (/^[A-Za-z]:(?:\\|\/)(?:Users|home)(?:\\|\/)/i.test(match)) {
      return "[REDACTED-HOME]";
    }
    return "[REDACTED-PATH]";
  });
  return out;
}

export function containsAbsoluteHostPath(text: string): boolean {
  const stripped = text
    .replace(/\[REDACTED-(?:PATH|HOME|UNC)\]/g, "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "");

  WINDOWS_DRIVE_PATH.lastIndex = 0;
  if (WINDOWS_DRIVE_PATH.test(stripped)) {
    WINDOWS_DRIVE_PATH.lastIndex = 0;
    return true;
  }
  WINDOWS_DRIVE_PATH.lastIndex = 0;

  UNC_BACKSLASH.lastIndex = 0;
  if (UNC_BACKSLASH.test(stripped)) {
    UNC_BACKSLASH.lastIndex = 0;
    return true;
  }
  UNC_BACKSLASH.lastIndex = 0;

  if (/(?:^|[\s"'=(])\/(?:home|Users)\/[A-Za-z0-9._-]+/.test(stripped)) {
    return true;
  }
  if (/(?:^|[\s"'=(])\/\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/.test(stripped)) {
    return true;
  }
  return /file:\/\/\/[A-Za-z]:/i.test(stripped);
}

export function containsUnredactedSecret(text: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const matches = text.match(regex) ?? [];
    for (const match of matches) {
      if (pattern.kind === "private-key" || !isPlaceholderSecret(match)) {
        return true;
      }
    }
  }
  return false;
}

export function sanitizeReviewText(input: string, hostPaths: string[] = []): RedactionResult {
  const known = redactKnownHostPaths(input, hostPaths);
  const pathRedacted = redactHostPaths(known);
  return redactSecrets(pathRedacted);
}

export function containsForbiddenLeak(haystack: string, needle: string): boolean {
  if (!needle) {
    return false;
  }
  return haystack.includes(needle);
}
