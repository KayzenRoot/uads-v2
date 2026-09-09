import path from "node:path";
import { toPosix } from "../lib/hash.js";

const WINDOWS_DRIVE = /^[A-Za-z]:/;

export function assertSafeRelativeProjectPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("empty relative path rejected");
  }
  const posix = toPosix(trimmed).replace(/\\/g, "/").replace(/^\.\//, "");
  if (!posix || posix === "." || posix === "..") {
    throw new Error("unsafe relative path rejected");
  }
  if (posix.startsWith("/") || posix.startsWith("\\")) {
    throw new Error("absolute path rejected");
  }
  if (WINDOWS_DRIVE.test(posix) || WINDOWS_DRIVE.test(trimmed)) {
    throw new Error("absolute drive path rejected");
  }
  if (posix.startsWith("//") || trimmed.startsWith("\\\\")) {
    throw new Error("UNC path rejected");
  }
  if (posix.split("/").includes("..")) {
    throw new Error("path traversal rejected");
  }
  if (posix.includes("\0")) {
    throw new Error("unsafe relative path rejected");
  }
  const normalized = path.posix.normalize(posix);
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("path traversal rejected");
  }
  return posix;
}

export function isRelativeProjectPath(value: string): boolean {
  try {
    assertSafeRelativeProjectPath(value);
    return true;
  } catch {
    return false;
  }
}
