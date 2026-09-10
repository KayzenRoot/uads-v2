# UADS2-WO-018 — S03 Test / Proof Plan

Status: ACTIVE PLAN
Risk: HIGH

## Purpose
Translate the M30 S03 threat/failure model into concrete S04 proof obligations. This document is prospective and precedes S03 approval.

## Mandatory proof families

### P1 Governed command security
- reject spoofed owner/module identity;
- reject unauthorized actor/capability combinations;
- detect stale preconditions and TOCTOU races;
- prove idempotency under duplicate/replay delivery;
- prove immutable audit receipt linkage;
- prove bounded blast radius for HIGH/CRITICAL controls.

### P2 UNKNOWN_OUTCOME reconciliation
- simulate disconnect after owner acceptance but before client receipt;
- preserve UNKNOWN_OUTCOME until owner evidence reconciles;
- prove retries do not duplicate non-idempotent side effects;
- prove contradictory receipts cause DEGRADED/incident state, never arbitrary winner selection.

### P3 Telemetry integrity and continuity
- forged/corrupt hash rejection;
- clock-skew behavior;
- known/unknown gap detection;
- replay window correctness;
- silence cannot become HEALTHY without continuity/freshness evidence.

### P4 Resource exhaustion and AOBC
- cardinality explosion;
- event amplification;
- slow-client/SSE fan-out pressure;
- query/storage pressure;
- deterministic degradation ladder;
- mandatory truth/audit/health evidence survives optional-detail shedding;
- benchmark against Issue #39/B6 debt.

### P5 Storage and partial failure
- disk-full, read-only and corrupt-record behavior;
- source-isolated degradation;
- dashboard continues bounded partial service;
- no domain-state corruption due observability failure.

### P6 Privacy/security
- secrets/raw prompts/sensitive paths rejected or sanitized;
- correlation identifiers remain opaque/bounded;
- optional exporter/plugin compromise is isolated from canonical local truth;
- dashboard compromise cannot directly mutate domain state.

### P7 Operator safety and recovery
- risk-class safeguards;
- confirmation/policy behavior for dangerous actions;
- repeated rollback/recovery loop detection;
- recovery actions themselves audited and bounded.

### P8 COG/AAE experimental safety
- inferred causality always marked INFERRED with evidence links;
- AAE cannot hide unresolved HIGH/CRITICAL or uncertain states;
- drill-down/raw evidence remains available.

### P9 Critical token-spend safety
- prove every model-bearing dispatch has a finite hard Economic Safety Envelope;
- prove parent-child budget conservation under concurrent delegation;
- prove agent depth, descendants, per-agent children and concurrency ceilings cannot be bypassed;
- prove recursive/duplicate semantic delegation trips a circuit breaker before hard-budget breach;
- prove retry ownership is single and cross-layer retries cannot multiply calls;
- prove deterministic/policy/context/budget failures are not automatically retried;
- prove progress-free model/tool loops terminate within bounded call/token limits;
- prove duplicate expensive-call handling uses dedup/reconciliation without blind replay;
- prove context accumulation and RAG retrieval obey token/source/top-K growth ceilings;
- prove model fallback cannot silently escalate to a materially more expensive profile outside policy/budget;
- prove multi-model broadcast requires explicit ensemble authorization and a separate bounded budget;
- prove UNKNOWN token/cost accounting cannot create new spend capacity;
- prove restart/recovery does not reset consumed budget or duplicate outstanding reservation;
- prove token/cost/model-call/agent-spawn velocity anomaly triggers WARN/THROTTLED/HARD_STOP deterministically;
- prove HARD_STOP blocks new model-bearing dispatch locally without requiring an LLM call;
- prove project/WO/execution/agent/provider kill switches are governed, auditable and bounded;
- prove dashboard does not label remaining token/cost budget CURRENT when accounting continuity is stale/gapped.

CRITICAL gate: a release cannot be approved while any token-spend safety proof above is unresolved or failing.

## S04 gate rule
S04 cannot begin with unresolved HIGH/CRITICAL S03 findings lacking a specific prevention/detection/containment/recovery proof obligation. Token-spend runaway is classified as CRITICAL economic safety and is release-blocking by default.
