import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { EVIDENCE_FILE_NAMES } from "../src/lib/evidence.js";
import { inspectReviewBundle } from "../src/lib/inspect-review.js";
import { createReviewBundle, ReviewInspectionError, type ReviewManifest } from "../src/lib/review-bundle.js";
import { sha256Hex } from "../src/lib/hash.js";
import { readZip } from "../src/lib/zip-read.js";
import { FIXTURE_GITHUB_TOKEN, initRepo, tempDirs, writeFullEvidence } from "./helpers.js";

const schemaRoot = path.resolve(".");

function validManifest(overrides: Partial<ReviewManifest> = {}): ReviewManifest {
  return {
    schema: "uads.review-manifest",
    schemaVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    uadsVersion: "0.1.0",
    projectId: "abc123abc123abcd",
    fingerprint: "f".repeat(64),
    fingerprintSource: "remote",
    repositoryName: "sample",
    sidecar: "sidecar://workspaces/abc123abc123abcd",
    zipFileName: "uads-review-test.zip",
    git: {
      branch: "main",
      head: "a".repeat(40),
      originUrl: "https://github.com/KayzenRoot/uads",
      hasCommits: true,
    },
    includedFiles: ["README.md"],
    skipped: [],
    excludedDirectoryClasses: ["node_modules/"],
    evidenceIncluded: [...EVIDENCE_FILE_NAMES],
    exclusions: ["node_modules/"],
    inspection: { ok: true, errors: [] },
    ...overrides,
  };
}

function writeStoredZip(zipPath: string, files: Array<{ name: string; content: string }>): void {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localFull = Buffer.concat([local, name, data]);
    locals.push(localFull);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localFull.length;
  }

  const localBlob = Buffer.concat(locals);
  const centralBlob = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  fs.writeFileSync(zipPath, Buffer.concat([localBlob, centralBlob, eocd]));
}

function requiredZipFiles(manifest: ReviewManifest): Array<{ name: string; content: string }> {
  return [
    { name: "review-manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` },
    { name: "repository-tree.txt", content: "README.md\n" },
    { name: "git-status.txt", content: "(clean)\n" },
    { name: "git-diff.txt", content: "\n" },
    { name: "git-log.txt", content: "abc123 initial\n" },
    { name: "version.txt", content: "0.1.0\n" },
    { name: "README.txt", content: "UADS review bundle\n" },
    { name: "project/README.md", content: "# sample\n" },
    ...EVIDENCE_FILE_NAMES.map((name) => ({ name: `evidence/${name}`, content: `ok ${name}\n` })),
  ];
}

function writeFixtureZip(
  files: Record<string, string> = {},
  manifest: ReviewManifest = validManifest(),
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-inspect-"));
  const zipPath = path.join(dir, "review.zip");
  const zip = new AdmZip();
  const entries: Record<string, string> = {
    "review-manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "repository-tree.txt": "README.md\n",
    "git-status.txt": "(clean)\n",
    "git-diff.txt": "\n",
    "git-log.txt": "abc123 initial\n",
    "version.txt": "0.1.0\n",
    "README.txt": "UADS review bundle\n",
    "project/README.md": "# sample\n",
    ...Object.fromEntries(EVIDENCE_FILE_NAMES.map((name) => [`evidence/${name}`, `ok ${name}\n`])),
    ...files,
  };
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, "utf8"));
  }
  zip.writeZip(zipPath);
  return zipPath;
}

