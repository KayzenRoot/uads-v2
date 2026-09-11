# UADS2-WO-025 — Runtime Evidence Bundle Template

Status: TEMPLATE / TO BE FILLED BY EXECUTOR
Issue: #75
Risk: HIGH

## Exact identities
- Base main SHA: `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`
- Implementation head SHA: <fill>
- Node version: <fill>
- OS/platform: <fill>
- Executor/host model routing state: <fill>
- Requested effort / applied effort: <fill>

## Source baseline verification
Record pre-edit identities for the 13 frozen blobs:
- `src/kernel/model-router.ts`
- `src/kernel/model-types.ts`
- `src/kernel/model-requirements.ts`
- `src/kernel/model-runtime.ts`
- `src/kernel/model-registry.ts`
- `src/kernel/model-persist.ts`
- `src/adapters/host-capability-consumer.ts`
- `src/adapters/host-capability-passive.ts`
- `src/kernel/host-capability-proof.ts`
- `src/commands/models.ts`
- `src/adapters/host-dispatch.ts`
- `tests/model-routing.test.ts`
- `schemas/model-execution-plan.schema.json`
Any drift from the frozen baseline must be explained as a controlled source-baseline delta.

## Changed files
<fill exact paths and rationale>

## Proof results
Use PASS / FAIL / BLOCKED / NOT_APPLICABLE with evidence references.
- RT-001:
- RT-002:
- RT-003:
- RT-009:
- RT-010:
- RT-011:
- ES-013:
- ES-014:
- T1 capability-truth boundary/UNKNOWN discipline:
- T2 lock hard constraint/audit:
- T3 lock fail-closed:
- T4 cheapest-claim discipline:
- T5 quality floor:
- T6 latest-model resolution:
- T7 enforcement-state truth:
- T8 no silent expensive fallback:
- T9 no broadcast/single target:
- T10 schema/legacy/baseline integrity:
- RT-004..008, RT-012, ES-015..019: NOT_APPLICABLE (owner: IW1-02/IW1-03/IW1-04)

## Tests
### Focused
Command(s): <fill>
Result: <fill>

### Full suite
Command: <fill>
Files/tests passed: <fill>
Result: <fill>

## Runtime scenarios
Document: legacy-snapshot-only enablement attempt, adapter-unspecified truth, lock set/show/clear revision audit, locked-profile removal/inadmissibility failure, corrupt lock state recovery, prior-schema plan degradation, enforcement-state derivation, broadcast rejection, zero model-bearing routing calls.

## Performance observation
Environment: <fill>
Routing decision latency: <fill>
Status/dashboard projection latency: <fill>
Issue #39 comparison: <fill>

No developer-host observation may be labeled production SLO/capacity. Routing performs zero model-bearing calls; no paid benchmarks.

## Security/privacy
- secret/host-path leakage into routing state: <fill>
- bounded reason codes / no raw provider payloads: <fill>
- closed schemas (`additionalProperties: false`): <fill>
- no project-local UADS state; global sidecar only: <fill>

## Repository gates on exact final head
- CI: <fill>
- CodeQL: <fill>
- Dependency Review: <fill>
- Cross-Platform: <fill>

## HEDS
Review ID: <fill after independent final audit>
Verdict: <fill>

## Final verdict
<APPROVED / CORRECTION REQUIRED / BLOCKED>

Do not mark APPROVED while any release-blocking capability-truth, lock, economic-safety, enforcement-truth, schema-determinism or exact-head gate requirement is FAIL/BLOCKED.