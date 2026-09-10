# UADS2-WO-021 — Context Lock

Status: ACTIVE
Issue: #66
Risk: HIGH with CRITICAL economic-safety subset

## Frozen inputs
- `docs/v2/operations/UADS-HEDS.md`
- `docs/v2/operations/UADS-ADAPTIVE-EVIDENCE-GAUNTLET.md`
- M07 Token & Quota Governor 2.0
- M08 Review Pipeline 2.0
- M21 Retry Controller
- M22 Evidence-Driven Escalation
- M24 cost attribution
- M30 S03/S04 economic-safety and proof doctrine
- M31 safe release gates

## Scope lock
This Work Order promotes the Independent Review Adversary direction into the bounded AEG/HEDS 2.1 cross-module contract and owning-module requirements. It does not claim runtime enforcement before M07/M08/M22 and supporting modules complete their own deep-discovery/implementation gates.

## Non-negotiables
1. No unbounded builder/critic loop.
2. No fixed all-critic fan-out.
3. No model-bearing action without finite M07 admission.
4. No critic diversity bypass of Model Lock.
5. No retry multiplication outside M21.
6. No critic PASS directly authorizes merge.
7. Final HEDS review remains independent.
8. HIGH/CRITICAL findings cannot silently disappear.
9. Emergency stop requires no LLM call.
10. SOLO remains usable without Hive.

## Stop condition
Do not promote this contract if any review loop can mint economic capacity, bypass model/risk policy, hide unresolved HIGH/CRITICAL findings, or become an alternative merge authority.
