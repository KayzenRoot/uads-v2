#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNpm } from "../lib/exec.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(root, "dist", "cli.js");

if (!fs.existsSync(cli)) {
  const build = runNpm(["run", "build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const result = spawnSync(process.execPath, [cli, "review", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
