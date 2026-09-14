import fs from "node:fs";
import path from "node:path";
import { readJsonIfValid } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { resolveUadsHome } from "../lib/workspace.js";
import { canonicalDigest } from "./upir.js";
import type { ContextSlice } from "./context-compiler.js";

export const CONTEXT_CAS_VERSION = "1.0.0" as const;
export const CONTEXT_CAS_MAX_ENTRIES = 200 as const;

export type ContextCasResult =
  | { status: "HIT"; slice: ContextSlice }
  | { status: "MISS"; reason: string };

function casDirectory(uadsHome?: string): string {
  return path.join(resolveUadsHome(uadsHome), "gef", "context-cas");
}

export function contextCasKey(input: { contentDigest: string; producerVersion: string; toolchainBasis: string }): string {
  return sha256Hex(canonicalDigest({ contentDigest: input.contentDigest, producerVersion: input.producerVersion, toolchainBasis: input.toolchainBasis }));
}

export function sliceContentDigest(slice: Omit<ContextSlice, "sliceDigest">): string {
  return canonicalDigest({ entries: slice.entries, radius: slice.radius, taskId: slice.taskId });
}

export function contextCasPath(key: string, uadsHome?: string): string {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("CAS_KEY_REJECTED");
  const directory = casDirectory(uadsHome);
  const target = path.resolve(directory, `${key}.json`);
  if (!target.startsWith(path.resolve(directory))) throw new Error("CAS_PATH_TRAVERSAL_REJECTED");
  return target;
}

export function contextCasPut(slice: ContextSlice, uadsHome?: string): string {
  const key = contextCasKey({ contentDigest: sliceContentDigest(slice), producerVersion: slice.producerVersion, toolchainBasis: slice.toolchainBasis });
  const target = contextCasPath(key, uadsHome);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(slice, null, 2)}\n`, "utf8");
  return key;
}

export function contextCasGet(key: string, uadsHome?: string): ContextCasResult {
  let target: string;
  try {
    target = contextCasPath(key, uadsHome);
  } catch {
    return { status: "MISS", reason: "CAS_KEY_INVALID" };
  }
  const parsed = readJsonIfValid<ContextSlice>(target);
  if (!parsed.ok) return { status: "MISS", reason: parsed.error === "missing" ? "CAS_MISS" : "CAS_CORRUPT_MISS" };
  const slice = parsed.value;
  if (!slice || typeof slice !== "object" || !Array.isArray((slice as ContextSlice).entries)) {
    return { status: "MISS", reason: "CAS_CORRUPT_MISS" };
  }
  return { status: "HIT", slice: slice as ContextSlice };
}

export function lookupContextCas(input: { contentDigest: string; producerVersion: string; toolchainBasis: string }, uadsHome?: string): ContextCasResult {
  return contextCasGet(contextCasKey(input), uadsHome);
}

export function pruneContextCas(input: { maxEntries?: number; uadsHome?: string } = {}): { kept: number; pruned: number } {
  const directory = casDirectory(input.uadsHome);
  if (!fs.existsSync(directory)) return { kept: 0, pruned: 0 };
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
  const maxEntries = input.maxEntries ?? CONTEXT_CAS_MAX_ENTRIES;
  if (files.length <= maxEntries) return { kept: files.length, pruned: 0 };
  const excess = files.length - maxEntries;
  for (const name of files.slice(0, excess)) {
    try {
      fs.unlinkSync(path.join(directory, name));
    } catch {
      continue;
    }
  }
  return { kept: files.length - excess, pruned: excess };
}
