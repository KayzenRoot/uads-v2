# UADS V2 — Current Checkpoint

Status: UADS2-WO-006 PR #29 HEDS CORRECTION APPLIED / FRESH EXACT-HEAD GATES PENDING
Date: 2026-09-09

Completed Work Order: UADS2-WO-005
Active Work Order: UADS2-WO-006
Active Issue: #28
Active PR: #29
Active Branch: `work/uads2-wo-006-m03-pccr-core`
Base main SHA: `36b2019fc22b4d6c5d250e41edf12e737c4ddcfa`
Implementation-equivalent verified head: `0c96f6c4b74e73157fae3cb9533ffdd3f3254a44`
Active Module: M03 Host Capability Detector
Active Session: S05.1

## Implemented slice

**PCCR Core + Passive/Deterministic-Local Proof + Conservative Compatibility Projector**

Runtime scope remains exactly:
- `schemas/host-capability-proof.schema.json`
- `src/kernel/host-capability-proof.ts`
- `tests/host-capability-proof.test.ts`

No existing runtime/schema/package/workflow file was modified.

## Objective verification

On `0c96f6c4b74e73157fae3cb9533ffdd3f3254a44`:
- 52/52 test files PASS;
- 462/462 tests PASS;
- CI SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Cross-Platform SUCCESS;
- B1 p95 0.134119 ms <= 50 ms;
- B3 10,990 bytes/host <= 65,536;
- B4 all unsafe/tamper/drift/absence counters = 0;
- B7 corruptAccepted=0 and recovered=true.

## Correction record

An earlier run failed only T049 because the test used a fake GitHub token shorter than the existing canonical secret-pattern threshold. The fixture was corrected. Runtime code was unchanged.

## Final gate

The evidence/checkpoint metadata is now frozen.
Run all four hosted gates on the final PR head, confirm zero unresolved threads, then HEDS.

No active host probe or next module may start before UADS2-WO-006 is APPROVED/MERGED.


## HEDS correction record

Exact-head audit on `a0b0f5ebd5cfc0b1b0322967697a2af5a233b51a` found a cross-capability replay gap: proof `capabilityId` was not checked against the projector/storage key.

The bounded runtime correction adds:
- subject/path binding enforcement on proof reads;
- capability/path binding enforcement on proof reads;
- capability/key binding enforcement in direct projection;
- strengthened copied-root replay test;
- `M03-REG-001` cross-capability replay regression test;
- B4 replay coverage for cross-capability injection.

Prior benchmark values are historical. Fresh exact-head gates/benchmark are required before HEDS can become APPROVED.
