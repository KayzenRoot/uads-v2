# UADS2-WO-014 — Context Lock (POST-MERGE GOVERNANCE RECONSTRUCTION)

Status: RECONSTRUCTED AFTER MERGE
Reconstruction issue: #56 / UADS2-WO-014G
Original Work Order: UADS2-WO-014
Original PR: #50
Original candidate head: `c8137718c94d0f42d306a59638523e3bd1e48916`
Original merge SHA: `23c8615849bf43b8bf72069bc55f2eab2f606033`

> This file did not exist before PR #50 merged. It is a truthful post-merge reconstruction of the context boundary evidenced by the original Work Order, PR, gates and merged artifacts. It MUST NOT be cited as proof that a pre-merge Context Lock existed.

## Locked scope reconstructed from original evidence

- Module: M30 Production Observability & Real-Time Operations.
- Session: S00 problem, objectives and metrics reconciliation.
- Purpose: reconcile the pre-existing WO-003 event-spine/dashboard foundation against full M30 discovery before technology selection or new runtime implementation.
- Allowed changes: documentation/governance only for S00 framing, objective metrics, source/foundation reconciliation and anti-fabrication requirements.
- Forbidden scope: new telemetry dependencies, runtime storage redesign, alert/tracing/SLO implementation, M24/M08 ownership changes, production-readiness claims, technology-stack canonization.

## Canonical source order at execution time

Checkpoint > Decisions/ADRs > Scope > DoD > Architecture > Requirements > historical M30 foundation/evidence.

## Reconstructed invariants

1. No dashboard datum may be presented as live/current without objective source and freshness evidence.
2. Missing source projects UNAVAILABLE; stale source projects STALE/non-live; invalid/corrupt source projects DEGRADED or UNAVAILABLE with reason.
3. Historical WO-003 performance data are baselines, not production SLOs.
4. M24 retains Work Order/cost ledger semantics; M30 owns telemetry transport, health, alerts and dashboard projection.
5. Issue #39 remains the M30-owned telemetry overhead debt.
6. GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT remains mandatory.

## Reconstruction integrity note

This reconstruction exists to repair process evidence, not to retroactively alter chronology. The technical S00 decisions remain those already merged in PR #50.