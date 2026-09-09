# Work Order — UADS2-BOOTSTRAP-001

Status: READY_FOR_REVIEW  
Repository: KayzenRoot/uads-v2  
Branch: bootstrap/uads2-foundation-001  
Initial target-main SHA: f08189ada12b65d9e8fcc9e6e70233619998dbd3  
Frozen source repository: KayzenRoot/uads  
Frozen source SHA: 312e32946798eb3abbb49a79af08e13efb7719dc  
Risk: STANDARD

## OBJECTIVE

Establish UADS V2 as a controlled, auditable continuation of UADS V1; preserve the complete V1 tracked tree unchanged; add the V2 Source Pack, accepted initial architectural decisions, Hive/HEDS review compatibility, backlog/issues and bootstrap evidence; deliver through a reviewable PR without changing UADS V1 or implementing V2 runtime behavior.

## CONTEXT

UADS V1 is already in active use. The V2 repository was intentionally created separately. V2 development must use the existing UADS V1 engineering runtime/process while preserving V1 as an independent line.

The user explicitly identified four V1 behavior targets: excessive review agent fan-out, one visible chat per worker, duplicated review analysis and oversized model/reasoning effort.

Hive V2 Review Standard v2/HEDS is the requested delivery model for this project.

## SCOPE

- freeze and record V1 source identity;
- import all 489 V1 tracked files byte-for-byte;
- preserve inherited workflows;
- create V2 Source Pack overlay without rewriting V1 history;
- record initial accepted ADRs;
- record planning master and module classifications;
- define Hive V2/UADS V2 responsibility boundary and preliminary contracts;
- create bootstrap/bug/integration/discovery GitHub issues;
- prepare Evidence Bundle, Checkpoint Delta and PR;
- run applicable inherited hosted validation after PR creation.

## OUT OF SCOPE

- runtime bug fixes;
- implementation of any of the 26 proposed V2 modules;
- changing package version/name/release metadata;
- publishing or installing UADS V2;
- changing the UADS V1 repository;
- final Hive V2 implementation integration;
- aggressive proof-cache reuse;
- Experience/Policy learning activation;
- broad cleanup or dependency upgrades.

## FILES/SOURCES TO READ

Authority order:
1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/03-SCOPE.md`
4. `docs/v2/09-DEFINITION-OF-DONE.md`
5. `docs/v2/04-ARCHITECTURE.md`
6. `docs/v2/02-REQUIREMENTS.md`
7. inherited `docs/`, `.engineering/PROTOCOL.md`, `.engineering/DECISIONS.md`
8. Hive V2 current Review Standard/HEDS documents for integration compatibility
9. this Work Order, Context Lock and evidence.

## REQUIREMENTS

- R-UADS2-015 Evidence-first delivery.
- R-UADS2-017 Backward safety.
- Source equivalence: 489/489 inherited files, zero missing, zero blob mismatch.
- V2 planning must not be misrepresented as implemented capability.

## ARCHITECTURE RULES

- global-first/zero-project-footprint V1 runtime behavior remains inherited;
- V2 overlay does not silently overwrite V1 canonical history;
- Hive owns macro/canonical truth; UADS owns bounded execution;
- HEDS is consumed as delivery/review contract, not duplicated as a second governance engine;
- unknown capability is never true.

## CONSTRAINTS

- no force-push;
- no history rewrite;
- no destructive V1 action;
- no product runtime mutation;
- no release/tag/publication;
- no checkpoint promotion before audit;
- proof-validity reuse beyond conservative deterministic reuse remains experimental.

## ACCEPTANCE CRITERIA

- [x] Frozen V1 source SHA/tree recorded.
- [x] 489/489 V1 tracked files present with identical Git blob SHA.
- [x] V1 repository unchanged by bootstrap.
- [x] V2 Source Pack overlay created.
- [x] Initial V2 ADRs and decisions ledger created.
- [x] Four known bugs recorded as GitHub issues.
- [x] Hive/UADS integration issue and module-discovery issue recorded.
- [ ] PR opened against main.
- [ ] Applicable PR-head hosted checks complete.
- [ ] Evidence Bundle updated with exact PR base/head and check results.
- [ ] Independent audit produces APPROVED.
- [ ] Only then may Checkpoint Delta be promoted/merged.

## TESTS

Bootstrap verification:
- source/target recursive Git tree reconciliation;
- every inherited source path present;
- every inherited Git blob SHA equal;
- inherited GitHub Actions workflows restored exactly;
- hosted Foundation/CI;
- CodeQL;
- Dependency Review;
- compatibility workflows;
- engineering protocol validation;
- lint/typecheck/build/test as invoked by inherited CI;
- review evidence/direct-review checks when applicable.

## DELIVERABLES

- exact V1 snapshot in UADS V2 branch;
- V2 Source Pack and planning master;
- ADRs/Decisions Ledger;
- GitHub issues;
- Context Lock;
- Baseline;
- Evidence Bundle;
- Checkpoint Delta;
- PR and review record.

## REVIEW FORMAT

Use UADS V2 Review Protocol:
Context Lock → Preflight → Change Impact → Selected Verification → Evidence Bundle → Audit → one verdict: APPROVED / CORRECTION REQUIRED / BLOCKED.

User-facing review is PT-BR and includes verdict, evidence, defects/corrections, PR/merge state, risk, progress snapshot and next necessary step.

## STOP CONDITION

Stop without merge or next implementation Work Order if:
- any inherited file is missing/mismatched;
- required CI/evidence fails or is ambiguous;
- Context Lock becomes stale without relock;
- bootstrap expands into product behavior;
- a HIGH/CRITICAL defect is known;
- Hive/UADS responsibility conflict cannot be resolved;
- independent audit is not APPROVED.
