# 10 — Installation

## Global-first

UADS belongs in the user home, not in each git clone of a product.

```
~/.uads/
~/.uads/core/
~/.uads/skills/
~/.uads/agents/
~/.uads/adapters/
~/.uads/cache/
~/.uads/workspaces/
~/.uads/npm/          # fallback CLI prefix when the default npm global prefix is not writable
```

Override the home with `UADS_HOME`. Override the CLI npm prefix with `UADS_NPM_PREFIX` or `--prefix=`.

## Requirements

- Node.js **>= 20**
- `npm` on PATH
- No proprietary runtime

## Installer

```bash
# Unix
./scripts/install/install.sh

# Windows
./scripts/install/install.ps1
```

Both wrappers run `scripts/install/install.mjs`, which:

1. Validates Node.js and npm
2. Creates the `~/.uads` layout
3. Copies `core/`, `skills/`, `agents/`, and `adapters/` (skips existing files unless `--force`)
4. Installs dependencies and builds the CLI if needed
5. Installs the `uads` package with `npm install --global --prefix <dir>`
6. Installs managed host resources only when a host target is proven; Cursor uses `$UADS_CURSOR_HOME/.cursor/agents` or the existing user-level Cursor target. Codex and Generic Agent Skills are installed explicitly with `uads adapters install <adapter>`
7. Verifies the CLI by running `node <prefix>/(lib/)node_modules/uads/dist/cli.js --help` and `doctor` (no shell interpolation of paths)
8. Prints a PATH hint if the prefix is not already on PATH

If the default global npm prefix is not writable, the installer falls back to `~/.uads/npm` (or `UADS_NPM_PREFIX`) and explains the failure instead of silently skipping CLI installation.

The installer does not write `.uads/`, caches, reviews, work orders, or memory-bank files into the managed project.

## Host adapters

The supported adapters are `cursor`, `codex`, and `generic-agent-skills`.
Detection is read-only:

```bash
uads adapters list
uads adapters detect --json
uads adapters status --json
```

Explicit installation writes only global host resources and records ownership
hashes under `~/.uads/adapters/`:

```bash
uads adapters install cursor
uads adapters install codex
uads adapters install generic-agent-skills
uads adapters prepare generic-agent-skills --json
uads adapters uninstall generic-agent-skills
```

The adapter targets are fixed and global (`~/.cursor/agents`,
`~/.codex/agents`, and `~/.agents/skills/uads-orchestrator`). Unmanaged or
modified files, traversal, and symlink/junction escapes fail closed. Adapter
state never stores raw host paths, credentials, prompts, or arbitrary commands.

## Development from source

```bash
npm install
npm run build
node dist/cli.js doctor
```

`npm run lint` in this foundation is TypeScript `tsc --noEmit` (compile/static check). There is no ESLint config yet.
