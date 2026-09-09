# EVIDENCE — UADS2-WO-003 / M30 Event Spine & Dashboard Operator Foundation

WORK ORDER: `UADS2-WO-003`

BASE SHA: `5a6e0d31ec99d2f89136fbd764257a588d625263`

HEAD SHA: `60b3f26f276a8f22fafb73b7d33f60cef16d053f` (correction implementation snapshot; final PR head and hosted gates remain auditor-bound)

AUDITED PR HEAD: `1f62e6ae225c7b4e2da0d956e573f5cf95a3b521` (latest pushed
content head observed before this metadata-only status update)

## IMPLEMENTATION

Implemented and corrected the bounded M30 runtime surface on the existing global-first
sidecar. The slice adds a closed `uads.operational-event` v1.0.0 contract,
UUID identity, canonical SHA-256 integrity, immutable one-event-per-file
creation, bounded reads/retention, health projection, sanitized diagnostics and
errors, loopback HTTP/SSE dashboard, and additive CLI inspection commands.
The correction closes HEDS CR-001 through CR-003 with fail-closed and
retention-isolation proof, locale-independent nested canonical hashing, and a
bounded operator identity/status panel.
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
| focused M30 Vitest | PASS — 2 files / 10 tests |
| focused regression selection | PASS — 6 files / 31 tests |
| `npm run eval:orchestrator` | PASS — 9/9 |
| `npm run eval:execution` | PASS — 9/9 |
| `npm run validate:engineering` | PASS |
| `npm audit --audit-level=high` | PASS exit code; moderate advisory remains outside this scope |
| `npm test` | INCONCLUSIVE — correction rerun stayed open without final output during a controlled window and was stopped; no failure result was emitted |
| `npm run validate` | INCONCLUSIVE — reaches the same full Vitest runner behavior; no final result emitted |

## CR-001

Closed with deterministic focused tests for the serialized event byte ceiling,
payload key ceiling, reload/reinstantiation, corrupt/unsupported/hash-mismatch
degradation while preserving valid records, M30-only retention with an
adjacent sidecar sentinel, max SSE clients, disconnect cleanup, visible
error/diagnostic projections and missing-source `UNAVAILABLE` behavior.

## CR-002

Closed with `compareCanonicalKeys`, an explicit locale-independent UTF-16
code-unit comparator used by canonical hashing. Nested payload objects with
different insertion order produce identical hashes. The B-001 signature remains
exactly `eventType | gate | normalizedSubjectPath | normalizedFindingCode |
evidenceDigest`.

## CR-003

Closed with a minimal dashboard panel showing Work Order ID, correlation ID and
execution identity from the latest objective event, plus a bounded selection of
existing `uadsStatus` fields. Missing values render as `UNAVAILABLE`; no mock or
external asset was added.

## BENCHMARK

The isolated result is stored at
`.engineering/evidence/UADS2-WO-003/benchmark-m30.json`.

- Environment: Node `v24.18.0`, Windows `win32`, `x64`.
- Method: synchronous local sidecar operations measured with
  `performance.now()` in an isolated temporary `UADS_HOME`.
- Sample count: `24` writes, `24` bounded reads and `24` snapshots.
- Write throughput: `26.04` events/second; p50 `35.402 ms`; p95 `58.961 ms`.
- Bounded read p50 `37.066 ms`; p95 `50.903 ms`.
- Dashboard snapshot p50 `1659.012 ms`; p95 `2174.484 ms`.
- Retained events: `24`; configured retention cap: `1000`.
- Retention proof: explicit cap `8`, input `10`, retained `8`, removed `2`,
  `withinCap=true`, `oldestRemoved=true`, `newestRetained=true`, health
  `HEALTHY`.
- Limitations: one developer host, synchronous filesystem path, no production
  SLO inferred; latency sample is bounded to 24 events and the retention proof
  uses an explicit bounded cap of 8.

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
- Raw event hashes: `2d892da7bde71a7594a21e967dc61081814f184c8df13a7b7d4e6d2ad10abd9d`,
  `6d1c8a54df434ef71f40607dfdbd5d0ac5558af6886e5202fd6f424f3bbf9b1c`.
- This is M30 transport/schema proof only. It does not claim M08 semantic
  review-analysis integration.

## DASHBOARD

The server accepts only `127.0.0.1`. The objective endpoints are
`/api/snapshot`, `/api/events?limit=...` and `/api/stream`; `/` serves the
compiled no-external-asset dark operator shell. The shell now includes bounded
Work Order/correlation/execution identity and selected existing UADS status
fields. Missing telemetry is shown as `UNAVAILABLE`; no mock metrics are
emitted. Error and diagnostic events appear as first-class snapshot data.

## SECURITY

The focused proof covers secret/path sanitization, closed schema rejection,
payload bounds, non-loopback rejection, security headers, traversal rejection,
absence of external asset references, M30-only cleanup and SSE lifecycle
limits. Event files are contained in the global sidecar workspace and created
without replacing an existing event ID. The prior HEDS audit identified no
HIGH/CRITICAL defect; the final audit of this correction remains pending.

## LIMITATIONS

Final exact-head hosted CI, CodeQL, Dependency Review, Cross-Platform
Compatibility and HEDS audit have not yet run on the correction PR head.
The full local Vitest and `validate` commands are INCONCLUSIVE due to the
non-returning runner described above. Visual fidelity to the owner binary
reference is not claimed because that binary is not versioned in the repository.

## CI

`PASS on audited PR head 1f62e6ae225c7b4e2da0d956e573f5cf95a3b521 — CI,
CodeQL, Dependency Review and UADS Cross-Platform Compatibility all completed
SUCCESS. Final HEDS audit remains pending.`

## EVIDENCE

- [B-001 proof](../evidence/UADS2-WO-003/b001-proof.json)
- [M30 benchmark](../evidence/UADS2-WO-003/benchmark-m30.json)
- [M30 planning delta](../../docs/v2/planning/M30-EVENT-SPINE-DASHBOARD-FOUNDATION.md)
- [Checkpoint delta](../checkpoints/CHECKPOINT-DELTA-UADS2-WO-003.md)

## PR

PR #22: https://github.com/KayzenRoot/uads-v2/pull/22

Same branch and PR retained; no merge performed. Hosted gates passed on the
audited PR head above; ready for independent HEDS exact-head final audit.

## STOP CONDITION

STOP at `READY_FOR_FINAL_HEDS_AUDIT`. Do not merge, start M01, implement full
M08 semantics, add dependencies, expose non-loopback HTTP, or claim hosted
approval from this local evidence.
