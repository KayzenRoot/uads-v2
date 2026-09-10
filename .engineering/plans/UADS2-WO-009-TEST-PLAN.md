# UADS2-WO-009 — Test Plan

Status: FROZEN BEFORE IMPLEMENTATION

## Focused tests

- T011 no receipt -> UNKNOWN, never UNSUPPORTED.
- T012 missing-host style no receipt/current context -> UNKNOWN.
- T013 BLOCKED receipt -> BLOCKED/unknown projection.
- T014 TIMED_OUT receipt -> UNKNOWN.
- T015 SUCCEEDED but unrecognized summary -> UNKNOWN.
- T016 recognized complete enumeration exclusion -> E3 UNSUPPORTED + complete-enumeration-exclusion.
- T017 recognized exact unsupported result -> E3 UNSUPPORTED + active-probe-recognized-unsupported.
- T051 forged receipt/contract status-parser-summary mismatch rejected.
- T052 valid historical PCCR 1.0 accepted; 1.0 carrying new 1.1 negative kind rejected.
- synthetic exact supported result -> E3 SUPPORTED only under TEST_ONLY contract.
- wrong subject/adapter/capability/probe/descriptor/parser each fail closed.
- lease expiry -> STALE.
- descriptor/policy/config/runtime drift -> STALE.
- test-only contract blocked outside NODE_ENV=test.
- production active contract list empty.
- raw receipt output is never needed/persisted by compiler.

## Regression

- host-capability-proof full suite;
- host-capability-passive full suite;
- host-capability-probe full suite;
- full npm test;
- all evals/validation;
- exact-head four hosted gates.

## Benchmark

WO009-B1 1000 synthetic receipt->proof compiles, target p95 <= 10 ms.
WO009-B4 false-positive/absence-to-UNSUPPORTED/forged-acceptance counters = 0.
