# UADS

**Universal Autonomous Development Studio** by **NexLabs**.

[![CI](https://github.com/KayzenRoot/uads/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/KayzenRoot/uads/actions/workflows/ci.yml) [![CodeQL](https://github.com/KayzenRoot/uads/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/KayzenRoot/uads/security/code-scanning) [![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

UADS is a pre-1.0, global-first autonomous software engineering orchestration framework for specialist delegation, independent review, evidence-based quality gates, context intelligence, and cost-aware execution.

This repository is the public open-source UADS product. Releases are published from exact validated SHAs in the [GitHub Releases](https://github.com/KayzenRoot/uads/releases) page. The TypeScript kernel remains provider-neutral: it does not edit customer projects or call model-provider APIs.

## Architecture Freeze v0.2 (summary)

- **Global-first install** under `~/.uads/`
- **Zero project footprint** by default — no operational UADS state in the managed project
- **Sidecar workspace** at `~/.uads/workspaces/<project-id>/`
- Agent Skills entrypoint, Cursor + Codex/generic adapters
- Context routing, repository map, dependency/impact map
- Token budget manager and cache-first prompt architecture
- Provider-neutral model routing, evidence protocol, review ZIP workflow
- Global specialist registry with 25 bounded built-in profiles, deterministic domain/gate/evidence obligation coverage, independent assurance, and semantic stale-plan binding
- Common Cursor/Codex/Generic Agent Skills adapters with ownership-safe global installation, sidecar-only Host Dispatch Bundles, and the bounded Host Execution handoff/Receipt Boundary with current-authority revalidation and 32-entry history retention
- Two-stage GitHub Direct Review Evidence with exact-SHA CI receipt, canonical workflow artifact, and release cross-checks
- Staged implementation roadmap

Normative detail: [`docs/`](docs/).

## Quick start

Requires Node.js 20+.

```bash
./scripts/install/install.ps1   # Windows
./scripts/install/install.sh    # Unix
uads doctor
uads review
```

If the installer used `~/.uads/npm` (or `UADS_NPM_PREFIX`), add that prefix (Unix: `.../bin`) to PATH.

From source:

```bash
npm install
npm run build
node dist/cli.js --help
node dist/cli.js doctor
node dist/cli.js inspect
node dist/cli.js plan --request "Change the primary button color."
node dist/cli.js index --json
node dist/cli.js impact --path src/cli.ts --json
node dist/cli.js context pack --json
node dist/cli.js dispatch --json
node dist/cli.js verify --json
node dist/cli.js status
node dist/cli.js resume
node dist/cli.js failure record --source test --input ./fail.txt --json
node dist/cli.js diagnose --failure <id> --json
node dist/cli.js cache status --json
node dist/cli.js cost status --json
node dist/cli.js models status --json
node dist/cli.js capabilities status --json
node dist/cli.js specialists list --json
node dist/cli.js specialists status --json
node dist/cli.js specialists explain --json
node dist/cli.js adapters list --json
node dist/cli.js adapters detect --json
node dist/cli.js adapters status --json
node dist/cli.js adapters prepare generic-agent-skills --json
node dist/cli.js adapters handoff generic-agent-skills --json
node dist/cli.js adapters receipt generic-agent-skills --state <state> --json
node dist/cli.js review
```

Host Execution is a bounded handoff and receipt capability after adapter
preparation. Receipts remain global and sidecar-only, with current and
immutable history. UADS does not invoke model providers, execute arbitrary
host commands, or create approval proof; the host owns IDE/agent/provider
execution, and approval-gated intent fails closed without durable proof.

`npm run lint` is TypeScript `tsc --noEmit` (compile/static check; not ESLint).

## Project and release documentation

- [Releases](https://github.com/KayzenRoot/uads/releases) and [changelog](CHANGELOG.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Governance](GOVERNANCE.md)
- [Release policy](RELEASING.md)
- [CI and security workflows](.github/workflows/)

Review bundles and validation evidence are written **outside** the project:

`~/.uads/workspaces/<project-id>/reviews/`
`~/.uads/workspaces/<project-id>/evidence/`

## Layout

Prompt 010 adds strict host adapter state and Host Dispatch Bundle contracts alongside the existing schemas.

| Path | Role |
| --- | --- |
| `src/` | CLI + orchestrator kernel |
| `skills/uads-orchestrator/` | Agent Skill + `references/` |
| `agents/` | Canonical `uads-*` specialist markdown |
| `evals/` | Orchestrator, execution, context, fault, cost, model-routing, specialist-routing, adapter, assurance, and fault-injection evals |
| `core/` | Reserved orchestrator modules |
| `adapters/` | Common Cursor / Codex / Generic Agent Skills host adapters |
| `schemas/` | Checkpoint, work order, evidence, review, profile, repo map, execution-run, index/impact/context pack, failure/diagnosis/memory, model-routing, and specialist-routing contracts |
| `.engineering/` | Static engineering delivery protocol, contracts, templates, adoption records, and cleanup reports; never UADS runtime sidecar state |
| `docs/` | Architecture Freeze v0.2 |
| `scripts/` | Install, GitHub audit/direct-review, release, review, validate |

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.

Copyright 2026 NexLabs.
