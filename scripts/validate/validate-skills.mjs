#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNpm } from "../lib/exec.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist/lib/skills-preflight.js");
if (!fs.existsSync(dist)) {
  const build = runNpm(["run", "build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const { preflightUadsSkills } = await import("../../dist/lib/skills-preflight.js");
const result = preflightUadsSkills(path.join(root, "skills"));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) {
  process.exit(1);
}
