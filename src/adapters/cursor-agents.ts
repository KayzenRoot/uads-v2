import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findPackageRoot } from "../lib/version.js";
import { installHostAdapter, uninstallHostAdapter } from "./host-adapter-install.js";

export const UADS_AGENT_PREFIX = "uads-";
export const MANIFEST_NAME = "uads-managed-agents.json";

export function listCanonicalAgentFiles(packageRoot: string): string[] {
  const dir = path.join(packageRoot, "agents");
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(UADS_AGENT_PREFIX) && name.endsWith(".md"))
    .sort();
}

export function installCursorAgents(input: {
  uadsHome?: string;
  cursorUserHome?: string;
  packageRoot?: string;
}): { installed: string[]; skipped: string[]; cursorDir: string; error?: string } {
  const packageRoot = input.packageRoot ?? findPackageRoot();
  const agentFiles = listCanonicalAgentFiles(packageRoot);
  const cursorDir = resolveCursorAgentsDir(input.cursorUserHome);
  try {
    const state = installHostAdapter(
      "cursor",
      {
        uadsHome: input.uadsHome,
        packageRoot,
        hostHome: input.cursorUserHome,
      },
    );
    return {
      installed: state.resources.map((resource) => path.basename(resource.relativeTarget)).sort(),
      skipped: [],
      cursorDir,
    };
  } catch (error) {
    return {
      installed: [],
      skipped: agentFiles,
      cursorDir,
      error: `Cursor adapter skipped: cannot write ${cursorDir} (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

export function resolveCursorAgentsDir(cursorUserHome?: string): string {
  const home = cursorUserHome ?? process.env.CURSOR_USER_HOME ?? os.homedir();
  return path.join(home, ".cursor", "agents");
}

export function uninstallCursorAgents(input: {
  uadsHome?: string;
  cursorUserHome?: string;
  force?: boolean;
} = {}): void {
  uninstallHostAdapter("cursor", {
    uadsHome: input.uadsHome,
    hostHome: input.cursorUserHome,
    force: input.force,
  });
}
