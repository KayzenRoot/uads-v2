# UADS2-WO-006 — EXECUTOR PROMPT

Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-006-m03-pccr-core`
Issue: #28
Planning head to reconcile before implementation: `53c89f52e707b64c6f238a2d5a374d897f9d34d7`
Mode: UADS / HEDS bounded execution
Language for final executor report: pt-BR
Canonical technical language: English

## Mission

Execute **only** UADS2-WO-006 / M03 S05 Slice 1:

**PCCR Core + Passive/Deterministic-Local Proof + Conservative Compatibility Projector**

Do not implement vendor-specific host probes.

## Preflight

1. Fetch and prune the repository.
2. Checkout `work/uads2-wo-006-m03-pccr-core`.
3. Fast-forward only. Do not force push or rewrite history.
4. Verify the branch contains planning head `53c89f52e707b64c6f238a2d5a374d897f9d34d7` as its current ancestor.
5. Read completely, in canonical order:
   - `docs/v2/11-CHECKPOINT.md`
   - `docs/v2/10-DECISIONS-LEDGER.md`
   - `docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md`
   - `.engineering/work-orders/UADS2-WO-006-M03-S05-SLICE1-PCCR-CORE.md`
   - `.engineering/context-locks/UADS2-WO-006-M03-PCCR-CORE.md`
   - `docs/v2/modules/m03/M03-S05-SLICE1-PCCR-IMPLEMENTATION-CONTRACT.md`
   - `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md`
6. Reconcile every Context Lock fingerprint before editing runtime files.
7. If a locked source changed unexpectedly, STOP with `STALE_CONTEXT`. Do not guess.

## Exact runtime scope

Create only these runtime/test files unless a compile/test blocker proves a minimal existing-file edit NECESSARY:

- `schemas/host-capability-proof.schema.json`
- `src/kernel/host-capability-proof.ts`
- `tests/host-capability-proof.test.ts`

Do not change:
- `schemas/runtime-capability-snapshot.schema.json`
- package dependencies or lockfile
- M30 operational-event schema/event enum
- model/profile/router architecture
- worker/orchestrator runtime

Any NECESSARY existing-file edit must be explicitly justified in the Evidence Bundle.

## Required implementation

### 1. Closed PCCR schema

Implement a versioned, additionalProperties=false schema for the existing ten legacy capability IDs only.

Required fields:
- schema / schemaVersion
- capabilityId
- state: SUPPORTED | UNSUPPORTED | UNKNOWN | BLOCKED | STALE
- evidenceClass: E0 | E1 | E2 | E3 | E4
- subjectDigest
- adapterId
- runtimeVersion nullable
- probeId
- validityBasis:
  - adapterContractDigest
  - probeDefinitionDigest
  - policyDigest
  - configurationDigest nullable
- observedAt
- validUntil nullable
- validityClass: IDENTITY_BOUND | LEASED
- evidenceDigest
- negativeProofKind nullable
- reasonCodes[]
- proofDigest

No raw evidence, absolute paths, secrets or environment dumps.

### 2. Deterministic proof core

Implement:
- canonical proof serialization;
- deterministic SHA-256 proof digest excluding `proofDigest`;
- strict normalization + JSON Schema validation;
- bounded privacy validation;
- proof compilation;
- proof evaluation against a caller-supplied current validity basis.

### 3. CEL / E2 floor

Invariant:
- E1 DECLARED can never produce SUPPORTED.
- Any SUPPORTED proof requires E2 or stronger.

### 4. Negative Proof Contract

For Slice 1, UNSUPPORTED is legal only when:
- `negativeProofKind = adapter-contract-impossible`;
- evidenceClass >= E2;
- exact adapterContractDigest is bound;
- normal integrity/freshness validation passes.

Never infer UNSUPPORTED from absence, missing file, timeout, permission denial, parser failure or declaration.

### 5. Freshness and drift

Evaluate at least:
- subjectDigest drift;
- adapterId drift;
- runtimeVersion drift;
- adapterContractDigest drift;
- probeDefinitionDigest drift;
- policyDigest drift;
- configurationDigest drift;
- LEASED expiry;
- clock regression where current time is earlier than observedAt.

Drift results in effective STALE and never TRUE/FALSE reuse.

### 6. Global sidecar persistence

Store at:

`<UADS_HOME>/registry/runtime/capabilities/proofs/<subjectDigest>/<capabilityId>.json`

Reuse existing atomic/sidecar helpers.
Do not create project-local proof state.
Corrupt/tampered proof reads fail closed.
A later valid atomic rewrite must demonstrate recovery.

### 7. Conservative legacy projection

Project PCCR into the current RuntimeCapabilitySnapshot without expanding its schema.

Rules:
- initialize all ten legacy capability values to `unknown`;
- valid SUPPORTED -> true;
- valid UNSUPPORTED -> false;
- UNKNOWN/BLOCKED/STALE/missing/invalid -> unknown;
- legacy input true without valid PCCR -> unknown;
- preserve legacy runtime/adapter metadata;
- recompute identityDigest;
- snapshot-wide provenance confidence remains conservative, never falsely `proven`.

### 8. M30 best-effort telemetry

Do not change event enums/schema.

When telemetry context is provided, emit:
- eventType: `evidence.lifecycle`
- sourceComponent: `m03.host-capability`

Persist proof first.
Telemetry failure must not roll back, alter or invalidate truth.
Return telemetry status independently.

## Required tests

Map test names explicitly to:
- T001-T010
- T018-T030
- T045-T060

Do not claim coverage without a real assertion.

Active-probe tests T031-T044 are OUT OF SCOPE.

## Required benchmark evidence

Measure and report:
- B1 warm proof validation p50/p95 and target comparison <= 50 ms;
- B3 durable proof bytes under Slice-1 fixture vocabulary, target <= 64 KiB/host;
- B4 unsafe TRUE = 0, tamper/replay acceptance = 0, covered drift misses = 0, absence-to-UNSUPPORTED mistakes = 0;
- B7 corrupt/partial proof accepted = 0 and recovery path proven.

Do not invent results.

## Verification

Run:
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- focused Vitest for `tests/host-capability-proof.test.ts`
- `npm test`
- `npm run validate:engineering`
- `npm run validate`
- `git diff --check`
- dependency audit / existing high-severity gate

Fix in-scope failures before pushing.
Mark genuinely environmental/non-conclusive checks truthfully.

## Evidence and repository delivery

Create/update:
- `.engineering/reports/EVIDENCE-UADS2-WO-006.md`
- `.engineering/evidence/UADS2-WO-006/` machine-readable benchmark/test evidence where useful
- `.engineering/checkpoints/CHECKPOINT-DELTA-UADS2-WO-006.md`
- `docs/v2/continuity/CURRENT.json`

Evidence Bundle must include:
- exact base/head;
- changed-file classification;
- S04 test-ID mapping;
- B1/B3/B4/B7 values;
- schema/runtime/test file digests;
- privacy/security review;
- M27-M31 classification;
- known limitations;
- explicit statement that vendor-specific active probes were not implemented;
- explicit proof that legacy true without valid PCCR degrades to unknown.

Commit and push the same branch.
Open one PR against `main` for issue #28.

## STOP CONDITION

Stop when the PR is ready for exact-head HEDS.

Do NOT:
- merge the PR;
- start Cursor/Codex active probes;
- start another M03 slice;
- start M01/M02/M04/M06/M23;
- weaken ADR-UADS2-012;
- hide failed or inconclusive evidence.

Final report in pt-BR must include:
1. status;
2. exact base/head;
3. files changed;
4. tests/checks;
5. benchmark values;
6. security/privacy findings;
7. PR number/link;
8. known limitations;
9. explicit `READY FOR EXACT-HEAD HEDS` or truthful blocker.
