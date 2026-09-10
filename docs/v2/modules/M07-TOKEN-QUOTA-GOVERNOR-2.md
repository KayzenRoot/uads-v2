# M07 — Token & Quota Governor 2.0
Status: DISCOVERY | Class: NECESSARY

Mission: budget context, worker spawns, retries, model/effort escalation and review so quality remains bounded by explicit resource policy.

Standalone: owns local budgets. Hive complement: can accept optional project/program ceilings.

Candidate technology radar, UNAPPROVED: hierarchical token buckets; proof-value-per-token score; quota reservation; adaptive backpressure; emergency budget circuit breaker.

## Adaptive Evidence Gauntlet requirement

M07 is the economic authority for every AEG run. Before any model-bearing critic or correction dispatch, M07 must admit a finite Economic Safety Envelope covering tokens, monetary cost where known, calls, critics, rounds, concurrency, context growth and wall time.

AEG-specific invariants:
- critics and correction rounds cannot mint new budget;
- child reservations conserve the parent Work Order budget;
- default active specialist concurrency remains 1 until an evidence-gated profile proves otherwise;
- maxRounds, maxCriticInvocations and maxConcurrentCritics are hard bounds;
- UNKNOWN usage does not create spend capacity;
- retries remain owned by M21 and cannot be multiplied by the Gauntlet;
- HARD_STOP blocks new model-bearing AEG work locally without another LLM call;
- Model Lock / routing policy cannot be bypassed by critic diversity.

The future M07 proof matrix must include runaway critic fan-out, correction-loop oscillation, budget reset on restart, retry amplification and post-HARD_STOP zero-extra-dispatch proofs.

Sessions S00–S07 cover baselines, algorithms, budget architecture, starvation/abuse, cost tests, slicing, host telemetry, freeze.

Mandatory tests: hard caps, reservation release, no spawn storm, no infinite retry spend, graceful low-quota behavior, bounded AEG rounds/critics, parent-child budget conservation, and deterministic emergency stop.
