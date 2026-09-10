# M30 S00 — Problem, Objectives & Metrics

Status: IMPLEMENTED CANDIDATE — HEDS PENDING

## Problem
UADS V2 needs one objective operational nervous system that can answer, in near real time, what the system is doing, whether it is healthy, what failed, what evidence supports that conclusion, and whether displayed information is fresh enough to trust. The operator surface must never fabricate health, activity, cost, model, review, execution or diagnostic state when an objective source is missing, stale, corrupt or unsupported.

The existing WO-003 foundation proves a useful bounded local event spine and dashboard, but it does not yet constitute full M30 production readiness. Full M30 must define observability semantics, freshness, aggregation, SLI/SLO, alert correctness, incident/runbook linkage, operational health, degradation behavior and dashboard contracts at module scale.

## Operator outcomes
An operator must be able to determine, from objective evidence:
1. current system/project/Work Order activity and correlation identity;
2. HEALTHY / DEGRADED / UNAVAILABLE state with explicit reason and freshness;
3. recent errors, diagnostics and operational events without hidden drops or duplicate counting;
4. whether displayed data is live, delayed, stale or unavailable;
5. which source produced a displayed value and when it was last validated;
6. whether an alert/SLO breach is based on sufficient current evidence;
7. what recovery/runbook action applies when a production condition degrades.

## Existing foundation inventory
### REUSE
- versioned `uads.operational-event` contract;
- immutable event identity and canonical SHA-256 integrity;
- bounded reads and retention;
- invalid/corrupt record degradation rather than fabricated success;
- loopback-only HTTP dashboard surface;
- SSE one-way operator event delivery;
- explicit `UNAVAILABLE` for missing telemetry;
- privacy/path/secret sanitization;
- event producer boundary: modules emit events, dashboard projects them.

### REWORK / HARDEN
- event storage/retention path for scale and hot-path efficiency;
- snapshot aggregation latency;
- freshness semantics and source leases;
- health model from coarse state to reason-coded component/source health;
- dashboard projection contracts to make source/freshness visible;
- SSE replay/gap/backpressure/reconnect semantics;
- cardinality budgets and aggregation policy;
- telemetry durability/throughput without excessive synchronous overhead.

### DEFER TO LATER M30 SESSIONS
- exact observability technology stack;
- traces/metrics implementation choice;
- alert engine implementation;
- SLO computation engine;
- incident/runbook automation;
- visual redesign/fidelity work.

### RETIRE AS CANONICAL CLAIM
- historical text that says WO-003 is still awaiting final HEDS;
- any implication that the WO-003 benchmark is a production SLO;
- any dashboard state derived from mock/stale data without explicit non-live labeling.

## Ownership boundaries
- M30 owns production telemetry transport, operational aggregation, source health, freshness, SLI/SLO, alerting and dashboard/operator projections.
- M24 owns Work Order/cost attribution and cost ledger semantics.
- M08 owns semantic review-analysis generation; M30 transports/projects its operational event surface.
- M27 owns capacity/load engineering constraints and benchmark methodology at enterprise scale.
- M28 owns resilience/recovery engineering patterns; M30 must expose their operational state.
- M29 owns operational security/supply-chain controls; M30 must not become a secret/path/cardinality exfiltration surface.
- M31 owns safe release/continuous operations; M30 supplies release health evidence and observable degradation signals.

## S00 measurable objectives
These are discovery acceptance metrics, not yet production SLO commitments.

### O1 Truthfulness
- 0 fabricated live values in governed tests.
- Missing source => `UNAVAILABLE`.
- Corrupt/invalid source => `DEGRADED` or `UNAVAILABLE` with reason.
- Stale source => explicit `STALE`/non-live state, never silently current.

### O2 Freshness
Every operator-visible real-time datum must carry or resolve to:
- source identity;
- observed/event timestamp;
- evaluation timestamp;
- freshness budget/lease;
- freshness state: CURRENT / STALE / UNAVAILABLE.
A field without objective freshness evidence is not authorized to display as live.

### O3 Integrity and deduplication
- deterministic event/hash identity validation;
- duplicate-counting tests produce deterministic numerator/denominator and raw-event identities;
- corrupt/hash-mismatched events never enter healthy aggregates silently.

### O4 Loss and gap visibility
- dropped/rejected/invalid events must be countable or surfaced as an explicit unknown gap condition;
- reconnect/replay semantics must not silently skip a known event range;
- no claim of complete stream continuity without evidence.

### O5 Performance
Historical baselines remain evidence, not targets:
- WO-003 dashboard snapshot: p50 ~1659 ms, p95 ~2174 ms on one Windows host;
- M03 B6 later demonstrated excessive synchronous telemetry overhead and is tracked by Issue #39.
S01-S04 must define justified targets and measurement environments before production SLOs are accepted.

### O6 Boundedness/cardinality
- payload/string/key/query/client/retention limits remain explicit;
- high-cardinality attributes require a bounded policy before production promotion;
- unbounded labels, raw prompts, arbitrary provider output and secrets are forbidden defaults.

### O7 Availability and degradation
Dashboard/operator APIs must remain capable of presenting partial truth when one source fails. One missing subsystem must not force fabricated global HEALTHY or erase healthy independent sources.

### O8 Operator usefulness
For every actionable health/alert state, the projection must make available a reason code plus enough bounded identity/context to reach an owning component, evidence, diagnostic or runbook link without exposing sensitive payloads.

## Anti-fabrication invariant
A rendered value is one of:
- LIVE/CURRENT with objective source and freshness proof;
- STALE with last-known timestamp;
- DEGRADED with bounded reason;
- UNAVAILABLE.
There is no implicit synthetic fallback presented as live production truth.

## Enterprise pillars at S00
- M27 Scale/load: GAP TO DESIGN. Existing bounds exist, but full throughput/cardinality/retention targets require S01-S04 proof design.
- M28 Resilience/recovery: PARTIALLY COVERED. Corrupt/missing-source degradation exists; reconnect, replay, gap and broader recovery semantics remain to design.
- M29 Operational security: PARTIALLY COVERED. Loopback/sanitization/closed schema exist; full cardinality, operational access and supply-chain posture remain to reconcile.
- M30 Observability: OWNED HERE. Foundation exists; full semantic/operational plane remains incomplete.
- M31 Safe operations: PARTIALLY COVERED. Versioning/additive rollback exist; release health/alerts/runbook integration remain incomplete.

## Known debt
Issue #39 remains the canonical M30 hot-path performance debt. S00 does not waive or hide it.

## S00 exit condition
Proceed to S01 only after this problem/metric contract passes exact-head repository gates and HEDS. S01 may then evaluate market technologies against these frozen needs rather than selecting tools first.