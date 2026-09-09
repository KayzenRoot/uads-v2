# M18 — UADS ↔ Hive Integration Bridge
Status: DISCOVERY | Class: NECESSARY

Mission: let UADS and Hive cooperate through explicit optional contracts while preserving independent operation.

Hard invariant: UADS core MUST boot, plan, execute and review in `SOLO` mode with Hive absent. `HIVE_CONNECTED` is additive.

Hive owns macro/canonical truth, durable organizational memory and HEDS policy. UADS owns bounded execution/micro-orchestration. Bridge candidates: `HiveTaskEnvelope`, `UADSQualityBundle`, capability negotiation and promotion candidates.

Candidate technology radar, UNAPPROVED: versioned contract handshake; Merkle/fingerprint context references; evidence-not-computation exchange; circuit-breaker/disconnected mode.

Sessions S00–S07 cover boundaries, contracts, optionality architecture, network/staleness/security, contract tests, implementation, end-to-end compatibility and freeze.

Mandatory tests: Hive absent, incompatible version, stale envelope, cross-project identity, network failure, reconnect, no duplicate canonical promotion.
