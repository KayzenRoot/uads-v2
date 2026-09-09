# Work Order — `UADS2-WO-001`

Status: `COMPLETED — HEDS APPROVED / MERGED`
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-001-v1-baseline`
Baseline Git SHA: `3eedf833c00b18755ce2b105f4df8c6c13269055`
Approved Head Git SHA: `8f585caf15c2a3ccd217439bd989a1ba9309d8be`
Merge Git SHA: `6ec3a4c025532ceafb67df79f07daf1b7c7042ad`
Scope class: `cross-cutting`
Risk: `MEDIUM`

## Objective

Reproduce representative UADS V1 operational review workloads against the frozen lineage and bind an objective baseline for fan-out, quota amplification, review latency, duplication, model/effort routing and correction behavior before any UADS V2 runtime module implementation.

## Context

Canonical V1 lineage: `KayzenRoot/uads@312e32946798eb3abbb49a79af08e13efb7719dc`.
UADS V2 bootstrap is approved and merged. This baseline is the mandatory gate named by `docs/v2/11-CHECKPOINT.md` and `docs/v2/06-TEST-BENCHMARK-PLAN.md`.

## B-001 approved amendment

HEDS conditionally recommended the B-001 amendment on reviewed head
`50b811bcad1435ce65e682d6fb46fda8e3857897`. The owner explicitly approved the
amendment on 2026-09-09. The verbatim decision is retained in
`.engineering/evidence/UADS2-WO-001/blocker-resolution/owner-amendment-decision.json`.

The original Duplicate Analysis Rate proof obligation remains historically
preserved. Exhaustive frozen-V1 inspection records
`ABSENT_ON_FROZEN_V1_SUPPORTED_PATHS` and `UNAVAILABLE` at `0/0` because no
authoritative structured analysis-event stream exists. This is not an inferred
zero.

The approved replacement obligation is mandatory for V2: V2 must emit
privacy-safe, identity-bound structured analysis events sufficient to calculate
deterministic numerator, denominator, rate, and raw-event hashes on the same
bounded workloads before the relevant V2 comparison gate can pass.

## Included scope

- Reproduce a representative set of LOW, STANDARD and ELEVATED review workloads using frozen V1 behavior without modifying V1.
- Capture worker/specialist spawn count per Work Order.
- Capture maximum simultaneous specialist count.
- Capture visible worker-conversation count.
- Capture token/input/output or host quota telemetry when available; otherwise explicitly record telemetry as unavailable rather than infer it.
- Capture review wall-clock and Time-to-Trusted-Merge components.
- Capture retries and correction-loop depth.
- Capture selected model and reasoning effort for each execution when exposed by the host/runtime.
- Capture context radius/size and cache/reuse evidence when exposed.
- Preserve the unchanged duplicate-analysis rule; record frozen-V1 source absence and `UNAVAILABLE` at `0/0` under the owner-approved B-001 amendment.
- Carry the mandatory V2 structured analysis-event and deterministic rate-proof obligation forward.
- Capture first-pass approval versus correction-required outcome.
- Record defects caught before merge and known escaped defects for sampled workloads when evidence exists.
- Produce an Evidence Bundle, baseline dataset/report and Checkpoint Delta.
- Preserve all raw evidence needed to reproduce measurements.

## Explicitly out of scope

- Implementing the Sequential Agent Orchestrator or any other V2 runtime module.
- Changing V1 source, workflows or canonical V1 truth.
- Fixing BUG-UADS2-001 through BUG-UADS2-004 in this Work Order.
- Establishing performance targets before the baseline is evidence-bound.
- Claiming hidden host telemetry, worker invisibility or token counts not objectively available.
- Broad cleanup, refactoring or dependency upgrades.

## Files / sources to read

1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/09-DEFINITION-OF-DONE.md`
4. `docs/v2/06-TEST-BENCHMARK-PLAN.md`
5. `docs/v2/04-ARCHITECTURE.md`
6. `docs/v2/03-SCOPE.md`
7. `docs/v2/02-REQUIREMENTS.md`
8. `.engineering/PROTOCOL.md`
9. `.engineering/DECISIONS.md`
10. Frozen V1 lineage at `312e32946798eb3abbb49a79af08e13efb7719dc`

## Architecture rules

- UADS V2 remains standalone-first and Hive integration remains optional/additive.
- No accepted ADR may be overwritten.
- Runtime capability UNKNOWN must remain UNKNOWN and may not be upgraded to true by assumption.
- Evidence must distinguish host-observed facts from inferred or unavailable telemetry.
- The baseline must not change the system whose behavior it is measuring.

## Constraints

- Use the exact frozen V1 lineage for behavioral reference.
- Preserve sample definitions so V2 can later replay the same workload classes.
- Prefer deterministic extraction from logs, Git, structured outputs and timestamps over LLM interpretation.
- Any metric unavailable from the host must be marked `UNAVAILABLE` with reason and impact.
- No HIGH/CRITICAL known defect may be ignored in the baseline report.

