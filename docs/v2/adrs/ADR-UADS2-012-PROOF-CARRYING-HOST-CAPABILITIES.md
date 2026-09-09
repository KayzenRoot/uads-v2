# ADR-UADS2-012 — Proof-Carrying Host Capabilities

Status: PROPOSED — UADS2-WO-005 HEDS PENDING
Date: 2026-09-09
Module: M03
Issue: #26

## Context

Current UADS has conservative tri-state runtime capabilities, strict schema validation, sidecar persistence and identity digests. However, proof provenance is snapshot-wide and has no per-capability evidence/freshness contract.

Host/adapter presence is not equivalent to feature support.

## Proposed decision

M03 SHALL use evidence-bound per-capability proof records.

A host-dependent capability may project to enabled `true` only when:
1. state is `SUPPORTED`;
2. evidence meets the capability's minimum CEL rung;
3. subject/probe/policy/evidence digests remain current;
4. freshness/lease requirements remain valid;
5. proof integrity validates.

`UNKNOWN`, `BLOCKED` and `STALE` always project to legacy `unknown`.

`UNSUPPORTED` is permitted only through the Negative Proof Contract.

Active probes SHALL use a static bounded registry and MUST NOT use arbitrary shell execution by default.

The first implementation slice SHALL be compatibility-first and SHALL NOT require vendor-specific active probes.

## Consequences

Positive:
- capability truth becomes auditable per feature;
- stale host capability cannot silently survive drift;
- downstream M01/M04/M06/M23 receive one conservative fact contract;
- host-specific experimentation is isolated from core truth semantics.

Cost:
- additional proof records and probe lifecycle;
- more explicit stale/UNKNOWN states;
- vendor-specific active probes require ongoing compatibility tests.

## Rejected alternatives

- static host/version capability matrix as truth;
- directory/adapter presence as feature proof;
- global snapshot provenance with no per-feature evidence;
- arbitrary shell-based probing;
- declaration-only enablement;
- TPM/remote-attestation requirement for the initial local threat model.

## Promotion gate

ACCEPTED only after UADS2-WO-005 exact-head HEDS approves S00-S04.
Runtime implementation remains unauthorized until then.
