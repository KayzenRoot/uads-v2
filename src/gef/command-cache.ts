import fs from "node:fs";
import path from "node:path";
import { readJsonIfValid } from "../lib/atomic-write.js";
import { sha256Hex } from "../lib/hash.js";
import { resolveUadsHome } from "../lib/workspace.js";
import { reissueCacheHit, verifyWorkReceipt, type ValidityBasis, type WorkReceipt } from "./command-receipt.js";
import { computeValidityFingerprint } from "./command-receipt.js";

export const COMMAND_CACHE_MAX_ENTRIES = 200 as const;

export type CacheLookup =
  | { status: "HIT"; receipt: WorkReceipt }
  | { status: "MISS"; reason: string };

export function commandCacheDirectory(uadsHome?: string): string {
  return path.join(resolveUadsHome(uadsHome), "gef", "command-cache");
}

export function commandCachePath(validityFingerprint: string, uadsHome?: string): string {
  if (!/^[a-f0-9]{64}$/.test(validityFingerprint)) throw new Error("CACHE_KEY_REJECTED");
  const directory = commandCacheDirectory(uadsHome);
  const target = path.resolve(directory, `${validityFingerprint}.json`);
  if (!target.startsWith(path.resolve(directory))) throw new Error("CACHE_PATH_TRAVERSAL_REJECTED");
  return target;
}

export function commandCacheLookup(basis: ValidityBasis, projectFingerprint: string, taskId: string, uadsHome?: string): CacheLookup {
  const key = computeValidityFingerprint(basis);
  let target: string;
  try {
    target = commandCachePath(key, uadsHome);
  } catch {
    return { status: "MISS", reason: "CACHE_KEY_INVALID" };
  }
  const parsed = readJsonIfValid<WorkReceipt>(target);
  if (!parsed.ok) return { status: "MISS", reason: parsed.error === "missing" ? "CACHE_MISS" : "CACHE_CORRUPT_MISS" };
  const verified = verifyWorkReceipt(parsed.value);
  if (!verified.ok) return { status: "MISS", reason: `CACHE_CORRUPT_MISS:${verified.reason}` };
  const stored = verified.receipt;
  if (stored.projectFingerprint !== projectFingerprint) return { status: "MISS", reason: "CACHE_PROJECT_MISMATCH" };
  if (stored.validityFingerprint !== key) return { status: "MISS", reason: "CACHE_BASIS_MISMATCH" };
  return { status: "HIT", receipt: reissueCacheHit(stored, taskId) };
}

export function commandCacheStore(receipt: WorkReceipt, uadsHome?: string): string {
  const verified = verifyWorkReceipt(receipt);
  if (!verified.ok) throw new Error(`CACHE_STORE_CORRUPT:${verified.reason}`);
  if (receipt.source !== "EXECUTED") throw new Error("CACHE_STORE_SOURCE_REJECTED");
  const target = commandCachePath(receipt.validityFingerprint, uadsHome);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  pruneCommandCache({ uadsHome });
  return target;
}

export function pruneCommandCache(input: { maxEntries?: number; dryRun?: boolean; uadsHome?: string } = {}): { kept: number; pruned: number; dryRun: boolean } {
  const directory = commandCacheDirectory(input.uadsHome);
  if (!fs.existsSync(directory)) return { kept: 0, pruned: 0, dryRun: input.dryRun ?? false };
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
  const maxEntries = input.maxEntries ?? COMMAND_CACHE_MAX_ENTRIES;
  if (files.length <= maxEntries) return { kept: files.length, pruned: 0, dryRun: input.dryRun ?? false };
  const victims = files.slice(0, files.length - maxEntries);
  if (input.dryRun === true) return { kept: maxEntries, pruned: victims.length, dryRun: true };
  let pruned = 0;
  for (const name of victims) {
    try {
      fs.unlinkSync(path.join(directory, name));
      pruned += 1;
    } catch {
      continue;
    }
  }
  return { kept: files.length - pruned, pruned, dryRun: false };
}

export function inspectCommandCache(uadsHome?: string): Array<{ validityFingerprint: string; bytes: number; digest: string }> {
  const directory = commandCacheDirectory(uadsHome);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .slice(0, 200)
    .map((name) => {
      const target = path.join(directory, name);
      let bytes = 0;
      let digest = "";
      try {
        const raw = fs.readFileSync(target);
        bytes = raw.length;
        digest = sha256Hex(raw);
      } catch {
        bytes = -1;
      }
      return { validityFingerprint: name.replace(/\.json$/, ""), bytes, digest };
    });
}
