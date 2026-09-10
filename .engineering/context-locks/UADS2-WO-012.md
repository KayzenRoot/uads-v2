# Context Lock — UADS2-WO-012

Base branch: `main`
Base SHA: `cacb7daaf932338931cf544039c1a634ed0bcd52`
Base checkpoint: UADS2-WO-011 APPROVED / MERGED
Target: M03 S06.2 proof-aware consumer boundary
Issue: #45

## Canonical constraints
- Future production consumers must not trust adapter-declared capability TRUE.
- Preserve fail-closed `true | false | unknown` compatibility semantics.
- Consumer reads must not persist proof records by default.
- Preserve GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT.
- No real Cursor/Codex capability claim without evidence.
- No vendor-specific active probe.
- No implementation of M01/M04/M06/M23 in this slice.
- No new npm dependency.

## Authoritative anchors
- `docs/v2/modules/M03-HOST-CAPABILITY-DETECTOR.md`
- `docs/v2/modules/m03/M03-S02-ARCHITECTURE.md`
- `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md`
- `docs/v2/11-CHECKPOINT.md`
- `src/adapters/host-capability-passive.ts`
- `src/kernel/host-capability-proof.ts`

## Locked intent
Create a stable consumer seam, not a new proof engine. The implementation behind this seam may evolve later to combine passive and active/stored proofs without changing consumer semantics.
