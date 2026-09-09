# Work Order — UADS2-WO-007

Status: IMPLEMENTED / EVIDENCE FROZEN — EXACT-HEAD HEDS PENDING
Module: M03 — Host Capability Detector
Slice: S05.2 — Host Subject Identity & Passive Evidence Bridge
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-007-m03-subject-passive-evidence`
Base SHA: `384e24ba947382d68a8215f494041cee7cf15670`
Issue: #30
PR: #31
Risk: MEDIUM-HIGH
ADRs: ADR-UADS2-011 / ADR-UADS2-012 — ACCEPTED

## Objective

Implement the next bounded M03 vertical slice after PCCR core:

**stable privacy-safe host subject identity + passive adapter/root evidence bridge into PCCR**.

This slice must remove ambiguity between:
- host target/root presence;
- adapter declaration;
- per-capability proof.

A legacy host detection status of `SUPPORTED` MUST NOT mean a capability is `SUPPORTED`.

## Exact runtime scope

Expected runtime/test files:

- NEW `src/kernel/host-capability-subject.ts`
- NEW `src/adapters/host-capability-passive.ts`
- NEW `tests/host-capability-passive.test.ts`

Existing runtime files are read-only unless a narrowly demonstrated integration blocker makes a minimal edit NECESSARY. Any such edit must be:
- justified in Evidence Bundle;
- covered by focused regression;
- free of ownership expansion;
- free of dependency/schema-version expansion unless explicitly amended.

Planning/evidence/checkpoint artifacts may change under `.engineering/` and `docs/v2/`.

## Out of scope

- no Cursor-specific active probe;
- no Codex-specific active probe;
- no child_process/subprocess execution;
- no shell;
- no network;
- no filesystem mutation of host roots;
- no TEMPORARY_LOCAL / NETWORK / MUTATING / COST_BEARING probe;
- no six future capability IDs in runtime;
- no M01/M02/M04/M06/M23 implementation;
- no host-dispatch consumer migration unless separately proven NECESSARY;
- no package dependency;
- no release/version bump;
- no M03 S07 freeze.

## Required subject contract

Create a stable `HostCapabilitySubject` derived only from privacy-safe facts already available through current host adapter/root resolution.

At minimum bind:
- adapterId;
- exact adapter contract version;
- exact adapter definition/contract digest;
- rootIdentityDigest;
- targetRootDigest;
- rootKind;
- sourceClass;
- runtimeVersion nullable;
- subject schema/version/domain;
- subjectDigest.

Do not persist:
- hostHome;
- targetRoot;
- resourceRoot;
- manifestPath;
- environment values;
- raw sourceLabel;
- secrets.

The same semantic host subject must produce the same subjectDigest even if detection timestamps change.

Cross-root, cross-adapter, root-binding-version or exact contract changes must not silently reuse the old subject.

## Exact adapter-contract digest

The slice must compute a deterministic digest from the normalized fixed adapter definition plus the host adapter contract version.

The digest MUST bind the fixed capability declaration itself.

A mutated/non-canonical adapter definition cannot be treated as the same contract.

## Passive evidence policy

Current adapter definition values are declarations, not feature proof.

For each of the existing ten capability IDs:

### Detection BLOCKED
- PCCR state: `BLOCKED`
- evidence: E1 or weaker
- legacy projection: `unknown`

### Detection UNAVAILABLE / UNPROVEN
- PCCR state: `UNKNOWN`
- declaration evidence may be E1
- legacy projection: `unknown`
- adapter `false` MUST NOT become UNSUPPORTED while the target/presence basis is absent/unproven

### Detection SUPPORTED
This means only that the target/root is present and structurally acceptable.

Then:
- declaration `true` => `UNKNOWN`, E1; NEVER SUPPORTED
- declaration `unknown` => `UNKNOWN`, E1
- fixed declaration `false` => may become `UNSUPPORTED`, E2, `negativeProofKind=adapter-contract-impossible`, only because the exact normalized adapter contract proves impossibility by construction

No passive path in WO-007 may create `SUPPORTED`.

## Presence/status drift binding

Passive proof validity must include a deterministic privacy-safe digest of the relevant passive host state.

At minimum it must change when:
- target/root presence status changes;
- root identity changes;
- target root digest changes;
- adapter contract changes;
- runtimeVersion changes when it becomes known.

Use an existing PCCR validity-basis field conservatively; do not weaken ADR-UADS2-012.

If a generic-adapter negative proof was created while the target was present and the target later disappears, the old proof MUST evaluate STALE/UNKNOWN rather than remain FALSE.

## Passive bridge

Provide a bounded API that can:

1. resolve current adapter definition/target/detection;
2. derive subject + current PCCR basis;
3. compile passive PCCR records for the ten existing capabilities;
4. persist them through WO-006 PCCR storage;
5. produce a conservative proof-aware RuntimeCapabilitySnapshot;
6. optionally emit best-effort M30 `evidence.lifecycle` telemetry through the existing event schema.

The bridge must not require Hive.

## Legacy semantic boundary

`detectHostAdapter().status === SUPPORTED` remains a host-target availability fact.

It is NOT capability proof.

The new bridge must not use `runtimeSnapshotFromHostDetection()` as its trust source for capability values. It may use only identity metadata and exact passive facts.

The old legacy function may remain for compatibility in this slice unless a minimal safe deprecation/clarification edit is NECESSARY.

## Required tests

At minimum:

- U007-T001 subject digest deterministic across repeated detection timestamps;
- U007-T002 different target root -> different subject digest;
- U007-T003 different adapter -> different subject digest;
- U007-T004 subject/durable evidence contains no absolute host path;
- U007-T005 exact adapter contract digest deterministic;
- U007-T006 mutated/non-canonical adapter definition cannot reuse contract identity;
- U007-T007 target presence alone never creates capability TRUE;
- U007-T008 Cursor present => all ten capabilities remain UNKNOWN from passive declarations;
- U007-T009 Codex present => all ten capabilities remain UNKNOWN from passive declarations;
- U007-T010 generic adapter present => subagents/parallelAgents FALSE only through E2 NPC;
- U007-T011 generic adapter absent => subagents/parallelAgents UNKNOWN, never false;
- U007-T012 blocked target => all capability projections UNKNOWN;
- U007-T013 generic false proof binds exact adapterContractDigest;
- U007-T014 target presence/status drift makes prior negative proof STALE;
- U007-T015 root switch makes prior proof stale/rejected;
- U007-T016 passive bridge preserves WO-006 cross-capability binding protection;
- U007-T017 legacy input TRUE without passive PCCR proof remains UNKNOWN;
- U007-T018 passive bridge has no SUPPORTED proof output;
- U007-T019 best-effort M30 telemetry cannot mutate truth;
- U007-T020 SOLO path requires no Hive;
- U007-T021 no child_process/shell/network execution path is introduced;
- U007-T022 persisted passive proof state remains bounded under 64 KiB/host;
- U007-T023 repeated same semantic subject with fixed observedAt produces deterministic proof digests;
- U007-T024 detection reason/timestamp changes that do not change semantic identity do not change subjectDigest;
- U007-T025 exact current basis can re-evaluate persisted passive proof after restart.

Existing WO-006 tests remain mandatory regression coverage.

## Benchmarks

- PCCR warm validation B1 must remain <= 50 ms p95.
- B3 total proof bytes remain <= 64 KiB/host.
- Passive subject derivation + ten-capability proof compilation target p95 <= 25 ms in synthetic local benchmark.
- Passive bridge compile + persist + project target p95 <= 100 ms in bounded temp-home benchmark.
- Safety counters: positive capabilities inferred from target presence = 0; absence-to-UNSUPPORTED = 0; cross-root/cross-capability replay acceptance = 0.

Performance cannot weaken correctness.

## Enterprise gates

M27:
- bounded ten-capability work;
- no probe fanout;
- bridge/subject benchmarks.

M28:
- missing/blocked root -> UNKNOWN/BLOCKED;
- prior negative proof becomes stale after presence/root drift;
- restart re-evaluation deterministic.

M29:
- no path/secret persistence;
- exact contract/root binding;
- replay protection;
- no process/network execution.

M30:
- best-effort existing event contract only;
- telemetry does not determine capability truth.

M31:
- additive bridge;
- no legacy schema expansion;
- rollback = stop using passive bridge, preserving WO-006 conservative PCCR semantics.

## Verification

At minimum:
- npm ci
- npm run lint
- npm run typecheck
- npm run build
- focused passive-evidence tests
- existing host-capability-proof tests
- host-adapter/root regression tests
- npm test
- npm run eval:adapters
- npm run validate:engineering
- npm run validate
- git diff --check
- dependency gate
- exact-head CI / CodeQL / Dependency Review / Cross-Platform

## Stop condition

STOP with BLOCKED/CORRECTION REQUIRED if:
- host presence can enable TRUE;
- a declaration true can become SUPPORTED;
- missing target can create UNSUPPORTED;
- prior negative proof stays false after target disappears;
- absolute path/secret becomes durable;
- active process/network probe becomes necessary;
- WO-006 subject/capability replay hardening is bypassed;
- accepted ADR-UADS2-012 must be weakened;
- HIGH/CRITICAL defect remains.


## Implementation evidence snapshot

Implementation head: `3683c3d125d32558409f2362ef722b414114fb14`
CI run: `34411074895`
CI job: `102665372314`

Runtime scope:
- `src/kernel/host-capability-subject.ts`
- `src/adapters/host-capability-passive.ts`
- `tests/host-capability-passive.test.ts`

Hosted implementation-head result:
- 53/53 test files PASS;
- 489/489 tests PASS;
- lint/typecheck/build PASS;
- all evals PASS;
- Dependency Review SUCCESS;
- CodeQL SUCCESS;
- Cross-Platform Linux/Windows SUCCESS.

Benchmark sample:
- U007-B1 compile p95 = 2.639622 ms <= 25 ms;
- U007-B2 compile+persist+project p95 = 3.453904 ms <= 100 ms;
- U007-B3 = 11,728 bytes/host <= 65,536;
- U007-B4 all safety counters = 0.

Final exact HEDS head will be auditor-bound after this evidence-only commit. Do not self-embed a mutable final SHA.
