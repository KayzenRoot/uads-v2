# UADS2-WO-020 — Context Lock

Status: LOCKED / CODEX_READY
Module: M30 Production Observability & Real-Time Operations
Session: S05.1 Truth Kernel & Living Cockpit Vertical Slice
Issue: #65
Base main SHA: `e5ed58ed541c415c06fe42498f622a1aeada0f4a`
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
- UADS2-WO-023 Technology Acquisition Radar, APPROVED/MERGED
- UADS2-WO-024 Implementation Sequencing & Ownership Freeze, merged at `6f99ae565f2e07658ab60742451fb8defe21a4f3`
- WO-024 post-merge HEDS reconciliation at `e5ed58ed541c415c06fe42498f622a1aeada0f4a`
- existing local-first operational-events and dashboard/SSE foundation

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
11. `readHostCapabilityProjection()` remains the M03 production consumer boundary.
12. No mandatory Grafana/Kafka/Mimir/Tempo/OTel Collector/SaaS/WebSocket dependency is introduced.

## Source baseline at dispatch preparation
Base main: `e5ed58ed541c415c06fe42498f622a1aeada0f4a`.
Critical source identities inherited from the reconciled WO-024 baseline unless current-main verification proves movement:
- `src/kernel/operational-events.ts`: blob `c68b5a960c7774b877867ae2aa32505bd3bbff48`
- `src/kernel/operational-event-types.ts`: blob `77ba2574d8c6b1a0d08ffce9459a09571beec972`
- `src/commands/dashboard.ts`: blob `172b21d89bbc3421e449935ad24f5df9a32f6600`

Before executor dispatch, verify these identities against the branch. Any unexpected source movement is a controlled baseline delta, not permission to redesign.

## Scope lock
Implement one thin end-to-end path from canonical operational evidence through truth/continuity evaluation into a bounded realtime cockpit projection. Do not expand into distributed observability infrastructure, broad command mutation, or unrelated modules.

## Executor behavior
The executor implements and proves. It does not redesign architecture. If a frozen ownership/interface is materially incompatible with source reality, stop as `NEEDS_ARCHITECTURE` with evidence.

## Stop conditions
Stop and mark CORRECTION REQUIRED if implementation can fabricate live state, hide continuity gaps, bypass source authority, cause unbounded telemetry/cardinality/SSE growth, expose sensitive raw data, introduce model-bearing spend into dashboard refresh, or weaken M03/M07/M21/M24/M29/M31 authority.