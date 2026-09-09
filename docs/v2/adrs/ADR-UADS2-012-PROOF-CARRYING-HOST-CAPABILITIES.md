# ADR-UADS2-012 — Proof-Carrying Host Capabilities

Status: ACCEPTED
Date: 2026-09-09
Module: M03
Issue: #26

## Context

Current UADS has conservative tri-state runtime capabilities, strict schema validation, sidecar persistence and identity digests. However, proof provenance is snapshot-wide and has no per-capability evidence/freshness contract.

Host/adapter presence is not equivalent to feature support.

## Decision

M03 SHALL use evidence-bound per-capability proof records.

A host-dependent capability may project to enabled `true` only when:
1. state is `SUPPORTED`;
2. evidence meets the capability's minimum CEL rung, with a global enabling floor of E2;
3. subject/probe/policy/evidence digests remain current;
4. freshness/lease requirements remain valid;
5. proof integrity validates.

`UNKNOWN`, `BLOCKED` and `STALE` always project to legacy `unknown`.

`E1 DECLARED` is discovery input only and never produces `SUPPORTED`.

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

## Promotion record

Accepted after UADS2-WO-005 exact-head HEDS APPROVED.

- Reviewed head: `f6915633f2722ac7258e0c04e3931a90178b8e05`
- Merged PR: #27
- Merge SHA: `91da3704dff14e6cb1bd81ba0370be20cde7cddc`
- Hosted gates: CI, CodeQL, Dependency Review and Cross-Platform Compatibility all SUCCESS.
- HEDS review is recorded as an exact-head COMMENT review because GitHub prohibits the PR author account from formally approving its own PR.

Acceptance authorizes bounded S05 implementation Work Orders under this architecture; it does not claim M03 runtime completion.
