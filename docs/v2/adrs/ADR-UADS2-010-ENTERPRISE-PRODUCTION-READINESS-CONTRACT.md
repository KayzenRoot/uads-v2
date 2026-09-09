# ADR-UADS2-010 — Enterprise Production-Readiness Contract

Status: ACCEPTED
Date: 2026-09-09

## Context
The owner requires UADS V2 to reach professional large-company engineering maturity across scale/load, resilience, operational security, production observability and continuous safe operations. The original 26 modules contain partial capabilities but not complete cross-cutting ownership for those five pillars.

## Decision
1. Every module/major capability classifies all five pillars as `COVERED`, `NOT_APPLICABLE` with rationale, or `GAP`.
2. A necessary `GAP` blocks production-readiness declaration.
3. Add NECESSARY cross-cutting modules M27 Capacity & Load Engineering, M28 Resilience & Recovery Engineering, M29 Operational Security & Supply Chain, M30 Production Observability & Real-Time Operations, and M31 Release Engineering & Safe Operations.
4. Cross-cutting modules compose with functional modules and do not duplicate their authority.
5. ADR-UADS2-009 remains in force. M30 owns production observability and dashboard/operator contracts; M24 remains the Work Order/cost ledger.
6. B-001 remains mandatory: M08 emits structured review-analysis events, M30 owns authoritative event transport/operational surface, and M24 owns Work Order attribution.
7. After this planning gate, implement the event-backed observability/dashboard foundation before or with the first M01 functional slice.
8. SOLO remains complete; HIVE_CONNECTED remains optional/additive.
9. Production readiness is evidence-based.

## Consequences
Module inventory becomes 31. Architecture, Security, Deployment and DoD gain enterprise gates. Capacity, failure, security, observability and release evidence become first-class artifacts.

## Non-goals
No runtime implementation and no forced Kubernetes/microservices/blue-green where simpler mechanisms satisfy evidence.

## Supersession
Weakening a mandatory pillar or B-001 requires a new ADR and explicit owner decision.
