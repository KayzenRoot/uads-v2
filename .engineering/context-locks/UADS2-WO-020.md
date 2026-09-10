# UADS2-WO-020 — Context Lock

Status: ACTIVE
Module: M30 Production Observability & Real-Time Operations
Session: S05.1 Truth Kernel & Living Cockpit Vertical Slice
Issue: #65
Base main SHA: `786d2ca204fb55b3ec402e27984b6bf778f18d6a`
Risk: HIGH

## Frozen inputs
- M30 S00 problem/objectives/metrics
- M30 S01 technology radar
- M30 S01.5 proprietary invention radar
- M30 S02 architecture and state/command contracts
- M30 S03 failure/security/recovery doctrine
- M30 S03 token-spend safety
- M30 S04 proof/benchmark matrix
- M30 S04 economic chaos/release floors
- ADR-UADS2-011 S05 Vertical Implementation Slices
- existing local-first `operational-events` and dashboard/SSE foundation

## Governing truths
1. Source-owning modules remain authoritative; M30 may not create a second domain truth source.
2. No displayed datum may claim CURRENT/LIVE without freshness and lineage evidence.
3. Missing or ambiguous data renders STALE, DEGRADED, UNAVAILABLE or UNKNOWN as appropriate.
4. Dashboard rendering/refresh must not require an LLM call.
5. This slice is read-only/diagnostic at the LOCP boundary unless a separately proven owner command is introduced.
6. OTCL/TCL/AOBC/CBF/TPSC/PSCF semantics must remain bounded and deterministic.
7. Economic/routing state is projected only from owning modules; absence is UNKNOWN/UNAVAILABLE, never zero/default success.
8. Loopback-only/local-first behavior remains the default runtime profile.
9. GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT remains mandatory.
10. M27-M31 constraints apply from this first runtime slice.

## Scope lock
Implement one thin end-to-end path from canonical operational evidence through truth/continuity evaluation into a bounded realtime cockpit projection. Do not expand into distributed observability infrastructure, broad command mutation, or unrelated modules.

## Stop conditions
Stop and mark CORRECTION REQUIRED if implementation can fabricate live state, hide continuity gaps, bypass source authority, cause unbounded telemetry/cardinality/SSE growth, expose sensitive raw data, or introduce model-bearing spend into dashboard refresh.