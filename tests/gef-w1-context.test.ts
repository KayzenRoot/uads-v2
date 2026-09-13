import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileContext, recordExpansion } from "../src/gef/context-compiler.js";
import { contextCasGet, contextCasKey, contextCasPut, lookupContextCas, pruneContextCas, sliceContentDigest } from "../src/gef/context-cas.js";
import { normalizeRepoRelativePath } from "../src/gef/upir.js";

const previousHome = process.env.UADS_HOME;
const SECRET_FIXTURE = `ghp_${"QWERTYUIOPASDFGHJKLZXCVBNM0123456789ab"}`;

afterEach(() => {
  if (previousHome === undefined) delete process.env.UADS_HOME;
  else process.env.UADS_HOME = previousHome;
});

function radiusFixture(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-radius-"));
  fs.writeFileSync(
    path.join(repo, "target.ts"),
    `import { depHelper } from "./dep";\nimport type { TargetConfig } from "./models";\n\nexport function targetSymbol(config: TargetConfig): string {\n  return depHelper(config.name);\n}\n`,
  );
  fs.writeFileSync(
    path.join(repo, "dep.ts"),
    `import type { TargetPolicy } from "./contracts";\n// credential ${SECRET_FIXTURE}\nexport function depHelper(name: string, _policy?: TargetPolicy): string {\n  return name;\n}\n`,
  );
  fs.writeFileSync(
    path.join(repo, "contracts.ts"),
    `export interface TargetPolicy {\n  level: number;\n}\n`,
  );
  fs.writeFileSync(
    path.join(repo, "models.ts"),
    `export interface TargetConfig {\n  name: string;\n}\n`,
  );
  fs.writeFileSync(
    path.join(repo, "target.test.ts"),
    `import { targetSymbol } from "./target";\ntest("target", () => { expect(targetSymbol({ name: "a" }).name ?? "a").toBeDefined(); });\n`,
  );
  fs.writeFileSync(
    path.join(repo, "unrelated.ts"),
    `export function unrelatedFixtureSymbol(): number {\n  return 42;\n}\n`,
  );
  fs.mkdirSync(path.join(repo, "docs", "v2"), { recursive: true });
  fs.writeFileSync(path.join(repo, "docs", "contract.md"), `# Architecture Contract\nRelevant contract context for the target.\n`);
  fs.writeFileSync(path.join(repo, "docs", "v2", "03-SCOPE.md"), `# Broad Scope\nBroad project governance context.\n`);
  return repo;
}

function identities(slice: { entries: Array<{ path: string; symbol: string; inclusionReason: string }> }): Set<string> {
  return new Set(slice.entries.map((entry) => `${entry.path}::${entry.symbol}::${entry.inclusionReason}`));
}

