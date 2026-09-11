# UADS2-WO-026 — Runtime Dispatch Binding

Status: CODEX_READY / NOT YET EXECUTED
Issue: #78
Base main SHA: `a0a778e5fa4a28750540246fa5894c91a92d0b2b`
Runtime branch (planned): `feat/uads2-wo-026-m03-proven-capability-resolution`

## Decision
The planning/freeze for M03 proven capability resolution + dispatch adapter binding is packaged in this Work Order. The remaining requirements need TypeScript changes, executable tests, deterministic proof fixtures and negative runtime scenarios; they are bound here for a later governed runtime increment. Dispatching that runtime executor is NOT authorized by this document until this freeze PR merges with exact-head gates and independent HEDS approval.

## Slice ordering constraint (frozen)
1. This freeze merges (docs-only PR): exact-head CI, CodeQL, Dependency Review, Cross-Platform, then independent HEDS.
2. The runtime increment executes from this binding (M03 boundary evolution behind IF-001 + dispatch adapter-identity binding + eval-fixture proof seeding), with its own Evidence Bundle and HEDS.
3. Only after the runtime increment merges: PR #77 is rebased/reconciled in its own governed increment to remove the X7/FI regressions — without restoring legacy enablement and without relaxing `requireProvenRuntime` — then returns to HEDS.

## Executor input
The executor must read and obey, in order:
1. `.engineering/context-locks/UADS2-WO-026.md`
2. `.engineering/plans/UADS2-WO-026-TEST-PLAN.md`
3. `docs/v2/planning/UADS2-WO-026-M03-PROVEN-CAPABILITY-RESOLUTION-FREEZE.md`
4. HEDS review `5178444951` on PR #77 (blocker definition and required goals)
5. M03 S05.1–S05.4 contracts, S06.2 consumer boundary, probe policy and capability vocabulary
6. `.engineering/reports/EVIDENCE-UADS2-WO-026-TEMPLATE.md`

## UADS-native execution rule
Use the globally installed UADS bootstrap/preflight/routing/dispatch path when available and proven. Remain GLOBAL-FIRST and ZERO-PROJECT-FOOTPRINT. Do not install project-local UADS state or bypass stale-context/digest checks.

## Model / effort routing
Preferred: a host-proven available model; do not invent capability. Effort is per subtask:
- LOW mechanical wiring/fixture plumbing;
- MEDIUM resolver/basis implementation and focused tests;
- HIGH boundary semantics, provenance rules and dispatch adapter binding;
- XHIGH exceptional unresolved defects;
- MAX is not a default.
If the host fixes or overrides model/effort, record HOST_FIXED/MISMATCH/UNKNOWN rather than claiming enforcement (same discipline as the M05 freeze).

## Parallel agents
Fan-out is OFF by default. The executor may use host-native bounded assistance only if it cannot multiply economic capacity/retries, cannot violate source boundaries and remains auditable; otherwise execute sequentially. No visible specialist conversations; no parallel paid work.

## Allowed primary source boundary
- `src/adapters/host-capability-consumer.ts` (facade evolution behind IF-001)
- `src/adapters/host-capability-passive.ts` (only if required for fallback/basis wiring)
- `src/kernel/host-capability-proof.ts` (resolution/projection additions; schema versions unchanged)
- `src/kernel/host-capability-subject.ts`
- `src/kernel/host-capability-probe.ts`
- `src/kernel/host-capability-active-evidence.ts`
- narrowly scoped new files under `src/kernel/` or `src/adapters/` for the resolver/acquisition seam
- `src/kernel/execution.ts` (only dispatch adapter-identity plumbing and plan capability-acquisition inputs)
- `src/commands/dispatch.ts` (only adapter identity)
- `src/cli.ts` (only dispatch adapter-identity wiring)
- `src/eval/execution.ts`, `src/eval/fault-injection-normative.ts` (fixture proof seeding through public M03 APIs only)
- `tests/host-capability-*.test.ts` and narrowly scoped new resolver/dispatch-binding tests
- schemas only if strictly required and versioned; prefer the existing host-capability-proof schema family (`1.0.0` / `1.1.0`) unchanged

## Forbidden behavior
- enable capabilities from legacy snapshots, adapter declarations or any non-PCCR source;
- mark passive-declared TRUE as SUPPORTED; map UNKNOWN to ALLOW;
- set provenance `proven` unconditionally or merely because an adapter exists;
- bypass basis/lease/currentness matching; use non-current proof;
- infer dispatch adapter identity from legacy state; dispatch without explicit validated identity;
- disable, relax or bypass `requireProvenRuntime`;
- restore `readRuntimeCapabilitySnapshot()` as enabling truth;
- bump the runtime capability snapshot contract `0.8.0` or edit the Model Execution Plan schema;
- take over M06/M07/M24 responsibilities; mutate M03 V1;
- introduce paid model/provider calls, hidden retries, vendor credentials, unbounded shell probes, network by default or project-local UADS state;
- leak secrets/host paths or introduce open schemas;
- edit, merge, close, rewrite or discard PR #77 or its branch;
- perform broad unrelated refactors; hide Issue #39 performance debt.

## Executor terminal states
- COMPLETE_CANDIDATE: implementation/tests/evidence prepared for PR audit.
- NEEDS_ARCHITECTURE: frozen architecture/source reality conflict requires architect decision.
- BLOCKED_EVIDENCE: required runtime/host proof cannot be obtained truthfully.
- CORRECTION_REQUIRED: a release-blocking invariant fails.

## STOP CONDITION
Executor stops only after the implementation candidate, focused/full tests, negative scenarios, deterministic proof fixtures, local performance observations and Evidence Bundle are complete, or after a truthful blocking terminal state is reached. Before material edits, re-verify the frozen source blobs in `.engineering/context-locks/UADS2-WO-026.md` against the dispatch-time branch; any movement is a controlled source-baseline delta (record and reconcile), not permission to redesign. Merge remains forbidden until exact-head gates and independent HEDS approve the final implementation head. PR #77 reconciliation is explicitly out of scope for this increment.
