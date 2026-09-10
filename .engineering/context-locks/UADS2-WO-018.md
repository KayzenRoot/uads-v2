# UADS2-WO-018 — Context Lock

Status: ACTIVE
Module: M30 Production Observability & Real-Time Operations
Session: S03 Failure, Security and Recovery Analysis
Issue: #59
Base main SHA: `27e5d996cf5d8a759d86ae2b84c94e3c37395b09`
Risk: HIGH

## Frozen inputs
- M30 S00 problem/objectives/metrics
- M30 S01 technology radar
- M30 S01.5 proprietary invention radar
- M30 S02 architecture
- Issue #39 telemetry-overhead debt

## Governing truths
1. Domain-owning modules remain authoritative.
2. M30 may observe, derive, correlate and orchestrate governed commands, but may not directly own/mutate business-domain state.
3. Missing, stale, corrupt or uncertain evidence must remain explicit.
4. Dangerous commands require owner, authorization, preconditions, risk classification, bounded blast radius, audit receipt and terminal outcome semantics.
5. `UNKNOWN_OUTCOME` cannot be silently converted to success/failure.
6. Observability failure must not corrupt workload/domain state.
7. GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT and local-first viability remain mandatory.

## Scope lock
This Work Order analyzes failure, threat, abuse, containment and recovery. It does not implement runtime controls, adopt new dependencies or change S02 ownership boundaries.

## Stop conditions
Stop and block S04 if any unresolved HIGH/CRITICAL path lacks prevention or containment plus observable recovery semantics.
