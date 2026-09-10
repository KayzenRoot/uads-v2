# Evidence Bundle — UADS2-WO-012

Status: APPROVED / MERGED
Module: M03 — Host Capability Detector
Slice: S06.2 — Proof-Aware Consumer Boundary
Issue: #45
PR: #46
Approved head: `d15c18727a5775768d82049fa0bf7b890e981ad6`
Merge SHA: `6b1f0049311386af6d5c2bacb94da514def9e4c6`
HEDS review: `5162743199`
Date: 2026-09-10

## Exact-head gates
- CI: SUCCESS
- CodeQL: SUCCESS
- Dependency Review: SUCCESS
- UADS Cross-Platform Compatibility: SUCCESS

## HEDS findings
Initial diff audit found one governance/documentation gap: the module-level canonical document did not yet name the new consumer API as the required future integration seam. The branch was corrected before approval by updating `docs/v2/modules/M03-HOST-CAPABILITY-DETECTOR.md`. All mandatory gates reran and passed on the corrected exact head.

Final HEDS verdict: APPROVED.

## Proven behavior
- `readHostCapabilityProjection()` is the canonical M03 production-consumer boundary.
- Adapter-declared TRUE remains UNKNOWN without acceptable proof.
- Generic fixed negative facts remain FALSE only under current NPC semantics.
- Consumer reads are non-persisting by default.
- No project-local runtime footprint is created.
- PCCR/passive/probe implementation details remain behind the facade.
- Future M01/M04/M06/M23 consumers are required to use the proof-aware boundary rather than declaration-derived capability truth.

## Scope exclusions preserved
- no implementation of M01/M04/M06/M23;
- no vendor-specific active probe;
- no real Cursor/Codex capability claim;
- no new capability vocabulary;
- no new npm dependency;
- no OpenTelemetry expansion.

## Freeze readiness note
S06.1 migrated the current production host-dispatch consumer. S06.2 established the canonical future consumer seam. Frozen M03 proof, safety, replay/privacy and cross-platform obligations have been implemented and tested across S05.1-S05.5. Remaining vendor-specific active probes are explicitly optional experiments and are not prerequisites for core M03 correctness. B6 remains a documented justified performance exception owned as visible M30 debt, not a capability-truth blocker.

Therefore M03 is eligible for an S07 freeze review, subject to a final bypass/source audit and canonical freeze record.