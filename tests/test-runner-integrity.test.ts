import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { statusFromExit } from "../src/lib/evidence.js";
import { runProcess } from "../src/lib/exec.js";

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage") {
          continue;
        }
        visit(abs);
        continue;
      }
      if (/\.(ts|mjs|js|json)$/.test(entry.name)) {
        files.push(abs);
      }
    }
  };
  visit(root);
  return files;
}

describe("test runner evidence integrity", () => {
  it("maps process exit codes strictly without reading stdout", () => {
    expect(statusFromExit(0, true)).toBe("PASS");
    expect(statusFromExit(1, true)).toBe("FAIL");
    expect(statusFromExit(2, true)).toBe("FAIL");
    expect(statusFromExit(null, true)).toBe("FAIL");
  });

  it("keeps a non-zero child FAIL even when stdout looks green or mentions onTaskUpdate", () => {
    const result = runProcess(process.execPath, [
      "-e",
      "process.stdout.write('Test Files  1 passed (1)\\nTests  1 passed (1)\\nTimeout calling \"onTaskUpdate\"\\n'); process.exit(1);",
    ]);
    expect(result.status).toBe(1);
    expect(String(result.stdout)).toMatch(/Tests\s+1 passed/);
    expect(String(result.stdout)).toMatch(/onTaskUpdate/);
    expect(statusFromExit(result.status, true)).toBe("FAIL");
  });

  it("keeps a zero child PASS", () => {
    const result = runProcess(process.execPath, ["-e", "process.exit(0)"]);
    expect(result.status).toBe(0);
    expect(statusFromExit(result.status, true)).toBe("PASS");
  });

  it("uses a direct Vitest command with no output-based success override", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as { scripts: { test: string } };
    expect(pkg.scripts.test).toBe("vitest run --maxWorkers=1");
    expect(fs.existsSync(path.resolve("scripts", "validate", "run-vitest.mjs"))).toBe(false);
    const hits: string[] = [];
    for (const root of [path.resolve("src"), path.resolve("scripts"), path.resolve("package.json")]) {
      const files = fs.statSync(root).isFile() ? [root] : collectSourceFiles(root);
      for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        if (
          /onTaskUpdate/.test(text) ||
          /treating as PASS/.test(text) ||
          /dangerouslyIgnoreUnhandledErrors/.test(text)
        ) {
          hits.push(path.relative(path.resolve("."), file));
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("a genuine failing Vitest file makes the Vitest process exit non-zero", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-vitest-fail-"));
    fs.writeFileSync(
      path.join(dir, "fail.test.ts"),
      `import { it } from "vitest";\nit("fails on purpose", () => { throw new Error("intentional fixture failure"); });\n`,
    );
    fs.writeFileSync(
      path.join(dir, "vitest.config.ts"),
      `import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["fail.test.ts"] } });\n`,
    );
    const vitestCli = path.resolve("node_modules", "vitest", "vitest.mjs");
    const result = runProcess(process.execPath, [vitestCli, "run", "--maxWorkers=1", "--config", path.join(dir, "vitest.config.ts")], {
      cwd: dir,
      env: { ...process.env, CI: "true" },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout ?? ""}${result.stderr ?? ""}`).toMatch(/intentional fixture failure|FAIL/i);
  });
});
