# UADS V2 — Architecture

Status: CANONICAL OVERLAY IN REVIEW

## Operating modes
`SOLO` is mandatory and complete. `HIVE_CONNECTED` is optional/additive through versioned contracts. Hive absence must not break UADS core execution.

## Core model

```text
User / optional HiveTaskEnvelope
        |
        v
UADS Coordinator
        +--> Context / Risk / Impact
        +--> Model + Effort Router
        +--> Spawn Gate --> zero or one active specialist worker
        +--> Verification / Fault Resolution
        +--> Evidence / Review
        +--> Enterprise Production-Readiness Plane
               M27 Capacity & Load
               M28 Resilience & Recovery
               M29 Operational Security & Supply Chain
               M30 Production Observability & Real-Time Operations
               M31 Release Engineering & Safe Operations
```

Default invariant: `coordinator_count=1`, `max_active_specialist_workers=1`, `parallel_specialist_fanout=false`.

## Functional ownership
M01 owns sequential queue/scheduler semantics. M02 owns background worker abstraction. M03 owns proven host capabilities. M04–M07 own model/effort/resource routing. M08 owns HEDS review runtime. M10/M20/M21 own fault, failure memory and retry semantics. M24 owns Work Order/cost ledger semantics.

## Observability boundary
M30 owns production telemetry transport, health/alerts, SLI/SLO and the real-time dashboard/operator plane. M24 owns Work Order/cost attribution. M08 emits review-analysis events required by B-001. Missing telemetry is explicit, never inferred.

## Enterprise production-readiness plane
Every module Work Order classifies scale/load, resilience, operational security, production observability and continuous safe operations as `COVERED`, `NOT_APPLICABLE` with rationale, or `GAP`. Necessary GAPs block production-readiness declaration.

## Runtime sequencing after UADS2-WO-002 approval
1. M30 event spine + dashboard/operator foundation.
2. First bounded M01 orchestrator slice integrated with M30.
3. M03 capability proof + M02 background worker integration.
4. Remaining modules through bounded Work Orders.

M27/M28/M29/M31 constraints apply from the first runtime slice.

## Safety invariants
- Hive optionality preserved;
- no canonical truth mutation from learned policy;
- no hidden escalation;
- no unbounded spawn;
- no retry without changed hypothesis/evidence;
- no proof reuse without validity;
- no advance while current work is BLOCKED/CORRECTION REQUIRED;
- no production-ready claim with necessary enterprise GAP;
- no real-time UI claim without objective source.
