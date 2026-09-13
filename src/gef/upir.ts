import { sha256Hex } from "../lib/hash.js";
import { assertSchema, validateAgainstSchema } from "../lib/json-schema.js";
import { findPackageRoot } from "../lib/version.js";

export const UPIR_SCHEMA_VERSION = "0.1.0" as const;
export const UPIR_SCHEMA_FILE = "gef-upir.schema.json" as const;

export type UpirTaskClass = "T0" | "T1" | "T2" | "T3";
export type UpirContextRadius = "C0" | "C1" | "C2" | "C3" | "C4";

export type UpirBudgets = {
  maxRepositorySearches: number;
  maxExtraFilesOpened: number;
  maxSourceFilesChanged: number;
  maxTestFilesChanged: number;
  maxSemanticLOC: number;
  retryBudget: number;
  targetInputTokens?: number | null;
  targetOutputTokens?: number | null;
  targetActiveSeconds?: number | null;
};

export type Upir = {
  schemaVersion: typeof UPIR_SCHEMA_VERSION;
  taskId: string;
  projectFingerprint: string;
  workOrder: string;
  taskClass: UpirTaskClass;
  contextRadius: UpirContextRadius;
  baseSha: string;
  reviewedHeadSha: string | null;
  goal: string;
  acceptedFindings: string[];
  openFindings: string[];
  targetSymbols: string[];
  frozenInvariants: string[];
  requiredProofs: string[];
  budgets: UpirBudgets;
  stopConditions: string[];
  digest: string;
};

export type UpirInput = Omit<Upir, "digest">;

const SAFE_TASK_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function assertSafeTaskId(taskId: string): void {
  if (!SAFE_TASK_ID.test(taskId) || taskId.includes("..") || taskId.includes("/") || taskId.includes("\\")) {
    throw new Error("TASK_ID_TRAVERSAL_REJECTED");
  }
}

export function normalizeRepoRelativePath(input: string): string {
  const withSlashes = input.replace(/\\/g, "/").trim();
  if (withSlashes.length === 0 || withSlashes.length > 300) throw new Error("PATH_BOUND_REJECTED");
  if (withSlashes.startsWith("/") || /^[A-Za-z]:\//.test(withSlashes) || withSlashes.startsWith("file:")) {
    throw new Error("ABSOLUTE_PATH_REJECTED");
  }
  const segments = withSlashes.split("/").filter((part) => part.length > 0);
  const normalized: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") throw new Error("PATH_TRAVERSAL_REJECTED");
    if (segment.length > 120) throw new Error("PATH_SEGMENT_BOUND_REJECTED");
    normalized.push(segment);
  }
  if (normalized.length === 0) throw new Error("PATH_EMPTY_REJECTED");
  const result = normalized.join("/");
  if (result.startsWith("..")) throw new Error("PATH_TRAVERSAL_REJECTED");
  return result;
}

export function normalizeRepoRelativePathDeterministic(windowsPath: string, posixPath: string): { fromWindows: string; fromPosix: string; equal: boolean } {
  const fromWindows = normalizeRepoRelativePath(windowsPath);
  const fromPosix = normalizeRepoRelativePath(posixPath);
  return { fromWindows, fromPosix, equal: fromWindows === fromPosix };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function canonicalDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function computeUpirDigest(input: UpirInput & { digest?: string }): string {
  const { digest: _omitted, ...rest } = input;
  void _omitted;
  return canonicalDigest(rest);
}

export function validateUpir(data: unknown, schemaRoot?: string): string[] {
  return validateAgainstSchema(UPIR_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
}

export function assertUpir(data: unknown, schemaRoot?: string): asserts data is Upir {
  assertSchema(UPIR_SCHEMA_FILE, data, schemaRoot ?? findPackageRoot());
  const record = data as Upir;
  assertSafeTaskId(record.taskId);
  const expected = computeUpirDigest({ ...record, digest: record.digest });
  if (expected !== record.digest) throw new Error("UPIR_DIGEST_MISMATCH");
}

export function buildUpir(input: UpirInput, schemaRoot?: string): Upir {
  assertSafeTaskId(input.taskId);
  for (const target of input.targetSymbols) {
    if (target.length === 0 || target.length > 200) throw new Error("UPIR_TARGET_SYMBOL_BOUND_REJECTED");
  }
  const digest = computeUpirDigest(input);
  const candidate: Upir = { ...input, digest };
  const errors = validateUpir(candidate, schemaRoot);
  if (errors.length > 0) throw new Error(`UPIR_SCHEMA_REJECTED: ${errors.join("; ")}`);
  const recomputed = computeUpirDigest(candidate);
  if (recomputed !== digest) throw new Error("UPIR_DIGEST_MISMATCH");
  return candidate;
}
