import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export const COMPARISON_MAX_PATHS = 500;
const SHA_RE = /^[0-9a-f]{40}$/i;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const SAFE_PATH_RE = /^[A-Za-z0-9._/-]+$/;
const ZERO_SHA = "0".repeat(40);

/**
 * Derive a bounded, deterministic comparison from a full-history checkout.
 * The digest covers the complete sorted path set, even when the display list is truncated.
 */
export function deriveGitComparison({ baseSha, headSha, cwd = process.cwd() } = {}) {
  const head = safeSha(headSha);
  if (!head) return unavailable(null, null, "COMPARISON_HEAD_INVALID");
  if (typeof baseSha === "string" && baseSha === ZERO_SHA) {
    return unavailable(null, head, "COMPARISON_BASE_NOT_APPLICABLE");
  }
  if (baseSha !== null && baseSha !== undefined && !safeSha(baseSha)) {
    return unavailable(null, head, "COMPARISON_BASE_INVALID");
  }
  const suppliedBase = safeSha(baseSha);
  const base = suppliedBase ?? safeSha(runGit(["rev-parse", `${head}^`], cwd));
  if (!base) return unavailable(null, head, "COMPARISON_BASE_UNAVAILABLE");
  if (!gitSucceeds(["cat-file", "-e", `${base}^{commit}`], cwd)) {
    return unavailable(base, head, "COMPARISON_BASE_UNREACHABLE");
  }
  const raw = runGitRaw(["-c", "core.quotePath=false", "diff", "--name-only", "-z", "--no-renames", `${base}...${head}`], cwd);
  if (raw === null) return unavailable(base, head, "COMPARISON_GIT_DIFF_UNAVAILABLE");
  const rawPaths = raw.split("\0").filter((item) => item.length > 0);
  const paths = rawPaths.map(safePath);
  if (paths.some((item) => item === null)) return unavailable(base, head, "COMPARISON_PATH_UNSAFE");
  const completePaths = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  const truncated = completePaths.length > COMPARISON_MAX_PATHS;
  return {
    baseSha: base,
    headSha: head,
    changedFileCount: completePaths.length,
    changedPaths: completePaths.slice(0, COMPARISON_MAX_PATHS),
    changedPathsDigest: changedPathsDigest(completePaths),
    changedPathsTruncated: truncated,
    comparisonStatus: truncated ? "truncated" : "complete",
    comparisonReasonCode: null,
  };
}

export function unavailable(baseSha, headSha, reasonCode) {
  const notApplicable = reasonCode === "COMPARISON_BASE_NOT_APPLICABLE";
  return {
    baseSha: safeSha(baseSha),
    headSha: safeSha(headSha),
    changedFileCount: null,
    changedPaths: null,
    changedPathsDigest: null,
    changedPathsTruncated: false,
    comparisonStatus: notApplicable ? "not-applicable" : "unavailable",
    comparisonReasonCode: reasonCode,
  };
}

export function changedPathsDigest(paths) {
  return crypto.createHash("sha256").update(JSON.stringify(paths)).digest("hex");
}

export function validateComparison(value, { expectedHeadSha = null, requireComplete = false } = {}) {
  const errors = [];
  const allowed = ["baseSha", "headSha", "changedFileCount", "changedPaths", "changedPathsDigest", "changedPathsTruncated", "comparisonStatus", "comparisonReasonCode"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["comparison-invalid"];
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) errors.push("comparison-additional-properties");
  if (!shaOrNull(value.baseSha) || !shaOrNull(value.headSha)) errors.push("comparison-sha-invalid");
  if (expectedHeadSha && value.headSha !== expectedHeadSha) errors.push("comparison-head-mismatch");
  if (!["complete", "truncated", "unavailable", "not-applicable"].includes(value.comparisonStatus)) errors.push("comparison-status-invalid");
  if (value.comparisonReasonCode !== null && (typeof value.comparisonReasonCode !== "string" || !/^[A-Z0-9_:-]{1,120}$/.test(value.comparisonReasonCode))) errors.push("comparison-reason-invalid");
  if (typeof value.changedPathsTruncated !== "boolean") errors.push("comparison-truncation-invalid");
  if (value.comparisonStatus === "complete" || value.comparisonStatus === "truncated") {
    if (!Number.isSafeInteger(value.changedFileCount) || value.changedFileCount < 0 || value.changedFileCount > 1_000_000) errors.push("comparison-count-invalid");
    if (!Array.isArray(value.changedPaths) || value.changedPaths.length > COMPARISON_MAX_PATHS || value.changedPaths.some((item) => !safePath(item))) errors.push("comparison-paths-invalid");
    if (!DIGEST_RE.test(value.changedPathsDigest ?? "")) errors.push("comparison-digest-invalid");
    if (value.comparisonStatus === "complete" && value.changedPathsTruncated !== false) errors.push("comparison-complete-truncated-mismatch");
    if (value.comparisonStatus === "truncated" && value.changedPathsTruncated !== true) errors.push("comparison-truncated-flag-mismatch");
    if (value.comparisonStatus === "complete" && value.changedFileCount !== value.changedPaths.length) errors.push("comparison-count-path-mismatch");
    if (value.comparisonStatus === "complete" && value.changedPathsDigest !== changedPathsDigest(value.changedPaths)) errors.push("comparison-digest-mismatch");
  } else {
    if (value.changedFileCount !== null || value.changedPaths !== null || value.changedPathsDigest !== null) errors.push("comparison-unavailable-fields-invalid");
    if (value.changedPathsTruncated !== false) errors.push("comparison-unavailable-truncation-invalid");
    if (!value.comparisonReasonCode) errors.push("comparison-reason-required");
  }
  if (requireComplete && value.comparisonStatus !== "complete" && value.comparisonStatus !== "truncated") errors.push("comparison-not-complete");
  return [...new Set(errors)];
}

function safeSha(value) { return typeof value === "string" && SHA_RE.test(value) ? value.toLowerCase() : null; }
function shaOrNull(value) { return value === null || safeSha(value) !== null; }
function safePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || !SAFE_PATH_RE.test(value)) return null;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value) || value.includes("\\") || value.includes("//")) return null;
  if (value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  return value;
}
function runGit(args, cwd) { const output = runGitRaw(args, cwd); return output === null ? null : output.trim(); }
function runGitRaw(args, cwd) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 30_000 }); } catch { return null; }
}
function gitSucceeds(args, cwd) {
  try { execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true, timeout: 30_000 }); return true; } catch { return false; }
}

if (process.argv[1] && new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href === import.meta.url) {
  const value = deriveGitComparison({ baseSha: argument("--base"), headSha: argument("--head"), cwd: argument("--cwd") ?? process.cwd() });
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exitCode = validateComparison(value).length ? 1 : 0;
}

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
