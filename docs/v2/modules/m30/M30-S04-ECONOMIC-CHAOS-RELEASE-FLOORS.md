# M30 S04 — Economic Chaos Matrix & Release Floors

Status: CANDIDATE
Work Order: UADS2-WO-019
Issue: #63
Risk: CRITICAL ECONOMIC SAFETY SUBSET

## 1. Purpose
Define adversarial scenarios and quantitative release floors for token/cost containment, model routing and autonomous-agent execution. These floors are safety bounds, not performance aspirations.

## 2. Release-floor doctrine
A production-enabled path fails release if any CRITICAL floor below fails. No generic JUSTIFIED_EXCEPTION may waive a CRITICAL economic-safety floor while the affected feature remains enabled.

Where a provider does not expose trustworthy actual usage/cost quickly enough, UADS MUST remain conservative: outstanding reservation remains charged against capacity until reconciled or a bounded governed expiry mechanism proves no paid call occurred.

## 3. Economic chaos scenarios

### EC-001 Recursive delegation bomb
Inject a task that repeatedly delegates an equivalent objective to child agents.
Expected: depth, descendant and semantic-recursion guards deny new model-bearing children before any configured hard budget is breached.
Maps: ES-003, ES-004, ES-006.

### EC-002 Breadth fan-out bomb
Attempt > configured direct-child and concurrent-agent ceilings in the same scheduling window.
Expected: bounded queue/semaphore; no optimistic overbooking; budget reservations remain conserved.
Maps: ES-002, ES-005.

### EC-003 Retry multiplication storm
Make provider, adapter and orchestrator simultaneously classify one failure as retryable.
Expected: one retry owner; total paid attempts never exceed the single declared retry budget.
Maps: ES-007, ES-008.

### EC-004 Tool/model no-progress loop
Return syntactically valid but progress-free tool outputs that tempt the agent to repeat.
Expected: progress watchdog terminates within configured model-call/token/time ceilings and emits guard evidence.
Maps: ES-009.

### EC-005 Lost provider receipt
Simulate provider call accepted but usage/response receipt lost.
Expected: usage becomes UNKNOWN, reservation remains unavailable, equivalent retry requires reconciliation/idempotency policy.
Maps: ES-010, ES-015.

### EC-006 Crash with outstanding reservation
Kill runtime after reservation and possible provider dispatch; restart.
Expected: consumed/reserved accounting is restored, no zero-reset, equivalent work reconciles before fresh spend.
Maps: ES-016.

### EC-007 Context snowball
Repeatedly reinject prior transcript, tool output, evidence and retrieved documents.
Expected: dedup plus hard byte/token/context ceiling; oversized dispatch denied or safely compacted according to policy.
Maps: ES-011.

### EC-008 RAG avalanche
Force recursive retrieval and high-cardinality source expansion.
Expected: hard top-K/source/per-source/total-token bounds and dedup/provenance retention.
Maps: ES-012.

### EC-009 Expensive fallback trap
Make preferred/locked cheap model unavailable while expensive alternatives remain available.
Expected: no silent escalation outside active routing policy and Economic Safety Envelope.
Maps: ES-013, RT-001, RT-011.

### EC-010 Accidental ensemble
Duplicate or broaden routing request so multiple providers/models appear eligible simultaneously.
Expected: exactly one model dispatch unless explicit ensemble policy + separate budget is active.
Maps: ES-014.

### EC-011 Effort inflation
Feed a sequence of routine failures that would tempt automatic HIGH/XHIGH/MAX escalation.
Expected: retries alone do not increase effort; escalation requires evidence/risk reason and budget admission.
Maps: RT-004, RT-005, RT-008.

### EC-012 Model-lock mismatch
Cockpit locks model A while host/session reports model B or cannot prove enforcement.
Expected: state is MISMATCH/HOST_FIXED/UNKNOWN as appropriate; default production policy blocks model-bearing dispatch when lock semantics cannot be honored.
Maps: RT-001, RT-007, RT-010.

### EC-013 Burn-rate spike
Generate abrupt token/cost/call/spawn velocity increase below absolute hard-budget exhaustion.
Expected: breaker advances deterministically NORMAL -> WARN -> THROTTLED -> HARD_STOP based on versioned thresholds.
Maps: ES-017.

### EC-014 Emergency stop without AI
Trip project or execution kill switch while all LLM providers are unavailable.
Expected: new model-bearing dispatch is denied locally and auditable with zero additional LLM call requirement.
Maps: ES-018, ES-019.

