import fs from "node:fs";
import path from "node:path";
import { isPathInside } from "./hash.js";

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export function assertSafeSidecarId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error("unsafe sidecar identifier");
  }
}

export function sidecarJsonPath(directory: string, id: string): string {
  assertSafeSidecarId(id);
  const target = path.resolve(directory, `${id}.json`);
  if (!isPathInside(directory, target)) {
    throw new Error("sidecar path escape rejected");
  }
  return target;
}

export function atomicWriteFile(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents, "utf8");
  try {
    fs.renameSync(tmp, target);
  } catch {
    fs.copyFileSync(tmp, target);
    fs.unlinkSync(tmp);
  }
}

export function atomicWriteJson(target: string, value: unknown): void {
  atomicWriteFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJsonIfValid<T>(target: string): { ok: true; value: T } | { ok: false; error: string } {
  if (!fs.existsSync(target)) {
    return { ok: false, error: "missing" };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as T;
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
