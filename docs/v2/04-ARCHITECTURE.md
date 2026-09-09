# UADS V2 — Architecture

Status: CANONICAL OVERLAY IN REVIEW

## Operating modes

UADS V2 is standalone-first.

```text
SOLO
User → UADS V2 Core → Result / Evidence

HIVE_CONNECTED
HiveTaskEnvelope → Optional Hive Bridge → UADS V2 Core → UADSQualityBundle → Hive
```

`SOLO` is a first-class mandatory mode. The UADS core MUST NOT require Hive packages, services or availability to boot, plan, execute, verify or review its owned work. `HIVE_CONNECTED` is additive through a versioned optional bridge. Loss, absence or incompatibility of Hive must degrade safely to the supported standalone boundary rather than break UADS core execution.

## Core model

```text
User / optional HiveTaskEnvelope
        |
        v
UADS Coordinator
        |
        +--> Context / Risk / Impact
        |
        +--> Model + Effort Router
        |
        +--> Spawn Gate
                |
                +--> zero or one active specialist worker
        |
        +--> Selected Verification / Fault Resolution
        |
        +--> Evidence + Review Package
        |
        v
Main Session Result / optional UADSQualityBundle
```

Default concurrency invariant:

```text
coordinator_count = 1
max_active_specialist_workers = 1
parallel_specialist_fanout = false
```

## Main components

### Coordinator
Owns bounded task lifecycle and preserves Work Order identity.

### Sequential Agent Orchestrator
Maintains a queue. A next specialist cannot start until the active specialist reaches a terminal state.

### Background Worker Runtime
Executes a selected specialist without creating a new visible user conversation when the host proves support.

### Host Capability Layer
Detects runtime/adapter capabilities. Capability state is PROVEN, UNKNOWN/UNPROVEN, UNSUPPORTED or BLOCKED. Unknown never authorizes a feature.

### Model Router + Effort Autopilot
Selects a policy-compatible model/profile and reasoning class from proven runtime options. Routing is evidence- and budget-aware.

### Context Intelligence
Retains inherited C0-C5/progressive-context behavior. Context expands only when evidence or risk requires it.

### Evidence/Failure/Fault Layer
Evidence Cache, Failure Memory, fault localization, targeted verification and correction loops share immutable identity and invalidation rules.

### Review Pipeline
Implements HEDS-compatible delta-first review outputs. UADS executes and packages evidence; it does not duplicate Hive's canonical governance authority.

### Optional Hive Integration Bridge
Translates versioned task/evidence contracts and capability state. It is an adapter boundary, not a core dependency. Hive cannot become necessary for normal UADS solo operation.

## Hive boundary

```text
HIVE V2
truth • durable memory • governance • macro planning • HEDS policy
       |
       | optional HiveTaskEnvelope
       v
UADS V2 BRIDGE
version/capability/identity validation
       |
       v
UADS V2 CORE
context • routing • bounded execution • gates • fault repair • evidence
       |
       | optional UADSQualityBundle
       v
HIVE V2
reconcile • promote • canonical checkpoint
```

## Non-duplication principle

Analyze once when validity permits. Exchange evidence and identity rather than recomputing the same conclusion in both systems. A capability already owned by Hive should become a bridge/contract in UADS when integration is useful, not a duplicate authority.

## Enterprise production-readiness plane

Every module Work Order MUST classify:
1. Scale & load.
2. Resilience & failure handling.
3. Operational security.
4. Production observability.
5. Continuous operations & safe delivery.

Each classification is `COVERED`, `NOT_APPLICABLE` with rationale, or `GAP`. A necessary GAP blocks production-readiness declaration.

Cross-cutting owners:
- M27 Capacity & Load Engineering;
- M28 Resilience & Recovery Engineering;
- M29 Operational Security & Supply Chain;
- M30 Production Observability & Real-Time Operations;
- M31 Release Engineering & Safe Operations.

These compose with functional modules rather than replacing them.

## Observability ownership split

M08 emits privacy-safe review-analysis events required by the owner-approved B-001 V2 obligation.
M24 owns Work Order/cost attribution and ledger semantics.
M30 owns authoritative production event transport, operational aggregation, SLI/SLO, health/alerts and the real-time dashboard/operator plane.

A real-time UI claim MUST be backed by an objective source. Missing data is `UNAVAILABLE` or degraded, never fabricated.

## Historical runtime sequencing from UADS2-WO-002 — SUPERSEDED

The earlier bounded sequence proposed:

1. establish M30 event/dashboard foundation;
2. implement an M01 slice;
3. add M03/M02 capability/background integration.

This sequence is retained as historical provenance but is **superseded by ADR-UADS2-011 and the frozen global HARD dependency graph**.

Current rule:
- module numbers do not define build order;
- a module may enter deep discovery only from the graph-eligible set;
- M03 is a HARD predecessor of M01 and is the selected next module;
- the WO-003 M30 foundation does not equal full M30 S07 module freeze.

M27/M28/M29/M31 constraints still apply from the first runtime slice.

## Safety invariants

- standalone core remains operable with Hive absent;
- no canonical truth mutation from learned policy;
- no hidden escalation to stronger model/effort without recorded reason;
- no unbounded specialist spawn;
- no retry without changed hypothesis/evidence;
- no proof reuse without validity;
- no next increment while current one is CORRECTION REQUIRED/BLOCKED;
- no production-readiness declaration with a necessary enterprise pillar still GAP;
- no real-time UI claim without objective event/source backing.


## Global module architecture gate — ADR-UADS2-011

The 31-module system-level topology, ownership matrix and dependency graph are canonical planning inputs:

- `docs/v2/planning/GLOBAL-MODULE-SYSTEM-ARCHITECTURE.md`
- `docs/v2/planning/GLOBAL-MODULE-SYSTEM-CONTRACTS.md`
- `docs/v2/planning/GLOBAL-MODULE-DEPENDENCY-GRAPH.md`
- `docs/v2/planning/GLOBAL-MODULE-DEPENDENCIES.json`

Detailed technology choices are intentionally deferred to each module's S01/S01.5 cycle.

A module may enter deep discovery only when its HARD predecessors are frozen, unless a new explicit ADR authorizes a contract-first exception. Module numbers are not construction order.

The first selected deep-discovery module after UADS2-WO-004 approval is M03 Host Capability Detector.

Architecture Reconciliation runs every 3–5 completed module freezes, default 4, and immediately on material boundary/ADR/technology/regression changes.


## M03 deep-discovery candidate — ADR-UADS2-012

UADS2-WO-005 proposes **Proof-Carrying Host Capabilities** for M03.

The candidate architecture separates:
- host/adapter presence;
- declarations/enumerations;
- current per-capability evidence;
- freshness/drift validity;
- compatibility projection.

Only a current valid `SUPPORTED` proof may project to enabled `true`.
`UNKNOWN`, `BLOCKED` and `STALE` project to `unknown`.

`UNSUPPORTED` is legal only under the Negative Proof Contract; absence/timeout/permission denial is insufficient.

This subsection is a frozen candidate until exact-head HEDS approves UADS2-WO-005. No M03 runtime implementation is authorized by this text.
