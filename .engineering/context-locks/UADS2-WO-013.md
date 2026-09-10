# Context Lock — UADS2-WO-013

Base branch: `main`
Base checkpoint: UADS2-WO-012 APPROVED / MERGED
Target: M03 S07 Freeze Review
Issue: #47

## Locked constraints
- no new M03 capability vocabulary;
- no vendor-specific Cursor/Codex active probe;
- no real vendor capability claim;
- no downstream M01/M04/M06/M23 implementation;
- no weakening of PCCR/NPC/CEL/CLDS fail-closed semantics;
- preserve GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT;
- B6 remains visible M30 debt, not silently reclassified as PASS;
- exact-head approval required before FROZEN promotion.

## Authoritative anchors
- `docs/v2/11-CHECKPOINT.md`
- `docs/v2/modules/M03-HOST-CAPABILITY-DETECTOR.md`
- `docs/v2/modules/m03/M03-S00-PROBLEM-METRICS.md`
- `docs/v2/modules/m03/M03-S01-TECHNOLOGY-RADAR.md`
- `docs/v2/modules/m03/M03-S01.5-TECHNOLOGY-INVENTION-RADAR.md`
- `docs/v2/modules/m03/M03-S02-ARCHITECTURE.md`
- `docs/v2/modules/m03/M03-S03-FAILURE-SECURITY-RESILIENCE.md`
- `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md`
- `docs/v2/modules/m03/M03-S06.2-CONSUMER-BOUNDARY.md`
- `docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md`

## Locked intent
Freeze what is proven. Do not turn deferred experiments into implied support.