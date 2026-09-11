# UADS2-WO-025 — Checkpoint Delta

Status: PRE-MERGE CANDIDATE
Date: 2026-09-10
Issue: #75
PR: #76
Base main: `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`

## Program state
- UADS2-WO-024 Implementation Sequencing & Ownership Freeze: APPROVED / MERGED.
- UADS2-WO-025 IW1-01 M05 Proof-Aware Model Routing + Model Lock planning freeze: CANDIDATE FOR FINAL HEDS.
- IW1-01 runtime implementation remains NOT COMPLETED and requires the next executor-heavy increment.

## WO-025 frozen candidate outputs
- routing freeze (capability acquisition, Model Lock contract, enforcement projection, no-broadcast, schema evolution);
- IW1-01 Context Lock (LOCKED / CODEX_READY);
- IW1-01 Test/Proof Plan (T1..T10 mapped to RT/ES proof IDs);
- Evidence Bundle template;
- runtime dispatch binding;
- 13 exact source-baseline blob identities.

## IW1-01 critical planning baseline
Planning main: `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`.
Critical blobs:
- `src/kernel/model-router.ts`: `c46061746bb0221557b091279b99e7f587ef8441`
- `src/kernel/model-types.ts`: `df4ac2159c6df0cf1fe7c176ef14ed06bf39b435`
- `src/kernel/model-requirements.ts`: `2a0b325061a949f303ae0c1a6910f5cbab5f37fb`
- `src/kernel/model-runtime.ts`: `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62`
- `src/kernel/model-registry.ts`: `30af33571e776df2d50ce46cf7a6166d166ca3c8`
- `src/kernel/model-persist.ts`: `c0d0799a064a48e87dbdbd26407cb47563037a59`
- `src/adapters/host-capability-consumer.ts`: `6e4035a5c6790ffe6272a4e93dd99c24908ff936`
- `src/adapters/host-capability-passive.ts`: `edd37b91bee623730f43bbdc6422084e6e63f7f9`
- `src/kernel/host-capability-proof.ts`: `ff79a8f6280e8be0ae4563e9b6e62b9e216df76b`
- `src/commands/models.ts`: `9be44ab26c9e6a264bbae37eaa57ed59aff630ec`
- `src/adapters/host-dispatch.ts`: `97bfebbc62570a5a245a7dd8512f37b57fe2e1b0`
- `tests/model-routing.test.ts`: `47c2bdbad80c1e63366cdb4dd04720c91ba98ee1`
- `schemas/model-execution-plan.schema.json`: `ef7b91217a11d5ae8dc2444bc8bc094176980536`

At actual implementation dispatch, reconcile current main and issue a controlled source-baseline delta if any identity moved.

## Next action after WO-025 merge
Create the IW1-01 runtime implementation branch, re-verify the 13 frozen blobs against then-current main, and dispatch the IW1-01 executor as a separate governed increment from the frozen package (Context Lock → Test Plan → freeze doc → dispatch binding). No executor dispatch while this freeze is awaiting HEDS or while architecture is unresolved.

## Stop condition
Final PR #76 head must pass CI, CodeQL, Dependency Review and Cross-Platform, then independent HEDS must approve that exact head before squash merge.