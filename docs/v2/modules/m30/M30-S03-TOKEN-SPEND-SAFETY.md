# M30 S03 — Token Spend Safety

Status: CANDIDATE ADDENDUM
Risk: CRITICAL ECONOMIC SAFETY
Work Order: UADS2-WO-018
Issue: #59

## 1. Intent
Token runaway is treated as a production safety incident, not merely a cost-optimization defect. Any bug that can cause uncontrolled model calls, delegation fan-out, retry storms, recursive agent spawning, repeated tool/model loops, context inflation or duplicate execution MUST fail closed before material spend can accumulate.

## 2. Economic Safety Envelope (ESE)
Every model-bearing execution scope MUST resolve an Economic Safety Envelope before dispatch.

Required bounded fields:
- project/workspace identity;
- Work Order / execution identity;
- model/provider/profile identity;
- hard token budget;
- hard monetary-cost budget when price data is available;
- maximum model-call count;
- maximum retry count;
- maximum delegation depth;
- maximum direct children per agent;
- maximum total descendant agents;
- maximum concurrent model-bearing agents;
- maximum context size / growth budget;
- maximum wall-clock lifetime;
- budget reservation and consumed counters;
- parent budget identity for delegated work;
- kill-switch state and reason.

No missing/unknown hard limit may be interpreted as unlimited in production mode.

## 3. Budget hierarchy
Budgets form a strict parent-child tree:
GLOBAL/PROJECT -> WORK ORDER -> EXECUTION -> AGENT -> CHILD AGENT -> MODEL CALL.

A child may receive only a bounded reservation from its parent's remaining budget. Delegation never creates new economic capacity. Unused reservation may be returned; spent budget cannot be resurrected by retry, restart or child creation.

Invariant: sum(active child reservations + parent consumed + parent remaining) may never exceed the parent's original hard budget, within explicitly defined accounting tolerance.

## 4. Delegation safety
### TS-001 Recursive agent spawning — CRITICAL
Controls:
- hard delegation-depth ceiling;
- hard descendants ceiling;
- hard child-per-agent ceiling;
- cycle detection using execution/lineage identity;
- no child may spawn before obtaining budget reservation;
- duplicate semantic delegation guarded by task/fingerprint identity;
- fan-out breach trips circuit breaker and emits CRITICAL economic-safety evidence.

### TS-002 Agent fan-out explosion — CRITICAL
Controls:
- concurrency semaphore for model-bearing agents;
- bounded queue with explicit rejection/defer behavior;
- launch rate limit;
- aggregate reserved-budget check before spawn;
- no optimistic overbooking of token budget.

## 5. Retry safety
### TS-003 Retry storm — CRITICAL
Controls:
- retry budget is finite and part of the same parent budget;
- exponential backoff with bounded jitter where retries are valid;
- no automatic retry for deterministic failures, policy rejection, context-limit failure, budget rejection or unsafe UNKNOWN_OUTCOME;
- retry reason must be classified;
- retry consumes call-count and token/cost allowance;
- repeated equivalent failure opens a circuit breaker.

### TS-004 Cross-layer duplicate retries — CRITICAL
Provider, adapter, agent and orchestrator layers MUST not independently retry the same failed call without a single authoritative retry policy. Retry ownership is explicit and duplicate retry chains are forbidden.

## 6. Loop and duplicate-call safety
### TS-005 Tool/model loop — CRITICAL
Detect repeated bounded signatures across model response -> tool call -> model response cycles. When repeated progress-free signatures exceed policy, stop execution and mark TOKEN_SPEND_GUARD_TRIPPED.

### TS-006 Duplicate expensive call — HIGH
A deterministic request fingerprint plus execution identity SHOULD suppress accidental duplicate calls when semantics permit. Dedup must not fabricate successful outcomes. If outcome is unknown, use reconciliation rather than blind replay.

### TS-007 Non-progress loop — CRITICAL
Each multi-step agent loop must expose measurable progress markers. N consecutive iterations with no meaningful state/evidence delta trips the economic circuit breaker even if individual calls succeed.

## 7. Context-growth safety
### TS-008 Runaway context accumulation — HIGH/CRITICAL
Controls:
- maximum context/token window utilization policy;
- incremental context-growth ceiling per iteration;
- deduplication before reinjection;
- bounded history retention / summarization contract;
- large tool outputs are referenced, sliced or summarized rather than blindly copied repeatedly;
- no recursive inclusion of prior prompts/transcripts/evidence bundles;
- context-size estimate checked before expensive dispatch.

