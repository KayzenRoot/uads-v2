# UADS2-WO-022 — Context Lock

Status: ACTIVE
Issue: #68
Risk: HIGH

## Frozen inputs
- `docs/v2/operations/UADS-HEDS.md`
- `docs/v2/operations/UADS-ADAPTIVE-EVIDENCE-GAUNTLET.md`
- `docs/v2/modules/M07-TOKEN-QUOTA-GOVERNOR-2.md`
- `docs/v2/modules/M08-REVIEW-PIPELINE-2.md`
- `docs/v2/modules/M22-EVIDENCE-DRIVEN-ESCALATION.md`
- `docs/v2/modules/M30-PRODUCTION-OBSERVABILITY-REALTIME-OPERATIONS.md`
- `docs/v2/modules/m30/M30-S02-ARCHITECTURE.md`
- `docs/v2/modules/m30/M30-S04-PROOF-BENCHMARK-MATRIX.md`
- active M30 S05.1 WO-020 contracts

## Scope lock
Freeze a transversal Graph + Harness Engineering Program and Digital Operations Office projection requirements. This is architecture/contract work only. It must preserve existing module ownership and must not claim runtime capability before owning-module implementation and proof.

## Non-negotiables
1. No new graph or harness component may become a second source of domain truth.
2. Deterministic graph algorithms are preferred over LLM calls where sufficient.
3. Graph expansion must be bounded and may not imply unbounded context retrieval.
4. Graph-derived agent/critic/model activity remains behind M07 economic admission and M22 evidence-driven escalation.
5. Harness retries may not duplicate M21 retry authority.
6. Graph provenance, harness identity, exact head/root and evidence lineage must be machine-verifiable.
7. Digital Operations Office live visuals must map to real runtime events/state. No phantom work.
8. REPLAY must be visibly distinct from LIVE.
9. UI animation/rendering must not be required for authoritative operation or emergency control.
10. S05.1 Living Cockpit remains active and must only gain compatibility seams, not be derailed.

## Stop condition
Do not promote this program if it introduces unbounded traversal/context/spend, fabricated operational state, duplicate authority, or a visual control path that can bypass authoritative module policy.