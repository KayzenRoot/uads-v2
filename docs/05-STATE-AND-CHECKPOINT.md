# 05 — State and checkpoint

## Rule

UADS operational state belongs in the global sidecar:

`~/.uads/workspaces/<project-id>/`

Never commit UADS checkpoints, work orders, or review ZIPs to the managed project by default.

## Project profile

`profile.json` follows `schemas/project-profile.schema.json`. The foundation CLI creates or updates it when generating a review bundle.

## Checkpoint (v0.2, durable)

`schemas/checkpoint.schema.json` is persisted at `state/current.json` plus `state/checkpoints/`. Writes are temp+rename. Corrupt current state is reported, not silently trusted; a prior valid checkpoint may be recovered.

Lifecycle: intake → classify → plan → implement → verify → review → stopped.

Prompt 002 drives through **plan**. Prompt 003 adds durable execution runs under `execution-runs/<id>/`. `uads dispatch --session` binds the implementer session and advances the checkpoint to implement only after a clean worktree baseline. `uads resume` returns execution ids, digest, pending/failed gates, reviewers, and next action without a full repository walk.

Dirty pre-existing worktrees block dispatch. UADS does not reset, stash, or delete user files. Active checkpoint, Work Order, routing decision, run, and packet IDs are cross-checked. Corrupt evidence/review JSON fails closed rather than disappearing from the audit history.

Prompt 004 adds sidecar `index/index-state.json`, `dependency-graph.json`, `test-map.json`, `interface-map.json`, plus `context/packs/` and `context/impact-reports/`. Prompt 005 adds `failures/records/`, `failures/diagnoses/`, `failures/memory.json`, and `context/diagnostic-packs/`. Prompt 006 lazily creates `cache/evidence-index.json`, `cache/evidence/`, `cache/decisions/`, `cost/ledger.json`, `cost/qpt-current.json`, and `cost/decisions/`. Engine 0.4.1 index state records completeness; a truncated index is stale and cannot drive impact, Context Packs, dispatch, diagnosis, or cache HIT. Existing v0.3.0 Work Orders, execution runs, evidence, and reviews are preserved. `uads resume` / `uads status` still do not walk or reparse the repository; they may read compact failure, cache, and cost fields from the sidecar.

## Work orders

`schemas/work-order.schema.json` v0.2.0 is the unit of planned work. The kernel plans; it does not call model APIs. Host agents apply in-scope edits after `uads dispatch`. Completion requires `uads finalize`.

Routing conclusions live in `schemas/routing-decision.schema.json`.

The 0.8.0 Model Execution Plan is persisted separately at `model-routing/current.json` with immutable history entries. It binds the Work Order digest, change digest, registry digest, runtime identity digest, routing policy digest, quality floor, eligible/rejected profiles, fallback chain, cache-layer hints, and explicit runtime fallback strategy. Dispatch treats a missing, corrupt, stale, or blocked plan as a stop condition and never silently downgrades the Work Order.

## Discipline

- Write checkpoints after each meaningful phase
- On resume, read the latest checkpoint first
- Treat sidecar files as durable but not source-of-truth for product code

Prompt 012 adds the host execution receipt sidecar at
`host-execution/current.json`, with immutable transition entries under
`host-execution/history/<receipt-id>.json`. Handoff revalidates the current
Host Dispatch Bundle and all bound orchestration identities before persisting
`ACCEPTED`. Receipt transitions are limited to the closed
`ACCEPTED → STARTED → COMPLETED|FAILED|BLOCKED` contract (a host may report a
direct terminal outcome from `ACCEPTED`); terminal receipts cannot be
rewritten. History retention is fixed at 32 valid entries and corrupt JSON
fails closed. Receipts are operational status only: they never replace gate
evidence, assurance, review, or finalize state.

Before every mutating receipt transition, UADS reconstructs the current Host
Dispatch artifacts and compares them with the accepted bundle. A changed
execution run, Work Order, routing decision, specialist selection, model plan,
runtime, current-change identity, adapter ownership, target root, or bundle
fails closed with a stable reason code; the previous receipt remains unchanged.
The Work Order `requiresApproval` list is a global policy catalog and may be
non-empty for every plan; it is not evidence that the current handoff requests
one of those actions. UADS derives the schema-closed
`autonomyBoundary.activeApprovalGatedActions` list from the canonical objective,
scope, requested artifacts, constraints, acceptance criteria, and planning
signals. Only a non-empty active list fails closed at
handoff with `APPROVAL_AUTHORIZATION_MISSING` when no existing durable
authorization proof can be verified for the current identity. The active list
is bound into the Work Order digest and Host Dispatch Bundle identity. Host
Dispatch recomputes it from current Work Order action signals, requires
persisted `constraints`, and fails closed for legacy absence, so a persisted
projection, caller-provided boolean/state, or `approvedBoundaries` prose never
creates that authority.
When sensitive signals imply an action but do not prove a fixed class,
`activeApprovalIntentAmbiguous` is bound to the same identities and blocks only
that task fail-closed.