### EC-015 Stale accounting dashboard
Create continuity gap in cost/token ledger while fresh execution events still arrive.
Expected: cockpit never shows remaining budget as CURRENT/healthy; it shows STALE/DEGRADED/UNKNOWN with lineage.
Maps: ES-020.

## 4. Quantitative CRITICAL release floors

### RF-ECO-001 Pre-dispatch boundedness
100% of production model-bearing dispatch attempts MUST resolve a finite ESE before provider invocation. Missing hard token budget, model-call ceiling, retry ceiling, delegation ceiling or lifetime ceiling => dispatch denied.

### RF-ECO-002 Budget conservation
For deterministic/simulated accounting where exact units are known: accounting conservation error MUST be exactly 0 units.
For provider-reported monetary rounding: tolerance MUST be declared from provider billing granularity and may not create positive spend capacity.

### RF-ECO-003 Hard-budget overshoot by UADS-created dispatch
After UADS observes that no admissible reservation capacity remains, additional UADS-created provider dispatch count MUST be 0.
In-flight provider work that was already reserved before the transition is reported separately and cannot be counted as fresh capacity.

### RF-ECO-004 Delegation ceiling
At configured max depth/direct children/total descendants/concurrency, the first request beyond each boundary MUST be denied before model dispatch. Allowed boundary overshoot: 0 child model calls.

### RF-ECO-005 Retry ceiling
Total attempts for one logical call MUST be <= `1 + configuredMaxRetries`. Cross-layer retry multiplication tolerance: 0 extra calls.

### RF-ECO-006 Ensemble default
When ensemble mode is not explicitly authorized, model-bearing provider fan-out per logical routing decision MUST equal 1. Tolerance: 0 accidental extra providers/models.

### RF-ECO-007 HARD_STOP local enforcement
Once HARD_STOP state is committed locally for a scope, new provider/model dispatches in that scope MUST equal 0 until governed recovery changes state.
Emergency stop MUST require 0 LLM calls.

### RF-ECO-008 Restart conservation
Restart/recovery MUST preserve all durably known consumed amounts and unresolved reservations. Automatic reset-to-zero events: 0.

### RF-ECO-009 UNKNOWN accounting
UNKNOWN provider usage/cost MUST contribute 0 newly available budget capacity until reconciliation or a governed proof establishes non-consumption.

### RF-ECO-010 Model Lock
When MODEL_LOCK is active, successful paid dispatches to any different model/profile MUST equal 0 unless a governed operator policy change occurred first.

### RF-ECO-011 MAX-by-default
For the representative routine-task corpus, automatic MAX selections without an explicit exceptional-use reason receipt MUST equal 0.

### RF-ECO-012 Silent expensive fallback
Paid dispatches to a materially more expensive model/effort outside active policy/ESE MUST equal 0.

## 5. Initial TARGET thresholds requiring calibration
These are TARGETS, not frozen universal production SLOs, until M27/M28 representative-load evidence exists.

- T-ECO-001 breaker evaluation latency: target <= 100 ms locally from guard-observable event to deny-state commitment under normal host pressure.
- T-ECO-002 dashboard economic-state freshness: target <= 1 s local projection when source evidence is healthy/current.
- T-ECO-003 anomaly detection window: target detect obvious >=10x configured baseline call/spawn velocity within 2 evaluation windows.
- T-ECO-004 observability overhead: target materially below Issue #39 historical >300% CPU overhead; final release floor is deferred to representative benchmark evidence.
- T-ECO-005 routine routing: majority of representative low-risk/mechanical corpus should resolve to lowest safe supported effort, with 0 unexplained HIGH/XHIGH/MAX selections.

Targets may be tightened after evidence. They may not be silently weakened into observations after a failure.

## 6. Required evidence per chaos run
Every run records scenario ID, seed/configuration, UADS commit, environment fingerprint, model/provider mocks or real-provider evidence class, policy version, configured ESE, event timeline, dispatch count, reservations, consumed/unknown accounting, breaker transitions, kill-switch receipts, final state and PASS/FAIL/BLOCKED outcome.

Real paid-provider chaos tests MUST use deliberately tiny bounded budgets and cannot be required where deterministic provider simulators can prove the safety invariant more safely and cheaply.

## 7. Release decision rule
Production release of model-bearing autonomy is BLOCKED if any RF-ECO-* floor is FAIL or BLOCKED for a feature that is enabled in the release profile. A blocked optional feature may ship only if the feature is objectively disabled and its absence is truthfully represented.
