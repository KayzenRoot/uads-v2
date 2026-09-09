# EVIDENCE — UADS2-WO-003 / M30 Event Spine & Dashboard Operator Foundation

WORK ORDER: `UADS2-WO-003`

BASE SHA: `5a6e0d31ec99d2f89136fbd764257a588d625263`

HEAD SHA: `e156bd2738ce10d30da4b0881e37709eadd8716b` (implementation snapshot; final PR head and hosted gates remain auditor-bound)

## IMPLEMENTATION

Implemented the bounded M30 runtime surface on the existing global-first
sidecar. The slice adds a closed `uads.operational-event` v1.0.0 contract,
UUID identity, canonical SHA-256 integrity, immutable one-event-per-file
creation, bounded reads/retention, health projection, sanitized diagnostics and
errors, loopback HTTP/SSE dashboard, and additive CLI inspection commands.
No M01 orchestration, M08 semantic review pipeline, background worker, Hive
dependency, V1 mutation, release/version change or runtime dependency was added.

## FILES

- `schemas/operational-event.schema.json`
- `src/kernel/operational-event-types.ts`
- `src/kernel/operational-events.ts`
- `src/commands/dashboard.ts`
- `src/lib/workspace.ts`
- `src/cli.ts`
- `tests/operational-events.test.ts`
- `tests/dashboard-m30.test.ts`
- `scripts/benchmark/m30-event-dashboard.mjs`
- `scripts/benchmark/m30-b001-proof.mjs`
- `.engineering/evidence/UADS2-WO-003/`

## TESTS

| Check | Result |
|---|---|
| `npm ci` | PASS; npm reported one pre-existing moderate `adm-zip` advisory |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| focused M30 Vitest | PASS — 2 files / 6 tests |
| `npm run eval:orchestrator` | PASS — 9/9 |
| `npm run eval:execution` | PASS — 9/9 |
| `npm run validate:engineering` | PASS |
| `npm audit --audit-level=high` | PASS exit code; moderate advisory remains outside this scope |
| `npm test` | INCONCLUSIVE — Vitest runner stayed open without final output after approximately nine minutes and was stopped; no failure result was emitted |
| `npm run validate` | INCONCLUSIVE — reaches the same full Vitest runner behavior; no final result emitted |

## BENCHMARK

The isolated result is stored at
`.engineering/evidence/UADS2-WO-003/benchmark-m30.json`.

- Environment: Node `v24.18.0`, Windows `win32`, `x64`.
- Method: synchronous local sidecar operations measured with
  `performance.now()` in an isolated temporary `UADS_HOME`.
- Sample count: `24` writes, `24` bounded reads and `24` snapshots.
- Write throughput: `28.12` events/second; p50 `33.387 ms`; p95 `47.059 ms`.
- Bounded read p50 `30.412 ms`; p95 `38.117 ms`.
- Dashboard snapshot p50 `1501.025 ms`; p95 `2018.625 ms`.
- Retained events: `24`; configured retention cap: `1000`.
- Limitations: one developer host, synchronous filesystem path, no production
  SLO inferred, bounded 24-event sample.

## ENTERPRISE PILLARS

- Scale/load: bounded event size `64 KiB`, payload keys `32`, query limit `200`,
  SSE clients `8`, retention `1000`; overload is rejected/degraded.
- Resilience: restart/reload reads valid records; corrupt/hash-mismatched/
  unsupported records are skipped and degrade health; immutable creation avoids
  replacement; missing storage is `UNAVAILABLE`.
- Operational security: existing secret sanitization plus host-path redaction,
  loopback-only binding, security headers, no CDN/external scripts, no arbitrary
  file-read route, no new dependency.
- Production observability: objective event spine, health, diagnostics/errors,
  snapshots, recent events and SSE projection.
- Continuous safe operations: additive `observability/` sidecar paths, bounded
  CLI additions, versioned schema, no destructive migration; rollback is removal
  of the additive M30 implementation while prior sidecar domains remain readable.

## B-001 PROOF

The persisted proof is stored at
`.engineering/evidence/UADS2-WO-003/b001-proof.json`.

- Two persisted and reloaded `review.analysis` events: yes.
- Canonical signature preserved exactly as
  `eventType | gate | normalizedSubjectPath | normalizedFindingCode | evidenceDigest`.
- Signature version: `normalized-structured-analysis-signature-v1`.
- Deterministic numerator: `1`; denominator: `2`; rate: `0.5`.
- Raw event hashes: `0f792c0c035bb5fe93854a6dbaab0849058aee57d34831745ab284a6b1991cfa`,
  `af79974e71e8d6a843978504ba8bcab08a5e506c118f22c48cba75c4bf0f34e3`.
- This is M30 transport/schema proof only. It does not claim M08 semantic
  review-analysis integration.

## DASHBOARD

The server accepts only `127.0.0.1`. The objective endpoints are
`/api/snapshot`, `/api/events?limit=...` and `/api/stream`; `/` serves the
compiled no-external-asset dark operator shell. Missing telemetry is shown as
`UNAVAILABLE`; no mock metrics are emitted. Error and diagnostic events appear
as first-class snapshot data.

## SECURITY

The focused proof covers secret/path sanitization, closed schema rejection,
payload bounds, non-loopback rejection, security headers, traversal rejection,
and absence of external asset references. Event files are contained in the
global sidecar workspace and created without replacing an existing event ID.

## LIMITATIONS

Final exact-head hosted CI, CodeQL, Dependency Review, Cross-Platform
Compatibility and HEDS audit have not yet run on the implementation snapshot.
The full local Vitest and `validate` commands are INCONCLUSIVE due to the
non-returning runner described above. Visual fidelity to the owner binary
reference is not claimed because that binary is not versioned in the repository.

## CI

`PENDING — must be read from the exact pushed PR #22 head; no remote PASS is
claimed in this local evidence bundle.`

## EVIDENCE

- [B-001 proof](../evidence/UADS2-WO-003/b001-proof.json)
- [M30 benchmark](../evidence/UADS2-WO-003/benchmark-m30.json)
- [M30 planning delta](../../docs/v2/planning/M30-EVENT-SPINE-DASHBOARD-FOUNDATION.md)
- [Checkpoint delta](../checkpoints/CHECKPOINT-DELTA-UADS2-WO-003.md)

## PR

PR #22: https://github.com/KayzenRoot/uads-v2/pull/22

Same branch and PR retained; no merge performed. Ready for independent HEDS
exact-head final audit after push.

## STOP CONDITION

STOP at `READY_FOR_FINAL_HEDS_AUDIT`. Do not merge, start M01, implement full
M08 semantics, add dependencies, expose non-loopback HTTP, or claim hosted
approval from this local evidence.
