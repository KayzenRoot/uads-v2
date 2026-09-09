# EVIDENCE-UADS2-WO-001

This bundle includes the B-001 blocker-resolution inspection and the HEDS
conditional amendment recommendation. It does not claim that the mandatory
duplicate-analysis denominator was obtained, that the amendment was approved
by the owner, or that HEDS approval has been granted.

## Scope and provenance

- Work Order: `UADS2-WO-001`.
- Repository: `KayzenRoot/uads-v2`.
- V2 base: `3eedf833c00b18755ce2b105f4df8c6c13269055`.
- Working branch before the final evidence commit: `work/uads2-wo-001-v1-baseline`.
- Frozen V1 ref: `KayzenRoot/uads@312e32946798eb3abbb49a79af08e13efb7719dc`.
- Frozen V1 tree: `b2a6763045fc1dbb81b6ba2880bf1f77167d7133`.
- Frozen V1 source fingerprint: `b22017e779325cffaabb14de41742e01aa8e853d8aee96a8c21c8f35c9cf366a`.

The V1 exact commit was cloned into isolated temporary sample workspaces,
built, and exercised detached. The canonical V1 checkout was checked clean
before and after collection. No V1 tracked file was edited.

## Collection commands

The following were executed as foreground commands using system Node/npm:

```text
git clone https://github.com/KayzenRoot/uads-v2.git .
git fetch --prune origin
git switch --track origin/work/uads2-wo-001-v1-baseline
git merge --ff-only origin/work/uads2-wo-001-v1-baseline
git clone https://github.com/KayzenRoot/uads.git <isolated-v1-workspace>
git checkout --detach 312e32946798eb3abbb49a79af08e13efb7719dc
npm ci
npm run build
npm run eval:orchestrator
npm run eval:execution
npm run eval:specialist-routing
npm run eval:model-routing
npm exec -- vitest run --maxWorkers=1 <focused-test-files>
node --check scripts/baseline/recompute-wo001.mjs
node scripts/baseline/recompute-wo001.mjs --write
```

The primary CLI samples also used the V1 commands `inspect`, `plan`,
`dispatch`, `verify`, `evidence record`, `assurance start`, `assurance record`,
`finalize`, `status`, and `cost status` as applicable to each bounded path.

## Raw evidence inventory

Raw evidence is under `.engineering/evidence/UADS2-WO-001/`:

- `samples/LOW-E5/`: plan, dispatch, static evidence, review, and cost
  sidecars;
- `samples/STANDARD-E2/`: plan, blocked checkpoint, and cost sidecars;
- `samples/ELEVATED-E7/`: plan, blocked checkpoint, and cost sidecars;
- `samples/LOW-X6-CORRECTION/`: plan, dispatch, two-attempt execution,
  six evidence records, correction/final review, and cost sidecars.
- `blocker-resolution/`: exhaustive supported-path inspection and sanitized
  command transcript.

The complete repository-relative path and SHA-256 inventory is embedded under
`rawEvidence` for every sample in `UADS2-WO-001-BASELINE-DATA.json`.
The blocker inspection files and their hashes are embedded under
`blockerResolution.rawEvidence`.

## B-001 resolution

The inspection found no authoritative structured analysis-event stream on the
frozen V1 supported paths. V1 exposes routing assignments, findings/verdicts,
execution state, cost/model snapshots, and host receipts; none is an analysis
event under the approved duplicate rule. The rate therefore remains
`UNAVAILABLE` with `0/0`, and no assignment or verdict is reinterpreted as an
analysis event.

The required response is the proposed amendment at
`.engineering/work-orders/UADS2-WO-001-B-001-AMENDMENT-PROPOSAL.md`, with
status `PROPOSED_PENDING_OWNER_AUDITOR_APPROVAL`. HEDS conditionally
recommended that amendment, but no owner decision is recorded. This is not
checkpoint promotion, final HEDS approval, or runtime authorization.

## Sample evidence

### LOW-E5

V1 `plan` classified the request LOW/trivial/documentation with context C1
and selected six specialists plus one assurance reviewer. `dispatch`,
`verify`, static evidence recording, assurance recording, and `finalize`
completed. The persisted final review verdict is `APPROVED`. The subsequent
optional `uads review` packaging inspection failed closed because its default
inspector required validation files not present in this bounded sample; this
is recorded as a packaging limitation, not converted into an execution
failure.

### STANDARD-E2

V1 `plan` classified the request HIGH/cross-cutting with context C3, selected
nine specialists plus two assurance reviewers, and persisted a strong-model
requirement. `dispatch` refused to proceed with `NO_ELIGIBLE_MODEL`. No
provider invocation or review occurred.

