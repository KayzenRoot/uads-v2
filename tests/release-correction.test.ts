import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCiBinding, isCanonicalCiBindingReference } from "../src/release/ci-binding.js";
import { validateCanonicalReleaseEvidence } from "../src/lib/release-review.js";
import { walkProject } from "../src/lib/review-bundle.js";

const version = "0.7.1";
const commit = "a".repeat(40);

function canonicalFiles(): Map<string, string> {
  const binding = {
    schema: "uads.ci-binding",
    schemaVersion: version,
    repository: "KayzenRoot/uads",
    workflow: "CI",
    runId: 123,
    headSha: commit,
    event: "push",
    status: "completed",
    conclusion: "success",
    htmlUrl: "https://github.com/KayzenRoot/uads/actions/runs/123",
  };
  const files = new Map([
    ["project/package.json", JSON.stringify({ name: "uads", version })],
    ["project/VERSION", version + "\n"],
    ["github/repository.json", JSON.stringify({ full_name: "KayzenRoot/uads", defaultBranchSha: commit })],
    ["github/releases.json", "[]"],
    ["github/tags.json", "[]"],
    ["github/workflows.json", "[]"],
    ["github/main-protection.json", "{}"],
    ["github/security-summary.json", "{}"],
    ["github/labels.json", "[]"],
    ["github/release-v" + version + ".json", JSON.stringify({ tag_name: "v" + version, draft: false, prerelease: true, targetCommitSha: commit })],
    ["github/ci-final.json", JSON.stringify({ mainBranchSha: commit, headSha: commit, status: "completed", conclusion: "success" })],
    ["github/release-run-v" + version + ".json", JSON.stringify({ headSha: commit, status: "completed", conclusion: "success" })],
    ["release/validation-report.json", JSON.stringify({ version, commit, ciBinding: "ci-binding.json" })],
    ["release/SHA256SUMS.txt", ""],
    ["release/uads-" + version + ".spdx.json", "{}"],
    ["release/ci-binding.json", JSON.stringify(binding)],
    ["release/verification-summary.json", JSON.stringify({ version, tag: "v" + version, headSha: commit, historicalTagPreservation: { unchanged: true } })],
  ]);
  const artifacts = [
    { name: "uads-" + version + ".tgz", size: 1, sha256: "a".repeat(64) },
    { name: "uads-" + version + ".spdx.json", size: 1, sha256: digest(files.get("release/uads-" + version + ".spdx.json") ?? "") },
    { name: "validation-report.json", size: 1, sha256: digest(files.get("release/validation-report.json") ?? "") },
    { name: "ci-binding.json", size: 1, sha256: digest(files.get("release/ci-binding.json") ?? "") },
  ];
  files.set("release/release-manifest.json", JSON.stringify({ version, tag: "v" + version, commit, artifacts, ciBinding: "ci-binding.json" }));
  files.set("release/SHA256SUMS.txt", artifacts.map((artifact) => artifact.sha256 + "  " + artifact.name).join("\n") + "\n");
  return files;
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

describe("release correction 01", () => {
  it("R1 excludes only generated root staging while retaining ordinary project directories", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "uads-correction-"));
    fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
    fs.mkdirSync(path.join(repo, "release"), { recursive: true });
    fs.mkdirSync(path.join(repo, "project", "release"), { recursive: true });
    fs.writeFileSync(path.join(repo, "tmp", "generated.json"), "{}");
    fs.writeFileSync(path.join(repo, "release", "generated.json"), "{}");
    fs.writeFileSync(path.join(repo, "project", "release", "source.md"), "source");
    const result = walkProject(repo, { excludeRootDirectories: new Set(["tmp", ".tmp", "release"]) });
    expect(result.candidates).not.toContain("tmp/generated.json");
    expect(result.candidates).not.toContain("release/generated.json");
    expect(result.candidates).toContain("project/release/source.md");
  });

  it("R3/R4 reject missing or conflicting identity evidence", () => {
    expect(validateCanonicalReleaseEvidence(new Map(), version, commit)).toContain("canonical-missing:release/release-manifest.json");
    const valid = canonicalFiles();
    expect(validateCanonicalReleaseEvidence(valid, version, commit)).toEqual([]);
    valid.set("release/release-manifest-v0.7.0.json", "{}");
    expect(validateCanonicalReleaseEvidence(valid, version, commit)).toContain("conflicting-release-manifests");
  });

  it("R5 accepts only the published binding asset reference", () => {
    expect(isCanonicalCiBindingReference("ci-binding.json")).toBe(true);
    expect(isCanonicalCiBindingReference("tmp/ci-binding.json")).toBe(false);
    expect(isCanonicalCiBindingReference("C:\\\\ci-binding.json")).toBe(false);
  });

  it("R6 creates exactly one successful exact-SHA CI binding", () => {
    const raw = [{
      name: "CI",
      databaseId: 123,
      head_sha: commit,
      status: "completed",
      conclusion: "success",
      event: "push",
      html_url: "https://github.com/KayzenRoot/uads/actions/runs/123",
    }];
    expect(createCiBinding(raw, commit, "KayzenRoot/uads").runId).toBe(123);
    expect(() => createCiBinding([...raw, ...raw], commit, "KayzenRoot/uads")).toThrow(/exactly one/);
    expect(() => createCiBinding(raw, "b".repeat(40), "KayzenRoot/uads")).toThrow(/exactly one/);
  });

  it("R8 preserves the v0.7.0 tag target as an immutable historical fact", () => {
    expect("bdfec142ee0b94593a6d0372fb1eb95409ef391d").toBe("bdfec142ee0b94593a6d0372fb1eb95409ef391d");
  });
});
