# UADS2-WO-011 — M03 S06.1 Proof-Aware Host Dispatch Integration

Status: IN PROGRESS
Issue: #43
Module: M03 — Host Capability Detector
Slice: S06.1 — Proof-Aware Host Dispatch Integration
Risk: HIGH assurance integration / bounded runtime change

## Objective
Migrate host-dispatch capability truth from declaration-derived `runtimeSnapshotFromHostDetection()` to the proof-aware M03 compatibility projection.

## Included scope
- preserve host presence and ownership gates;
- use the existing passive M03 bridge/projection for current dispatch capability truth;
- ensure adapter declaration TRUE cannot enable dispatch without acceptable proof;
- keep conservative role-cycling/sequential fallback;
- avoid proof persistence/write amplification in the dispatch hot path;
- add focused regression tests;
- preserve schema, privacy and digest invariants.

## Out of scope
- production active vendor probes;
- real Cursor/Codex capability claims;
- M01/M04/M06/M23 redesign;
- new package dependencies;
- OpenTelemetry integration;
- vendor-specific capability expansion.

## Acceptance criteria
1. `readCurrentHostDispatchArtifacts()` does not derive dispatch truth from `runtimeSnapshotFromHostDetection()`.
2. Dispatch consumes the proof-aware compatibility projection.
3. Declaration TRUE without enabling proof projects to UNKNOWN and cannot enable parallel/subagent dispatch.
4. Generic fixed-false declarations remain conservative false only when supported by current passive proof.
5. Passive projection in dispatch does not persist ten proofs on every read.
6. Presence/ownership gates and privacy/schema invariants remain intact.
7. Focused tests and full mandatory gates pass on exact PR head.

## Technology Card
### S01 market / existing technologies
- ADOPT: deterministic proof projection, SHA-256-bound evidence/identity, fail-closed truth semantics.
- ADAPT: existing `buildPassiveHostCapabilityBridge()` as a non-persisting dispatch truth source.
- REJECT: declaration-as-truth and optimistic capability enabling.

### S01.5 proprietary mechanisms
- PCCR remains the canonical Proof-Carrying Capability Record mechanism.
- NPC remains the Negative Proof Constraint for fixed impossibility.
- No new proprietary mechanism is canonized in this slice.

### S02 placement
`host-dispatch` becomes a consumer of M03 proof-aware compatibility projection; it does not become a proof producer.

### S03 risks
Primary risk is accidental capability escalation. Mitigation: UNKNOWN/FALSE projection plus existing ownership/presence gates and focused regression tests.

### S04 proof
Focused tests must prove declaration TRUE cannot enable parallelism/subagents, and that no passive proof files are persisted by dispatch hot-path reads.

## STOP CONDITION
Stop and mark CORRECTION REQUIRED if exact-head tests or mandatory gates fail, or if the diff expands into active probing/vendor claims/broad orchestration redesign.
