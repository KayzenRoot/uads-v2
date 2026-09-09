import path from "node:path";
import { BINARY_EXTENSIONS, EXCLUDED_DIRECTORY_NAMES } from "./constants.js";
import { toPosix } from "./hash.js";

const SOURCE_OR_DOC_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
]);

export function isExcludedDirectoryName(name: string): boolean {
  return EXCLUDED_DIRECTORY_NAMES.has(name);
}

export function isSensitiveDataFile(relativePath: string): boolean {
  const posix = toPosix(relativePath);
  const base = path.posix.basename(posix);
  const ext = path.posix.extname(base).toLowerCase();

  if (base === ".env.example") {
    return false;
  }
  if (/^\.env(\..+)?$/i.test(base)) {
    return true;
  }
  if (/\.(pem|p12|pfx|jks|keystore)$/i.test(base)) {
    return true;
  }
  if (ext === ".key") {
    return true;
  }
  if (ext === ".token") {
    return true;
  }
  if (/^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/i.test(base)) {
    return true;
  }
  if (/^(secrets|credentials)\.json$/i.test(base)) {
    return true;
  }
  return false;
}

export function shouldExcludeFromReview(relativePath: string): boolean {
  const posix = toPosix(relativePath);
  const parts = posix.split("/").filter(Boolean);

  if (parts.some((part) => isExcludedDirectoryName(part))) {
    return true;
  }

  const base = parts[parts.length - 1] ?? "";
  if (base.endsWith(".zip.sha256") || posix.includes("/reviews/")) {
    return true;
  }

  return isSensitiveDataFile(posix);
}

export function isSecretFileName(relativePath: string): boolean {
  return isSensitiveDataFile(relativePath);
}

export function isOrdinaryReviewableSource(relativePath: string): boolean {
  const ext = path.posix.extname(toPosix(relativePath)).toLowerCase();
  return SOURCE_OR_DOC_EXTENSIONS.has(ext) && !isSensitiveDataFile(relativePath);
}

export function isBinaryFileName(relativePath: string): boolean {
  const ext = path.posix.extname(toPosix(relativePath)).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function isUnsafeZipEntryName(name: string): boolean {
  const posix = name.replace(/\\/g, "/");
  if (posix.startsWith("/") || posix.startsWith("\\")) {
    return true;
  }
  if (/^[A-Za-z]:/.test(posix)) {
    return true;
  }
  return posix.split("/").includes("..");
}
