# M03 S00 — Problem, Capability Vocabulary & Success Metrics

Status: FROZEN CANDIDATE — WO-005 HEDS PENDING

## Problem statement

UADS must never enable host-dependent behavior because a directory exists, an adapter definition says it should work, or an old snapshot once said it worked.

The current runtime snapshot is a useful conservative base, but its provenance is snapshot-wide and has no freshness/proof lease. M03 V2 therefore needs **per-capability proof**, not stronger guessing.

## Canonical state model

Rich M03 proof state:
- `SUPPORTED` — current evidence proves the host feature.
- `UNSUPPORTED` — current evidence safely proves absence under the Negative Proof Contract.
- `UNKNOWN` — insufficient evidence.
- `BLOCKED` — evidence could exist but probe/policy/approval/security prevents proving it.
- `STALE` — prior proof existed but its validity basis changed or expired.

Compatibility projection into the current tri-state runtime surface:
- `SUPPORTED` → `true`;
- `UNSUPPORTED` → `false`;
- `UNKNOWN | BLOCKED | STALE` → `unknown`.

This projection is one-way. Legacy `true` cannot manufacture a new proof record.

**Evidence floor:** CEL `E1 DECLARED` is discovery input only and can never produce `SUPPORTED`. Every enabling `SUPPORTED` result requires at least `E2 DETERMINISTIC_LOCAL_FACT`, or a stronger rung.

## Host capability vocabulary

### Existing capability IDs to preserve
- modelSelection
- toolCalling
- structuredOutput
- promptCache
- explicitCache
- persistentContext
- subagents
- parallelAgents
- usageTelemetry
- visionInput

### Proposed M03 V2 host/control additions for S05 schema work
- modelEnumeration
- reasoningEffortControl
- backgroundExecution
- headlessExecution
- workerCancellation
- workerResume

The additions are architecture vocabulary only in WO-005. Existing schemas are not changed here.

## Capability classes

1. **HOST_ONLY** — property of host/runtime itself.
2. **MODEL_HOST_INTERSECTION** — usable only when M04 model proof and M03 host proof both pass.
3. **ROUTER_CONTROL** — host exposes control surface, but M05/M06 decide when to use it.

M03 proves availability. It never decides policy use.

## Success metrics

Safety objectives:
- Unsafe Enablement Rate = **0** in the mandatory adversarial corpus.
- UNKNOWN/BLOCKED/STALE-to-TRUE violations = **0**.
- Subject/probe/policy drift invalidation = **100%** for covered drift cases.
- Tampered proof/evidence acceptance = **0**.
- Absence incorrectly classified as UNSUPPORTED = **0**.
- Cross-host/cross-root replay acceptance = **0**.

Determinism:
- same identity + same probe definition + same evidence + same policy => identical proof digest and projection;
- durable records contain no unredacted secret or absolute host path.

Performance targets to validate in S04/S05:
- valid warm proof check target p95 ≤ 50 ms;
- bounded local full-probe target p95 ≤ 2 s per host;
- any individual automatic active probe hard timeout ≤ 5 s;
- proof record target ≤ 64 KiB per host under the initial vocabulary.

Correctness outranks latency. Missing proof returns UNKNOWN rather than violating a performance target.

## Baseline comparison metrics

M03 implementation must later report:
- capability false-positive rate;
- capability false-negative/UNKNOWN rate;
- proof cache hit rate;
- stale-proof rejection rate;
- probe count and probe duration;
- automatic vs blocked/approval-gated probe count;
- proof bytes per host;
- M30 telemetry overhead;
- host drift detection latency.

## HARD consumers

- M01: subagents/background/headless/cancellation facts.
- M04: modelSelection/modelEnumeration host facts.
- M06: reasoningEffortControl fact.
- M23: versioned host capability set and proof status.

No consumer may reinterpret UNKNOWN as TRUE.
