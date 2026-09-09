# ADR-UADS2-009 — Dashboard-First Real-Time Operations

Status: ACCEPTED
Date: 2026-09-09

## Context

UADS V2 development must be observable from the beginning rather than adding observability after runtime modules are already built. The owner selected the latest approved UADS V2 visual concept as the canonical dashboard visual reference and requires the dashboard to surface system state, newly implemented capabilities, errors, diagnostics and development/runtime progress in real time wherever the underlying subsystem can provide objective events.

The current checkpoint still requires `UADS2-WO-001` baseline completion before any V2 runtime module implementation. This ADR does not bypass that gate.

## Decision

1. After the mandatory V1 operational baseline gate is approved, dashboard/observability foundations become an implementation priority and must be planned early enough that subsequent runtime modules expose their state through the dashboard as they are introduced.
2. The dashboard is the primary operator surface for UADS V2 system state, execution activity, health, errors, diagnostics, evidence status and module capability visibility.
3. Data displayed as real time must be event-backed or otherwise objectively refreshed from the source subsystem. The UI must never fabricate real-time state from stale snapshots.
4. Every new runtime capability must declare its dashboard observability contract as part of its Work Order and acceptance criteria when materially applicable.
5. Errors and diagnostic states are first-class dashboard data, not hidden implementation detail.
6. The latest owner-approved UADS V2 visual reference is the canonical visual target for dashboard fidelity. Implementation may use appropriate 2D/3D/web tooling, but fidelity, performance, accessibility and maintainability are acceptance concerns.
7. Dashboard construction must not duplicate Hive canonical governance authority. In HIVE_CONNECTED mode it may visualize Hive-provided macro truth through explicit contracts; in SOLO mode it remains fully functional from UADS-owned data.

## Consequences

- Telemetry/event contracts become architecture dependencies for runtime modules.
- Dashboard slices should be vertically integrated with the subsystem they expose rather than populated with mock operational claims.
- A module that cannot expose a requested metric must report `UNAVAILABLE`/degraded state explicitly.
- Visual fidelity is important, but correctness of live data and diagnostics takes precedence over decorative effects.
- The first runtime planning after `UADS2-WO-001` must reconcile M01/S00 sequencing with this dashboard-first observability requirement.

## Non-goals

- This ADR does not authorize runtime implementation before the baseline gate.
- This ADR does not require every low-level internal event to be persisted indefinitely.
- This ADR does not authorize Blender/Maya or any specific technology as mandatory; tooling remains an implementation decision based on fidelity and engineering constraints.

## Supersession

Any change that removes dashboard-first observability, weakens the real-time evidence requirement, or changes the canonical visual target requires a new ADR and checkpoint delta.
