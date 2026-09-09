# Work Order — UADS2-WO-005

Status: ACTIVE — M03 S00-S04 DEEP DISCOVERY
Module: M03 — Host Capability Detector
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-005-m03-deep-discovery`
Base SHA: `122426d0c7079722ed7ca118f13385b7b67183ee`
Issue: #26
Risk: MEDIUM-HIGH
Scope: architecture/discovery/test-design only

## Objective

Freeze M03 through S00-S04 before any runtime implementation.

M03 must convert host capability handling from coarse adapter/static declarations into evidence-bound, per-capability, fresh, identity-bound proof that fails closed.

## Sessions in scope

- S00 Problem & Success Metrics
- S01 Technology Radar
- S01.5 Technology Invention Radar
- S02 Detailed Architecture & Boundaries
- S03 Failure / Security / Resilience Model
- S04 Test & Benchmark Design

## Explicitly out of scope

- no S05 runtime implementation;
- no schema/runtime migration;
- no active real-host probes executed by repository code;
- no provider API calls;
- no model-profile registry redesign (M04);
- no worker runtime or orchestration implementation (M01/M02);
- no peer capability negotiation implementation (M23);
- no broad Cursor/Codex adapter V2 implementation (M15/M16);
- no package/dependency changes.

## Source-lock observations

Current UADS already provides:
- tri-state runtime capabilities `true | false | unknown`;
- closed JSON Schema for runtime capability snapshots;
- runtime/adapter identity digest;
- sidecar persistence;
- host target/root detection and privacy-safe root digests;
- conservative static adapter capability defaults;
- extensive host root/replay/tamper tests.

Current gaps:
1. snapshot provenance/confidence is global rather than capability-specific;
2. no `observedAt` / `validUntil` / freshness lease exists;
3. no proof/evidence digest is bound to each capability;
4. no reusable probe registry/executor exists;
5. host-root presence can produce adapter status `SUPPORTED` while version remains `UNPROVEN`;
6. no deterministic drift invalidation for runtime version/probe definition/policy changes;
7. no disciplined rule for when a negative observation may become `false`;
8. host capabilities required by V2 such as reasoning-effort control/background/headless/model enumeration are not yet part of a frozen M03 vocabulary.

## Acceptance

- [ ] S00 metrics and capability vocabulary frozen;
- [ ] S01 candidates classified REUSE/ADAPT/INVENT/EXPERIMENT/OUT_OF_SCOPE;
- [ ] S01.5 proprietary candidates are falsifiable;
- [ ] S02 owns one primary proof model and compatibility projection;
- [ ] `UNKNOWN` / `BLOCKED` / `STALE` can never project to enabled `true`;
- [ ] negative proof rule prevents absence-as-unsupported;
- [ ] freshness/drift invalidation contract defined;
- [ ] active-probe safety envelope defined;
- [ ] M30 event contract defined without claiming runtime implementation;
- [ ] M27-M31 enterprise classifications defined;
- [ ] S03 adversarial/failure model frozen;
- [ ] S04 tests/benchmarks frozen before S05;
- [ ] no runtime source/schema/package modification;
- [ ] exact-head hosted gates SUCCESS;
- [ ] HEDS APPROVED before first S05 slice.

## Stop condition

STOP if:
- a design requires arbitrary shell execution by default;
- capability truth depends on undocumented provider assumptions;
- declaration alone can enable a high-impact capability;
- an UNKNOWN/STALE/BLOCKED state can become TRUE;
- negative proof is inferred merely from absence;
- M03 takes ownership from M04/M06/M23;
- runtime implementation appears in this Work Order.
