# Context Lock — UADS2-WO-011

Base branch: `main`
Base checkpoint: UADS2-WO-010 APPROVED / MERGED
Target: M03 S06.1 proof-aware host-dispatch integration
Issue: #43

## Canonical constraints
- Preserve host presence/ownership gates.
- No production active vendor probe.
- No real Cursor/Codex capability claim.
- No adapter declaration TRUE may enter dispatch as proven TRUE.
- Conservative fallback remains role-cycling/sequential.
- Avoid ten-proof persistence/write amplification in dispatch hot path.
- No broad M01/M04/M06/M23 redesign.
- No new npm dependency.

## Authoritative implementation anchors
- `docs/v2/11-CHECKPOINT.md`
- `src/adapters/host-dispatch.ts`
- `src/adapters/host-capability-passive.ts`
- `src/kernel/host-capability-proof.ts`
- `tests/host-adapters.test.ts`

## Locked intent
This slice changes the consumer truth source only. It does not expand capability vocabulary or active evidence acquisition.
