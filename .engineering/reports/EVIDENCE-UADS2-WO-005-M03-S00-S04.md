# Evidence Bundle — UADS2-WO-005 / M03 S00-S04

Status: CONTENT FROZEN / EXACT-HEAD HEDS PENDING
Issue: #26
PR: #27
Base main: `122426d0c7079722ed7ca118f13385b7b67183ee`
Branch: `work/uads2-wo-005-m03-deep-discovery`
Initial PR-binding parent: `fa1b009b933daf7211dfcf1df23641bb41f978de`
Exact final review head: resolved externally from PR #27 by HEDS; intentionally not self-embedded in this mutable evidence file.

## Objective

Prove that M03 detailed discovery is complete through S04 and that no runtime implementation has begun.

## Baseline findings

Current UADS already has useful primitives:
- `RuntimeCapabilitySnapshot` with conservative `true | false | unknown`;
- strict schema validation;
- SHA-256 runtime identity digest;
- sidecar persistence;
- host adapter/root identity and replay protection;
- conservative static adapter capabilities;
- existing host compatibility/security tests.

Observed architectural gaps at source lock:
1. provenance/confidence is snapshot-wide rather than capability-specific;
2. no freshness/expiry lease;
3. no per-capability evidence/probe digest;
4. no general safe probe framework;
5. host target presence may yield adapter `SUPPORTED` while reason includes `VERSION_UNPROVEN`;
6. no runtime-version/probe-policy drift invalidation;
7. no Negative Proof Contract;
8. V2-required host facts such as reasoning-effort control/background/headless/model enumeration are not frozen in the current runtime vocabulary.

## S00-S04 outputs

- S00 problem/vocabulary/metrics: frozen candidate.
- S01 Technology Radar: frozen candidate.
- S01.5 Technology Invention Radar: frozen candidate.
- S02 detailed architecture: frozen candidate.
- S03 failure/security/resilience: frozen candidate.
- S04 tests/benchmarks: frozen candidate.

## Technology decisions

REUSE:
- current tri-state projection;
- SHA-256 identities;
- sidecar/atomic persistence;
- root binding;
- closed schemas;
- M30 event spine.

ADAPT:
- explicit capability discovery/version binding patterns;
- documented local enumeration where available;
- bounded no-shell active probes;
- content-addressed validity basis.

INVENT:
- PCCR — Proof-Carrying Capability Record;
- global CEL enabling floor = E2; E1 declaration never becomes TRUE;
- CEL — Capability Evidence Ladder;
- NPC — Negative Proof Contract;
- CLDS — Capability Lease & Drift Sentinel;
- PBF — Probe Budget Fence.

EXPERIMENT:
- vendor-specific Cursor/Codex active probes;
- stronger signed/TPM attestation.

OUT_OF_SCOPE:
- arbitrary shell probes;
- adaptive learned truth;
- provider API model catalog probing;
- Hive-derived local truth.

## Current official external references used in S01

Research consulted 2026-09-09:
- Model Context Protocol 2026 explicit identity/capability discovery pattern;
- Cursor current foreground/background subagent and cloud-agent capability documentation;
- Node.js current `child_process.execFile` timeout/AbortSignal behavior.

These references inform architecture patterns only. They are not evidence that any feature is enabled on the user's current machine.

## Test design proof

S04 freezes **66 named mandatory tests** before implementation.

Safety target:
- unsafe TRUE false positives = 0;
- tamper/replay acceptance = 0;
- covered drift misses = 0;
- absence→UNSUPPORTED errors = 0.

Initial implementation slice intentionally excludes vendor-specific active probes.

## Canonical conflict discovered and resolved

`docs/v2/04-ARCHITECTURE.md` retained a pre-ADR-UADS2-011 sequence that placed M01 before M03.

This conflicts with the accepted global graph where M03 is a HARD predecessor of M01.

Resolution:
- preserve the old sequence as historical provenance;
- mark it SUPERSEDED;
- current authority is ADR-UADS2-011 + global HARD dependency graph;
- M03 remains selected next.

## Scope proof

Expected changed paths are limited to:
- `.engineering/` WO/context/evidence/checkpoint;
- `docs/v2/` architecture/ledger/module discovery/continuity.

No `src/`, `schemas/`, `tests/`, package manifest, lockfile or runtime dependency change is authorized or required.

Machine-readable validation:
`.engineering/evidence/UADS2-WO-005/m03-discovery-validation.json`.

## HEDS gate

Before merge:
- exact PR head immutable during audit;
- CI SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Cross-Platform SUCCESS;
- unresolved review threads = 0;
- independent HEDS verdict APPROVED.

Only after merge may ADR-UADS2-012 be promoted from PROPOSED to ACCEPTED and the first S05 vertical-slice Work Order be created.


## PR scope verification

PR #27 changes exactly 18 paths and all are under `.engineering/` or `docs/v2/`.

No runtime/source/schema/test/package/lockfile path is changed.
Unresolved review threads at PR-open verification: 0.


## Final semantic tightening before exact-head freeze

The CEL rule was tightened after PR opening:
- E1 `DECLARED` is discovery input only;
- E1 can never produce `SUPPORTED`;
- every enabling `SUPPORTED` has a global minimum proof floor of E2 `DETERMINISTIC_LOCAL_FACT`;
- stronger per-capability requirements may require E3/E4.

This removes declaration-only enablement for all capabilities, not only high-impact capabilities.
