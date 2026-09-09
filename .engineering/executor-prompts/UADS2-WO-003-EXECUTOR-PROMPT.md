# UADS2-WO-003 — Executor Prompt

Execute this instruction completely. Stop only at the Work Order STOP CONDITION or a genuine blocker.

## Repository / branch

Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-003-m30-event-dashboard-foundation`
Issue: #21
Target PR: existing PR for this branch once created.
Base source lock: `5a6e0d31ec99d2f89136fbd764257a588d625263`

## Local synchronization

If the intended local project directory is empty, clone `KayzenRoot/uads-v2` directly into it. If it is already a Git checkout, verify repository identity instead of recloning. If it is non-empty and unrelated, STOP without deleting or overwriting data.

Fetch/prune, checkout the exact Work Order branch, and fast-forward only. Do not force-push, reset destructively or rewrite history.

## Read before editing

Read, in source order:
1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/03-SCOPE.md`
4. `docs/v2/09-DEFINITION-OF-DONE.md`
5. `docs/v2/04-ARCHITECTURE.md`
6. `docs/v2/02-REQUIREMENTS.md`
7. `docs/v2/13-REVIEW-PROTOCOL.md`
8. ADR-UADS2-009 and ADR-UADS2-010
9. `.engineering/work-orders/UADS2-WO-003-M30-EVENT-DASHBOARD-FOUNDATION.md`
10. `.engineering/context-locks/UADS2-WO-003-CONTEXT-LOCK.md`
11. `.engineering/plans/UADS2-WO-003-TEST-PLAN.md`
12. `docs/v2/planning/M30-EVENT-SPINE-DASHBOARD-FOUNDATION.md`
13. `docs/v2/planning/M30-ENTERPRISE-READINESS.md`

Reconcile all locked source fingerprints before implementation. If a locked source changed materially, STOP and report STALE_CONTEXT.

## Implementation rules

Implement only UADS2-WO-003.

Prefer existing:
- `getUadsPaths/ensureWorkspace`;
- `atomic-write` patterns;
- `sanitizeOperationalValue`;
- AJV schema validation;
- existing hashing/canonicalization utilities where valid;
- CLI command conventions;
- Vitest conventions.

Do not add a runtime dependency.

Implement:
- operational event schema/types;
- M30 project-sidecar paths;
- immutable event persistence/read/validation/retention;
- health projection;
- B-001 `review.analysis` transport/schema support;
- local loopback HTTP dashboard server;
- objective snapshot/recent-event APIs;
- dependency-free real-time stream;
- dark operator shell with zero mock metrics;
- CLI dashboard/observability inspection commands as bounded by the Work Order;
- all tests and benchmark evidence.

Do not implement broad M01/M08 logic.

## Dashboard truth rule

Never make the UI look complete by inventing data. Any source that is absent or not objectively measurable is shown as `UNAVAILABLE` or degraded. Errors/diagnostics are first-class.

## Validation

Run the full test plan. Fix defects inside scope. Record exact commands/results. If a mandatory check is unavailable/inconclusive, say so explicitly.

Produce:
- `.engineering/reports/EVIDENCE-UADS2-WO-003.md`
- `.engineering/checkpoints/CHECKPOINT-DELTA-UADS2-WO-003.md`
- benchmark raw/summary evidence under `.engineering/evidence/UADS2-WO-003/`
- any required architecture/schema documentation deltas.

Commit and push normal commits to this same branch/PR. No force push.

## Final report in pt-BR

Return:
WORK ORDER
BASE SHA
HEAD SHA
IMPLEMENTATION
FILES
TESTS
BENCHMARK
ENTERPRISE PILLARS
B-001 PROOF
DASHBOARD
SECURITY
LIMITATIONS
CI
EVIDENCE
PR
STOP CONDITION

## Stop condition

Stop after implementation/evidence is pushed and ready for independent exact-head HEDS audit, or earlier on a genuine Work Order blocker. Do not merge and do not begin M01.
