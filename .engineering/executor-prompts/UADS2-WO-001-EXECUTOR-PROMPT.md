# UADS2-WO-001 — Executor Prompt

## ROLE
Act as the bounded executor for Work Order `UADS2-WO-001`. Execute this increment end-to-end. Do not begin any UADS V2 runtime module. The user must not need to perform Git/terminal setup manually when you can perform it safely.

## LOCAL WORKSPACE BOOTSTRAP — MANDATORY FIRST STEP
The user's intended local UADS V2 working directory is currently EMPTY. Treat this first execution as a clean-machine/empty-workspace bootstrap.

1. Inspect the current working directory before writing anything.
2. If it is truly empty (ignoring harmless OS metadata), clone `KayzenRoot/uads-v2` directly into the current directory. Do not create an unnecessary nested `uads-v2/uads-v2` path.
3. If `.git` already exists, do not clone again. Verify the repository identity and remote instead.
4. If the directory is non-empty and is not clearly the intended UADS V2 repository, STOP rather than deleting, overwriting or relocating unrelated user files.
5. Verify `origin` points to the canonical `KayzenRoot/uads-v2` repository. If the remote is missing, add it safely. If it points elsewhere, report the mismatch and only correct it when the repository identity is unambiguous and no unrelated history would be lost.
6. Fetch/prune remote refs non-destructively.
7. Checkout the existing remote Work Order branch `work/uads2-wo-001-v1-baseline`, creating a local tracking branch only if needed.
8. Pull/fast-forward to the exact remote head. Do not force reset over user work. If local modifications unexpectedly exist, preserve them and STOP with a precise report rather than discarding them.
9. Verify branch, `origin`, HEAD, working-tree cleanliness, and reachability of `origin/main` before proceeding.
10. Do not use force-push, destructive clean/reset, history rewriting, or deletion of unrelated local content.

The local checkout is an execution workspace. GitHub canonical sources and the active checkpoint remain authoritative.

