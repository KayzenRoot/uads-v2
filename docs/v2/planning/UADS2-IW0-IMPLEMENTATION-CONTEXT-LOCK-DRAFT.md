# UADS V2 — IW0 Implementation Context Lock Draft

Status: DRAFT FOR NEXT IMPLEMENTATION WO
Prepared under: UADS2-WO-024
Target: M30 S05.1 Truth Kernel + Living Cockpit

## Locked objective
Implement the frozen M30 S05.1 vertical slice without redesigning architecture: authoritative operational source -> Operational State Envelope -> OTCL -> TCL -> TPSC -> AOBC/CBF -> PSCF -> read-only Living Cockpit/SSE.

## Canonical inputs
At implementation-WO creation, bind exact current main SHA and re-read:
- `docs/v2/modules/M30-PRODUCTION-OBSERVABILITY-REALTIME-OPERATIONS.md`
- `docs/v2/modules/m30/M30-S02-ARCHITECTURE.md`
- `docs/v2/modules/m30/M30-S02-STATE-COMMAND-CONTRACTS.md`
- `docs/v2/modules/m30/M30-S03-FAILURE-SECURITY-RECOVERY.md`
- `docs/v2/modules/m30/M30-S03-TOKEN-SPEND-SAFETY.md`
- `docs/v2/modules/m30/M30-S04-PROOF-BENCHMARK-MATRIX.md`
- WO-020 Context Lock/Test Plan
- `docs/v2/planning/UADS2-IW0-SOURCE-BASELINE.md`
- `docs/v2/planning/UADS2-IW0-CODEX-EXECUTION-PACKAGE.md`

## Locked source boundary
Primary mutation is restricted to the M30 event/truth/projection/dashboard/test/schema seams named in the source baseline. Any extra runtime file must be justified in evidence and remain under M30 ownership.

## Locked invariants
1. no fabricated CURRENT/LIVE data;
2. missing or stale source must not render healthy/current;
3. derived/inferred state never outranks source truth;
4. dashboard does not become domain truth owner;
5. no LLM call required for render/refresh/emergency observability;
6. local-first loopback HTTP/SSE remains default;
7. telemetry remains bounded and privacy-safe;
8. economic/model data without authoritative source is UNKNOWN/UNAVAILABLE;
9. M03 capability truth is consumed through its frozen projection boundary;
10. no heavyweight mandatory infrastructure introduced.

## Risk
HIGH, because M30 becomes a cross-module operational truth/control surface. Mutation controls remain out of scope for this first read-only slice unless separately proven.

## Exit
The implementation may start only after this draft is copied/promoted into a numbered implementation WO, exact source baseline is reconciled to current main, Test Plan is frozen, and the executor can begin without choosing new architecture.