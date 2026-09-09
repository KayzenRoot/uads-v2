import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function resolveNpmInvocation() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter((value) => typeof value === "string" && value.length > 0);

  for (const cli of candidates) {
    if (fs.existsSync(cli)) {
      return { command: process.execPath, argsPrefix: [cli] };
    }
  }

  return { command: "npm", argsPrefix: [] };
}

export function runProcess(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
    ...options,
    shell: false,
  });
}

export function runNpm(args, options = {}) {
  const npm = resolveNpmInvocation();
  return runProcess(npm.command, [...npm.argsPrefix, ...args], options);
}
