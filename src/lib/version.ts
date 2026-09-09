import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_UADS_VERSION } from "./constants.js";

export function findPackageRoot(startDir: string = path.dirname(fileURLToPath(import.meta.url))): string {
  let current = startDir;

  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

export function readUadsVersion(packageRoot?: string): string {
  const root = packageRoot ?? findPackageRoot();
  const versionFile = path.join(root, "VERSION");
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, "utf8").trim() || DEFAULT_UADS_VERSION;
  }

  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? DEFAULT_UADS_VERSION;
  }

  return DEFAULT_UADS_VERSION;
}
