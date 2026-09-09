import fs from "node:fs";
import path from "node:path";
import { EXCLUDED_DIRECTORY_NAMES } from "../lib/constants.js";
import { isSensitiveDataFile } from "../lib/exclusions.js";
import { sha256Hex, toPosix } from "../lib/hash.js";
import { atomicWriteJson, readJsonIfValid } from "../lib/atomic-write.js";
import { assertSchema } from "../lib/json-schema.js";
import { readGitSummary } from "../lib/git.js";
import type { UadsPaths } from "../lib/workspace.js";
import type { RepositoryMap } from "./types.js";

const MAP_VERSION = "0.2.0";
const KEY_MANIFESTS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "tsconfig.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "Dockerfile",
  "docker-compose.yml",
  "foundry.toml",
  "hardhat.config.ts",
  "hardhat.config.js",
];

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".sol": "solidity",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".gd": "gdscript",
};

type WalkStats = {
  languages: Map<string, number>;
  filesSampled: number;
};

function hashFile(abs: string): string | null {
  try {
    return sha256Hex(fs.readFileSync(abs));
  } catch {
    return null;
  }
}

function collectManifestHashes(repoRoot: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const rel of KEY_MANIFESTS) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs) || isSensitiveDataFile(rel)) {
      continue;
    }
    const digest = hashFile(abs);
    if (digest) {
      hashes[rel] = digest;
    }
  }
  return hashes;
}

