# UADS V2 — Global 31-Module System Architecture

Status: FROZEN CANDIDATE — UADS2-WO-004 HEDS PENDING
Date: 2026-09-09

## Purpose

Define enough architecture across all 31 modules to prevent duplicate authority, circular dependencies and late integration surprises while deliberately postponing detailed technology decisions until each module's deep-discovery cycle.

## System planes

### 1. Execution Control Plane
M01, M02, M03, M07, M21, M22.

Owns bounded work execution, capability gating, resource ceilings, retry and escalation control.

### 2. Model & Reasoning Plane
M04, M05, M06, M25.

Owns model capability truth, selection, effort sizing and operational policy profiles.

### 3. Context & Continuity Plane
M14, M17, M19.

Owns bounded context-radius decisions, project resume/orientation and deterministic evidence reuse validity.

### 4. Quality & Repair Plane
M08, M09, M10, M20.

Owns selected proof, HEDS runtime, active diagnosis and verified failure-memory.

### 5. Host & Integration Plane
M15, M16, M18, M23.

Owns host adapters, optional Hive bridge and capability negotiation. It never owns UADS core policy or Hive canonical truth.

### 6. Learning Plane
M11, M12, M13, M26.

Observation and candidate learning only until separately proven. Static deterministic policies remain functional when learning is disabled.

### 7. Operational Intelligence Plane
M24, M30.

M24 owns Work Order/cost attribution. M30 owns objective event transport, health, diagnostics and dashboard/operator projection.

### 8. Enterprise Production-Readiness Plane
M27, M28, M29, M31 plus M30 observability.

Owns capacity/load proof, recovery/resilience, operational security/supply chain, release/migration/rollback safety and production observability.

## Core end-to-end flow

```text
Git/Sidecar/Hive optional
        |
       M17 resume/context seed
        |
M03 capabilities ---- M25 policy
   |                    |
   +--> M04 profiles --> M05 model route
   |                    |
   +---------------> M06 effort
   |
M07 budget ----------------------+
                                  |
                              M01 coordinator
                                  |
                        M02 worker when proven
                                  |
                  result / failure / evidence
                        |          |
                       M10        M19
                        |          |
                       M20         |
                        |          |
                       M21         |
                         \        /
                           M22
                            |
                           M09
                            |
                           M08 HEDS
                            |
                      trusted-merge readiness

All objective lifecycle/evidence signals -> M30 event spine
Work Order/cost attribution           -> M24
M27/M28/M29/M31 constrain every slice
```

This is an architectural topology, not a claim that every module is implemented.

## Authority invariants

- one primary owner per state/decision family;
- UNKNOWN capability never becomes TRUE;
- model registry truth is separate from route choice;
- budget authority is separate from cost attribution;
- active fault diagnosis is separate from durable failure memory;
- retry permission is separate from escalation choice;
- M30 projections are not source-of-truth replacements for owning modules;
- learning cannot mutate canonical truth;
- Hive integration remains optional/additive;
- enterprise gates never silently become functional owners.

## Deep-discovery eligibility

A bounded runtime foundation is not automatically a full module S07 freeze. WO-003 established an M30 foundation, but M30 remains eligible for later deep discovery/freeze.

A module enters S00/S01 only when:
1. all HARD predecessors are frozen or an explicit contract-first ADR exists;
2. no current Work Order is BLOCKED/CORRECTION REQUIRED;
3. its system-level contract remains consistent with this map;
4. M27-M31 classifications are present;
5. source lock is fresh.

## Architecture reconciliation

Default every 4 completed module freezes, allowed at 3 for risk and never later than 5. Any material interface/ADR/technology invalidation triggers immediate reconciliation.

## References

- `GLOBAL-MODULE-SYSTEM-CONTRACTS.md`
- `GLOBAL-MODULE-DEPENDENCY-GRAPH.md`
- `GLOBAL-MODULE-DEPENDENCIES.json`
- ADR-UADS2-011
