# ADR-UADS2-011 — Global Architecture → Deep Module Discovery → Vertical Implementation → Integration Freeze

Status: ACCEPTED
Date: 2026-09-09
Owner decision source: issue #23
Work Order: UADS2-WO-004

## Context

The owner explicitly selected a hybrid construction model to minimize integration defects and stale over-planning:

- architect all UADS V2 modules first at system level;
- do not fully design every module before coding;
- deepen one module at a time in dependency order;
- implement each module with small vertical slices and continuous tests.

The alternative extremes are rejected:
1. full waterfall specification of all modules before implementation;
2. isolated full-module implementation without a global system map.

## Decision

UADS V2 SHALL use the canonical construction model:

**Global Architecture → Deep Module Discovery → Vertical Implementation → Integration Freeze**

### Global architecture gate

Before new deep module implementation:
- all 31 modules have system-level ownership and non-ownership;
- primary inputs/outputs/data authority are explicit;
- dependency types are explicit;
- the HARD dependency graph is acyclic;
- eligible implementation/deep-discovery order is graph-driven.

System-level architecture is intentionally shallower than detailed module design. It freezes boundaries, not all technologies.

### Deep module lifecycle

One module at a time, chosen from the currently eligible dependency set:

- S00 Problem & Success Metrics;
- S01 Technology Radar;
- S01.5 Technology Invention Radar;
- S02 Detailed Architecture & Boundaries;
- S03 Failure / Security / Resilience Model;
- S04 Test & Benchmark Design before implementation;
- S05 Vertical Implementation Slices;
- S06 Integration & Hardening;
- S07 Module Freeze + exact-head HEDS.

### Technology Invention Radar

S01.5 is mandatory. Every proprietary/invented technology candidate must state:
- concrete problem and baseline;
- measurable expected advantage;
- existing simpler alternatives;
- novelty/non-duplication rationale;
- safety/security/resource costs;
- rollback/fallback;
- benchmark or experiment that can falsify the idea.

Novelty alone is never sufficient.

### Vertical slice rule

A slice must deliver one bounded end-to-end behavior through its real contract surface, tests, M30 observability and applicable M27-M31 proof obligations. Horizontal piles of unfinished infrastructure do not count as completed slices.

### Dependency order

Module numbers do not define construction order.
Only modules whose HARD predecessors are frozen may enter deep discovery, unless an explicit ADR authorizes a contract-first exception.

Only one deep-discovery module is active at a time by default.

### Architecture reconciliation

Run an Architecture Reconciliation Checkpoint:
- by default after 4 completed module freezes;
- never later than 5;
- as early as 3 for elevated risk;
- immediately on a material interface/ADR/technology/regression change.

### Enterprise gates

M27-M31 apply continuously to every runtime slice. A necessary enterprise GAP blocks production-readiness declaration.

## Consequences

- Global planning stays current and bounded.
- Detailed technology decisions are made close to implementation.
- Cross-module collisions are caught before code.
- Runtime feedback can update future module discovery through explicit ADR/checkpoint deltas.
- Some module numbers will be implemented later than higher-numbered dependencies.

## Supersession

Changing this construction model, bypassing dependency eligibility, or removing S01.5 requires a new ADR and explicit owner decision.
