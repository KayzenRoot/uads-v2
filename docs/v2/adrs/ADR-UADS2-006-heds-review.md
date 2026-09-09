# ADR-UADS2-006 — HEDS-Compatible Review Delivery

Status: ACCEPTED  
Date: 2026-09-09

## Decision
UADS V2 project delivery adopts the current Hive V2 delta-first, evidence-driven, risk-adaptive review operating model.

## Required properties
- immutable Work Order/base/head identity;
- progressive disclosure;
- Change Impact before repo-wide reading;
- selected verification with rationale;
- Evidence Bundle;
- explicit verdict;
- Correction Delta reuse only when validity survives;
- checkpoint promotion only after approval;
- Time-to-Trusted-Merge as primary delivery metric.

## Constraint
Hive ADR-024 proof-validity reuse remains experiment-required; UADS must not overstate that capability.