### ELEVATED-E7

V1 `plan` classified the request HIGH/local with context C3, selected eight
specialists plus two assurance reviewers, and persisted a strong-model
requirement. `dispatch` refused to proceed with `NO_ELIGIBLE_MODEL`. No
provider invocation or review occurred.

### LOW-X6-CORRECTION

The V1 execution evaluation passed X6. The persisted run has attempt 2, one
`CORRECTION_NEEDED` review followed by `APPROVED`, one retry, and correction
depth 1. This supplemental sample uses the execution evaluator’s synthetic
fixture repository and is not evidence that the frozen V1 product source was
modified.

## Validation results

V1 exact-source checks:

| Check | Result |
| --- | --- |
| Build | PASS |
| Orchestrator eval | 9/9 PASS |
| Execution eval | 9/9 PASS |
| Specialist-routing eval | 26/26 PASS |
| Model-routing eval | 22/22 PASS |
| Focused orchestrator-kernel tests | 13/13 PASS |
| Focused execution-lifecycle tests | 4/4 PASS |
| Focused specialist-routing tests | 36/36 PASS |
| Focused model-routing tests | 24/24 PASS |
| Full `npm test` | INCONCLUSIVE; bounded foreground run stalled after startup and was interrupted |
| `npm run eval:cost` | INCONCLUSIVE; bounded foreground run produced no output and was interrupted |

V2 checks after evidence generation:

| Check | Result |
| --- | --- |
| `npm ci` | PASS; lockfile install, npm reported one moderate audit finding |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run lint` | PASS |
| Focused V2 Vitest selection | 4 files, 77/77 PASS |
| `npm run validate:engineering` | PASS; 23 required files, 6 schemas, 6 records |
| `npm run validate` | INCONCLUSIVE; full test phase produced no result after startup and was stopped in bounded foreground run |
| Dataset recomputation twice | PASS; byte-identical SHA-256 `4F0412659C63119532B3C87E412A1E0BE605D0EC2C92A814678E6965536C6991` |
| Host-path scan over evidence/docs/scripts | PASS; clean |
| Runtime scope/diff inspection | PASS; no V2 runtime source path changed |
| B-001 supported-path inspection | PASS as an exhaustive inspection; required result is no authoritative event stream |
| Pre-correction exact-head CI (`d466e0f...`) | PASS; CI, CodeQL, Dependency Review, Compatibility all completed successfully; the head was rejected for governance finding G-001 |
| Owner amendment decision | PENDING; no owner-decision artifact is recorded |
| Post-correction exact-head CI | Required gate for HEDS re-audit; authoritative result is the GitHub status on the pushed correction head |

## Deterministic recomputation checks

`recompute-wo001.mjs` validates each input fingerprint, reads only the checked-
in raw sidecars, computes derived values, and writes the dataset. Re-running
it must produce byte-identical JSON. The report’s metric values are not hand-
edited; they are derived by this utility.

## Errors and corrections

1. The first low-sample optional `uads review` inspection failed closed due to
   missing default validation artifacts; the failure and its required paths
   were retained as a limitation.
2. The full V1 test and cost-eval commands were stopped only after bounded
   foreground observation without output; neither is reported as passing.
3. The baseline recomputation utility had a variable-name error during local
   validation. It was corrected before dataset generation and passed
   `node --check` plus a successful write/recompute.
4. HEDS identified an owner-decision attribution unsupported by authoritative
   decision input on reviewed head `d466e0f...`; the artifact and all dependent
   applied-state metadata were removed. Owner decision remains pending.

## Unavailable telemetry and impact

The sidecars expose no provider/host event stream. Therefore host worker
concurrency, host-visible worker conversations, concrete model, reasoning
effort, provider tokens, quota amplification, billing, and escaped defects
are `UNAVAILABLE`. This is a measurement boundary, not an inferred zero.

## Scope proof

The only intended V2 changes are the required reports/checkpoint delta, the
machine-readable dataset, raw evidence, the standalone baseline
recomputation utility, and the proposed Work Order Amendment. No files under
`src/`, `core/`, `adapters/`, or other V2 runtime implementation paths are
changed. The exact V1 source remains clean and its required ref/tree remain
verifiable.

## Proposed checkpoint delta

The proposed delta is evidence-only: record the completed V1 baseline, preserve
the `NO_ELIGIBLE_MODEL` and telemetry limitations, retain the frozen-V1
duplicate rate as `UNAVAILABLE` (`0/0`), record the B-001 technical blocker,
and submit the amendment for owner/auditor decision. It does not promote the
checkpoint, start M01/S00, fix BUG-UADS2-001..004, or assert HEDS approval.
