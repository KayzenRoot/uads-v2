# UADS2-WO-008 — M03 S05.3 Test & Benchmark Plan

Status: FROZEN BEFORE IMPLEMENTATION

## Required tests

- T031 reject unsupported/arbitrary executable rule.
- T032 reject descriptor with shell field and prove execFile uses shell=false.
- T033 reject over-count/over-length fixedArgs; runtime has no args override.
- T034 UADS_TEST_SECRET inherited by parent is absent in child.
- T035 stdout maxBuffer produces OUTPUT_LIMIT.
- T036 stderr maxBuffer produces OUTPUT_LIMIT.
- T037 timeout produces TIMED_OUT.
- T038 MUTATING returns BLOCKED without spawn.
- T039 NETWORK_OBSERVE returns BLOCKED without spawn.
- T040 COST_BEARING returns BLOCKED without spawn.
- T041 PATH-search rule rejected; PATH shadow cannot replace process.execPath.
- T042 test-only pre/post identity drift produces IDENTITY_DRIFT.
- T043 100 concurrent same-key calls return one executionId.
- T044 generic executor creates zero PCCR proof files; corrupt receipt read is REJECTED.

Additional:
- descriptor digest deterministic and insertion-order independent;
- receipt digest tamper rejected;
- receipt path binding subject/probe/execution enforced;
- production node version parser returns bounded version summary;
- TEST_ONLY descriptor blocked outside test mode by direct policy helper;
- receipt contains no absolute executable path/environment dump/secret;
- cross-platform process.execPath identity contract.

## Benchmarks

### WO008-B2
50 sequential production node-version self-tests.
- p50/p95;
- target p95 <= 2000 ms;
- max descriptor timeout <= 5000 ms.

### WO008-B5
100 concurrent same key.
- unique execution IDs = 1;
- unique receipt digests = 1;
- p95 caller completion <= 2000 ms;
- in-flight map empty after settle.

### WO008-B3
One persisted receipt <= 64 KiB.

### WO008-B4
- shellExecution=0
- pathLookupExecution=0
- blockedSpawn=0
- leakedSecret=0
- pccrProofCreated=0
