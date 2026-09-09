import { describe, expect, it } from "vitest";
import { findActionPinIssues, validateActionPins } from "../src/release/action-pins.js";
import { createReleaseManifest, checksumFile } from "../src/release/release-artifacts.js";
import { MAIN_PROTECTION, repositoryConfigSnapshot } from "../src/release/github-config.js";
import { HISTORICAL_RELEASES, validateReleaseMetadata } from "../src/release/semver.js";
import { releaseTitle } from "../src/release/release-title.js";

const validMetadata = {
  version: "0.7.0",
  packageVersion: "0.7.0",
  versionFile: "0.7.0\n",
  lockfileVersion: "0.7.0",
  changelog: "# Changelog\n\n## [0.7.0] - 2026-08-31\n",
  branch: "main",
  currentSha: "a".repeat(40),
  originMainSha: "a".repeat(40),
};

describe("release engineering", () => {
  it("1: rejects a package version mismatch", () => {
    expect(validateReleaseMetadata({ ...validMetadata, packageVersion: "0.6.0" })).toContain("package-version-mismatch");
  });

  it("2: rejects invalid SemVer", () => {
    expect(validateReleaseMetadata({ ...validMetadata, version: "0.7" })).toContain("invalid-semver");
  });

  it("3: rejects a missing changelog version", () => {
    expect(validateReleaseMetadata({ ...validMetadata, changelog: "# Changelog\n" })).toContain("changelog-version-missing");
  });

  it("4: rejects a VERSION mismatch", () => {
    expect(validateReleaseMetadata({ ...validMetadata, versionFile: "0.6.0" })).toContain("VERSION-mismatch");
  });

  it("5: rejects a package-lock mismatch", () => {
    expect(validateReleaseMetadata({ ...validMetadata, lockfileVersion: "0.6.0" })).toContain("lockfile-version-mismatch");
  });

  it("6: fails closed on a tag conflict", () => {
    expect(validateReleaseMetadata({ ...validMetadata, tagSha: "b".repeat(40) })).toContain("release-tag-conflict");
  });

  it("7: accepts clean correct release metadata", () => {
    expect(validateReleaseMetadata(validMetadata)).toEqual([]);
  });

  it("8: rejects mutable external action refs", () => {
    expect(findActionPinIssues("uses: actions/checkout@v7\n", ".github/workflows/ci.yml")).toHaveLength(1);
  });

  it("9: accepts 40-character immutable external refs", () => {
    expect(findActionPinIssues(`uses: actions/checkout@${"a".repeat(40)} # v7\n`)).toEqual([]);
  });

  it("10: accepts local actions", () => {
    expect(validateActionPins({ "workflow.yml": "uses: ./.github/actions/local\n" })).toEqual([]);
  });

  it("11: generates deterministic sorted checksums", () => {
    const artifacts = [
      { name: "z.txt", size: 1, sha256: "z".repeat(64) },
      { name: "a.txt", size: 1, sha256: "a".repeat(64) },
    ];
    expect(checksumFile(artifacts)).toBe(checksumFile([...artifacts].reverse()));
    expect(checksumFile(artifacts).split("\n")[0]).toContain("a.txt");
  });

  it("12: release manifests reject secrets and absolute host paths", () => {
    const base = {
      version: "0.7.0",
      tag: "v0.7.0",
      commit: "a".repeat(40),
      generatedAt: "2026-08-31T00:00:00.000Z",
      artifacts: [{ name: "uads-0.7.0.tgz", size: 1, sha256: "a".repeat(64) }],
      validationReport: "validation-report.json",
      ciBinding: null,
    };
    expect(() => createReleaseManifest({ ...base, ciBinding: "ghp_" + "a".repeat(36) })).toThrow(/secret/i);
    expect(() => createReleaseManifest({ ...base, ciBinding: "C:\\Users\\owner\\ci.json" })).toThrow(/absolute/i);
  });

  it("13: repository configuration is idempotent at the pure-data layer", () => {
    expect(repositoryConfigSnapshot()).toEqual(repositoryConfigSnapshot());
    expect(repositoryConfigSnapshot().mainProtection).toEqual(MAIN_PROTECTION);
  });

  it("14: preserves the exact canonical historical version/SHA map", () => {
    expect(HISTORICAL_RELEASES.map(({ version, commit }) => ({ version, commit }))).toEqual([
      { version: "0.1.0", commit: "fed4a41fa606d2c20f045c49872c4a4a384ba341" },
      { version: "0.2.0", commit: "8a920a22f28e7317883776bb397060deaf5306d8" },
      { version: "0.3.0", commit: "ccd24218c1ffa2693f9e3d2d5dfe797738961ac0" },
      { version: "0.4.0", commit: "de0842435890517c02f5c1171cacd1fec3e845d7" },
      { version: "0.5.0", commit: "9b1012c11c135c2eaa8b191d0526e796a0c6bcda" },
      { version: "0.6.0", commit: "9433ca04d3db41411d313959f140a707459bae74" },
    ]);
  });

  it("16: release titles are version-aware and not globally hard-coded", () => {
    expect(releaseTitle("0.10.0")).toBe("UADS v0.10.0 - Runtime Adapters");
    expect(releaseTitle("0.10.1")).toBe("UADS v0.10.1 - Runtime Adapter Hardening");
    expect(releaseTitle("0.10.2")).toBe("UADS v0.10.2 - Adapter Root Identity Hardening");
    expect(releaseTitle("0.11.0")).toBe("UADS v0.11.0 - Assurance & Stabilization");
    expect(releaseTitle("0.10.2")).not.toContain("GitHub Release Engineering");
  });

  it("17: derives a deterministic title for a future changelog version", () => {
    const changelog = [
      "# Changelog",
      "",
      "## [0.12.1] - 2026-09-08",
      "",
      "### Highlights",
      "",
      "- Release titles now derive from the authoritative changelog.",
      "",
      "### Fixed",
      "",
      "- The publisher supplies the current changelog section to title derivation.",
      "",
    ].join("\n");

    expect(releaseTitle("0.12.1", changelog)).toBe("UADS v0.12.1 - Release titles now derive from the authoritative changelog.");
  });

  it("18: the exact 0.12.0 failure pattern is resolved by supplying changelog evidence", () => {
    const changelog = [
      "## [0.12.0] - 2026-09-07",
      "",
      "### Highlights",
      "",
      "- Delivered the bounded Host Execution and Receipt Boundary.",
      "",
    ].join("\n");

    expect(releaseTitle("0.12.0", changelog)).toBe("UADS v0.12.0 - Delivered the bounded Host Execution and Receipt Boundary.");
  });

  it("19: missing or malformed future title sources fail closed", () => {
    expect(() => releaseTitle("0.12.1")).toThrow("release title is not defined for version 0.12.1");
    expect(() => releaseTitle("0.12.1", "## [0.12.1] - 2026-09-08\n\n### Fixed\n\n- No Highlights section.\n")).toThrow("release title cannot be derived from changelog highlights");
    expect(() => releaseTitle("0.12.1", "## [0.12.0] - 2026-09-07\n\n### Highlights\n\n- Older version.\n")).toThrow("release changelog section is missing for version 0.12.1");
  });
});
