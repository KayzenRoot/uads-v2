import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type NpmInvocation = {
  command: string;
  argsPrefix: string[];
};

export function resolveNpmInvocation(): NpmInvocation {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter((value): value is string => Boolean(value));

  for (const cli of candidates) {
    if (fs.existsSync(cli)) {
      return { command: process.execPath, argsPrefix: [cli] };
    }
  }

  return { command: "npm", argsPrefix: [] };
}

export function runProcess(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): SpawnSyncReturns<string> {
  return spawnSync(command, args, {
    env: process.env,
    windowsHide: true,
    ...options,
    encoding: "utf8",
    shell: false,
  }) as SpawnSyncReturns<string>;
}

export function runNpm(args: string[], options: SpawnSyncOptions = {}): SpawnSyncReturns<string> {
  const npm = resolveNpmInvocation();
  return runProcess(npm.command, [...npm.argsPrefix, ...args], options);
}
