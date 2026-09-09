import { redactSecrets } from "./secrets.js";

export function sanitizeOperationalText(value: string): string {
  const result = redactSecrets(value);
  if (result.omit) {
    return "[REDACTED:unsanitizable-operational-text]";
  }
  return result.text;
}

export function sanitizeOperationalList(values: string[]): string[] {
  return values.map((item) => sanitizeOperationalText(item));
}

export function sanitizeOperationalValue<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeOperationalText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeOperationalValue(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeOperationalValue(nested);
    }
    return out as T;
  }
  return value;
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return sanitizeOperationalText(raw);
}
