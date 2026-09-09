# M07 — Token & Quota Governor 2.0
Status: DISCOVERY | Class: NECESSARY

Mission: budget context, worker spawns, retries, model/effort escalation and review so quality remains bounded by explicit resource policy.

Standalone: owns local budgets. Hive complement: can accept optional project/program ceilings.

Candidate technology radar, UNAPPROVED: hierarchical token buckets; proof-value-per-token score; quota reservation; adaptive backpressure; emergency budget circuit breaker.

Sessions S00–S07 cover baselines, algorithms, budget architecture, starvation/abuse, cost tests, slicing, host telemetry, freeze.

Mandatory tests: hard caps, reservation release, no spawn storm, no infinite retry spend, graceful low-quota behavior.
