import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  computeProjectFingerprint,
  fingerprintFromMaterial,
  normalizeRemoteUrl,
} from "../src/lib/fingerprint.js";

describe("project fingerprint", () => {
  it("normalizes equivalent git remotes to the same material", () => {
    const a = normalizeRemoteUrl("git@github.com:KayzenRoot/uads.git");
    const b = normalizeRemoteUrl("https://github.com/KayzenRoot/uads.git");
    const c = normalizeRemoteUrl("https://github.com/KayzenRoot/uads/");
    expect(a).toBe("https://github.com/KayzenRoot/uads");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("is stable for the same material", () => {
    const first = fingerprintFromMaterial("https://github.com/KayzenRoot/uads", "remote");
    const second = fingerprintFromMaterial("https://github.com/KayzenRoot/uads", "remote");
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.projectId).toBe(first.fingerprint.slice(0, 16));
    expect(first.projectId).toHaveLength(16);
  });

  it("prefers origin remote over filesystem path", () => {
    const fp = computeProjectFingerprint({
      originUrl: "https://github.com/KayzenRoot/uads.git",
      repoRoot: "D:/tmp/somewhere-else",
    });
    expect(fp.source).toBe("remote");
    expect(fp.material).toBe("https://github.com/KayzenRoot/uads");
  });

  it("falls back to a path-based fingerprint", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "uads-fp-"));
    const fp = computeProjectFingerprint({ originUrl: null, repoRoot: dir });
    expect(fp.source).toBe("path");
    expect(fp.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("matches git origin in a real repo when origin exists", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "uads-git-fp-"));
    execFileSync("git", ["init", "-b", "main"], { cwd: dir });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/KayzenRoot/uads.git"], {
      cwd: dir,
    });
    writeFileSync(path.join(dir, "README.md"), "x\n");
    const fp = computeProjectFingerprint({
      originUrl: "https://github.com/KayzenRoot/uads.git",
      repoRoot: dir,
    });
    expect(fp.projectId).toBe(
      computeProjectFingerprint({
        originUrl: "git@github.com:KayzenRoot/uads.git",
        repoRoot: dir,
      }).projectId,
    );
  });
});
