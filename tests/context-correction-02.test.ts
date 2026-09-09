import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasJsTsExportBoundary, maskNonCodeJsTs } from "../src/kernel/js-ts-lex.js";
import { extractJsTsReferences } from "../src/kernel/js-ts-extractor.js";
import { buildOrRefreshIndex } from "../src/kernel/index-engine.js";
import { analyzeImpact } from "../src/kernel/impact.js";
import { buildContextPack } from "../src/kernel/context-pack.js";
import { buildImpactAndPack } from "../src/kernel/intelligence.js";
import { ensureWorkspace } from "../src/lib/workspace.js";
import { gitCommit, initRepo, tempDirs } from "./helpers.js";

function write(root: string, rel: string, contents: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

describe("js/ts lexical mask", () => {
  it("preserves executable syntax and line numbers while masking literals", () => {
    const source = `import { x } from "./real";\nconst a = 'import "./fake"';\n`;
    const masked = maskNonCodeJsTs(source);
    expect(masked.split("\n")).toHaveLength(source.split("\n").length);
    expect(masked.startsWith("import { x } from ")).toBe(true);
    expect(masked).not.toContain("./fake");
    expect(masked).not.toContain("import \"./fake\"");
  });

  it("keeps ${} interpolations executable", () => {
    const source = "const x = `hello ${import(\"./real\")} world`;\n";
    const masked = maskNonCodeJsTs(source);
    expect(masked).toContain("${import(");
    expect(masked).not.toContain("hello");
  });

  it("extracts literal import inside template interpolation", () => {
    const refs = extractJsTsReferences("src/x.ts", "export const x = `n ${import(\"./real\")}`;\n");
    expect(refs.some((item) => item.specifier === "./real" && item.method === "dynamic-import-literal")).toBe(true);
  });
});

describe("context intelligence correction 02", () => {
  it("does not emit edges from string, template, or comment import/require text", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c02a.git");
    write(repo, "src/real.ts", "export const real = 1;\n");
    write(
      repo,
      "src/app.ts",
      [
        `import { real } from "./real";`,
        `import "./real";`,
        `const r = require("./real");`,
        `const d = import("./real");`,
        `export const v = real;`,
        "",
      ].join("\n"),
    );
    write(
      repo,
      "src/fake.ts",
      [
        `const example = 'import "./real"';`,
        `const snippet = 'require("./real")';`,
        "const template = `import \"./real\"`;",
        `const side = 'import "./real"';`,
        "// import \"./real\"",
        "/* require(\"./real\") */",
        "const other = 1;",
        "",
      ].join("\n"),
    );
    gitCommit(repo, "init");
    const paths = ensureWorkspace("aaaaaaaaaaaaaaaa", home);
    const bundle = buildOrRefreshIndex({ repoRoot: repo, projectId: "aaaaaaaaaaaaaaaa", paths });
    const fromApp = bundle.graph.edges.filter((edge) => edge.source === "src/app.ts" && edge.target === "src/real.ts");
    expect(fromApp.some((edge) => edge.method === "static-import")).toBe(true);
    expect(fromApp.some((edge) => edge.method === "side-effect-import")).toBe(true);
    expect(fromApp.some((edge) => edge.type === "requires")).toBe(true);
    expect(fromApp.some((edge) => edge.type === "dynamic-import" && edge.method === "dynamic-import-literal")).toBe(true);
    expect(bundle.graph.edges.some((edge) => edge.source === "src/fake.ts")).toBe(false);
    const fakeRefs = extractJsTsReferences("src/fake.ts", fs.readFileSync(path.join(repo, "src/fake.ts"), "utf8"));
    expect(fakeRefs.filter((item) => item.specifier === "./real")).toHaveLength(0);
  });

  it("records computed imports per file without cross-file regex state", () => {
    const a = `export const loadA = (name: string) => import(name);\n`;
    const b = `export const loadB = (mod: string) => import(mod);\n`;
    const literal = `export const load = () => import("./real");\n`;
    const first = extractJsTsReferences("src/dyn-a.ts", a);
    const second = extractJsTsReferences("src/dyn-b.ts", b);
    const reversedB = extractJsTsReferences("src/dyn-b.ts", b);
    const reversedA = extractJsTsReferences("src/dyn-a.ts", a);
    expect(first.some((item) => item.specifier === "(computed)" && item.method === "dynamic-import-computed")).toBe(true);
    expect(second.some((item) => item.specifier === "(computed)" && item.method === "dynamic-import-computed")).toBe(true);
    expect(reversedA).toEqual(first);
    expect(reversedB).toEqual(second);
    const lit = extractJsTsReferences("src/dyn-lit.ts", literal);
    expect(lit.some((item) => item.method === "dynamic-import-literal" && item.specifier === "./real")).toBe(true);
    expect(lit.some((item) => item.method === "dynamic-import-computed")).toBe(false);

    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c02b.git");
    write(repo, "src/dyn-a.ts", a);
    write(repo, "src/dyn-b.ts", b);
    gitCommit(repo, "init");
    const paths = ensureWorkspace("bbbbbbbbbbbbbbbb", home);
    const bundle = buildOrRefreshIndex({ repoRoot: repo, projectId: "bbbbbbbbbbbbbbbb", paths });
    const unresolved = bundle.graph.unresolved.filter((item) => item.specifier === "(computed)");
    expect(unresolved.some((item) => item.source === "src/dyn-a.ts" && item.sourceDigest)).toBe(true);
    expect(unresolved.some((item) => item.source === "src/dyn-b.ts" && item.sourceDigest)).toBe(true);
    expect(unresolved.filter((item) => item.source === "src/dyn-a.ts")).toHaveLength(1);
    expect(unresolved.filter((item) => item.source === "src/dyn-b.ts")).toHaveLength(1);
  });

  it("does not treat template, comment, or string export text as an export boundary", () => {
    expect(hasJsTsExportBoundary("export const real = 1;\n")).toBe(true);
    expect(hasJsTsExportBoundary("export type X = string;\n")).toBe(true);
    expect(hasJsTsExportBoundary("export interface X { a: number }\n")).toBe(true);
    expect(hasJsTsExportBoundary("export function f() {}\n")).toBe(true);
    expect(hasJsTsExportBoundary("export class C {}\n")).toBe(true);
    expect(hasJsTsExportBoundary("export { x };\n")).toBe(true);
    expect(hasJsTsExportBoundary('export * from "./x";\n')).toBe(true);
    expect(
      hasJsTsExportBoundary("const docs = `\nexport const fake = 1;\n`;\nconst other = 1;\n"),
    ).toBe(false);
    expect(hasJsTsExportBoundary("// export const fake = 1;\nconst other = 1;\n")).toBe(false);
    expect(hasJsTsExportBoundary('const word = "export const fake = 1;";\nconst other = 1;\n')).toBe(false);

    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c02c.git");
    write(repo, "src/real.ts", "export const real = 1;\n");
    write(repo, "src/template.ts", "const docs = `\nexport const fake = 1;\n`;\nconst other = 1;\n");
    gitCommit(repo, "init");
    const paths = ensureWorkspace("cccccccccccccccc", home);
    const bundle = buildOrRefreshIndex({ repoRoot: repo, projectId: "cccccccccccccccc", paths });
    expect(bundle.interfaces.contracts.some((item) => item.path === "src/real.ts" && item.kind === "export")).toBe(true);
    expect(bundle.interfaces.contracts.some((item) => item.path === "src/template.ts")).toBe(false);
  });

  it("includes reverse docs/config at C2+ with edge evidence and keeps C1 narrow", () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/example/uads-c02d.git");
    write(repo, "src/app.ts", "export const app = 1;\n");
    write(repo, "src/other.ts", "export const other = 1;\n");
    write(repo, "docs/app.md", "[app](../src/app.ts)\n");
    write(repo, "docs/unrelated.md", "[other](../src/other.ts)\n");
    write(
      repo,
      "package.json",
      `${JSON.stringify({ name: "c02", version: "1.0.0", main: "./src/app.ts" }, null, 2)}\n`,
    );
    write(repo, "tsconfig.json", `${JSON.stringify({ files: ["src/app.ts"] }, null, 2)}\n`);
    gitCommit(repo, "init");
    const paths = ensureWorkspace("dddddddddddddddd", home);
    const pack = buildImpactAndPack({
      repoRoot: repo,
      projectId: "dddddddddddddddd",
      paths,
      radius: "C2",
      requestedPaths: ["src/app.ts"],
    });
    const selected = [...pack.report.inScopeCandidates, ...pack.report.supportingContext, ...pack.report.possibleImpact];
    const docsItem = selected.find((item) => item.path === "docs/app.md");
    const configItem = selected.find((item) => item.path === "tsconfig.json");
    const manifestItem = selected.find((item) => item.path === "package.json");
    expect(docsItem?.relation).toBe("documentation");
    expect(docsItem?.reason).toMatch(/documents/);
    expect(configItem?.relation).toBe("config");
    expect(configItem?.reason).toMatch(/configures/);
    expect(manifestItem?.relation).toBe("config");
    expect(manifestItem?.reason).toMatch(/manifest-reference/);
    expect(selected.some((item) => item.path === "docs/unrelated.md")).toBe(false);
    expect(pack.pack.docs).toContain("docs/app.md");
    expect(pack.pack.docs).not.toContain("docs/unrelated.md");
    expect(pack.pack.items.some((item) => item.path === "tsconfig.json" && item.role === "config")).toBe(true);

    const c1 = analyzeImpact({
      bundle: pack.bundle,
      projectId: "dddddddddddddddd",
      workOrderId: null,
      executionRunId: null,
      radius: "C1",
      requestedPaths: ["src/app.ts"],
      affectedAreas: [],
    });
    const c1Paths = [...c1.inScopeCandidates, ...c1.supportingContext, ...c1.possibleImpact].map((item) => item.path);
    expect(c1Paths).toEqual(["src/app.ts"]);
    const c1Pack = buildContextPack({
      bundle: pack.bundle,
      report: c1,
      projectId: "dddddddddddddddd",
      workOrderId: null,
      executionRunId: null,
      radius: "C1",
      objective: null,
      expansionHistory: [],
    });
    expect(c1Pack.docs).toEqual([]);
  });
});