describe("GEF W1 context radius semantics (CR-W1-01)", () => {
  it("C0 holds target + direct test refs without dependency bodies", () => {
    const repo = radiusFixture();
    const slice = compileContext({ taskId: "radius-c0", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C0" });
    const dump = JSON.stringify(slice);
    expect(dump).toContain("targetSymbol");
    expect(slice.entries.every((entry) => entry.inclusionReason === "TARGET" || entry.inclusionReason === "DIRECT_TEST")).toBe(true);
    expect(slice.entries.some((entry) => entry.path === "target.ts")).toBe(true);
    expect(slice.entries.some((entry) => entry.path === "dep.ts")).toBe(false);
    expect(slice.entries.some((entry) => entry.inclusionReason === "DIRECT_DEPENDENCY")).toBe(false);
    expect(slice.entries.some((entry) => entry.inclusionReason === "MODULE_INTERFACE")).toBe(false);
    expect(dump).not.toContain("unrelatedFixtureSymbol");
    expect(slice.entries.flatMap((entry) => entry.tests).join("\n")).toContain("target.test.ts");
  });

  it("C1 adds direct dependency context absent from C0", () => {
    const repo = radiusFixture();
    const c0 = compileContext({ taskId: "radius-c1", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C0" });
    const c1 = compileContext({ taskId: "radius-c1", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C1" });
    expect(c1.entries.some((entry) => entry.path === "dep.ts" && entry.inclusionReason === "DIRECT_DEPENDENCY")).toBe(true);
    expect(JSON.stringify(c0)).not.toContain("dep.ts");
    expect(JSON.stringify(c1)).not.toContain("unrelatedFixtureSymbol");
  });

  it("C2 adds required interface context absent from C1", () => {
    const repo = radiusFixture();
    const c1 = compileContext({ taskId: "radius-c2", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C1" });
    const c2 = compileContext({ taskId: "radius-c2", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C2" });
    expect(c1.entries.some((entry) => entry.symbol === "TargetPolicy")).toBe(false);
    expect(c1.entries.some((entry) => entry.inclusionReason === "MODULE_INTERFACE")).toBe(false);
    expect(c2.entries.some((entry) => entry.symbol === "TargetPolicy" && entry.inclusionReason === "MODULE_INTERFACE")).toBe(true);
  });

  it("C3 adds the configured architecture contract", () => {
    const repo = radiusFixture();
    const c2 = compileContext({ taskId: "radius-c3", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C2", architecturePaths: ["docs/contract.md"] });
    const c3 = compileContext({ taskId: "radius-c3", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C3", architecturePaths: ["docs/contract.md"] });
    expect(c3.entries.some((entry) => entry.path === "docs/contract.md" && entry.inclusionReason === "ARCHITECTURE_CONTRACT")).toBe(true);
    expect(JSON.stringify(c2)).not.toContain("docs/contract.md");
  });

  it("C4 is a bounded superset of lower radius context", () => {
    const repo = radiusFixture();
    const c3 = compileContext({ taskId: "radius-c4", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C3", architecturePaths: ["docs/contract.md"] });
    const c4 = compileContext({ taskId: "radius-c4", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C4", architecturePaths: ["docs/contract.md"] });
    for (const identity of identities(c3)) expect(identities(c4).has(identity)).toBe(true);
    expect(c4.entries.length).toBeGreaterThanOrEqual(c3.entries.length);
    expect(c4.entries.length).toBeLessThanOrEqual(24);
  });

  it("keeps required C0 context monotonic through C1-C4", () => {
    const repo = radiusFixture();
    const base = compileContext({ taskId: "radius-mono", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C0", architecturePaths: ["docs/contract.md"] });
    for (const radius of ["C1", "C2", "C3", "C4"] as const) {
      const grown = compileContext({ taskId: "radius-mono", repoRoot: repo, targetSymbols: ["targetSymbol"], radius, architecturePaths: ["docs/contract.md"] });
      for (const identity of identities(base)) expect(identities(grown).has(identity)).toBe(true);
    }
  });

  it("excludes unrelated files without dependency or contract basis", () => {
    const repo = radiusFixture();
    for (const radius of ["C0", "C1", "C2", "C3", "C4"] as const) {
      const slice = compileContext({ taskId: "radius-unrelated", repoRoot: repo, targetSymbols: ["targetSymbol"], radius, architecturePaths: ["docs/contract.md"] });
      expect(JSON.stringify(slice)).not.toContain("unrelatedFixtureSymbol");
      expect(slice.entries.some((entry) => entry.path === "unrelated.ts")).toBe(false);
    }
  });

  it("returns an explicit expansion-required outcome when entries exceed budget", () => {
    const repo = radiusFixture();
    expect(() => compileContext({ taskId: "radius-budget", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C1", maxEntries: 1 })).toThrow("CONTEXT_BUDGET_EXPANSION_REQUIRED");
    expect(() => compileContext({ taskId: "radius-budget", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C4", architecturePaths: ["docs/contract.md"], maxEntries: 2 })).toThrow("CONTEXT_BUDGET_EXPANSION_REQUIRED");
  });

  it("redacts the secret fixture from every radius", () => {
    const repo = radiusFixture();
    for (const radius of ["C0", "C1", "C2", "C3", "C4"] as const) {
      const slice = compileContext({ taskId: "radius-secret", repoRoot: repo, targetSymbols: ["targetSymbol"], radius, architecturePaths: ["docs/contract.md"] });
      expect(JSON.stringify(slice)).not.toContain(SECRET_FIXTURE);
    }
  });

  it("records C0->C1 expansion with a bounded reason", () => {
    const expansions = recordExpansion([], "C0", "C1", "DIRECT_DEP_REQUIRED");
    expect(expansions).toEqual([{ from: "C0", to: "C1", reason: "DIRECT_DEP_REQUIRED" }]);
    const repo = radiusFixture();
    const slice = compileContext({ taskId: "ctx-exp", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C1", expansions });
    expect(slice.expansions).toEqual(expansions);
  });

  it("CAS hits on exact input and misses on content or tool basis drift", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-gef-w1-cas-"));
    process.env.UADS_HOME = home;
    const repo = radiusFixture();
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
    const repo = radiusFixture();
    compileContext({ taskId: "zero-test", repoRoot: repo, targetSymbols: ["targetSymbol"], radius: "C0" });
    expect(fs.existsSync(path.join(repo, ".uads"))).toBe(false);
    expect(fs.existsSync(path.join(repo, "gef"))).toBe(false);
  });
});
