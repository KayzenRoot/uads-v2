# Work Order — `UADS2-WO-003`

Status: `ACTIVE — CORRECTION IMPLEMENTED / FINAL HEDS AUDIT PENDING`
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-003-m30-event-dashboard-foundation`
Base Git SHA: `5a6e0d31ec99d2f89136fbd764257a588d625263`
Issue: #21
Scope class: `bounded runtime foundation`
Risk: `MEDIUM`
Primary module: `M30 — Production Observability & Real-Time Operations`

## Objective

Implement the first bounded UADS V2 runtime slice: an objective, privacy-safe operational event spine plus a local real-time dashboard/operator foundation.

This slice MUST consume ADR-UADS2-009, ADR-UADS2-010 and the owner-approved B-001 amendment. It MUST integrate with the existing global-first sidecar rather than create a parallel state root.

## Context lock

Canonical source lock: `.engineering/context-locks/UADS2-WO-003-CONTEXT-LOCK.md`.

## Included scope

- Add a closed, versioned `uads.operational-event` schema and TypeScript types.
- Add stable event identity plus deterministic content hash verification.
- Persist immutable event records under the existing project sidecar workspace.
- Add bounded event read/query behavior and bounded retention.
- Add health semantics: `HEALTHY`, `DEGRADED`, `UNAVAILABLE`.
- Treat errors and diagnostics as first-class event categories.
- Add B-001-compatible review-analysis event fields without implementing the full M08 review pipeline.
- Add a local dashboard/operator HTTP server using Node.js built-ins only.
- Bind dashboard server to loopback by default and reject non-loopback binding in this slice.
- Add a real-time event stream for the dashboard using Server-Sent Events or an equivalently dependency-free local mechanism.
- Add objective dashboard snapshot data from existing UADS state plus M30 events.
- Expose missing source data as `UNAVAILABLE`/degraded, never synthetic values.
- Add CLI entry points needed to start the dashboard and inspect M30 status/events.
- Add tests and benchmark evidence required below.
- Preserve global-first sidecar semantics and SOLO operation.

## Explicitly out of scope

- No broad M01 Sequential Agent Orchestrator implementation.
- No full M08 HEDS review runtime implementation.
- No background worker implementation.
- No model-router rewrite.
- No Hive dependency in SOLO.
- No V1 source or repository mutation.
- No publication/release/version bump.
- No broad UI feature set beyond the operator foundation.
- No arbitrary external network binding.
- No user-supplied arbitrary event injection CLI.
- No new runtime dependency unless this Work Order is explicitly amended and re-reviewed.

## Event contract

Target schema: `uads.operational-event` v1.0.0.

Minimum identity:
- `eventId`: opaque stable event identity generated once;
- `eventHash`: deterministic SHA-256 over canonical persisted event content excluding `eventHash`;
- `projectId`;
- `correlationId`;
- `workOrderId` nullable;
- `executionRunId` nullable;
- `reviewId` nullable;
- `eventType`;
- `sourceComponent`;
- `severity`;
- `occurredAt`;
- `recordedAt`.

Operational state may be `HEALTHY`, `DEGRADED`, `UNAVAILABLE` or null when not a health transition.

For `review.analysis` events, the B-001 fields are mandatory:
- `gate`;
- `normalizedSubjectPath`;
- `normalizedFindingCode`;
- `evidenceDigest`.

The canonical duplicate-analysis signature remains:
`eventType | gate | normalizedSubjectPath | normalizedFindingCode | evidenceDigest`.

## Persistence design constraints

- Extend `getUadsPaths()/ensureWorkspace()` with a project observability root under the existing workspace.
- Prefer immutable one-event-per-file records under `observability/events/` to avoid shared append corruption.
- Persist via safe/sanitized data and atomic file creation semantics.
- Event readers MUST validate schema and content hash.
- Corrupt/unsupported records MUST NOT crash the dashboard; they surface as degraded evidence.
- Reads are bounded by default and have a hard maximum.
- Retention is bounded and cleanup cannot mutate other sidecar domains.
- Restarts must recover prior valid events from disk.

## Dashboard/operator foundation

- Local Node.js HTTP server only, no new web framework.
- Default bind: `127.0.0.1`.
- Non-loopback bind rejected in this Work Order.
- Static operator shell served by compiled UADS code/assets without CDN/external script dependency.
- APIs must expose only sanitized objective state.
- Real-time event updates use a dependency-free stream such as SSE.
- Initial panels: overall health, latest activity, recent errors/diagnostics, Work Order/correlation identity when available, M30 event counts, and existing UADS status fields that can be read objectively.
- Missing metrics render as `UNAVAILABLE`, never fake zero/mock telemetry.
- UI visual direction follows ADR-UADS2-009. Exact pixel-fidelity to the owner-approved binary reference is not claimed until that binary is versioned in the repository.

## Enterprise readiness classification

### Scale & load — COVERED via M27
Acceptance for this slice:
- bounded event size;
- bounded query limit and SSE client count;
- bounded retention;
- benchmark records event-write/read throughput and p50/p95 without inventing a production SLO;
- overload returns explicit degraded/rejected behavior rather than unbounded growth.

### Resilience — COVERED via M28
Acceptance:
- process restart reads prior valid events;
- corrupt event files do not crash the service;
- failed persistence produces explicit `UNAVAILABLE`/error state;
- immutable records are not partially overwritten;
- dashboard remains available in degraded mode when one data source is unavailable.

### Operational security — COVERED via M29
Acceptance:
- existing secret sanitization applies before persistence/output;
- loopback-only binding;
- no external scripts/CDNs;
- no arbitrary file-read endpoint;
- security headers on HTTP responses;
- bounded payload keys/values;
- no new dependency/supply-chain surface.

### Production observability — COVERED directly by M30
Acceptance:
- objective event spine, health state, diagnostics, SSE and dashboard snapshot;
- correlation/Work Order identity;
- B-001 event contract;
- no fabricated real-time claims.

### Continuous safe operations — COVERED via M31
Acceptance:
- additive sidecar paths only;
- existing state remains readable if M30 is removed/rolled back;
- schema is versioned and unsupported versions fail closed/degraded;
- no destructive migration;
- CLI additions are additive;
- rollback path documented.

## Acceptance criteria

- [x] Event JSON Schema is closed, versioned and validated through existing AJV infrastructure.
- [x] Event hash recomputes identically after persistence/reload.
- [x] Event IDs are unique and stable after persistence.
- [x] Sanitization prevents secret-bearing operational strings from durable event storage.
- [x] Unsafe/oversized payloads fail closed.
- [x] Event store is contained inside the correct global sidecar workspace.
- [x] Valid event records survive process restart/reload.
- [x] Corrupt/unsupported records cause degraded state, not process crash.
- [x] Read/query limits and retention bounds are enforced.
- [x] Dashboard binds only to loopback.
- [x] Dashboard exposes objective snapshot data and real-time updates.
- [x] Errors/diagnostics are first-class and visible.
- [x] Missing telemetry appears as `UNAVAILABLE`/degraded.
- [x] B-001 review-analysis schema fields are mandatory for that event type.
- [x] B-001 duplicate signature can be recomputed deterministically from persisted test events with non-zero denominator.
- [x] No full M08/M01 runtime behavior is implemented.
- [x] No runtime dependency is added.
- [x] SOLO works with Hive absent.
- [ ] Existing full lint/typecheck/build/test/evals remain green (full Vitest runner did not return; see evidence).
- [x] New focused M30 tests pass.
- [x] M30 overhead benchmark is reported with method and limitations.
- [ ] Evidence Bundle binds the final exact PR head and hosted gates (implementation snapshot is recorded; final HEDS remains pending).
- [ ] Exact-head CI, CodeQL, Dependency Review and Cross-Platform Compatibility pass.
- [ ] HEDS returns `APPROVED` before merge.

## Required tests

See `.engineering/plans/UADS2-WO-003-TEST-PLAN.md`.

## Deliverables

- M30 runtime implementation under bounded `src/` paths.
- M30 schemas under `schemas/`.
- focused tests under `tests/`.
- dashboard/operator foundation.
- benchmark script/evidence.
- Evidence Bundle and Checkpoint Delta.
- same branch/PR for implementation and correction loop.

## Stop conditions

STOP if:
- base/source lock is stale;
- new dependency becomes necessary without explicit amendment;
- non-loopback exposure is required;
- implementation expands into broad M01/M08 behavior;
- real-time UI needs fabricated data to look complete;
- event privacy cannot be proven;
- B-001 contract is weakened;
- existing runtime compatibility regresses;
- any HIGH/CRITICAL unresolved defect exists.

## Review

HEDS delta-first exact-head review. Runtime implementation starts only after preflight source/contract review is acceptable.

## Correction closure

HEDS CR-001 is addressed with deterministic focused proof for serialized-size
and payload-key ceilings, restart/reinstantiation reload, M30-only retention
with adjacent sidecar preservation, corrupt/unsupported/hash-mismatched record
degradation, SSE client limits and disconnect cleanup, objective error/
diagnostic projection, and missing-source `UNAVAILABLE` behavior.

HEDS CR-002 is addressed with a locale-independent UTF-16 code-unit comparator
for canonical hashing. Nested payload objects with different insertion order
now produce the same event hash; the B-001 signature contract is unchanged.

HEDS CR-003 is addressed with bounded dashboard panels for Work Order ID,
correlation ID, execution identity and selected existing UADS status fields.
Missing values render as `UNAVAILABLE`.

## Implementation checkpoint

The correction implementation snapshot is `60b3f26f276a8f22fafb73b7d33f60cef16d053f` and adds the bounded event spine,
immutable sidecar records, health projection, loopback dashboard/SSE surface,
CLI inspection commands, correction-focused tests, refreshed B-001 proof and
retention benchmark evidence.
The branch remains unmerged and is ready for a new exact-head HEDS final audit.
