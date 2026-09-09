# UADS2-WO-001 — V1 Operational Baseline Report

This report records the bounded, reproducible V1 baseline requested by
`UADS2-WO-001`. It measures the observable UADS sidecar and CLI state; it does
not claim provider execution, host telemetry, HEDS approval, or V2 runtime
implementation.

## WORK ORDER

`UADS2-WO-001` — FIRST EXECUTOR BOOTSTRAP + V1 OPERATIONAL BASELINE.

The baseline was collected on branch `work/uads2-wo-001-v1-baseline` from the
V2 base `3eedf833c00b18755ce2b105f4df8c6c13269055`. The frozen V1 source is
`KayzenRoot/uads@312e32946798eb3abbb49a79af08e13efb7719dc`, tree
`b2a6763045fc1dbb81b6ba2880bf1f77167d7133`.

## BASE SHA

`3eedf833c00b18755ce2b105f4df8c6c13269055`

## HEAD SHA

`cf19c3a048bb92442966fa5c6d5ba2431a63421f` — pushed baseline artifact
commit. The final handoff records the branch tip after this metadata update.

## SAMPLES

Four reproducible samples cover all required risk classes. `STANDARD` and
`ELEVATED` are baseline labels; V1 internally routes both corresponding
fixtures as `HIGH`.

| Sample | Risk class | Workload | Observable result | Planned specialist/assurance total |
| --- | --- | --- | --- | ---: |
| `UADS2-WO-001-LOW-E5` | LOW | `evals/orchestrator/e5-docs-typo.json` | `APPROVED`, completed | 7 |
| `UADS2-WO-001-STANDARD-E2` | STANDARD | `evals/orchestrator/e2-auth-billing.json` | `BLOCKED`, `NO_ELIGIBLE_MODEL` | 11 |
| `UADS2-WO-001-ELEVATED-E7` | ELEVATED | `evals/orchestrator/e7-financial-ledger.json` | `BLOCKED`, `NO_ELIGIBLE_MODEL` | 10 |
| `UADS2-WO-001-LOW-X6-CORRECTION` | LOW supplemental | `evals/execution/x6-correction-loop.json` | `APPROVED` after one correction | 7 |

The exact request text, SHA-256 input fingerprint, work-order identity,
selection digest, timestamps, and raw-file SHA-256 inventory are in
`UADS2-WO-001-BASELINE-DATA.json`.

## METRICS

Derived values are recomputed by
`scripts/baseline/recompute-wo001.mjs` from the raw sidecars. The resulting
dataset reports:

- planned specialist totals: LOW-E5 7, STANDARD-E2 11, ELEVATED-E7 10,
  LOW-X6 7;
- persisted V1 execution policy: `parallel=false`, `role-cycling`; therefore
  configured policy maximum is one active specialist at a time;
- provider/worker spawn events in the sampled V1 CLI path: 0 observed, with
  host process concurrency `UNAVAILABLE`;
- sidecar-visible worker conversations: 0; host-visible conversations:
  `UNAVAILABLE`;
- retries/correction depth: E5 `0/0`, E2 `0/0`, E7 `0/0`, X6 `1/1`;
- first-pass approval: `1/2 = 0.5` among samples reaching a final review
  verdict; blocked samples are excluded;
- duplicate-analysis rate: `UNAVAILABLE` because no V1 analysis-event stream
  was exposed;
- token/quota amplification: `UNAVAILABLE` because provider token counts and
  `agentCallsReported` were null;
- observed dispatch-to-final-review intervals for completed samples: E5
  `70379 ms`, X6 `10287 ms`. These are sidecar timestamp intervals, not a
  provider latency measurement.

## FILES

Required deliverables:

- `.engineering/reports/UADS2-WO-001-BASELINE-REPORT.md`
- `.engineering/reports/UADS2-WO-001-BASELINE-DATA.json`
- `.engineering/reports/UADS2-WO-001-MEASUREMENT-METHOD.md`
- `.engineering/reports/EVIDENCE-UADS2-WO-001.md`
- `.engineering/checkpoints/CHECKPOINT-DELTA-UADS2-WO-001.md`

Raw evidence is under `.engineering/evidence/UADS2-WO-001/`, partitioned by
sample and phase. The recomputation utility is
`scripts/baseline/recompute-wo001.mjs`; it is an evidence tool and is not a
UADS runtime path.

## TESTS

V1 exact-source validation:

- `npm run build`: PASS;
- `npm run eval:orchestrator`: 9/9 PASS;
- `npm run eval:execution`: 9/9 PASS, including X6 correction loop;
- `npm run eval:specialist-routing`: 26/26 PASS;
- `npm run eval:model-routing`: 22/22 PASS;
- focused Vitest files: 13, 4, 36, and 24 tests PASS respectively;
- full `npm test`: inconclusive; no test output after startup and the bounded
  foreground process was interrupted;
- `npm run eval:cost`: inconclusive; no output in the bounded foreground run
  and the process was interrupted.

V2 repository checks:

- `npm ci`: PASS using the lockfile; npm reported one moderate audit finding;
- `npm run typecheck`: PASS;
- `npm run build`: PASS;
- `npm run lint`: PASS;
- focused V2 Vitest selection: 4 files, 77 tests PASS;
- `npm run validate:engineering`: PASS;
- `npm run validate`: INCONCLUSIVE because its full test phase produced no
  result after startup and was stopped in the bounded foreground run;
- deterministic recomputation and host-path scan: PASS;
- scope/diff inspection: PASS; no V2 runtime source was changed.

## EVIDENCE

The evidence document records commands, exact SHAs, source-tree proof, raw
sidecar inventory, formulas, validation results, errors/corrections, and
unavailable telemetry. The JSON dataset is the machine-readable source for
all derived values in this report.

## LIMITATIONS

V1’s dispatch path creates an execution packet but does not invoke a provider
from this CLI baseline. Consequently, actual host worker count, visible worker
conversations, provider model/reasoning effort, provider token usage, quota,
and production escaped defects cannot be measured here. The LOW-E5
`uads review` packaging attempt also failed closed because its default
inspector required validation files outside this bounded baseline; this does
not alter the persisted execution/review sample result.

Timestamp intervals use persisted sidecar timestamps collected across separate
foreground commands. They are suitable for reproducibility and component
comparison, but must not be interpreted as isolated host or provider wall
clock.

## RISKS

The largest baseline risk is the absence of an eligible concrete model for the
STANDARD and ELEVATED requirements, which prevents dispatch. Host-owned
execution telemetry is also absent, so spawn/concurrency and token metrics are
not optimization targets. These are observations for the future V2 executor,
not fixes in this work order.

## CHECKPOINT DELTA

`CHECKPOINT-DELTA-UADS2-WO-001.md` records the proposed evidence-only delta:
the V1 baseline is locally measured and ready for independent HEDS audit;
V2 implementation remains gated and unchanged; no checkpoint promotion or
HEDS approval is asserted.

## PR

Existing PR: `#17`. This work stays on the existing branch and uses a normal
push. The final state will record whether the PR summary update succeeded or
was blocked by unavailable GitHub CLI/authentication.

## STOP CONDITION

Stop after the evidence-only baseline is committed and pushed to PR #17, with
the acceptance evidence and limitations available for independent HEDS audit.
Do not start M01/S00, implement the sequential executor, modify V1, or claim
HEDS approval from this baseline.
