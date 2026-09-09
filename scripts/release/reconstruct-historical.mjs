#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { HISTORICAL_RELEASES } = await import("../../dist/release/semver.js");
const repo = valueOf("--repo") ?? "KayzenRoot/uads";

for (const release of HISTORICAL_RELEASES) {
  verifyCommit(release.commit, release.version);
  const tagSha = remoteTagSha(`v${release.version}`);
  if (tagSha && tagSha !== release.commit) fail(`RELEASE_TAG_CONFLICT v${release.version}: ${tagSha}`);
  if (!tagSha) {
    run("git", ["tag", "-a", `v${release.version}`, release.commit, "-m", `${release.title} (historical reconstruction)`]);
    run("git", ["push", "origin", `refs/tags/v${release.version}`]);
  }
  const releaseExists = spawnSync("gh", ["release", "view", `v${release.version}`, "--repo", repo], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).status === 0;
  if (!releaseExists) {
    const notes = [
      `Historical release reconstructed from the original immutable version commit.`,
      `The source tag v${release.version} points to ${release.commit}; no historical binary artifact was rebuilt.`,
    ].join("\n\n");
    run("gh", ["release", "create", `v${release.version}`, "--repo", repo, "--title", release.title, "--notes", notes, "--prerelease", "--verify-tag"]);
  }
  process.stdout.write(`verified v${release.version} -> ${release.commit}\n`);
}

function verifyCommit(commit, version) {
  const packageJson = run("git", ["show", `${commit}:package.json`]);
  const value = JSON.parse(packageJson);
  if (value.version !== version) fail(`historical package version mismatch for ${version}`);
  const changelog = run("git", ["show", `${commit}:CHANGELOG.md`]);
  if (!changelog.includes(`## [${version}]`)) fail(`historical changelog missing ${version}`);
}

function remoteTagSha(tag) {
  const result = spawnSync("git", ["ls-remote", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const peeled = lines.find((line) => line.endsWith(`refs/tags/${tag}^{}`));
  return (peeled ?? lines[0])?.split(/\s+/)[0] ?? null;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) fail(result.stderr || `${command} ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function valueOf(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
