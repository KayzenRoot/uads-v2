# ADR-UADS2-006 — Adopt HEDS as the UADS V2 Review & Delivery Model

Status: ACCEPTED  
Date: 2026-09-09

## Decision

UADS V2 adopts the **HIVE Engineering Delivery System (HEDS)** as its canonical engineering delivery and review model, not merely as a compatibility target.

The canonical HEDS semantics used by UADS are documented in `docs/v2/operations/UADS-HEDS.md`.

## Operating modes

- `SOLO`: UADS MUST be capable of executing the HEDS review/delivery flow without Hive V2.
- `HIVE_CONNECTED`: UADS MUST exchange HEDS-compatible task/evidence artifacts with Hive while preserving Hive's authority over canonical project truth and promotion.

Hive absence MUST NOT disable the UADS review system.

## Required HEDS properties

- Source Lock / Context Lock;
- stable Work Order identity;
- Review Manifest;
- Context Capsule;
- Change Impact Manifest;
- risk-adaptive routing;
- selected verification with rationale;
- Evidence Bundle;
- delta-first review;
- Correction Delta Protocol;
- proof/action validity fingerprints;
- explicit `APPROVED`, `CORRECTION REQUIRED` or `BLOCKED` verdict;
- checkpoint promotion only after objective approval;
- Time-to-Trusted-Merge as primary performance metric;
- defect-learning feedback;
- trusted exact-integration merge verification where repository capabilities permit.

## UADS-specific additions

HEDS review in UADS MUST also account for worker concurrency, visible conversations, model/effort selection, context radius, token/quota amplification, retries, host capabilities, Evidence Cache/Failure Memory and SOLO/HIVE_CONNECTED behavior.

## Technology adoption

HEDS proprietary concepts P01-P10 are accepted as architectural design targets. Research-roadmap concepts remain `CANDIDATE / EXPERIMENT REQUIRED` until benchmarked and promoted through the module/session process.

## Constraint

Adopting HEDS does not mean every HEDS automation is already implemented in UADS runtime code. Runtime implementation is primarily owned by M08 and supporting modules and must be proven incrementally.

Broader proof reuse remains experiment-gated until complete validity and benchmark requirements are satisfied.