describe("final-byte inspection", () => {
  it("reopens the delivered ZIP after the final write and hashes those bytes", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    const probe = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    writeFullEvidence(path.join(home, "workspaces", probe.manifest.projectId, "evidence"));
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: true });
    const inspection = await inspectReviewBundle(result.zipPath, {
      requireEvidence: true,
      schemaRoot,
    });
    expect(inspection.ok).toBe(true);
    expect(result.manifest.inspection.ok).toBe(true);
    expect(sha256Hex(fs.readFileSync(result.zipPath))).toBe(result.sha256);
    expect(fs.readFileSync(result.checksumPath, "utf8")).toContain(result.sha256);
  });

  it("fails when required evidence is missing", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    await expect(
      createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: true }),
    ).rejects.toBeInstanceOf(ReviewInspectionError);

    const zipPath = writeFixtureZip({});
    const zip = new AdmZip(zipPath);
    zip.getEntries().forEach((entry) => {
      if (entry.entryName.startsWith("evidence/")) {
        zip.deleteFile(entry.entryName);
      }
    });
    zip.writeZip(zipPath);
    const inspection = await inspectReviewBundle(zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(inspection.errors.some((error) => error.startsWith("missing-entry:evidence/"))).toBe(true);
  });

  it("fails when an absolute host path remains", async () => {
    const zipPath = writeFixtureZip({ "evidence/tests.txt": "failed D:/Projects/uads/foo.test.ts\n" });
    const inspection = await inspectReviewBundle(zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(inspection.errors).toContain("absolute-host-path");
  });

  it("fails when an unredacted high-confidence token remains", async () => {
    const zipPath = writeFixtureZip({ "evidence/tests.txt": `token ${FIXTURE_GITHUB_TOKEN}\n` });
    const inspection = await inspectReviewBundle(zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(inspection.errors).toContain("unredacted-secret");
  });

  it("fails when the manifest is not valid JSON", async () => {
    const zipPath = writeFixtureZip({ "review-manifest.json": "{not-json" });
    const inspection = await inspectReviewBundle(zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(inspection.errors).toContain("manifest-invalid-json");
  });

  it("fails when the manifest violates JSON Schema", async () => {
    const manifest = validManifest();
    const invalid = { ...manifest } as Record<string, unknown>;
    delete invalid.projectId;
    const zipPath = writeFixtureZip({ "review-manifest.json": `${JSON.stringify(invalid)}\n` });
    const inspection = await inspectReviewBundle(zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(inspection.errors.some((error) => error.startsWith("schema:"))).toBe(true);
  });

  it("fails on duplicate ZIP entry names", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-dup-"));
    const zipPath = path.join(dir, "review.zip");
    const files = requiredZipFiles(validManifest());
    files.push({ name: "README.txt", content: "duplicate\n" });
    writeStoredZip(zipPath, files);
    const inspection = await inspectReviewBundle(zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(inspection.errors).toContain("duplicate-entry");
  });

  it("fails on unsafe ZIP entry paths", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uads-unsafe-"));
    const zipPath = path.join(dir, "review.zip");
    writeStoredZip(zipPath, [...requiredZipFiles(validManifest()), { name: "../escape.txt", content: "nope\n" }]);
    const inspection = await inspectReviewBundle(zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(inspection.errors).toContain("unsafe-entry-path");
  });

  it("fails when includedFiles does not match project entries", async () => {
    const zipPath = writeFixtureZip({}, validManifest({ includedFiles: ["src/missing.ts"] }));
    const inspection = await inspectReviewBundle(zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(inspection.errors).toContain("includedFiles-mismatch");
  });

  it("cannot retain a successful result after the ZIP bytes are mutated", async () => {
    const { repo, home } = tempDirs();
    initRepo(repo, "https://github.com/KayzenRoot/uads.git");
    fs.writeFileSync(path.join(repo, "README.md"), "# sample\n");
    const probe = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: false });
    writeFullEvidence(path.join(home, "workspaces", probe.manifest.projectId, "evidence"));
    const result = await createReviewBundle({ cwd: repo, uadsHome: home, requireEvidence: true });
    expect(result.manifest.inspection.ok).toBe(true);

    const zip = new AdmZip(result.zipPath);
    zip.addFile("project/leaked.txt", Buffer.from("path D:/Projects/uads/secret\n", "utf8"));
    zip.writeZip(result.zipPath);

    const inspection = await inspectReviewBundle(result.zipPath, { requireEvidence: true, schemaRoot });
    expect(inspection.ok).toBe(false);
    expect(sha256Hex(fs.readFileSync(result.zipPath))).not.toBe(result.sha256);
    const names = (await readZip(result.zipPath)).map((entry) => entry.name);
    expect(names).toContain("project/leaked.txt");
  });
});