## SOURCE CHECK / CONTEXT LOCK
After local bootstrap, reconcile the repository with GitHub and read in canonical order:
1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/03-SCOPE.md`
4. `docs/v2/09-DEFINITION-OF-DONE.md`
5. `docs/v2/04-ARCHITECTURE.md`
6. `docs/v2/02-REQUIREMENTS.md`
7. `docs/v2/06-TEST-BENCHMARK-PLAN.md`
8. `.engineering/PROTOCOL.md`
9. `.engineering/work-orders/UADS2-WO-001-V1-OPERATIONAL-BASELINE.md`

Use frozen UADS V1 lineage `KayzenRoot/uads@312e32946798eb3abbb49a79af08e13efb7719dc` as the behavioral reference. Do not modify V1 canonical source.

If checkpoint, Scope, DoD, Architecture, accepted relevant ADRs, branch head, or frozen V1 lineage differs materially from this Work Order, mark context `STALE`, reconcile/rebase safely, and stop if the Work Order can no longer be executed without reinterpretation.

## OBJECTIVE
Reproduce and measure representative UADS V1 operational review behavior so UADS V2 has an evidence-bound baseline before runtime implementation.

## SCOPE
Execute at least one reproducible workload for each risk class:
- LOW
- STANDARD
- ELEVATED

Prefer existing historical/reproducible UADS V1 review fixtures or bounded non-destructive representative workloads. Do not manufacture favorable results.

For every sample capture, when objectively observable:
- immutable workload/sample ID;
- risk class;
- input fingerprint;
- V1 source/ref fingerprint;
- start/end timestamps;
- final verdict;
- worker/specialist spawn count;
- maximum concurrent specialist workers;
- visible worker-conversation count;
- input/output/token or quota telemetry;
- review wall-clock and TTTM components;
- retry count;
- correction-loop depth;
- selected model;
- reasoning effort;
- context size/radius;
- cache/reuse evidence;
- defects caught before merge;
- known escaped defects supported by evidence.

Never infer hidden host telemetry. Record unavailable fields as `UNAVAILABLE`, with reason and impact.

## DUPLICATE ANALYSIS RULE
Define a deterministic, documented duplicate-analysis rule before calculating the metric. Prefer normalized structured event/signature comparison over semantic LLM judgment. Preserve the procedure so the same calculation can be replayed against V2.

## REQUIRED DELIVERABLES
Create/update only bounded evidence artifacts required by the Work Order, including:
- `.engineering/reports/UADS2-WO-001-BASELINE-REPORT.md`
- `.engineering/reports/UADS2-WO-001-BASELINE-DATA.json`
- `.engineering/reports/UADS2-WO-001-MEASUREMENT-METHOD.md`
- `.engineering/reports/EVIDENCE-UADS2-WO-001.md`
- `.engineering/checkpoints/CHECKPOINT-DELTA-UADS2-WO-001.md`

Add raw evidence under a clearly named bounded `.engineering/evidence/UADS2-WO-001/` path when needed. Do not commit secrets, credentials, private tokens, irrelevant machine data, or large generated/vendor artifacts.

If the owner-approved canonical dashboard reference image is available to the executor as an input/local file during this execution, it may be added unchanged under a clearly documented `docs/v2/ui/reference/dashboard/` path with a checksum and README identifying it as the canonical visual reference. Do not regenerate, reinterpret or alter the image. Absence of the binary image does not block this baseline Work Order.

## REQUIRED METRICS
Calculate from raw evidence, not estimates:
- Worker Spawn Count per sample;
- Maximum Concurrent Workers;
- Visible Worker Conversations;
- Review Duration;
- TTTM components available in the evidence;
- Retry Count;
- Correction Depth;
- Duplicate Analysis Rate;
- First Pass Approval Rate;
- token/quota amplification only where source telemetry makes the calculation valid.

Any denominator, formula, missing value handling, and sampling limitation must be explicit.

## VALIDATION
Before delivery:
1. deterministically validate JSON/schema/structure;
2. recompute derived metrics from raw evidence and verify identical results;
3. verify workload identities/fingerprints are stable;
4. prove no tracked file in frozen UADS V1 was changed;
5. prove no UADS V2 runtime behavior was implemented;
6. run repository unit/integration checks relevant to this change;
7. run lint, typecheck/build and existing CI-equivalent checks where applicable;
8. inspect `git diff` and `git status` for scope leakage.

## EVIDENCE BUNDLE
The Evidence Bundle must state:
- Work Order ID;
- base SHA;
- final head SHA or pre-commit candidate SHA plus final commit reference after commit;
- exact V1 frozen SHA;
- files changed;
- collection commands/procedure;
- sample inventory;
- raw evidence references and fingerprints;
- derived metrics and formulas;
- tests/checks with results;
- errors encountered and corrections made;
- limitations/UNAVAILABLE telemetry;
- risks;
- explicit proof that V1 source remained unchanged;
- explicit proof that no V2 runtime module was implemented;
- proposed Checkpoint Delta.

## GIT / PR DELIVERY
Stay on the existing branch and PR #17. Do not create a second PR. Commit using the Work Order ID, push normally, and update PR #17 with a concise execution/evidence summary. No force-push or history rewriting.

## OUT OF SCOPE
- dashboard implementation;
- M01/S00 implementation;
- sequential orchestrator implementation;
- fixes for BUG-UADS2-001 through BUG-UADS2-004;
- V1 source modifications;
- broad cleanup/refactoring;
- dependency upgrades unrelated to evidence collection;
- invented optimization targets.

ADR-UADS2-009 remains accepted but activates as an implementation priority only after this baseline gate is APPROVED.

## REVIEW FORMAT
At the end, return a Portuguese-Brazilian executor report with:
`WORK ORDER`, `BASE SHA`, `HEAD SHA`, `SAMPLES`, `METRICS`, `FILES`, `TESTS`, `EVIDENCE`, `LIMITATIONS`, `RISKS`, `CHECKPOINT DELTA`, `PR`, `STOP CONDITION`.

Do not self-promote the checkpoint and do not declare HEDS approval. The independent reviewer performs that audit.

## STOP CONDITION
Stop only when one of these is true:
1. all Work Order acceptance criteria that can be objectively satisfied are evidenced, committed, pushed to PR #17, and ready for independent HEDS audit; or
2. execution is genuinely blocked by unavailable mandatory evidence/capability, in which case document the blocker precisely and do not substitute assumptions.