## Acceptance criteria

- [x] At least one reproducible workload exists for each LOW, STANDARD and ELEVATED risk class.
- [x] Every workload has immutable identity, input fingerprint, start/end timestamps and final verdict or explicit blocked-path result.
- [x] Worker spawn count is measured on the observable UADS path; actual host concurrency is explicitly bounded where unavailable.
- [x] Maximum concurrent workers is measured or explicitly marked UNAVAILABLE with proof of limitation.
- [x] Visible worker-conversation count is measured on the persisted UADS path; host-visible state is explicitly bounded where unavailable.
- [x] Token/quota amplification is measured where host telemetry exists; missing telemetry is explicitly recorded.
- [x] Review duration and TTTM components are recorded where observable.
- [x] Retry count and correction depth are recorded.
- [x] Selected model and reasoning effort are recorded when exposed; otherwise `UNAVAILABLE`.
- [x] Context radius/size is recorded when exposed.
- [x] B-001 amendment approved: frozen-V1 analysis-event source absence is authoritative, Duplicate Analysis Rate remains `UNAVAILABLE` at `0/0`, and no synthetic denominator is permitted.
- [ ] V2 structured analysis-event emission and deterministic non-zero-denominator rate proof must be satisfied at the relevant V2 comparison gate; this is a carried-forward V2 obligation, not a blocker to closing the frozen-V1 baseline after final HEDS approval.
- [x] First Pass Approval Rate is calculated for the sample set.
- [x] Baseline report contains no unsupported optimization target.
- [x] Evidence Bundle contains base/head SHA, collection procedure, raw evidence references, derived metrics, limitations and risks.
- [x] HEDS audit returned APPROVED on exact head `8f585caf15c2a3ccd217439bd989a1ba9309d8be` before trusted merge.

## Tests / verification

- Validate baseline dataset/schema deterministically.
- Re-run derived metric calculation from raw evidence and verify identical output.
- Verify all sample workload identities and fingerprints are stable.
- Verify no tracked V1 file changed.
- Verify no V2 runtime behavior change is included in the PR.
- Run existing repository CI gates applicable to documentation/tooling changes.
- Independent HEDS audit against this amended Work Order, checkpoint, benchmark plan and DoD.

## Deliverables

- `.engineering/reports/UADS2-WO-001-BASELINE-REPORT.md`
- `.engineering/reports/UADS2-WO-001-BASELINE-DATA.json`
- `.engineering/reports/UADS2-WO-001-MEASUREMENT-METHOD.md`
- `.engineering/reports/EVIDENCE-UADS2-WO-001.md`
- `.engineering/checkpoints/CHECKPOINT-DELTA-UADS2-WO-001.md`
- `.engineering/evidence/UADS2-WO-001/blocker-resolution/owner-amendment-decision.json`
- PR containing only the bounded baseline/evidence increment.

## Review format

HEDS delta-first review. Verdict must be exactly one of `APPROVED`, `CORRECTION REQUIRED`, or `BLOCKED`, with findings tied to Work Order acceptance criteria and evidence.

## Stop conditions

- Context becomes stale because checkpoint, Scope, DoD, Architecture or an accepted relevant ADR changes.
- Frozen V1 lineage cannot be reproduced or validated.
- Measurement procedure alters the behavior being measured in a material way.
- Unsupported telemetry or a fabricated historical denominator is introduced.
- Scope expands into V2 runtime implementation before baseline approval.
- Any unresolved HIGH/CRITICAL defect invalidates the sampled baseline.

## Autonomy boundary

- Safe autonomous actions: inspect repositories, create bounded instrumentation/collection artifacts outside V1 canonical source, run non-destructive validations, collect evidence, calculate metrics, update this branch/PR.
- Requires maintainer/owner action: destructive repository administration or external permission changes not exposed to the executor.

## Review and delivery

- Independent reviewer: `HEDS`
- PR title: `baseline(UADS2-WO-001): reproduce V1 operational fan-out baseline`
- Evidence Bundle: `.engineering/reports/EVIDENCE-UADS2-WO-001.md`
- Checkpoint Delta: `.engineering/checkpoints/CHECKPOINT-DELTA-UADS2-WO-001.md`


## Completion record

- Final HEDS verdict: `APPROVED`
- Approved exact head: `8f585caf15c2a3ccd217439bd989a1ba9309d8be`
- Mandatory exact-head gates: CI SUCCESS; CodeQL SUCCESS; Dependency Review SUCCESS; UADS Cross-Platform Compatibility SUCCESS.
- Unresolved review threads: 0.
- PR #17 merged to `main` as `6ec3a4c025532ceafb67df79f07daf1b7c7042ad`.
- Issue #16 closed as completed.
- B-001 amendment: owner-approved and effective.
- Carried-forward obligation: V2 structured analysis events and deterministic Duplicate Analysis Rate proof at the relevant V2 comparison gate.
- Next step: bounded planning Work Order before runtime implementation.