function peekPackageJson(repoRoot: string): { scripts: Record<string, string>; frameworks: string[] } {
  const abs = path.join(repoRoot, "package.json");
  if (!fs.existsSync(abs)) {
    return { scripts: {}, frameworks: [] };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(abs, "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const frameworks: string[] = [];
    if (deps.react) frameworks.push("react");
    if (deps.next) frameworks.push("next");
    if (deps.vue) frameworks.push("vue");
    if (deps.express || deps.fastify || deps.hono) frameworks.push("http-server");
    if (deps.prisma) frameworks.push("prisma");
    if (deps.hardhat || deps.foundry) frameworks.push("evm");
    if (deps.viem || deps.ethers || deps.wagmi) frameworks.push("web3");
    return { scripts: pkg.scripts ?? {}, frameworks };
  } catch {
    return { scripts: {}, frameworks: [] };
  }
}

function detectPackageManager(repoRoot: string): string | null {
  if (fs.existsSync(path.join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(repoRoot, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(repoRoot, "bun.lock"))) return "bun";
  if (fs.existsSync(path.join(repoRoot, "package-lock.json"))) return "npm";
  if (fs.existsSync(path.join(repoRoot, "package.json"))) return "npm";
  return null;
}

function limitedWalk(repoRoot: string): WalkStats {
  const languages = new Map<string, number>();
  let filesSampled = 0;
  const visit = (absDir: string, depth: number): void => {
    if (depth > 4 || filesSampled > 400) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (filesSampled > 400) {
        return;
      }
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORY_NAMES.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }
        visit(path.join(absDir, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const rel = toPosix(path.relative(repoRoot, path.join(absDir, entry.name)));
      if (isSensitiveDataFile(rel)) {
        continue;
      }
      filesSampled += 1;
      const ext = path.posix.extname(rel).toLowerCase();
      const language = LANGUAGE_BY_EXT[ext];
      if (language) {
        languages.set(language, (languages.get(language) ?? 0) + 1);
      }
    }
  };
  visit(repoRoot, 0);
  return { languages, filesSampled };
}

function existsRel(repoRoot: string, rel: string): boolean {
  return fs.existsSync(path.join(repoRoot, rel));
}

export type InspectResult = {
  map: RepositoryMap;
  reused: boolean;
  fullWalk: boolean;
};

export function inspectRepository(input: {
  repoRoot: string;
  projectId: string;
  paths: UadsPaths;
  schemaRoot?: string;
  forceRefresh?: boolean;
}): InspectResult {
  const git = readGitSummary(input.repoRoot);
  const dirtyDigest = sha256Hex(git.status);
  const manifestHashes = collectManifestHashes(input.repoRoot);
  const cacheKey = sha256Hex(
    JSON.stringify({
      head: git.head,
      dirtyDigest,
      manifestHashes,
      mapVersion: MAP_VERSION,
    }),
  );

  if (!input.forceRefresh) {
    const cached = readJsonIfValid<RepositoryMap>(input.paths.repositoryMap);
    if (
      cached.ok &&
      cached.value.digest === cacheKey &&
      cached.value.schemaVersion === "0.2.0" &&
      cached.value.locations &&
      typeof cached.value.dirty === "boolean"
    ) {
      const reused = { ...cached.value, reused: true };
      return { map: reused, reused: true, fullWalk: false };
    }
  }

  const walk = limitedWalk(input.repoRoot);
  const languages = [...walk.languages.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const pkg = peekPackageJson(input.repoRoot);
  const modules = ["src", "app", "lib", "contracts", "backend", "frontend", "docs", "tests"]
    .filter((dir) => existsRel(input.repoRoot, dir))
    .map((dir) => ({ id: dir, path: dir, kind: dir === "docs" ? "docs" : "module" }));

  const entrypoints = ["src/cli.ts", "src/index.ts", "src/main.ts", "app/page.tsx", "cmd/main.go"]
    .filter((rel) => existsRel(input.repoRoot, rel));

  const locations = {
    agentsMd: ["AGENTS.md", "AGENTS.override.md"].filter((rel) => existsRel(input.repoRoot, rel)),
    cursor: [".cursor/rules", ".cursor/agents", ".cursor/skills"].filter((rel) => existsRel(input.repoRoot, rel)),
    skills: ["skills", ".agents/skills"].filter((rel) => existsRel(input.repoRoot, rel)),
  };

  const map: RepositoryMap = {
    schema: "uads.repository-map",
    schemaVersion: "0.2.0",
    projectId: input.projectId,
    generatedAt: new Date().toISOString(),
    mapVersion: MAP_VERSION,
    repositoryName: path.basename(input.repoRoot) || "repository",
    digest: cacheKey,
    gitHead: git.head,
    branch: git.branch,
    dirty: git.status !== "(clean)" && git.status.length > 0,
    dirtyDigest,
    reused: false,
    languages,
    packageManager: detectPackageManager(input.repoRoot),
    frameworks: pkg.frameworks,
    commands: {
      build: pkg.scripts.build ?? null,
      test: pkg.scripts.test ?? null,
      lint: pkg.scripts.lint ?? null,
      typecheck: pkg.scripts.typecheck ?? null,
    },
    signals: {
      docker: existsRel(input.repoRoot, "Dockerfile") || existsRel(input.repoRoot, "docker-compose.yml"),
      ci: existsRel(input.repoRoot, ".github/workflows"),
      tests: existsRel(input.repoRoot, "tests") || existsRel(input.repoRoot, "test"),
      docs: existsRel(input.repoRoot, "docs") || existsRel(input.repoRoot, "README.md"),
      agentsMd: existsRel(input.repoRoot, "AGENTS.md") || existsRel(input.repoRoot, "AGENTS.override.md"),
      cursor: existsRel(input.repoRoot, ".cursor"),
      skills: existsRel(input.repoRoot, "skills") || existsRel(input.repoRoot, ".agents/skills"),
      git: Boolean(git.repoRoot),
      database:
        existsRel(input.repoRoot, "prisma/schema.prisma") ||
        existsRel(input.repoRoot, "prisma") ||
        existsRel(input.repoRoot, "supabase") ||
        existsRel(input.repoRoot, "drizzle.config.ts") ||
        existsRel(input.repoRoot, "knexfile.js"),
      migrations:
        existsRel(input.repoRoot, "prisma/migrations") ||
        existsRel(input.repoRoot, "supabase/migrations") ||
        existsRel(input.repoRoot, "migrations") ||
        existsRel(input.repoRoot, "alembic"),
      web3:
        existsRel(input.repoRoot, "contracts") ||
        existsRel(input.repoRoot, "foundry.toml") ||
        existsRel(input.repoRoot, "hardhat.config.ts") ||
        existsRel(input.repoRoot, "hardhat.config.js"),
    },
    modules,
    entrypoints,
    locations,
    manifestHashes,
  };

  assertSchema("repository-map.schema.json", map, input.schemaRoot);
  atomicWriteJson(input.paths.repositoryMap, map);
  atomicWriteJson(input.paths.repositoryMapMeta, {
    digest: map.digest,
    gitHead: map.gitHead,
    dirtyDigest: map.dirtyDigest,
    generatedAt: map.generatedAt,
    mapVersion: MAP_VERSION,
  });
  return { map, reused: false, fullWalk: true };
}
