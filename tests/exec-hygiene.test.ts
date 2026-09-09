import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveNpmInvocation, runProcess } from "../src/lib/exec.js";

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
      if (/\.(ts|mjs|js)$/.test(entry.name)) {
        files.push(abs);
      }
    }
  };
  visit(root);
  return files;
}

describe("process execution hygiene", () => {
  it("resolves npm through npm-cli.js or a direct npm executable", () => {
    const invocation = resolveNpmInvocation();
    expect(invocation.argsPrefix.length === 0 || invocation.command === process.execPath).toBe(true);
    expect(invocation.command).not.toMatch(/\.cmd$/i);
  });

  it("runs processes with shell disabled", () => {
    const result = runProcess(process.execPath, ["-e", "process.stdout.write('ok')"]);
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toBe("ok");
  });

  it("does not use shell: true in UADS-controlled source", () => {
    const roots = [path.resolve("src"), path.resolve("scripts")];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of collectSourceFiles(root)) {
        const text = fs.readFileSync(file, "utf8");
        if (/shell:\s*true/.test(text) || /shell:\s*process\.platform === "win32"/.test(text)) {
          hits.push(path.relative(path.resolve("."), file));
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
