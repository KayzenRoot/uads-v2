# CHECKPOINT DELTA — UADS2-WO-005

Status: CONTENT FROZEN / HEDS PENDING
Module: M03
Issue: #26

Promote only after exact-head HEDS APPROVED.

## Proposed promotion

- M03 S00-S04 frozen before implementation.
- ADR-UADS2-012 accepted: Proof-Carrying Host Capabilities.
- PCCR, CEL, NPC, CLDS and PBF accepted as initial M03 architectural targets.
- Capability vocabulary preserves 10 current IDs and proposes 6 host-only/control additions for S05 schema work.
- Rich state model: SUPPORTED / UNSUPPORTED / UNKNOWN / BLOCKED / STALE.
- Legacy compatibility projection is conservative.
- No arbitrary shell or user-supplied command probing.
- Automatic active probes limited to fixed READ_ONLY_LOCAL descriptors initially.
- Negative proof cannot be inferred from absence.
- M27-M31 test obligations frozen.
- First future S05 slice: PCCR core + passive/deterministic-local proof + compatibility projector only.

## Not promoted by this delta

- no runtime implementation;
- no vendor-specific active probe;
- no current schema change;
- no package/dependency change;
- no claim that Cursor/Codex capabilities are currently available on the user's machine.


## Canonical reconciliation

The pre-ADR-UADS2-011 sequencing in `docs/v2/04-ARCHITECTURE.md` that placed M01 before M03 is explicitly marked SUPERSEDED. Historical provenance remains visible; current authority is ADR-UADS2-011 + the frozen HARD dependency graph.
