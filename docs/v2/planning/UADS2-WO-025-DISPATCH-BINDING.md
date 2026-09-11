# UADS2-WO-025 — Runtime Dispatch Binding

Status: CODEX_READY / NOT YET EXECUTED
Issue: #75
Base main SHA: `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`
Runtime branch (planned): `feat/uads2-wo-025-iw1-01-model-routing-lock`

## Decision
GitHub-only planning for M05 IW1-01 is complete enough to justify executor/runtime work. The remaining requirements need TypeScript changes, executable tests, persistence behavior, CLI behavior and negative runtime scenarios; further repository-only authoring would not truthfully prove them.

## Executor input
The executor must read and obey, in order:
1. `.engineering/context-locks/UADS2-WO-025.md`
2. `.engineering/plans/UADS2-WO-025-TEST-PLAN.md`
3. `docs/v2/planning/UADS2-WO-025-IW1-01-MODEL-ROUTING-FREEZE.md`
4. `docs/v2/planning/UADS2-IWAVE-0-4-INTERFACE-FREEZE.md`
5. M30 S03 token-spend safety and S04 proof/benchmark matrix (RT/ES families)
6. `.engineering/reports/EVIDENCE-UADS2-WO-025-TEMPLATE.md`

## UADS-native execution rule
Use the globally installed UADS bootstrap/preflight/routing/dispatch path when available and proven. Remain GLOBAL-FIRST and ZERO-PROJECT-FOOTPRINT. Do not install project-local UADS state or bypass stale-context/digest checks.

## Model / effort routing
Preferred: a host-proven available model; do not invent capability. Effort is per subtask:
- LOW mechanical wiring/schema edits;
- MEDIUM ordinary implementation/tests;
- HIGH capability-truth/lock integration and enforcement semantics;
- XHIGH exceptional unresolved defects;
- MAX is not a default.
If the host fixes or overrides model/effort, record HOST_FIXED/MISMATCH/UNKNOWN rather than claiming enforcement (this is also the RT-010 discipline).

## Parallel agents
Fan-out is OFF by default. The executor may use host-native bounded assistance only if it cannot multiply economic capacity/retries, cannot violate source boundaries and remains auditable; otherwise execute sequentially. Routing fan-out stays exactly one model target per decision regardless of executor assistance.

## Allowed primary source boundary
- `src/kernel/model-router.ts`
- `src/kernel/model-types.ts`
- `src/kernel/model-runtime.ts` (contract stability only; no version bump)
- `src/kernel/model-persist.ts`
- `src/kernel/execution.ts` (only the plan capability-acquisition path)
- `src/commands/models.ts`
- `src/commands/status.ts`
- `src/commands/dashboard.ts` (only existing status render fields)
- `src/cli.ts` (only wiring for lock commands / adapter identity)
- `src/lib/workspace.ts` (only additional sidecar path + layout)
- `schemas/model-execution-plan.schema.json`, new routing-state schema
- `tests/model-routing.test.ts` and narrowly scoped new routing/lock tests
- `src/eval/model-routing.ts` (deterministic eval extension only)

## Forbidden behavior
- enable capabilities from legacy snapshots, persisted capability files or adapter-declared values;
- bypass or weaken an active Model Lock; hide MISMATCH;
- claim VERIFIED_MATCH/HOST_FIXED without host-execution evidence;
- silently fall back to a different (possibly more expensive) profile;
- emit ensemble/broadcast or fan-out above one;
- perform model-bearing calls during routing/status/dashboard refresh;
- bump the runtime capability snapshot contract version;
- leak secrets/host paths or introduce open schemas;
- take over M06/M07/M24 responsibilities or broaden into unrelated modules;
- perform broad unrelated refactors; hide Issue #39 performance debt.

## Executor terminal states
- COMPLETE_CANDIDATE: implementation/tests/evidence prepared for PR audit.
- NEEDS_ARCHITECTURE: frozen architecture/source reality conflict requires architect decision.
- BLOCKED_EVIDENCE: required runtime/host proof cannot be obtained truthfully.
- CORRECTION_REQUIRED: a release-blocking invariant fails.

## STOP CONDITION
Executor stops only after the implementation candidate, focused/full tests, negative scenarios, local performance observations and Evidence Bundle are complete, or after a truthful blocking terminal state is reached. Before material edits, re-verify the 13 frozen source blobs against the dispatch-time branch; any movement is a controlled source-baseline delta (record and reconcile), not permission to redesign. Merge remains forbidden until exact-head gates and independent HEDS approve the final implementation head.