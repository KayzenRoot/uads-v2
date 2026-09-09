# Evidence Bundle — UADS2-WO-006 / M03 S05 Slice 1

Status: HEDS CORRECTION APPLIED / FRESH EXACT-HEAD GATES PENDING
Issue: #28
PR: #29
Base main: `36b2019fc22b4d6c5d250e41edf12e737c4ddcfa`
Branch: `work/uads2-wo-006-m03-pccr-core`
Implementation head at bundle creation: `d6a355106f600be43c53746a7a4cb6866473b458`

## Scope

Runtime implementation is bounded to exactly:
- `schemas/host-capability-proof.schema.json`
- `src/kernel/host-capability-proof.ts`
- `tests/host-capability-proof.test.ts`

Planning/evidence/checkpoint artifacts are additional documentation only.

No existing runtime/schema/test/package/workflow file was modified.
No npm dependency was added.
No vendor-specific Cursor/Codex active probe was implemented.
No subprocess, shell or network execution was introduced.
The ten-field legacy RuntimeCapabilitySnapshot schema remains unchanged.

## Implemented proof contract

- closed PCCR schema/version `uads.host-capability-proof@1.0.0`;
- states SUPPORTED / UNSUPPORTED / UNKNOWN / BLOCKED / STALE;
- CEL classes E0-E4;
- global SUPPORTED floor E2;
- Slice-1 NPC negative proof only: `adapter-contract-impossible`;
- deterministic canonical SHA-256 proof digest;
- strict schema + privacy + semantic normalization;
- subject/adapter/runtime/basis drift invalidation;
- identity-bound and leased validity;
- clock-regression fail-closed behavior;
- global sidecar persistence:
  `registry/runtime/capabilities/proofs/<subjectDigest>/<capabilityId>.json`;
- corrupt/tampered read rejection and atomic rewrite recovery path;
- conservative projection into the current ten-field RuntimeCapabilitySnapshot;
- legacy input TRUE without valid PCCR degrades to UNKNOWN;
- snapshot-wide provenance confidence remains `unknown`;
- M30 best-effort `evidence.lifecycle` telemetry using existing event schema only;
- telemetry failure cannot roll back or alter persisted truth.

## Frozen S04 mapping

Explicit tests exist for:
- T001-T010;
- T018-T030;
- T045-T060.

Active-probe tests T031-T044 remain out of scope.

## Benchmark evidence

Focused test emits machine-readable line:
`UADS2_WO_006_BENCHMARK <json>`

Required metrics:
- B1 p50/p95 proof evaluation, target p95 <= 50 ms;
- B3 proof bytes per host, target <= 64 KiB;
- B4 unsafe TRUE / tamper-replay / drift-miss / absence-to-UNSUPPORTED counters all zero;
- B7 corrupt accepted = 0 and recovery = true.

Measured on implementation-equivalent head `0c96f6c4b74e73157fae3cb9533ffdd3f3254a44`, CI run #80 / run id `34407137445`:

- B1 full-test sample #1: p50 = **0.063294 ms**, p95 = **0.134119 ms**, target p95 <= 50 ms, PASS.
- B1 full-test sample #2 from validation rerun: p50 = **0.053128 ms**, p95 = **0.129873 ms**, PASS.
- B3 durable proof state: **10,990 bytes/host**, target <= 65,536 bytes, PASS.
- B4: unsafeTrue=0, tamperReplayAccepted=0, driftMisses=0, absenceUnsupported=0, PASS.
- B7: corruptAccepted=0, recovered=true, PASS.

`0c96f6c4b74e73157fae3cb9533ffdd3f3254a44` is now historical pre-HEDS-correction benchmark evidence. A fresh exact-head rerun is mandatory because the HEDS correction adds capability/subject binding checks to runtime reads/projection.

## Privacy/security review

Durable PCCR contains only bounded IDs, enum states, version metadata, digests, timestamps and reason codes.
Raw evidence is not part of the schema.
Absolute host paths, secret-like strings, control characters and unbounded text are rejected by runtime validation.
Cross-host/root/adapter replay is rejected or evaluates STALE.
Tampered proof digest is rejected.
E1 cannot enable TRUE.
Absence cannot manufacture UNSUPPORTED.

## M27-M31 classification

- M27 Capacity/Load: COVERED for Slice 1 by bounded proof shape + B1/B3.
- M28 Resilience/Recovery: COVERED by corrupt rejection + atomic rewrite B7.
- M29 Operational Security: COVERED by closed schema, privacy checks, digests, replay/drift/NPC tests.
- M30 Observability: COVERED by existing `evidence.lifecycle` best-effort emission; truth is independent of telemetry availability.
- M31 Safe Operations: COVERED by additive new schema/module; legacy schema unchanged; rollback is conservative legacy path.

## Known limitations

- no vendor-specific active probes;
- no standardized subjectDigest builder from executable/root facts yet;
- no six future capability IDs in runtime vocabulary yet;
- no active-probe PBF executor;
- M03 is not S07-frozen by this slice.

## Correction history

Initial PR head `6206e221e7897f307ee84e1b8b8c795cf55f2e7b` failed exactly one new test: T049 used a fake GitHub token shorter than the repository's canonical secret detector threshold. Runtime code compiled cleanly and the benchmark already passed.

Correction commit `0c96f6c4b74e73157fae3cb9533ffdd3f3254a44` changed only the test fixture to a canonical 36+ character GitHub-token shape. On that implementation-equivalent head:
- 52/52 test files passed;
- 462/462 tests passed;
- lint/typecheck/build passed;
- all evals passed;
- foundation/engineering validation passed;
- dependency audit and packaging passed;
- CI SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Cross-Platform SUCCESS.

## Verification gate

Required before HEDS:
- CI SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Cross-Platform SUCCESS;
- exact-head benchmark values copied into this bundle;
- unresolved review threads = 0;
- no HIGH/CRITICAL defect.


## HEDS correction — cross-capability replay binding

During exact-head HEDS on `a0b0f5ebd5cfc0b1b0322967697a2af5a233b51a`, the auditor identified a HIGH integrity gap:

- a valid proof's `capabilityId` was cryptographically bound inside PCCR,
  but the projector did not verify that the proof stored/passed under a map key
  matched that key;
- a copied or injected `toolCalling` proof could therefore be reused under
  `subagents` (or another capability key) and incorrectly project `true`.

Bounded correction:
- `readHostCapabilityProof()` now rejects subject-path and capability-path binding mismatch;
- direct projection now refuses a proof whose internal `capabilityId` differs from the target capability;
- T047 was strengthened to copy a proof across subject roots and require REJECTED;
- new regression `M03-REG-001` proves direct and stored cross-capability replay cannot enable another capability;
- B4 replay accounting now includes a cross-capability replay attempt.

No schema, package, probe or architectural scope expansion was required.

The prior benchmark values remain historical only. Fresh exact-head B1/B3/B4/B7 values and all four hosted gates must be auditor-bound before final APPROVED.
