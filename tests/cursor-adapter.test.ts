import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installCursorAgents, MANIFEST_NAME, UADS_AGENT_PREFIX } from "../src/adapters/cursor-agents.js";
import { preflightUadsSkills } from "../src/lib/skills-preflight.js";

describe("Cursor adapter and skills preflight", () => {
  it("installs only uads- prefixed agents into an isolated Cursor home", () => {
    const uadsHome = fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-home-"));
    const cursorUserHome = fs.mkdtempSync(path.join(os.tmpdir(), "uads-cursor-home-"));
    const foreign = path.join(cursorUserHome, ".cursor", "agents");
    fs.mkdirSync(foreign, { recursive: true });
    const unrelated = path.join(foreign, "personal-reviewer.md");
    fs.writeFileSync(unrelated, "# keep me\n");

    const result = installCursorAgents({ uadsHome, cursorUserHome, packageRoot: path.resolve(".") });
    expect(result.error).toBeUndefined();
    expect(result.installed.some((name) => name.startsWith(UADS_AGENT_PREFIX))).toBe(true);
    expect(fs.existsSync(path.join(foreign, "uads-repo-inspector.md"))).toBe(true);
    expect(fs.existsSync(path.join(foreign, "uads-test-engineer.md"))).toBe(true);
    expect(fs.existsSync(path.join(foreign, "uads-requirements-engineer.md"))).toBe(true);
    expect(fs.readFileSync(unrelated, "utf8")).toContain("keep me");
    const manifest = JSON.parse(fs.readFileSync(path.join(foreign, MANIFEST_NAME), "utf8")) as { files: string[] };
    expect(manifest.files.every((name) => name.startsWith(UADS_AGENT_PREFIX))).toBe(true);
    expect(fs.existsSync(path.join(uadsHome, "agents", "uads-independent-reviewer.md"))).toBe(true);
  });

  it("reports Cursor adapter write failure without deleting canonical agents", () => {
    const uadsHome = fs.mkdtempSync(path.join(os.tmpdir(), "uads-adapter-home-"));
    const canonicalDir = path.join(uadsHome, "agents");
    fs.mkdirSync(canonicalDir, { recursive: true });
    fs.writeFileSync(path.join(canonicalDir, "uads-repo-inspector.md"), "pre-existing canonical\n");
    const blockedFile = fs.mkdtempSync(path.join(os.tmpdir(), "uads-cursor-file-"));
    const asFile = path.join(blockedFile, "not-a-dir");
    fs.writeFileSync(asFile, "x");
    const result = installCursorAgents({
      uadsHome,
      cursorUserHome: asFile,
      packageRoot: path.resolve("."),
    });
    expect(result.error).toMatch(/Cursor adapter skipped/i);
    expect(fs.readFileSync(path.join(uadsHome, "agents", "uads-repo-inspector.md"), "utf8")).toBe(
      "pre-existing canonical\n",
    );
  });

  it("passes the UADS Agent Skills compatibility preflight", () => {
    const result = preflightUadsSkills(path.join(path.resolve("."), "skills"));
    expect(result.ok, result.errors.join("; ")).toBe(true);
  });
});
