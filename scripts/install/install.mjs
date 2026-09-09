#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runNpm } from "../lib/exec.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const options = {
    force: false,
    skipBuild: false,
    help: false,
    prefix: process.env.UADS_NPM_PREFIX || "",
  };
  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    else if (arg === "--skip-build") options.skipBuild = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--prefix=")) options.prefix = arg.slice("--prefix=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.uads-write-probe-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function copyTree(src, dest, force) {
  if (!fs.existsSync(src)) {
    return;
  }
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        files.push(abs);
      }
    }
  };
  walk(src);
  for (const file of files) {
    const rel = path.relative(src, file);
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target) && !force) {
      process.stdout.write(`skip existing ${target}\n`);
      continue;
    }
    fs.copyFileSync(file, target);
  }
}

function resolveModuleCli(prefix) {
  const candidates = [
    path.join(prefix, "node_modules", "uads", "dist", "cli.js"),
    path.join(prefix, "lib", "node_modules", "uads", "dist", "cli.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function resolveCli(prefix) {
  const unix = path.join(prefix, "bin", "uads");
  const winCmd = path.join(prefix, "uads.cmd");
  const winPs = path.join(prefix, "uads.ps1");
  const moduleCli = resolveModuleCli(prefix);
  if (process.platform === "win32") {
    if (fs.existsSync(winCmd)) return { kind: "bin", path: winCmd };
    if (fs.existsSync(winPs)) return { kind: "bin", path: winPs };
  }
  if (fs.existsSync(unix)) return { kind: "bin", path: unix };
  if (moduleCli) return { kind: "node", path: moduleCli };
  return null;
}

function verifyCli(prefix, resolved) {
  const cliJs = resolveModuleCli(prefix) ?? (resolved.kind === "node" ? resolved.path : null);
  if (!cliJs) {
    fail(`Cannot verify CLI without dist/cli.js under ${prefix}`);
  }
  const help = spawnSync(process.execPath, [cliJs, "--help"], { encoding: "utf8", shell: false });
  if (help.status !== 0 || !help.stdout.includes("uads")) {
    fail(`uads --help failed after install.\n${help.stdout}\n${help.stderr}`);
  }
  const doctor = spawnSync(process.execPath, [cliJs, "doctor"], { encoding: "utf8", shell: false });
  if (doctor.status !== 0 || !doctor.stdout.includes("UADS doctor")) {
    fail(`uads doctor failed after install.\n${doctor.stdout}\n${doctor.stderr}`);
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(`UADS global-first installer (MVP)

Usage:
  node scripts/install/install.mjs [--force] [--skip-build] [--prefix=<dir>]

Requires Node.js >= 20 and npm. Installs layout under $UADS_HOME (default ~/.uads)
and installs the uads CLI via npm --prefix. Does not write into the managed project.
`);
  process.exit(0);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  fail(`Node.js >= 20 is required. Found ${process.version}`);
}

const npmCheck = runNpm(["--version"]);
if (npmCheck.status !== 0) {
  fail(
    `npm is not available on PATH. Install Node.js/npm and retry.\n${npmCheck.error ?? ""}\n${npmCheck.stderr}\n${npmCheck.stdout}`,
  );
}

const uadsHome = process.env.UADS_HOME
  ? path.resolve(process.env.UADS_HOME)
  : path.join(os.homedir(), ".uads");

for (const dir of ["core", "skills", "agents", "adapters", "cache", "workspaces", "npm"]) {
  fs.mkdirSync(path.join(uadsHome, dir), { recursive: true });
}

copyTree(path.join(root, "core"), path.join(uadsHome, "core"), options.force);
copyTree(path.join(root, "skills"), path.join(uadsHome, "skills"), options.force);
copyTree(path.join(root, "agents"), path.join(uadsHome, "agents"), options.force);
copyTree(path.join(root, "adapters"), path.join(uadsHome, "adapters"), options.force);

if (!options.skipBuild) {
  if (!fs.existsSync(path.join(root, "node_modules"))) {
    const installDeps = runNpm(["install"]);
    process.stdout.write(installDeps.stdout);
    process.stderr.write(installDeps.stderr);
    if (installDeps.status !== 0) fail("npm install failed");
  }
  const build = runNpm(["run", "build"]);
  process.stdout.write(build.stdout);
  process.stderr.write(build.stderr);
  if (build.status !== 0) fail("npm run build failed");
}

if (!fs.existsSync(path.join(root, "dist", "cli.js"))) {
  fail("dist/cli.js is missing. Build the CLI before installing.");
}

const fallbackPrefix = path.join(uadsHome, "npm");
let prefix = options.prefix ? path.resolve(options.prefix) : "";
let prefixSource = "flag-or-env";

if (!prefix) {
  const globalPrefix = runNpm(["prefix", "-g"]);
  const candidate = (globalPrefix.stdout || "").trim();
  if (candidate && isWritable(candidate)) {
    prefix = candidate;
    prefixSource = "npm-global";
  } else {
    prefix = fallbackPrefix;
    prefixSource = "uads-home";
    if (candidate && !isWritable(candidate)) {
      process.stderr.write(
        `Global npm prefix is not writable: ${candidate}\nFalling back to ${fallbackPrefix}\n`,
      );
    }
  }
}

fs.mkdirSync(prefix, { recursive: true });
if (!isWritable(prefix)) {
  fail(
    `Cannot write npm prefix ${prefix}. Set UADS_NPM_PREFIX to a writable directory or fix npm permissions.`,
  );
}

const installCli = runNpm(["install", "--global", "--prefix", prefix, root]);
process.stdout.write(installCli.stdout);
process.stderr.write(installCli.stderr);
if (installCli.status !== 0) {
  fail(
    `CLI install failed for prefix ${prefix} (${prefixSource}). If this is a permissions error, set UADS_NPM_PREFIX to a writable path.`,
  );
}

const resolved = resolveCli(prefix);
if (!resolved) {
  fail(`CLI files were not found under ${prefix} after npm install.`);
}

verifyCli(prefix, resolved);

const pathHint = process.platform === "win32" ? prefix : path.join(prefix, "bin");
const adapterSummaries = [];

try {
  const detectPath = path.join(root, "dist", "adapters", "host-adapter-detect.js");
  const installPath = path.join(root, "dist", "adapters", "host-adapter-install.js");
  if (fs.existsSync(detectPath) && fs.existsSync(installPath)) {
    const { detectHostAdapter } = await import(pathToFileURL(detectPath).href);
    const { installHostAdapter } = await import(pathToFileURL(installPath).href);
    const hostHome = process.env.UADS_CURSOR_HOME || process.env.CURSOR_USER_HOME;
    const detection = detectHostAdapter("cursor", { hostHome });
    if (detection.status === "SUPPORTED") {
      const adapterState = installHostAdapter("cursor", {
        uadsHome,
        hostHome,
        packageRoot: root,
      });
      adapterSummaries.push({
        adapterId: "cursor",
        support: detection.status,
        install: adapterState.installStatus,
        ownership: adapterState.ownershipStatus,
      });
      process.stdout.write(
        `Cursor adapter agents: ${adapterState.resources.length} managed resource(s)\n`,
      );
    } else {
      adapterSummaries.push({
        adapterId: "cursor",
        support: detection.status,
        install: "NOT_INSTALLED",
        ownership: "UNKNOWN",
      });
      process.stdout.write(`Cursor adapter not installed: host is ${detection.status}\n`);
    }
  }
} catch (error) {
  process.stderr.write(
    `Cursor adapter optional install skipped: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  adapterSummaries.push({
    adapterId: "cursor",
    support: "BLOCKED",
    install: "NOT_INSTALLED",
    ownership: "UNKNOWN",
  });
}

fs.writeFileSync(
  path.join(uadsHome, "install-manifest.json"),
  `${JSON.stringify(
    {
      product: "UADS",
      owner: "NexLabs",
      prefix,
      prefixSource,
      cli: resolved.path,
      pathHint,
      node: process.version,
      adapters: adapterSummaries,
      installedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(`UADS global layout ready at ${uadsHome}\n`);
process.stdout.write(`uads CLI installed via npm prefix ${prefix}\n`);
process.stdout.write(`Add to PATH: ${pathHint}\n`);
process.stdout.write("Zero project footprint: no project files were modified.\n");
