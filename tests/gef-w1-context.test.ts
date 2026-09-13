import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileContext, recordExpansion } from "../src/gef/context-compiler.js";
import { contextCasGet, contextCasKey, contextCasPut, lookupContextCas, pruneContextCas, sliceContentDigest } from "../src/gef/context-cas.js";
import { normalizeRepoRelativePath } from "../src/gef/upir.js";

const previousHome = process.env.UADS_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.UADS_HOME;
  else process.env.UADS_HOME = previousHome;
});

function fixtureRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-ctx-"));
  fs.writeFileSync(
    path.join(repo, "target.ts"),
    `export function targetSymbol(alpha: string): string {\n  return alpha;\n}\n\nexport const helper = 1;\n`,
  );
  fs.writeFileSync(
    path.join(repo, "unrelated.ts"),
    `export function unrelatedFixtureSymbol(): number {\n  return 42;\n}\n`,
  );
  fs.writeFileSync(
    path.join(repo, "target.test.ts"),
    `import { targetSymbol } from "./target";\ntest("target", () => { expect(targetSymbol("a")).toBe("a"); });\n`,
  );
  return repo;
}

describe("GEF W1 context compiler + CAS", () => {
  it("C0/C1 contains the target symbol and omits the unrelated fixture symbol", () => {
    const repo = fixtureRepo();
    const slice = compileContext({ taskId: "ctx-test", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C0" });
    const concatenated = slice.entries.map((entry) => `${entry.path}:${entry.symbol}:${entry.signatures.join(" ")}:${entry.excerpt ?? ""}`).join("\n");
    expect(concatenated).toContain("targetSymbol");
    expect(concatenated).not.toContain("unrelatedFixtureSymbol");
    expect(slice.entries.length).toBeGreaterThan(0);
    expect(slice.entries[0]?.path).not.toContain("\\");
    expect(slice.sliceDigest).toMatch(/^[a-f0-9]{64}$/);
    const c1 = compileContext({ taskId: "ctx-test", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C1" });
    expect(c1.entries.map((entry) => entry.symbol)).toContain("targetSymbol");
    expect(JSON.stringify(c1)).not.toContain("unrelatedFixtureSymbol");
  });

  it("records C0->C1 expansion with a bounded reason", () => {
    const expansions = recordExpansion([], "C0", "C1", "DIRECT_DEP_REQUIRED");
    expect(expansions).toEqual([{ from: "C0", to: "C1", reason: "DIRECT_DEP_REQUIRED" }]);
    const repo = fixtureRepo();
    const slice = compileContext({ taskId: "ctx-exp", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C1", expansions });
    expect(slice.expansions).toEqual(expansions);
  });

  it("CAS hits on exact input and misses on content or tool basis drift", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-cas-"));
    process.env.UADS_HOME = home;
    const repo = fixtureRepo();
    const slice = compileContext({ taskId: "cas-test", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C0" });
    const key = contextCasPut(slice, home);
    expect(contextCasGet(key, home).status).toBe("HIT");
    const recomputedKey = contextCasKey({ contentDigest: sliceContentDigest(slice), producerVersion: slice.producerVersion, toolchainBasis: slice.toolchainBasis });
    expect(recomputedKey).toBe(key);
    expect(lookupContextCas({ contentDigest: sliceContentDigest(slice), producerVersion: slice.producerVersion, toolchainBasis: slice.toolchainBasis }, home).status).toBe("HIT");
    expect(lookupContextCas({ contentDigest: "0".repeat(64), producerVersion: slice.producerVersion, toolchainBasis: slice.toolchainBasis }, home).status).toBe("MISS");
    expect(lookupContextCas({ contentDigest: sliceContentDigest(slice), producerVersion: "other/9.9.9", toolchainBasis: slice.toolchainBasis }, home).status).toBe("MISS");
    expect(lookupContextCas({ contentDigest: sliceContentDigest(slice), producerVersion: slice.producerVersion, toolchainBasis: "other-toolchain" }, home).status).toBe("MISS");
    expect(pruneContextCas({ maxEntries: 200, uadsHome: home }).kept).toBeGreaterThan(0);
  });

  it("treats corrupt cache as miss and rejects traversal keys", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-cas-corrupt-"));
    process.env.UADS_HOME = home;
    expect(contextCasGet("a".repeat(64), home).status).toBe("MISS");
    expect(contextCasGet("../traversal", home).status).toBe("MISS");
  });

  it("normalizes paths deterministically across platforms", () => {
    expect(normalizeRepoRelativePath("src\\gef\\context-compiler.ts")).toBe("src/gef/context-compiler.ts");
    expect(normalizeRepoRelativePath("src/gef/context-compiler.ts")).toBe("src/gef/context-compiler.ts");
  });

  it("preserves zero-project-footprint for context artifacts", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-zero-"));
    process.env.UADS_HOME = home;
    const repo = fixtureRepo();
    compileContext({ taskId: "zero-test", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C0" });
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
    expect(fs.existsSync(path.join(repo, "gef"))).toBe(false);
    expect(fs.readdirSync(repo).sort()).toEqual(["target.test.ts", "target.ts", "unrelated.ts"]);
  });
});
