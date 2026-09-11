# UADS2-WO-020 — Runtime Dispatch Binding

Status: CODEX_READY / NOT YET EXECUTED
Issue: #65
Base main SHA: `e5ed58ed541c415c06fe42498f622a1aeada0f4a`
Runtime branch: `feat/uads2-wo-020-m30-s05-1-runtime`

## Decision
GitHub-only planning for M30 S05.1 is complete enough to justify executor/runtime work. Further repository-only authoring would not truthfully prove the remaining requirements because they require TypeScript changes, executable tests, HTTP/SSE behavior, negative runtime scenarios and local benchmark evidence.

## Executor input
The executor must read and obey, in order:
1. `.engineering/context-locks/UADS2-WO-020.md`
2. `.engineering/plans/UADS2-WO-020-TEST-PLAN.md`
3. `docs/v2/planning/UADS2-IW0-CODEX-EXECUTION-PACKAGE.md`
4. `docs/v2/planning/UADS2-IW0-SOURCE-BASELINE.md`
5. frozen M30 S02/S03/S04 architecture/proof documents
6. `.engineering/reports/EVIDENCE-UADS2-WO-020-TEMPLATE.md`

## UADS-native execution rule
Use the globally installed UADS bootstrap/preflight/routing/dispatch path when available and proven. Remain GLOBAL-FIRST and ZERO-PROJECT-FOOTPRINT. Do not install project-local UADS state or bypass stale-context/digest checks.

## Model / effort routing
Preferred: GPT-5.6 Luna only when host proves availability/admissibility.
Effort is per subtask:
- LOW mechanical/wiring/schema edits;
- MEDIUM ordinary implementation/tests;
- HIGH difficult truth/freshness/security integration;
- XHIGH exceptional unresolved defects;
- MAX is not a default.
If host fixes/overrides model or effort, record HOST_FIXED/MISMATCH/UNKNOWN rather than claiming enforcement.

## Parallel agents
For this first runtime slice, optional multi-agent fan-out is OFF by default because the future Parallel Specialist Execution runtime is not yet proven. Executor may use host-native bounded assistance only if it cannot multiply economic capacity/retries, cannot violate source boundaries and remains auditable; otherwise execute sequentially.

## Allowed primary source boundary
- `src/kernel/operational-event-types.ts`
- `src/kernel/operational-events.ts`
- narrowly scoped new M30 kernel/projection files
- `src/commands/dashboard.ts`
- `src/cli.ts` only for necessary wiring
- `schemas/operational-event.schema.json` if schema evolution is required
- `tests/operational-events.test.ts`
- `tests/dashboard-m30.test.ts`
- narrowly scoped new M30 tests
- existing M30 benchmark/evidence seams

## Forbidden behavior
- redesign ownership;
- introduce mandatory heavyweight observability infrastructure;
- fabricate LIVE/CURRENT/zero values;
- make dashboard refresh model-bearing;
- bypass M03/M07/M21/M24/M29/M31 authority;
- broaden into Hive RAG/memory or UGAS media domains;
- hide Issue #39 performance debt;
- perform broad unrelated refactors.

## Executor terminal states
- COMPLETE_CANDIDATE: implementation/tests/evidence prepared for PR audit.
- NEEDS_ARCHITECTURE: frozen architecture/source reality conflict requires architect decision.
- BLOCKED_EVIDENCE: required runtime/host proof cannot be obtained truthfully.
- CORRECTION_REQUIRED: a release-blocking invariant fails.

## STOP CONDITION
Executor stops only after the implementation candidate, focused/full tests, negative scenarios, local performance observations and Evidence Bundle are complete, or after a truthful blocking terminal state is reached. Merge remains forbidden until exact-head gates and independent HEDS approve the final implementation head.