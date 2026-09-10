# UADS2-WO-012 — M03 S06.2 Proof-Aware Consumer Boundary

Status: IN PROGRESS
Issue: #45
Module: M03 — Host Capability Detector
Slice: S06.2 — Proof-Aware Consumer Boundary
Risk: MEDIUM-HIGH architecture boundary / low implementation breadth

## Objective
Establish one canonical M03 consumer-facing API that exposes fail-closed compatibility projection without leaking adapter declaration trust or PCCR implementation details.

## Source-check finding
The frozen M03 architecture requires the Compatibility Projector to feed M01/M04/M06/M23. Those HARD consumers are not yet implemented as runtime consumers of M03, so implementing them in this slice would be premature scope expansion. S06.1 already migrated the current production host-dispatch consumer. The remaining direct legacy snapshot usage is eval compatibility coverage, not production orchestration.

## Included scope
- add a stable consumer facade over proof-aware compatibility projection;
- keep declaration TRUE non-enabling;
- preserve current static negative proof semantics;
- default to no proof persistence for consumer reads;
- document the facade as the mandatory future integration seam for M01/M04/M06/M23;
- add focused fail-closed and zero-project-footprint tests.

## Out of scope
- implementing M01/M04/M06/M23;
- vendor-specific active probes or real Cursor/Codex capability claims;
- new capability vocabulary;
- OpenTelemetry changes;
- removal of eval-only legacy helper coverage;
- broad host-dispatch redesign.

## Acceptance criteria
1. A single documented consumer API exists.
2. Adapter declaration TRUE cannot produce enabled TRUE through that API without acceptable PCCR proof.
3. Generic fixed negatives remain conservative FALSE under current passive negative proof rules.
4. Consumer reads do not persist proof records by default.
5. Consumer reads create no project-local runtime footprint.
6. Existing M03 invariants remain unchanged.
7. Exact-head CI, CodeQL, Dependency Review and Cross-Platform gates pass.

## Technology Card
### S01 market/existing
- ADOPT: facade boundary, deterministic compatibility projection, fail-closed tri-state semantics.
- ADAPT: existing passive bridge remains an internal provider behind a stable consumer contract.
- REJECT: direct adapter declaration snapshots as a future production dependency.

### S01.5 proprietary
- PCCR, NPC, CEL and CLDS remain canonical mechanisms.
- No new proprietary primitive is needed for this slice.

### S02 placement
`host-capability-consumer.ts` is the integration seam between M03 proof truth and future HARD consumers. PCCR storage/probe internals stay behind it.

### S03 risk/security/recovery
Primary risk is accidental capability escalation or consumer coupling to passive implementation. The facade returns only proof-aware projected truth and privacy-safe identity metadata; it never writes proofs by default.

### S04 proof
Focused tests verify declaration TRUE -> UNKNOWN, fixed negative -> FALSE, no proof writes, and no project-local footprint. Full mandatory repository gates remain required.

## STOP CONDITION
Mark CORRECTION REQUIRED if the facade can enable capability truth from declarations, writes proof state by default, creates project-local state, expands into HARD consumer implementations, or exact-head mandatory gates fail.
