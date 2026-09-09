# Evidence Bundle — `ENG-PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001`

Status: `APPROVED_FOR_MERGE`
Repository: `KayzenRoot/uads`
Baseline Git SHA: `c8ce23e7797ff158772128fc8ed97ffbab056b4f`
Head Git SHA: `pending; authoritative PR head must be read from GitHub`
Approved source SHA/tree: `6087d29380c456ba2f44551c7f9388e8b4439b7f` / `1e5d0d2326a69cf38d112775aae12bf921c5c7bf`

## Claims

| Claim | Kind | Reference | Status | Notes |
| --- | --- | --- | --- | --- |
| Parent scope freeze is accepted and exact | `github` | main `c8ce23e7797ff158772128fc8ed97ffbab056b4f`, tree `4818ba203b241191afba43ff92ded3a6f3d2781d` | PASS | Parent implementation authorization was explicit and separate |
| Baseline validation passed | `command` | `npm run validate` | PASS | Prior implementation baseline: 49 files / 398 tests plus existing eval and protocol gates |
| Package installation is clean | `command` | `npm ci` | PASS | 0 reported vulnerabilities |
| Strict Host Execution Receipt schema exists | `file` | `schemas/host-execution-receipt.schema.json` | PASS | additionalProperties=false, closed states/reasons |
| Handoff revalidates current identities | `file` | `src/adapters/host-execution.ts`, `src/adapters/host-dispatch.ts` | PASS | bundle, orchestration, run, adapter, ownership, root, and change identities |
| Receipts are global-sidecar-only and bounded | `file` | `src/lib/workspace.ts`, `src/adapters/host-execution.ts` | PASS | atomic current/history; fixed 32-entry retention; no project writes |
| All three adapters share the contract | `test` | `tests/host-execution.test.ts` HEB15/HEB20 | PASS | Cursor, Codex, Generic Agent Skills |
| Receipt cannot authorize gates or finalize | `test` | `tests/host-execution.test.ts` HEB17 | PASS | execution evidence/review/finalize state remains unchanged |
| Focused HEB01–HEB52 suite | `test` | `npm run eval:host-execution` | PASS | 52 tests cover Correction 01/02 plus canonical constraints and acceptance-criteria approval signals, identity drift, legacy fail-closed handling, benign constraints, and receipt non-substitution |
| Full post-correction test suite | `command` | `npm test` | PASS | 49 test files, 406 tests passed after Correction 03 |
| Official post-correction foundation matrix | `command` | `npm run validate` | PASS | lint, typecheck, build, 49 test files / 406 tests, all evals, skills/actions/direct-review/CI-receipt/engineering validation passed |
| Correction 01 security diff scan | `review` | scan `9c05c447-430e-4d42-9919-0eee9704c090` | PASS | complete coverage; 0 reportable findings; TAC status unavailable in this session |
| Full implementation validation matrix | `command` | `npm run validate` | PASS | post-correction official matrix completed successfully; 49 test files / 406 tests |
| High-severity dependency audit | `command` | `npm audit --audit-level=high` | PASS | 0 vulnerabilities reported after clean `npm ci` |
| Exact hosted checks | `github` | source head `6087d29380c456ba2f44551c7f9388e8b4439b7f` | PASS | Foundation `34133880887`, CodeQL `34133880910`, Dependency Review `34133880987`, Compatibility `34133881041` all passed on the approved source head |
| Independent technical audit | `review` | PR #19 comment `5572564086` | PASS | APPROVED for the exact source head/tree and authorized one bounded promotion delta plus protected merge |
| Post-approval promotion authorization | `review` | PR #19 comment `5572564086` | PASS | Work Order/Checkpoint/Evidence promotion is governance/evidence-only; fresh promotion-head checks and post-merge verification remain required |

## Identity binding

- Work Order: `ENG-PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001`
- Branch: `feat/eng-prompt-012-host-execution-implementation-001`
- Parent scope: `ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001`
- Context Lock: `.engineering/context-locks/PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001.md`
- Baseline: `.engineering/baselines/PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001.md`
- Checkpoint Delta: `.engineering/checkpoints/CHECKPOINT-DELTA-PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001.md`
- Change summary: `Correction 01 current-identity enforcement plus Correction 02 active/ambiguous approval-intent classification and Correction 03 canonical approval-signal closure; exact PR head is authoritative from GitHub`

## Correction 01 — Current-Identity & Approval-Boundary Enforcement

- Audit comment addressed: `5559965334` on the original implementation head
  `00aab691814486fe8ee3c608a98a2c5dc10a94c8`, tree
  `acef397ce681eee2ee3ceb52a33884a0654d1669`.
- Before every mutating receipt transition, current execution-run, Work Order,
  routing, specialist, model/runtime, current-change, adapter, project, target
  root, and host ownership identity is reconstructed and compared with the
  accepted bundle; stale or conflicting state fails closed without rewriting
  the prior receipt or regenerating the bundle.
