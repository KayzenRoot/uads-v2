# UADS V2 — I-WAVE-0 Source Baseline

Status: FROZEN CANDIDATE
Work Order: UADS2-WO-024
Implementation target: M30 S05.1 Truth Kernel + Living Cockpit
Base main commit: `b21cce7150c991dba347e28bb8e3752be9e2e941`

## Purpose
Bind the first executor-heavy implementation slice to the current source layout so the executor does not spend tokens rediscovering repository ownership or moving architecture casually.

## Critical source baseline

| Path | Base blob SHA | Role | Mutation policy |
|---|---|---|---|
| `src/kernel/operational-events.ts` | `c68b5a960c7774b877867ae2aa32505bd3bbff48` | immutable event spine, integrity, bounded read/retention, health, event subscription | MODIFY_ALLOWED, preserve immutable/integrity/sanitization contracts |
| `src/kernel/operational-event-types.ts` | `77ba2574d8c6b1a0d08ffce9459a09571beec972` | current event/health type contract | MODIFY_ALLOWED only for versioned M30 S05.1 contract evolution |
| `src/commands/dashboard.ts` | `172b21d89bbc3421e449935ad24f5df9a32f6600` | loopback HTTP/SSE operator projection | MODIFY_ALLOWED, projection only, never domain truth owner |
| `tests/operational-events.test.ts` | baseline bound to base commit | event-spine regression proof | MODIFY/EXTEND_REQUIRED |
| `tests/dashboard-m30.test.ts` | baseline bound to base commit | HTTP/SSE/dashboard truth regression proof | MODIFY/EXTEND_REQUIRED |
| `scripts/benchmark/m30-event-dashboard.mjs` | baseline bound to base commit | historical performance benchmark seam | MODIFY/EXTEND_ALLOWED if benchmark design requires |
| `schemas/operational-event.schema.json` | baseline bound to base commit | closed operational event schema | MODIFY_ALLOWED only with explicit version/schema compatibility proof |

## Existing behavior that must survive
- loopback-only dashboard binding;
- bounded SSE clients;
- immutable event files;
- SHA-256 canonical integrity verification;
- closed event schema validation;
- sanitization and host-path redaction;
- bounded event payload/scan/retention;
- corrupt/unsupported/tampered records become degraded/unavailable truth rather than accepted data;
- snapshot missing data remains UNAVAILABLE rather than fabricated;
- M30 remains projection/control plane, not authoritative owner for producing modules.

## New S05.1 responsibilities to add without redesign
1. Operational State Envelope with source owner, observed/evaluated times, freshness lease, truthClass, truthState, continuityState, reason code, lineage/evidence refs.
2. OTCL deterministic truth/freshness evaluation.
3. TCL continuity/gap state.
4. TPSC separation of SOURCE / DERIVED / INFERRED projections.
5. AOBC/CBF bounded observability pressure/cardinality protections sufficient for this slice.
6. PSCF privacy-safe correlation identifiers.
7. truthful cockpit projection of global health, freshness, continuity and telemetry pressure.
8. economic/routing surfaces render UNKNOWN/UNAVAILABLE until authoritative M07/M24/M05/M06 sources exist.
9. realtime delivery remains SSE default and does not require model calls.

## Explicitly forbidden in IW0
- adding LLM calls to render, refresh, summarize or animate the dashboard;
- mandatory Grafana, Kafka, Mimir, Tempo, Loki, OTel Collector or SaaS dependency;
- implementing M05/M06/M07/M24 business truth inside M30;
- adding mutation controls that bypass Governed Command ownership;
- claiming production SLOs from the historical developer-host benchmark;
- replacing M03 `readHostCapabilityProjection()` with adapter declarations;
- deep Hive-owned RAG/memory functionality;
- UGAS media/marketing functionality.

## Boundary drift rule
If implementation evidence shows one frozen path is structurally wrong, executor must report `NEEDS_ARCHITECTURE` with exact reason/path/dependency rather than silently relocating ownership.

## Source-change accounting
Every added/modified runtime file outside this baseline must be listed in the Evidence Bundle with reason, owner, interface affected, risk and whether the change expands blast radius.

## Freeze condition
This baseline is valid only against the named base commit. A later implementation branch must reconcile changes from `main` before dispatch and either re-affirm this baseline or produce a controlled source-baseline delta.