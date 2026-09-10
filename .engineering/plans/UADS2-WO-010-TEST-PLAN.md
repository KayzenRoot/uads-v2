# UADS2-WO-010 — Test & Benchmark Plan

Status: FROZEN BEFORE IMPLEMENTATION

## Focused cross-platform proof

Run `tests/host-capability-cross-platform.test.ts` in:
- ubuntu-latest / Node 20;
- windows-latest / Node 20.

Cases:
- M03-T061 Linux executable identity.
- M03-T062 Windows executable identity.
- M03-T063 case-distinct lexical roots.
- M03-T064 lexically equivalent roots + V2 case-preserving policy.
- M03-T065 Windows hidden/no-shell/direct-executable contract.
- M03-T066 POSIX no-shell/direct-executable contract.

## B6

Seven measured batches per mode after warm-up, eight PCCR writes per batch.

Modes:
- telemetry disabled;
- existing evidence.lifecycle telemetry enabled.

Measure:
- `process.cpuUsage` user+system microseconds;
- median microseconds/op;
- overhead percentage.

Verdict:
- PASS if overhead <5%;
- JUSTIFIED_EXCEPTION otherwise, with measured value and reason.

## Regression

- full npm test;
- eval:adapters;
- all standard CI evals;
- exact-head CI/CodeQL/Dependency/Cross-Platform.
