# UADS V2 — Test & Benchmark Plan

Status: CANONICAL OVERLAY IN REVIEW

## Baseline first

Before changing V2 runtime behavior, capture V1 measurements for the same representative workloads.

Required baseline dimensions:
- workers spawned per Work Order;
- maximum concurrent specialist workers;
- visible worker conversations;
- tokens/input/output when host telemetry permits;
- context size/radius;
- retries;
- model/effort selected;
- review wall-clock;
- cache hits/reuse;
- first-pass approval;
- correction-loop depth;
- defects caught before merge;
- escaped defects.

## Regression levels

LOW: targeted deterministic checks.  
STANDARD: impacted unit/integration + lint/typecheck/build.  
ELEVATED: STANDARD + wider regression + relevant persistence/security/recovery/runtime checks.  
HIGH_ASSURANCE: independent proof obligations, broad regression, rollback/roll-forward evidence and no unsafe proof shortcut.

## Mandatory new tests

- concurrency invariant max worker = 1;
- sequential queue order;
- spawn gate;
- worker terminal-state handoff;
- no visible worker conversation when host proves background support;
- safe fallback when capability absent;
- runtime capability UNKNOWN is never treated as true;
- model/effort selection policy;
- simple task does not default EXTRA_HIGH;
- evidence-driven escalation;
- retry-with-new-hypothesis enforcement;
- stale cache invalidation;
- Hive envelope/bundle identity mismatch rejection;
- learned policy cannot override canonical constraints.

## Benchmarks

Primary metric: Time-to-Trusted-Merge (TTTM).

Supporting metrics:
- Tokens per Approved Work Order;
- First Pass Approval Rate;
- Review Context Signal Ratio;
- Duplicate Analysis Rate;
- Evidence Cache Hit Rate;
- Model Escalation Rate;
- EXTRA_HIGH Usage Rate;
- Failure Memory Reuse Rate;
- Bug Recurrence Rate;
- Worker Spawn Count;
- Maximum Concurrent Workers.

Targets beyond hard safety invariants are set only after V1 baseline evidence exists.
