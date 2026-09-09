# UADS2-WO-007 — EXECUTOR PROMPT

Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-007-m03-subject-passive-evidence`
Issue: #30
Planning head: `8164aa0551257a1ef826884d67149c312e38edf1`
Mode: UADS / HEDS bounded execution
Final executor report: pt-BR
Canonical technical language: English

## Mission

Execute only:

**UADS2-WO-007 — M03 S05.2 Host Subject Identity & Passive Evidence Bridge**

This slice converts existing adapter/root facts into privacy-safe PCCR evidence without active probing.

## Preflight

1. Fetch/prune repository.
2. Checkout `work/uads2-wo-007-m03-subject-passive-evidence`.
3. Fast-forward only.
4. Verify current branch contains planning head `8164aa0551257a1ef826884d67149c312e38edf1`.
5. Read completely:
   - `docs/v2/11-CHECKPOINT.md`
   - `docs/v2/10-DECISIONS-LEDGER.md`
   - `docs/v2/adrs/ADR-UADS2-011-GLOBAL-ARCHITECTURE-DEEP-DISCOVERY-VERTICAL-SLICES.md`
   - `docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md`
   - `.engineering/work-orders/UADS2-WO-007-M03-S05-2-SUBJECT-PASSIVE-EVIDENCE.md`
   - `.engineering/context-locks/UADS2-WO-007-M03-SUBJECT-PASSIVE-EVIDENCE.md`
   - `docs/v2/modules/m03/M03-S05.2-SUBJECT-PASSIVE-EVIDENCE-CONTRACT.md`
   - `.engineering/plans/UADS2-WO-007-TEST-PLAN.md`
   - `.engineering/reports/EVIDENCE-UADS2-WO-006.md`
6. Reconcile all Context Lock blob fingerprints.
7. Any unexpected locked-source drift => STOP `STALE_CONTEXT`.

## Expected runtime scope

Prefer new files only:

- `src/kernel/host-capability-subject.ts`
- `src/adapters/host-capability-passive.ts`
- `tests/host-capability-passive.test.ts`

Existing runtime files remain read-only unless an objective compile/integration blocker proves a minimal edit NECESSARY. Any such edit must be explicitly justified in Evidence Bundle.

Do not change:
- package dependencies / lockfile;
- PCCR schema unless a genuine blocker requires an amended Work Order;
- legacy runtime-capability schema;
- M30 event enum/schema;
- host-dispatch behavior unless explicitly necessary and tested;
- future capability vocabulary.

## Critical semantic rule

`detectHostAdapter().status === SUPPORTED` means only:
**host target/root is present and structurally acceptable**.

It is NOT per-capability proof.

Do not treat the legacy field name `provenCapabilities` as proof authority.

## 1. Stable HostCapabilitySubject

Implement a deterministic privacy-safe subject object containing at least:

- schema/domain/version;
- adapterId;
- adapterContractVersion;
- adapterContractDigest;
- root-binding version;
- rootIdentityDigest;
- targetRootDigest;
- rootKind;
- sourceClass;
- runtimeVersion nullable;
- subjectDigest.

No durable absolute paths, hostHome, targetRoot, manifestPath, sourceLabel values or environment values.

Subject digest:
- SHA-256;
- canonical locale-independent key ordering;
- excludes subjectDigest;
- excludes timestamps;
- same semantic facts => same digest;
- root/adapter/contract/runtime identity drift => different identity or stale basis.

## 2. Exact adapter contract digest

Compute deterministic digest from:
- normalized fixed adapter definition;
- HOST_ADAPTER_CONTRACT_VERSION;
- capability declaration map.

A mutated/non-canonical adapter definition must fail validation or fail identity equivalence.

## 3. Passive state digest

Create a privacy-safe digest for current passive host state, excluding timestamps.

At minimum bind:
- detection status;
- sorted semantic reason codes;
- rootIdentityDigest;
- targetRootDigest;
- runtimeVersion;
- adapterContractDigest.

Use this as the PCCR `configurationDigest` for passive evidence.

If target presence/status changes later, an old proof must become STALE under current basis.

## 4. Passive proof policy

Use fixed/versioned constants for:
- probeId, recommended `passive.adapter-contract.v1`;
- probeDefinitionDigest;
- policyDigest.

For each current legacy capability:

### BLOCKED
- state BLOCKED
- E1 or weaker
- never TRUE

### UNAVAILABLE / UNPROVEN
- state UNKNOWN
- E1 declaration evidence allowed
- never UNSUPPORTED merely because host is missing

### SUPPORTED target + declared true
- state UNKNOWN
- E1
- reason `ADAPTER_DECLARATION_TRUE_NOT_PROOF`
- never SUPPORTED

### SUPPORTED target + declared unknown
- state UNKNOWN
- E1

### SUPPORTED target + exact fixed declared false
- state UNSUPPORTED
- E2
- negativeProofKind `adapter-contract-impossible`
- bind exact adapterContractDigest

**There is no passive SUPPORTED path in WO-007.**

## 5. Evidence digest

Per capability, digest only:
- subjectDigest;
- adapterContractDigest;
- capabilityId;
- declared value;
- detection status;
- sorted semantic reason codes;
- passive state digest.

No raw paths or raw files.

## 6. Current basis

Build `HostCapabilityCurrentBasis` per capability with:
- subjectDigest;
- adapterId;
- runtimeVersion;
- adapterContractDigest;
- passive probeDefinitionDigest;
- passive policyDigest;
- passive state digest as configurationDigest.

## 7. Passive bridge

Provide bounded functions that:

1. resolve exact adapter definition and host target;
2. call current passive host detection;
3. derive subject and current basis;
4. compile ten passive PCCR records;
5. optionally persist through `persistHostCapabilityProof()`;
6. create conservative proof-aware legacy RuntimeCapabilitySnapshot;
7. optionally emit existing M30 `evidence.lifecycle` telemetry.

Do not return durable raw path data.

## 8. Legacy base

Do not use `runtimeSnapshotFromHostDetection()` capability values as trust input.

Build conservative metadata snapshot with all ten values UNKNOWN, then apply PCCR projection.

Legacy TRUE must not survive without valid PCCR.

## 9. Generic adapter negative contract

Current fixed `generic-agent-skills` contract declares:
- subagents=false
- parallelAgents=false

These may become E2 NPC UNSUPPORTED **only when current target/root presence is SUPPORTED and the exact contract/passive-state basis matches**.

If the target disappears:
- recompute subject/current basis;
- old negative proof must not keep FALSE;
- output becomes UNKNOWN/STALE.

## 10. Cursor / Codex passive result

Current builtin declarations are all UNKNOWN.

Even when Cursor/Codex target root is present:
- passive bridge must output no TRUE;
- all ten capability values remain UNKNOWN.

Do not invent support from vendor name/version/root.

## 11. Required tests

Implement U007-T001 through U007-T025 exactly as frozen in:
`.engineering/plans/UADS2-WO-007-TEST-PLAN.md`

Also run:
- full WO-006 PCCR tests;
- relevant host adapter/root tests;
- adapter evals.

Explicitly preserve:
- cross-subject replay rejection;
- cross-capability replay rejection;
- E1 never TRUE;
- absence never UNSUPPORTED.

## 12. Benchmarks

Produce machine-readable evidence for:
- U007-B1 subject + ten-proof compile p50/p95, target p95 <= 25 ms;
- U007-B2 compile + persist + project p50/p95, target p95 <= 100 ms;
- U007-B3 total ten passive proof bytes <= 64 KiB;
- U007-B4:
  - inferredPositiveTrue = 0
  - absenceUnsupported = 0
  - replayAccepted = 0
  - driftMisses = 0

Report environment/sample/method. No universal SLO claim.

## 13. M30

Use existing event schema only.

Telemetry:
- `eventType=evidence.lifecycle`;
- `sourceComponent=m03.host-capability`.

Telemetry failure cannot alter proof truth.

## 14. Verification

Run:
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- focused WO-007 tests
- WO-006 PCCR tests
- relevant host-adapter tests
- `npm test`
- `npm run eval:adapters`
- `npm run validate:engineering`
- `npm run validate`
- `git diff --check`
- dependency gate

Then push normal commits to the same branch and open one PR against main for issue #30.

## 15. Evidence

Create/update:
- `.engineering/reports/EVIDENCE-UADS2-WO-007.md`
- `.engineering/evidence/UADS2-WO-007/`
- `.engineering/checkpoints/CHECKPOINT-DELTA-UADS2-WO-007.md`
- `docs/v2/continuity/CURRENT.json`

Evidence must record:
- exact base/head;
- files changed;
- U007-T001..T025 mapping;
- benchmark values;
- subject/contract/passive-state digests;
- privacy review;
- proof that root presence created zero TRUE;
- proof that missing target created zero UNSUPPORTED;
- proof that root/status drift invalidates prior negative proof;
- no child_process/shell/network;
- no vendor active probe;
- M27-M31 classification;
- known limitations.

## STOP CONDITION

Stop when PR is ready for exact-head HEDS.

Do NOT:
- merge;
- implement Cursor/Codex active probes;
- use subprocess/shell/network;
- add future capability IDs;
- start another M03 slice;
- start M01/M04/M06/M23;
- weaken ADR-UADS2-012.

Final report in pt-BR:
STATUS / BASE / HEAD / FILES / TESTS / BENCHMARKS / SECURITY / PRIVACY / PR / LIMITATIONS / STOP.
