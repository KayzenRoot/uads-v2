#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowDir = path.join(root, ".github", "workflows");
const { validateActionPins } = await import("../../dist/release/action-pins.js");

const files = {};
for (const name of fs.readdirSync(workflowDir).sort()) {
  if (!/\.ya?ml$/i.test(name)) continue;
  const file = path.join(workflowDir, name);
  files[path.relative(root, file).replaceAll(path.sep, "/")] = fs.readFileSync(file, "utf8");
}

const issues = validateActionPins(files);
const result = { ok: issues.length === 0, workflows: Object.keys(files), issues };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (issues.length > 0) process.exit(1);
