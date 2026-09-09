# Engineering Delivery Governance

This directory contains the repository-level governance records for the Universal Existing-Project Engineering Delivery Protocol.

It is deliberately different from UADS operational state. UADS runtime checkpoints, work orders, indexes, evidence, and reviews remain in the global sidecar under `~/.uads/workspaces/<project-id>/`, as required by Architecture Freeze v0.2. The files here are static contracts, adoption records, and review evidence for this repository's engineering process.

## Source hierarchy

When sources disagree, use this order and record the decision:

1. System, platform, and explicit user instructions.
2. Repository security and ownership rules: `SECURITY.md`, `GOVERNANCE.md`, `CODEOWNERS`.
3. Normative architecture and product documents in `docs/`, especially `04-ARCHITECTURE.md`, `05-STATE-AND-CHECKPOINT.md`, `07-QUALITY-GATES.md`, and `13-DEFINITION-OF-DONE.md`.
4. This protocol and its records under `.engineering/`.
5. `CONTRIBUTING.md`, `.cursorrules`, agent definitions, and implementation notes.
6. Informational README files, issue text, and generated evidence.

Existing canonical documents are not copied or renamed. This directory links to them and records their fingerprints when a Work Order depends on them.

## Layout

- `PROTOCOL.md` — the normative delivery protocol.
- `schemas/` — machine-readable contracts for protocol records.
- `templates/` — copyable human-readable record templates.
- `work-orders/` — approved or proposed engineering work orders.
- `context-locks/` — source fingerprints and stale-context history.
- `baselines/` — immutable-before-change validation reports.
- `reports/` — cleanup inventories and Evidence Bundles.
- `checkpoints/` — proposed deltas; they do not promote UADS canonical sidecar state.
- `DECISIONS.md` — repository-level decisions created by or referenced by the protocol.

## Required identity

Every adoption or later protocol increment has one immutable identity in the form `ENG-<NAME>-<NNN>`. The identity is repeated in its Work Order, branch, Context Lock, Evidence Bundle, and Checkpoint Delta. A later increment must use a new identity.

## Record status

`PROPOSED` and `READY_FOR_REVIEW` records are not canonical product truth. They become accepted only through the normal maintainer review and merge path. A stale Context Lock is never silently reused.
