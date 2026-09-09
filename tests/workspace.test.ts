import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureWorkspace, getUadsPaths, resolveUadsHome } from "../src/lib/workspace.js";

describe("global sidecar workspace", () => {
  it("resolves an explicit override and the default ~/.uads home", () => {
    const override = path.join(os.tmpdir(), "uads-home-override");
    expect(resolveUadsHome(override)).toBe(path.resolve(override));
    const previous = process.env.UADS_HOME;
    delete process.env.UADS_HOME;
    try {
      expect(resolveUadsHome()).toBe(path.join(os.homedir(), ".uads"));
    } finally {
      if (previous === undefined) {
        delete process.env.UADS_HOME;
      } else {
        process.env.UADS_HOME = previous;
      }
    }
  });

  it("creates the global layout and project workspace outside the project", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "uads-home-"));
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "uads-proj-"));
    const paths = ensureWorkspace("abc123def4567890", home);

    expect(fs.existsSync(path.join(home, "core"))).toBe(true);
    expect(fs.existsSync(path.join(home, "skills"))).toBe(true);
    expect(fs.existsSync(path.join(home, "agents"))).toBe(true);
    expect(fs.existsSync(paths.reviews)).toBe(true);
    expect(fs.existsSync(paths.state)).toBe(true);
    expect(paths.workspace.startsWith(home)).toBe(true);
    expect(paths.workspace.includes(project)).toBe(false);
    expect(getUadsPaths("abc123def4567890", home).workspace).toBe(paths.workspace);
  });
});
