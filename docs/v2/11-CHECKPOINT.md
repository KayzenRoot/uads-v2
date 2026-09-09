# UADS V2 — Current Checkpoint

Status: UADS2-WO-006 APPROVED / MERGED; M03 S05.2 NEXT
Date: 2026-09-09

Completed Work Order: UADS2-WO-006
Completed PR: #29
Approved head: `7212f4f2f134589b655dcd4b480fa6dd699d8606`
Merge SHA: `c1fff560a1a50a5806c6f84d6e7990e6d8bf07af`

## M03 S05.1 completion

The first runtime slice under ADR-UADS2-012 is complete:

**PCCR Core + Conservative Compatibility Projection**

Accepted:
- closed `uads.host-capability-proof@1.0.0` schema;
- per-capability proof digest;
- E2 minimum enabling proof floor;
- Slice-1 Negative Proof Contract;
- subject/adapter/runtime/contract/probe/policy/config drift invalidation;
- LEASED expiry and clock-regression fail closed;
- global sidecar proof store;
- conservative ten-field legacy projection;
- legacy TRUE without valid PCCR -> UNKNOWN;
- best-effort M30 `evidence.lifecycle` telemetry;
- subject/path, capability/path and proof/key binding;
- cross-capability replay regression protection.

Exact-head proof:
- 52/52 test files PASS;
- 463/463 tests PASS;
- CI / CodeQL / Dependency Review / Cross-Platform: SUCCESS;
- B1 p95 0.147885 ms <= 50 ms;
- B3 10,990 bytes/host <= 65,536;
- B4 all safety/replay/drift/absence counters = 0;
- B7 corruptAccepted=0, recovered=true.

## M03 state

M03 is **not** S07-frozen yet.

Known remaining gaps:
- standardized stable subjectDigest builder from real host/root facts;
- passive evidence bridge from existing host adapter/root detection into PCCR;
- six future host/control capability IDs are not runtime vocabulary yet;
- PBF probe executor is not implemented;
- vendor-specific Cursor/Codex active probes remain EXPERIMENT;
- S06 integration/hardening and S07 module freeze remain future.

## Next NECESSARY increment

Create **UADS2-WO-007 — M03 S05.2: Host Subject Identity & Passive Evidence Bridge**.

Intent:
1. derive a stable privacy-safe host subject identity from existing adapter/root/runtime facts;
2. bind that identity deterministically to PCCR;
3. translate adapter declarations only as E1 discovery evidence, never TRUE;
4. allow E2 negative proof only where an exact adapter contract proves impossibility by construction;
5. integrate the passive bridge with PCCR storage/projection without child process, shell or network;
6. add objective M30 telemetry and S04-derived tests;
7. preserve all WO-006 replay/integrity invariants.

No vendor-specific active probe is authorized in WO-007.

## Global construction rule

ADR-UADS2-011 remains authoritative:
Global Architecture -> Deep Module Discovery -> Vertical Implementation -> Integration Freeze.

## Repository follow-up

Issue #9 remains open for admin-only branch protection/security configuration.