### TS-009 RAG/context retrieval explosion — HIGH
Retrieval must have top-K, byte/token, source-count and per-source bounds. Recursive retrieval expansion requires an additional budget grant. Retrieved context is deduplicated and provenance-tagged.

## 8. Model routing safety
### TS-010 Accidental expensive-model escalation — HIGH
Model/profile selection must be explicit, policy-bound and auditable. Fallback may not silently escalate to a materially more expensive model unless policy permits and remaining cost budget covers worst-case reservation.

### TS-011 Multi-model broadcast bug — CRITICAL
A task intended for one model cannot be broadcast to multiple models unless an explicit ensemble strategy with its own budget exists. Fan-out routing defaults to one selected execution path.

## 9. Accounting truth and reservation
Token/cost accounting distinguishes:
- ESTIMATED reservation before dispatch;
- PROVIDER_REPORTED actual usage when available;
- LOCALLY_ESTIMATED actual usage when provider data is absent;
- UNKNOWN when neither is trustworthy.

UNKNOWN cost/usage must not unlock additional budget. Conservative reservation remains consumed/unavailable until reconciled or explicitly expired by policy.

No dashboard projection may report budget remaining as authoritative if accounting continuity is uncertain.

## 10. Economic circuit breaker
Canonical states:
NORMAL -> WARN -> THROTTLED -> HARD_STOP -> RECONCILING.

Trigger families include:
- token velocity above configured ceiling;
- model-call velocity anomaly;
- agent spawn velocity anomaly;
- reservation exhaustion;
- retry burst;
- repeated non-progress cycles;
- context-growth anomaly;
- cost-rate anomaly;
- accounting continuity gap.

HARD_STOP prevents new model-bearing work in the affected scope. Existing in-flight work follows bounded cancellation semantics. Recovery never automatically resets counters to zero.

## 11. Spend kill switches
Required governed kill scopes:
- agent;
- execution;
- Work Order;
- project/workspace;
- provider/model profile where supported.

Kill switches must be local and deterministic where possible so stopping runaway spend does not depend on another LLM call. Invoking a kill switch is auditable and must not itself trigger model inference.

## 12. Default-deny economic invariants
- no unlimited production token budget;
- no unlimited retries;
- no unlimited delegation depth/fan-out;
- no unlimited context growth;
- no unlimited model-call count;
- no budget reset on retry/restart;
- no child budget creation from nothing;
- no expensive fallback outside policy;
- no silent multi-model broadcast;
- no LLM required to enforce emergency spend stop;
- no uncertain accounting treated as zero spend.

## 13. Dashboard requirements
The Living Operations Organism must expose in real time, subject to truth/freshness rules:
- tokens consumed and reserved by project/WO/execution/agent/model/provider;
- cost consumed/reserved where pricing is known;
- token and cost velocity;
- model-call count and velocity;
- agent count, concurrency, fan-out and delegation depth;
- retry counts and reasons;
- context-size/growth trends;
- budget remaining and accounting confidence;
- active circuit-breaker state;
- recent TOKEN_SPEND_GUARD_TRIPPED events;
- governed kill controls with owner/risk/audit semantics.

## 14. S04 mandatory proofs
S04 MUST include adversarial tests proving:
1. recursive agent spawn cannot exceed depth/descendant/concurrency/budget ceilings;
2. simultaneous delegation cannot over-reserve the same parent budget under race;
3. retry layers cannot multiply into retry storms;
4. repeated no-progress model/tool cycles trip before hard token budget breach;
5. duplicate expensive calls are suppressed/reconciled according to semantics;
6. context and RAG growth remain bounded under adversarial large outputs;
7. fallback cannot escalate cost beyond policy/budget;
8. multi-model broadcast cannot happen without explicit ensemble authorization;
9. UNKNOWN accounting cannot be interpreted as free budget;
10. kill switch halts new model-bearing dispatch without requiring an LLM call;
11. process restart/recovery does not reset consumed budget or duplicate reserved spend;
12. dashboard token/cost values never render CURRENT when underlying accounting evidence is stale/gapped.

A production release with unresolved CRITICAL token-spend proof is blocked.

## 15. Cross-module ownership
M30 owns visibility, anomaly detection, alerting, circuit-breaker presentation and governed control-plane integration for token spend. Authoritative dispatch/budget enforcement must also exist at the owning execution/routing/cost modules so M30 is not a single point of economic safety. M24 retains Work Order/cost attribution semantics; routing/execution modules enforce pre-dispatch reservations and fan-out/retry limits; M29 governs authorization/policy; M28 governs restart/recovery persistence; M31 blocks release when CRITICAL economic-safety proofs fail.
