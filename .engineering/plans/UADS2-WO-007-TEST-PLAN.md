# UADS2-WO-007 — M03 S05.2 Test & Benchmark Plan

Status: FROZEN BEFORE IMPLEMENTATION

## Required focused tests

- U007-T001 subject deterministic across detection timestamps.
- U007-T002 root switch changes subject.
- U007-T003 adapter switch changes subject.
- U007-T004 subject/bridge durable output contains no absolute path.
- U007-T005 adapter contract digest deterministic.
- U007-T006 altered/non-canonical definition rejected or cannot reuse digest.
- U007-T007 target presence creates zero TRUE capabilities.
- U007-T008 Cursor present => ten UNKNOWN.
- U007-T009 Codex present => ten UNKNOWN.
- U007-T010 generic present => only subagents/parallelAgents false through E2 NPC.
- U007-T011 generic absent => all UNKNOWN.
- U007-T012 blocked target => all UNKNOWN projection.
- U007-T013 generic negative proof exact contract digest binding.
- U007-T014 status/presence drift invalidates prior negative proof.
- U007-T015 root switch rejects/stales prior proof.
- U007-T016 WO-006 cross-capability replay remains rejected.
- U007-T017 legacy TRUE without PCCR remains UNKNOWN.
- U007-T018 passive bridge emits no SUPPORTED proof.
- U007-T019 telemetry failure independent of truth.
- U007-T020 SOLO path no Hive.
- U007-T021 source contains no child_process/shell/network execution path.
- U007-T022 proof storage <= 64 KiB/host.
- U007-T023 fixed semantic inputs/observedAt produce deterministic proof digests.
- U007-T024 timestamp-only change leaves subjectDigest unchanged.
- U007-T025 persisted proof re-evaluates after restart against exact current basis.

## Mandatory regression

- full `tests/host-capability-proof.test.ts`;
- relevant `tests/host-adapters.test.ts`;
- adapter eval suite;
- full npm test.

## Benchmarks

### U007-B1 subject + ten-proof compile
Synthetic fixed host facts, 500 iterations.
Target p95 <= 25 ms.

### U007-B2 compile + persist ten proofs + project
Isolated temp UADS_HOME.
Target p95 <= 100 ms.

### U007-B3 storage
Ten passive proofs <= 64 KiB/host.

### U007-B4 safety
- inferred positive TRUE from target presence = 0;
- absence-to-UNSUPPORTED = 0;
- replay acceptance = 0;
- drift misses = 0.

Report environment/sample/method. Do not claim universal production SLO from CI/dev hardware.

## Enterprise proof

M27: bounded O(10) passive work.
M28: drift/missing/blocked/restart.
M29: privacy/digests/replay/no process/network.
M30: event outcome only, not truth source.
M31: additive/rollback-safe.
