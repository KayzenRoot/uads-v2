# Work Order — UADS2-WO-006

Status: ACTIVE — M03 S05 SLICE 1
Module: M03 — Host Capability Detector
Slice: S05.1 — PCCR Core + Passive/Deterministic-Local Proof + Conservative Projection
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-006-m03-pccr-core`
Base SHA: `36b2019fc22b4d6c5d250e41edf12e737c4ddcfa`
Issue: #28
Risk: MEDIUM-HIGH
ADR: ADR-UADS2-012 — ACCEPTED

## Objective

Implement the smallest end-to-end runtime slice that makes M03 proof semantics real without introducing vendor-specific active probes.

The slice must establish:
1. a closed/versioned PCCR schema;
2. deterministic proof compilation and integrity validation;
3. bounded global sidecar persistence;
4. freshness/drift evaluation for the implemented validity basis;
5. the accepted Negative Proof Contract subset needed for static adapter-contract negatives;
6. conservative projection into the existing ten-field RuntimeCapabilitySnapshot;
7. best-effort M30-compatible evidence lifecycle telemetry using the existing operational event contract;
8. the applicable frozen S04 safety tests and benchmarks.

## Exact runtime scope

Allowed runtime/test changes:
- NEW `schemas/host-capability-proof.schema.json`
- NEW `src/kernel/host-capability-proof.ts`
- NEW `tests/host-capability-proof.test.ts`

Existing runtime files are read-only unless a demonstrated compile/test blocker makes a minimal change NECESSARY. Such a change requires:
- explicit impact note in Evidence Bundle;
- no ownership expansion;
- no package/dependency change;
- HEDS scrutiny.

Planning/evidence/checkpoint docs under `.engineering/` and `docs/v2/` may be updated as required by the workflow.

## Out of scope

- no Cursor-specific probe;
- no Codex-specific probe;
- no subprocess/child-process execution;
- no shell;
- no network;
- no TEMPORARY_LOCAL/NETWORK/MUTATING/COST_BEARING probe execution;
- no runtime introduction of the six proposed future capability IDs;
- no change to `runtime-capability-snapshot.schema.json`;
- no M04/M05/M06/M23 implementation;
- no model registry/router redesign;
- no M01/M02 worker/orchestrator implementation;
- no npm dependency;
- no release/version bump.

## Required data contract

The PCCR runtime record MUST be schema-closed and include at minimum:
- schema + schemaVersion;
- capabilityId limited in Slice 1 to the existing ten legacy capability IDs;
- observed state: SUPPORTED / UNSUPPORTED / UNKNOWN / BLOCKED / STALE;
- evidenceClass: E0 / E1 / E2 / E3 / E4;
- subjectDigest;
- adapterId;
- bounded runtimeVersion nullable;
- probeId;
- validity basis:
  - adapterContractDigest;
  - probeDefinitionDigest;
  - policyDigest;
  - configurationDigest nullable;
- observedAt;
- validUntil nullable;
- validityClass: IDENTITY_BOUND / LEASED;
- evidenceDigest;
- negativeProofKind nullable;
- bounded reasonCodes;
- proofDigest.

Raw evidence, absolute paths, secrets and environment dumps MUST NOT be durable fields.

## Proof rules

### SUPPORTED
- E1 can never produce SUPPORTED.
- Minimum enabling evidence = E2.
- Current basis must match.
- Integrity must match.
- Lease must be current when LEASED.

### UNSUPPORTED
In Slice 1, UNSUPPORTED is accepted only for:
`negativeProofKind = adapter-contract-impossible`

It must:
- be E2 or stronger;
- bind the exact adapterContractDigest;
- satisfy all normal integrity/freshness checks.

No absence, missing file, timeout, permission denial, parser failure or declaration may create UNSUPPORTED.

### UNKNOWN / BLOCKED / STALE
Never project to enabled TRUE.

## Persistence

Use existing atomic/sidecar primitives.

Canonical storage root:
`<UADS_HOME>/registry/runtime/capabilities/proofs/<subjectDigest>/<capabilityId>.json`

No project-local proof copy.

Corrupt/tampered records fail closed.

## Compatibility projection

Provide a bounded projector that:
- starts all existing ten legacy capabilities at `unknown`;
- applies only valid proof evaluations;
- SUPPORTED -> true;
- UNSUPPORTED -> false;
- UNKNOWN/BLOCKED/STALE/missing/invalid -> unknown;
- never preserves a legacy `true` merely because it existed in the input snapshot;
- preserves runtime/adapter identity metadata needed by the legacy snapshot;
- recomputes its identity digest using existing primitives;
- does not claim global snapshot provenance as `proven` because proof is per capability.

## M30 telemetry

Use the existing operational-event contract only. No event enum/schema expansion.

When telemetry context is supplied, emit a privacy-safe `evidence.lifecycle` event with source component `m03.host-capability` after authoritative proof persistence.

Telemetry failure MUST NOT mutate or invalidate the truth result. Return/record telemetry status separately.

## Required tests from frozen S04

Implement explicit test mapping for:
- T001–T010
- T018–T030
- T045–T060

Active-probe-specific T031–T044 remain out of scope.

Cross-platform active-probe tests T061–T066 remain future unless a pure path/identity helper introduced by this slice makes a subset directly relevant.

## Required benchmarks/evidence

- B1 warm proof validation, target p95 <= 50 ms.
- B3 durable proof state <= 64 KiB per host under Slice-1 fixture vocabulary.
- B4 zero unsafe TRUE, zero tamper/replay acceptance, zero covered drift miss, zero absence-to-UNSUPPORTED error.
- B7 corrupt/partial proof accepted = 0; deterministic safe recovery/rewrite path demonstrated.

Benchmarks are evidence, not permission to weaken correctness.

## Required verification

At minimum:
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- focused Vitest for host-capability-proof
- full `npm test`
- `npm run validate:engineering`
- `npm run validate`
- `git diff --check`
- no high-or-greater dependency regression
- hosted CI, CodeQL, Dependency Review and Cross-Platform exact-head gates.

## Evidence Bundle

Must include:
- exact base/head;
- changed-file classification;
- test-ID-to-test-name matrix;
- benchmark results B1/B3/B4/B7;
- proof schema digest;
- new runtime file digests;
- privacy review;
- M27-M31 classification;
- known limitations;
- no vendor-specific active-probe claim;
- no unsafe legacy true preservation.

## Enterprise gates

M27: proof validation/storage must stay bounded; benchmark B1/B3.
M28: corrupt/partial state fails closed and is recoverable; B7.
M29: digest/replay/privacy/NPC tests mandatory.
M30: best-effort evidence lifecycle telemetry, truth independent of telemetry availability.
M31: additive new schema/module, existing runtime snapshot schema unchanged, rollback = remove new proof-aware call path and return to conservative legacy behavior.

## Stop condition

STOP and report BLOCKED/CORRECTION REQUIRED if:
- runtime scope requires vendor-specific probing;
- subprocess/shell/network execution becomes necessary;
- legacy snapshot schema must be expanded;
- E1 can enable SUPPORTED;
- legacy true survives without a valid proof;
- absence can produce UNSUPPORTED;
- proof store leaks path/secret data;
- current accepted ADR-UADS2-012 must be weakened;
- a HIGH/CRITICAL security/integrity defect remains;
- full required verification cannot be made objective.


## Verification record before final HEDS

Implementation-equivalent head: `0c96f6c4b74e73157fae3cb9533ffdd3f3254a44`
PR: #29

- lint: PASS
- typecheck: PASS
- build: PASS
- full tests: 52/52 files, 462/462 tests PASS
- all inherited evals: PASS
- validate:engineering: PASS
- validate: PASS
- dependency gate: PASS
- packaging smoke: PASS
- CI: SUCCESS
- CodeQL: SUCCESS
- Dependency Review: SUCCESS
- Cross-Platform: SUCCESS
- B1/B3/B4/B7: PASS

Initial test-only defect:
T049 used a too-short fake GitHub token. The fixture was corrected to match the existing repository secret detector. Runtime implementation did not change.

Final exact-head HEDS remains mandatory after this evidence-only metadata commit.


## HEDS correction record

Exact-head audit of `a0b0f5ebd5cfc0b1b0322967697a2af5a233b51a` identified a HIGH integrity defect:
the PCCR internal `capabilityId` was not enforced against the proof map/storage capability key.

Required bounded correction has been applied in-scope:
- enforce subject/path binding in reads;
- enforce capability/path binding in reads;
- enforce proof capability/key binding before projection;
- strengthen T047 copied-root replay;
- add M03-REG-001 cross-capability replay regression;
- extend B4 replay attempt coverage.

Final status remains CORRECTION APPLIED / exact-head verification pending until fresh hosted gates and benchmark pass.
