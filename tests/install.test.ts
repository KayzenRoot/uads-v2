import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(".");
const installer = path.join(repoRoot, "scripts", "install", "install.mjs");

describe("global install", () => {
  it("creates the sidecar layout and a usable CLI without touching the managed project", () => {
    const uadsHome = fs.mkdtempSync(path.join(os.tmpdir(), "uads-install-home-"));
    const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "uads-npm-prefix-"));
    const managed = fs.mkdtempSync(path.join(os.tmpdir(), "uads-managed-"));

    const result = spawnSync(process.execPath, [installer, "--skip-build", `--prefix=${prefix}`], {
      cwd: managed,
      encoding: "utf8",
      env: {
        ...process.env,
        UADS_HOME: uadsHome,
        UADS_NPM_PREFIX: prefix,
        CURSOR_USER_HOME: fs.mkdtempSync(path.join(os.tmpdir(), "uads-cursor-home-")),
      },
    });

    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(fs.existsSync(path.join(uadsHome, "core"))).toBe(true);
    expect(fs.existsSync(path.join(uadsHome, "skills"))).toBe(true);
    expect(fs.existsSync(path.join(uadsHome, "agents"))).toBe(true);
    expect(fs.existsSync(path.join(uadsHome, "workspaces"))).toBe(true);
    expect(result.stdout).toContain("uads CLI installed");

    expect(fs.existsSync(path.join(managed, ".uads"))).toBe(false);
    expect(fs.existsSync(path.join(managed, "memory-bank"))).toBe(false);
    expect(fs.existsSync(path.join(managed, "reviews"))).toBe(false);
    expect(fs.existsSync(path.join(managed, ".uads-cache"))).toBe(false);
  }, 120_000);
});
