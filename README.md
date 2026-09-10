# UADS V2

**Universal Autonomous Development Studio V2** by **NexLabs**.

[![CI](https://github.com/KayzenRoot/uads-v2/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/KayzenRoot/uads-v2/actions/workflows/ci.yml) [![CodeQL](https://github.com/KayzenRoot/uads-v2/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/KayzenRoot/uads-v2/actions/workflows/codeql.yml) [![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)

> **Status:** V2 bootstrap and architecture/discovery program. Runtime V2 capabilities are not considered implemented until their governed Work Orders are merged with evidence.

> **Licensing:** UADS V2 is proprietary, source-visible software. Public visibility, if enabled, is for transparency, auditability, security review and development workflow. It does **not** make the project open source. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

UADS V2 is a controlled continuation of UADS V1, preserving the frozen V1 baseline while evolving orchestration, review, context, model/effort routing, fault resolution, cost governance and optional Hive V2 interoperability.

## Standalone first

UADS V2 has two explicit modes:

```text
SOLO
User → UADS V2 Core → Result / Evidence

HIVE_CONNECTED
HiveTaskEnvelope → Optional Hive Bridge → UADS V2 Core → UADSQualityBundle → Hive
```

`SOLO` is mandatory and first-class. Hive V2 is an optional additive integration, never a required dependency for core UADS operation.

## Canonical V2 source

Start with [`docs/v2/README.md`](docs/v2/README.md). Source authority is:

1. [`docs/v2/11-CHECKPOINT.md`](docs/v2/11-CHECKPOINT.md)
2. [`docs/v2/10-DECISIONS-LEDGER.md`](docs/v2/10-DECISIONS-LEDGER.md)
3. [`docs/v2/03-SCOPE.md`](docs/v2/03-SCOPE.md)
4. [`docs/v2/09-DEFINITION-OF-DONE.md`](docs/v2/09-DEFINITION-OF-DONE.md)
5. [`docs/v2/04-ARCHITECTURE.md`](docs/v2/04-ARCHITECTURE.md)
6. [`docs/v2/02-REQUIREMENTS.md`](docs/v2/02-REQUIREMENTS.md)
7. [`docs/v2/13-REVIEW-PROTOCOL.md`](docs/v2/13-REVIEW-PROTOCOL.md)
8. active Work Order / Context Lock / Evidence Bundle / PR.

Inherited V1 documentation remains authoritative wherever the V2 overlay has not explicitly superseded it. Historical references to Apache-2.0 in inherited or frozen material do not override the current UADS V2 license for newly governed V2 content.

## 26-module V2 program

The complete discovery inventory is under [`docs/v2/modules/`](docs/v2/modules/README.md). Each module follows sessions S00–S07:

```text
S00 Problem & Success Metrics
S01 Technology Radar
S02 Architecture & Boundaries
S03 Failure / Security Model
S04 Test & Benchmark Design
S05 Implementation Slicing
S06 Integration & Hardening
S07 Module Freeze
```

Ideas remain `CANDIDATE` until approved. Approved sessions update GitHub before the next session begins.

## Chat/session continuity

A fresh ChatGPT/Cursor/Codex session does not need old conversation history. If the user says **“vamos continuar do chat antigo”** or equivalent, bootstrap from:

- [`docs/v2/continuity/CURRENT.json`](docs/v2/continuity/CURRENT.json)
- [`docs/v2/operations/CHAT-CONTINUITY-PROTOCOL.md`](docs/v2/operations/CHAT-CONTINUITY-PROTOCOL.md)
- [`docs/v2/operations/RESPONSE-AND-PROGRESS-STANDARD.md`](docs/v2/operations/RESPONSE-AND-PROGRESS-STANDARD.md)
- [`AGENTS.md`](AGENTS.md)

GitHub is project memory; conversation memory is only convenience.

## Build V2 using the installed UADS

The existing globally installed UADS V1 runtime remains the execution foundation while V2 is built:

```bash
uads doctor
uads status
```

Operational state remains global/sidecar-first under `~/.uads/`. Repository `.engineering/` records are static governance/evidence, not runtime state.

## Engineering lifecycle

```text
ANALYZE → SOURCE CHECK → NEXT NECESSARY INCREMENT
→ WORK ORDER → CONTEXT LOCK → PREFLIGHT
→ EXECUTOR → TESTS/EVIDENCE → PR → AUDIT
→ APPROVED / CORRECTION REQUIRED / BLOCKED
→ CHECKPOINT DELTA → MERGE → NEXT
```

Primary optimization target: **Time-to-Trusted-Merge**, while preserving security, correctness and required assurance.

## V1 lineage

Frozen source baseline:

- repository: `KayzenRoot/uads`
- commit: `312e32946798eb3abbb49a79af08e13efb7719dc`
- tree: `b2a6763045fc1dbb81b6ba2880bf1f77167d7133`
- inherited version: `0.12.1`
- tracked files: `489`

The UADS V1 repository remains untouched and independently usable. Prior copies of V1 or other historical material may remain governed by licenses that applied when those copies were distributed.

## Current development entry points

| Path | Purpose |
| --- | --- |
| `docs/v2/` | V2 canonical Source Pack |
| `docs/v2/modules/` | 26-module discovery program |
| `docs/v2/operations/` | review, continuity, response and session contracts |
| `docs/v2/continuity/` | machine-readable current state |
| `.engineering/` | Work Orders, locks, evidence and checkpoint deltas |
| `AGENTS.md` | executor/fresh-session bootstrap |
| `.cursorrules` | Cursor-specific execution rules |
| `src/`, `tests/`, `evals/` | inherited V1 implementation/test baseline to evolve under V2 Work Orders |

## License

**NexLabs UADS V2 Source-Visible Proprietary License v1.0.** See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

Copyright 2026 NexLabs. All rights reserved.
