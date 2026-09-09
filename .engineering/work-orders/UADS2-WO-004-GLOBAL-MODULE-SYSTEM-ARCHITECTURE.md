# Work Order — UADS2-WO-004

Status: ACTIVE — GLOBAL SYSTEM ARCHITECTURE / HEDS PENDING
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-004-global-module-architecture`
Base SHA: `d3f80ed352c8424853882bbf9041c386a93bd603`
Issue: #24
Owner decision source: #23
Risk: MEDIUM
Scope: planning/governance only

## Objective

Promote the owner-approved construction model and freeze enough system-level architecture across all 31 modules to eliminate ambiguous authority, circular HARD dependencies and numeric-order construction before deep module discovery resumes.

## Included

- ADR-UADS2-011;
- global 31-module system architecture;
- contract/ownership matrix;
- machine-readable dependency graph;
- HARD/SOFT_OPTIONAL/EVENT/GOVERNANCE/ENTERPRISE_CROSSCUTTING taxonomy;
- acyclic HARD predecessor graph;
- eligibility waves and one-module-at-a-time selection policy;
- mandatory S01.5 Technology Invention Radar;
- vertical-slice rule;
- Architecture Reconciliation Checkpoint every 3–5 completed modules;
- Decisions Ledger, Architecture, lifecycle, manifest, Checkpoint and Continuity deltas.

## Out of scope

- no runtime implementation;
- no M01/M03 code;
- no detailed Technology Radar for all modules;
- no dependency/package change;
- no M30 expansion;
- no V1 mutation;
- no release/deployment.

## Acceptance

- [ ] issue #23 is canonically promoted without changing its meaning;
- [ ] every M01–M31 has system-level owner/non-owner boundary;
- [ ] every module has primary input/output and logical event family;
- [ ] every module has explicit HARD predecessors;
- [ ] HARD graph is acyclic;
- [ ] dependency taxonomy is documented;
- [ ] machine-readable graph and human graph agree;
- [ ] construction order is dependency-driven, not numeric;
- [ ] one active deep-discovery module by default;
- [ ] S01.5 is mandatory and falsifiable;
- [ ] S05 requires small vertical slices + continuous tests;
- [ ] M27–M31 gates remain continuous;
- [ ] reconciliation checkpoint rule frozen at 3–5 modules, default 4;
- [ ] next eligible module is selected with rationale;
- [ ] no runtime source path changed;
- [ ] exact-head mandatory CI gates pass;
- [ ] HEDS APPROVED before deep discovery resumes.

## Next module candidate

M03 Host Capability Detector, only after WO-004 HEDS approval and merge.

## Stop

STOP on runtime scope creep, dependency cycle, ambiguous dual ownership, owner-decision weakening, or unresolved HIGH/CRITICAL governance defect.