- Approval-gated Work Orders fail closed with
  `APPROVAL_AUTHORIZATION_MISSING` when no verifiable durable authorization
  proof exists. Receipts, CLI output, and prose cannot authorize the handoff;
  this architecture has no proof primitive to accept.
- Regression coverage HEB21–HEB27 passed, including current-run drift,
  orchestration identity drift, stale ownership/root, semantic bundle
  replacement, unchanged transitions, missing approval proof, and completed
  receipt non-substitution.
- This historical Correction 01 state was superseded by the approved source
  head and post-approval status delta recorded below; no source self-approval
  is implied.

## Correction 02 — Active Approval Intent Classification

- Root cause addressed: `requiresApproval` is a global policy catalog and is
  not evidence that the current handoff requests an approval-gated action.
- The planner now emits the fixed-vocabulary
  `autonomyBoundary.activeApprovalGatedActions` projection from canonical
  objective, scope, and domain/risk/destructive signals while preserving the
  non-empty catalog.
- The active projection is included in the Work Order routing digest and the
  Host Dispatch Bundle identity. Handoff and every mutating transition enforce
  the active projection and the per-task ambiguity marker, returning
  `APPROVAL_AUTHORIZATION_MISSING` without a durable exact-identity proof.
- Host Dispatch recomputes the projection from all persisted canonical Work Order
  action signals, including requested artifacts and destructive signals, rather
  than trusting persisted active fields. `approvedBoundaries`
  is not positive authorization proof; caller-supplied authorization prose,
  flags, and receipt state cannot bypass the gate.
- HEB28–HEB44 cover safe planner handoff, production deployment (including
  production database, Web3/on-chain transfer, material-cost infrastructure,
  credential rotation, Git history rewrite, package publication, tamper,
  caller-boolean bypass, caller-prose rejection, compatibility, ambiguous
  sensitive intent, promotion-to-production classification, requested-artifact
  binding, and explicit legacy-sidecar migration failure.
- The prior fixture behavior that globally cleared `requiresApproval` was
  removed. Local focused/full validation and the high-severity dependency audit
  pass on the final working tree; exact source-head hosted checks and
  independent audit are recorded as PASS below.

## Correction 03 - Canonical Approval Signal Closure

- Root cause addressed: `approvalCorpus()` omitted the persisted canonical
  `constraints` and `acceptanceCriteria` fields, so approval-gated intent
  stated only in either field could escape active classification.
- The corpus now includes objective, constraints, included scope, requested
  artifacts, acceptance criteria, domain/risk signals, and destructive signals.
  `outOfScope` remains a limit rather than positive intent, and
  `approvedBoundaries` remains excluded from authorization proof.
- `constraints` now participates in `computeWorkOrderRoutingDigest()`, binding
  constraint-derived approval classification to the existing Work Order/model
  routing identity rather than creating a parallel digest.
- Host Dispatch requires persisted `constraints` in addition to
  `requestedArtifacts` and `destructiveSignals`; legacy Work Orders missing
  the field fail closed with explicit migration handling and are never made
  safe by `?? []`.
- HEB45–HEB52 pass for constraints-only and acceptance-criteria-only package
  publication, constraints-only production deployment, post-prepare
  classification drift, missing legacy constraints, benign constraints,
  caller authorization bypass attempts, and completed-receipt substitution.
- The final full-suite count and exact source-head hosted checks are recorded
  above. Independent approval is recorded in PR #19 comment `5572564086`;
  this single bounded status delta is the authorized promotion record. No
  status-only follow-up commit is authorized.

## Post-approval promotion authorization

- External audit comment `5572564086` records `APPROVED` for source head
  `6087d29380c456ba2f44551c7f9388e8b4439b7f` / tree
  `1e5d0d2326a69cf38d112775aae12bf921c5c7bf` against base
  `c8ce23e7797ff158772128fc8ed97ffbab056b4f`.
- Foundation `34133880887` / job `101780177395`, CodeQL
  `34133880910` / job `101780177650`, Dependency Review
  `34133880987` / job `101780177243`, and Compatibility
  `34133881041` jobs `101780177946` and `101780178026` passed on that exact
  approved source head.
- This commit changes only the Work Order, Checkpoint Delta, and Evidence
  Bundle governance state. Its new post-promotion head is intentionally not
  persisted here; fresh checks and the protected merge must use GitHub's
  authoritative head.

## Privacy review

- [x] No credentials, raw tokens, private keys, customer data, raw prompts,
      model output, commands, environment dumps, or absolute host paths.
- [x] Generated/cache/vendored material and runtime sidecar state are excluded.
- [x] Receipt JSON is schema-closed and omits provider identity and output.
- [x] ZPF remains true; all operational state is under the global sidecar.
- [x] Approved source-head hosted checks and independent-review proof are
      recorded; fresh promotion-head checks remain required before merge.

## Delivery status

The implementation source is approved for one bounded promotion delta and
protected merge. Do not release or mark Prompt 012 complete before the
promotion-head checks and required post-merge independent verification pass.
