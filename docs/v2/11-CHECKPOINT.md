# UADS V2 — Current Checkpoint

Status: UADS2-WO-005 APPROVED / MERGED; M03 S05 SLICE 1 NEXT
Date: 2026-09-09

Completed Work Order: UADS2-WO-005
Completed PR: #27
Approved head: `f6915633f2722ac7258e0c04e3931a90178b8e05`
Merge SHA: `91da3704dff14e6cb1bd81ba0370be20cde7cddc`

## M03 deep-discovery freeze

S00–S04 are objectively frozen:
- S00 problem, capability vocabulary and success metrics;
- S01 Technology Radar;
- S01.5 Technology Invention Radar;
- S02 detailed architecture and ownership;
- S03 failure/security/resilience model;
- S04 66-test benchmark design before implementation.

ADR-UADS2-012 is ACCEPTED.

## M03 accepted architecture

**Proof-Carrying Host Capabilities**

Primary targets:
- PCCR — Proof-Carrying Capability Record;
- CEL — Capability Evidence Ladder;
- NPC — Negative Proof Contract;
- CLDS — Capability Lease & Drift Sentinel;
- PBF — Probe Budget Fence.

Hard invariants:
- E1 DECLARED is discovery input only and never produces SUPPORTED;
- every enabling SUPPORTED proof requires at least E2 DETERMINISTIC_LOCAL_FACT;
- UNKNOWN, BLOCKED and STALE never project to TRUE;
- absence, timeout, permission denial or unrecognized output never imply UNSUPPORTED;
- no arbitrary shell/user-command probing;
- initial automatic active probing is bounded READ_ONLY_LOCAL only;
- M03 proves host capability facts and does not steal M04/M05/M06/M23 authority.

## Next NECESSARY increment

Create **UADS2-WO-006 — M03 S05 Slice 1: PCCR Core + Passive/Deterministic-Local Proof + Compatibility Projector**.

Slice 1 MUST remain compatibility-first:
1. introduce rich proof schema/types/store;
2. implement passive/E2 deterministic-local proof compilation;
3. implement freshness/integrity validation needed by that bounded path;
4. project valid rich states into the legacy tri-state surface;
5. emit M30-compatible lifecycle signals where the existing event contract permits or through a bounded versioned extension;
6. satisfy the S04 tests applicable to Slice 1.

Vendor-specific Cursor/Codex active probes remain EXPERIMENT and are OUT OF SCOPE for Slice 1.

## Global construction rule

ADR-UADS2-011 remains authoritative:
Global Architecture → Deep Module Discovery → Vertical Implementation → Integration Freeze.

M03 is not S07-frozen merely because S00-S04 are complete.

## Repository follow-up

Issue #9 remains open for admin-only branch protection/security configuration.
