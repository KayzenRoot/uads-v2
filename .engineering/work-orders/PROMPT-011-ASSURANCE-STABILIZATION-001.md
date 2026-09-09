# Work Order — `PROMPT-011-ASSURANCE-STABILIZATION-001`

Status: `COMPLETED; CORRECTION_06_APPROVED_FOR_MERGE`
Repository: `KayzenRoot/uads`
Branch: `fix/prompt-011-promotion-closeout`
Baseline Git SHA: `d5cb361274cb19f70c8bd02dd023b596b8babf13`
Implementation/source Git SHA: `a23903d0f8f137121eab7a1d631b294eba8e5946`
Evidence-recording commits are tracked separately and are not treated as implementation identity.
Scope class: `cross-cutting`
Risk: `HIGH`
Correction 06 risk: `LOW / EVIDENCE-SENSITIVE`

## Objective

Harden assurance integrity, add deterministic assurance and adversarial fault-injection evaluations, prove bounded Linux/Windows compatibility, and remove the explicitly identified release-documentation drift required for UADS v0.11.0 readiness without introducing provider calls, project-local runtime state, or Prompt 012 scope.

### Correction 04 amendment — release security proof

Close the remaining release-authorization gap by making CodeQL, Scorecard, and Dependency Review authoritative typed proofs for corrected-release PASS. Preserve the already-published v0.11.0 evidence and release exactly, prepare the 0.11.1 contract without publishing or tagging it here, and record successful v0.11.0 promotion without rewriting the historical pre-promotion record.

### Correction 05 amendment — event/PR binding and post-main readiness

Close the independent review findings for the existing PR #14 by binding Scorecard proofs to `push` on `main`, binding same-tree Dependency Review to one exact merged/source PR and its run metadata, rejecting distinct authoritative run IDs as ambiguous, and adding bounded readiness polling before canonical post-main Direct Review publication. Keep the proof contract fail-closed, preserve the immutable v0.11.0 record, and do not publish or tag v0.11.1.

### Correction 06 amendment — promotion closeout

Close the documentation/evidence drift after the successful v0.11.1 promotion. Synchronize the existing Checkpoint, Evidence Bundle, Work Order, and `CHANGELOG.md` to the already-proven exact main SHA/tree, post-main proof runs, release/tag identity, and immutable asset snapshot. Update only the live v0.11.1 release description to remove the stale unpublished statement and record RG1-RG22 completion. Do not change runtime code, schemas, workflows, tests, dependencies, versions, release artifacts, tags, attestations, or begin Prompt 012.

### Correction 07 amendment — Dependency Review Coverage Alignment

Resolve the post-merge Direct Review readiness failure discovered after PR #15 by making Dependency Review run for every `pull_request` targeting `main`, including documentation-only changes. Start from main SHA `25bba5a623b15a2274c438837463af5025a93d73` / tree `8cdfa463bb79d91cac5a00a4e86ebd317e6e83be` on a new branch `fix/prompt-011-dependency-review-coverage` and open a new PR; PR #15 is merged and must not be reused or rewritten. Preserve the existing Dependency Review action pin, least-privilege permissions, `fail-on-severity: high`, and all fail-closed security-proof and identity-binding semantics. Add focused RG23-RG25 coverage for trigger alignment, missing-proof non-authorization, and valid exact-source-PR same-tree proof. No merge is authorized before an independent audit; Prompt 012, release/tag/asset changes, version changes, dependency changes, and any proof-policy relaxation remain out of scope.

Post-approval status delta: external audit comment `5554112346` approved PR #16 at the historical audited head `7ce3813df78e1f4de40051544b7820eda5f513d0` / tree `ec1af458e097264a9a58adf4337e44369279eeb9`. Correction 07 is now `APPROVED_FOR_MERGE`; the bounded canonical status delta, protected squash merge, and external post-merge verification are authorized. The audited head/tree remain historical evidence only, and the final main identity and post-merge proof run IDs must be read directly from GitHub rather than persisted through a recursive closeout commit or PR.

## Included scope

- Deterministic central assurance policy and semantic revalidation at assurance record/finalize seams.
- Exact recognized reviewer roles, role-to-gate separation, current-digest/evidence binding, finding coherence, and session independence.
- Bounded privacy-safe assurance packet fields and compatible review-record reason codes.
- AS1-AS22 assurance evals and normative FI1-FI16 deterministic fault-injection evals using real subsystem boundaries and isolated temporary fixtures; legacy coverage is retained as FI17-FI32.
- Linux/Windows Node 20 compatibility job family for release-critical CLI, install, adapter-root, ZPF, and review/privacy checks.
- CI receipt, GitHub Direct Review, release validation, and release-title bindings for the new gates.
- Required README, quality/security/performance/DoD/backlog/Direct Review documentation updates and the 0.11.0 changelog entry after validation.
- Coherent version metadata and release artifacts only after all local and exact-SHA external gates are proven.
- Typed 0.9.0 security proofs: exact-SHA CodeQL/Scorecard and exact-SHA or same-tree PR Dependency Review, with repository, final/source SHA/tree, run/attempt, PR, URL, and digest binding.
- Independent security-proof reconstruction in Direct Review, release verification/build/publish barriers, and final release-review validation; no v0.11.0 mutation and no v0.11.1 publication in this correction.
- RG1-RG14 adversarial coverage for failed/unknown/ambiguous/mismatched/tampered security evidence and historical immutability.
- Correction 05 event/ref and exact PR/run binding, deterministic candidate selection, bounded readiness, and RG15-RG22 adversarial coverage.
- Correction 06 canonical documentation/evidence closeout and truthful public v0.11.1 release notes, with historical pre-promotion evidence retained as historical.
- Correction 07 workflow coverage alignment and focused RG23-RG25 regression coverage, with the historical post-merge Direct Review timeout retained as evidence and no change to the corrected-release authorization contract.

## Explicitly out of scope

- Prompt 012 or v1.0 closure.
- Provider API clients, model-invocation gateway, dashboard/control plane, marketplace, enterprise policy server, deep UGAS integration, deployment automation, wallet custody, or financial execution.
- macOS as a required release platform.
- Arbitrary external commands for probing reviewers or runtimes.
- Dependency upgrades, migrations, broad cleanup, historical tag movement, or branch-protection changes beyond the bounded Correction 03 solo-maintainer governance adjustment. That adjustment may change only the impossible approval/code-owner requirements after a documented pre-flight proves that one eligible maintainer owns the repository; all other branch protections remain unchanged.
- Publishing a misleading release when exact-SHA Linux/Windows, Direct Review, CodeQL, Scorecard, or release evidence is unavailable.

## Dependencies and assumptions

- Prompt 010 baseline is represented by main SHA `0936f818ba8dc938b1b2ad41ffab0450c8fb30eb`; this worktree also contains the approved governed-delivery adoption at `2cd8fde252737f31a24cd5b13ed766675fd40d3f`.
- Node.js 20 and npm are available locally and in GitHub Actions.
- GitHub Actions, CodeQL, Scorecard, and Direct Review results must be observed from exact SHA; no result may be fabricated.
- Independent technical audit and exact-SHA evidence remain required before promotion; the implementer cannot self-approve, fabricate a GitHub APPROVE, or promote canonical truth.

## Acceptance criteria

- [x] Central assurance policy exists with stable reason codes and exact role/gate semantics.
- [x] APPROVED with HIGH/CRITICAL findings, stale/corrupt/mismatched evidence, current FAIL/BLOCKED evidence, cross-role approval, duplicate-session counterfeit, and implementer self-approval all fail closed.
- [x] Finalize independently revalidates current assurance and specialist-selection identity.
- [x] Privacy-safe bounded assurance packet is persisted sidecar-first.
- [x] `npm run eval:assurance` passes AS1-AS22, including typed-obligation and findings-file path-safety cases.
- [x] `npm run eval:fault-injection` passes normative FI1-FI16 and retained legacy FI17-FI32; each normative case exercises a real subsystem boundary and proves blocking/stop behavior.
- [x] All legacy tests/evals and validation counts remain green or are increased with a documented reason.
- [x] C1 typed assurance evidence binds to the canonical Specialist Selection Plan; arbitrary prose and caller booleans cannot satisfy assurance.
- [x] C2 normative FI meanings and real-boundary fixtures are recorded and mapped to FI1-FI16.
- [x] C3 compatibility evidence requires event-aware exact SHA/tree/run/attempt/job/platform/artifact identity, Node 20, fixed checks, and digest validation.
- [x] C4 `--findings-file` accepts only bounded ordinary JSON files under managed repository/sidecar roots and rejects traversal, symlink escape, foreign roots, invalid JSON, and oversize input without leaking paths.
- [x] C5 Dependency Graph is enabled and Dependency Review is green on exact SHA `4061946f301ff5b7ce5d3f0ddc231ab1a87cce09`: workflow run `33930026983`, attempt `2`, job `101229407580`, conclusion `success`. Attempt 1 is retained only as historical failure evidence: the graph was disabled, then enabled and successfully rerun.
- [x] README release drift and release-title single source are corrected without a manual-version trap.
- [x] v0.11.0 promotion completed on the audited exact SHA; the release/tag/assets remain immutable.
- [x] Corrected v0.11.1 semantics require all three reconstructable security proofs for final PASS.
- [x] RG1-RG14 regression tests cover failure, unknown, exact-SHA, same-tree PR, mismatch, ambiguity, tampering, all-pass, and v0.11.0 immutability cases.
- [x] Correction 05 binds Scorecard to push/main, binds same-tree Dependency Review to the exact merged/source PR and run metadata, rejects distinct authoritative run IDs, and adds bounded readiness handling.
- [x] RG15-RG22 cover non-push Scorecard, cross-PR reuse, ambiguous source PRs/runs, and pending-to-success/timeout readiness.
- [x] Correction 05 PR #14 final hosted Foundation, CodeQL, Linux/Windows compatibility, and Dependency Review checks passed on the final pre-record head `c4a3398a0eef1fe73f6f6e79879afd3ce7649cb2`, all attempt `1`; this remains historical pre-promotion evidence.
- [x] Independent maintainer review/merge plus fresh post-main Scorecard and Direct Review evidence are satisfied by merged PR #14 and runs `33969035984` / `33969337749`; Dependency Review is bound by same-tree PR #14 run `33967128218`, compatibility by run `33969242069`, and publication by release run `33969445797`.
- [x] Prompt 011 / v0.11.1 promotion is complete at main `db904219a691dea9509f04ff44ac9e8dff5563fa` / tree `0a4ef8e7e8354d4a90d8fc3db6fe19d70734c42f`; canonical records and public release notes are synchronized by Correction 06, and this closeout delta is independently `APPROVED_FOR_MERGE` under PR #15 comment `5553489182`.
- [ ] Correction 07 workflow coverage runs on every `pull_request` targeting `main`, and RG23-RG25 pass on the new PR head.
- [ ] Correction 07 new PR Foundation, CodeQL, Dependency Review, and Linux/Windows compatibility checks pass on the exact current head; independent audit remains required before merge.

## Required gates and evidence

- Gates: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, all legacy evals, `npm run eval:assurance`, `npm run eval:fault-injection`, `npm run validate:skills`, `npm run validate`, `npm audit --audit-level=high`, `npm pack --dry-run`, C1-C4 local checks, exact-SHA Linux/Windows compatibility artifacts, CodeQL, Scorecard, Direct Review, and release validation. Dependency Review must not remain red at merge/release time.
- Evidence: bounded command outputs, focused tests, privacy assertions, exact-SHA CI/compatibility receipts, Direct Review evidence, release manifest/checksums/SBOM, and an independent review.
- Correction 05 evidence additionally requires proof event/ref fields, exact merged/source PR and run binding, explicit uniqueness/ambiguity reason codes, bounded readiness evidence, and proof digests to agree across canonical Direct Review, review index, release builder, publisher, and final derivative. Scorecard must be observed only from its push-to-main workflow.
- Correction 07 evidence additionally records the historical post-merge Direct Review failure `33981776649` / job `101348158721` (`SECURITY_PROOF_READINESS_TIMEOUT` after 12 bounded attempts), the path-filter root cause, the coverage-only workflow fix, RG23-RG25, and audit-time authority for the new PR head/tree/checks. No current PR head is persisted self-referentially in the canonical record.

## Stop conditions

- Any v0.10.4 invariant or prior eval count regresses without a justified replacement.
- Assurance can approve unresolved HIGH/CRITICAL findings, current FAIL/BLOCKED evidence is bypassed, reviewer independence weakens, or security/performance/reliability roles cross-satisfy.
- Any FI case fails to block, ZPF/privacy is violated, secrets/absolute paths enter durable evidence, provider/network behavior is introduced, historical tags would move, or a destructive external action is required.
- Exact-SHA Linux/Windows compatibility or required GitHub evidence is missing or red; any required GitHub gate is missing or red; or C1-C4 evidence identity cannot be independently reconstructed.
- Any corrected-release security proof is missing, unknown, failed, ambiguous, source/tree mismatched, event/ref or PR/run mismatched, digest-tampered, or inferred from a non-push Scorecard result.
- Correction 07 Dependency Review does not trigger for a documentation-only PR, any required new-PR check is missing/red/ambiguous, or the workflow/test change weakens proof authorization or changes immutable release identity.

## Autonomy boundary

- Safe autonomous actions: inspect, create the bounded closeout branch and records, edit only the in-scope documentation/evidence files, prepare and update the truthful v0.11.1 release description after branch durability, run isolated local validation, commit, push the focused branch, and open/update a review request.
- Requires maintainer/owner action before approval: independent audit, restoration of multi-maintainer review requirements when a second eligible maintainer exists, and any later increment. After the independent `APPROVED` recorded on PR #15 comment `5553489182`, this post-approval instruction authorizes the executor to perform the normal protected squash merge and post-merge verification; the executor does not alter immutable release identity/assets or start Prompt 012.
- Correction 07 overrides the prior post-approval merge instruction for this new increment: the new PR must remain unmerged until an independent audit records `APPROVED`; after that approval, post-merge Direct Review verification is required before Prompt 011 can close.
- Correction 07 approval is now recorded under external audit comment `5554112346`; protected squash merge is authorized only after the status delta's own hosted checks pass. Direct Review post-merge PASS remains a mandatory condition and Prompt 011 must not be marked finally closed by the executor.

## Review and delivery

- Independent technical audit: recorded on PR #12 as comment/review evidence `5119401125`; GitHub human APPROVE is intentionally not required in current solo-maintainer mode.
- Historical PR #12 title: `feat: harden assurance and adversarial stabilization` (promotion completed and retained as history).
- Correction 04/05 PR title: `fix: bind release authorization to security proof` (PR #14, merged to the exact reviewed tree)
- Correction 06 PR title: `docs: close Prompt 011 v0.11.1 promotion record` (focused closeout branch; independent audit approved for protected merge)
- Correction 06 PR: `#15`; historical snapshots are the initial pushed snapshot `bbfdc209d692e65b9e79526a09b319a35bcb06de` / tree `dc45fced1ec7bccaea7fc001c276755deb8b16dc`, the previous evidence snapshot `6e3e914b0cd029ec7b11557af831b754831d55a9` / tree `e83f43fbafd089a51de089d2efdc0aee8d6ebc36`, and the pre-delta auditor-observed snapshot `a9ce41109634341f59892b3920e584d942681417` / tree `5ca446fe20e28de7ecb964f5a25894e20f9c8aaa`. Independent audit comment `5553489182` records `APPROVED` for historical audited target head `973e208882feaf3fd9fd7e1ae619c552412fefc6` / tree `540837bdd2bdef5e8a346a2f28b796d01e0e946a`. Foundation `33975382568`, CodeQL `33975382597`, and compatibility `33975382584` are historical checks for the previous evidence snapshot and passed on attempt `1`. For closeout review, the authoritative current PR head/tree and hosted checks must be read directly from GitHub by the auditor at audit time; they are intentionally not persisted as a self-referential PR identity inside the same PR. Dependency Review was not triggered for this documentation-only diff, and the promotion Dependency Review proof remains PR #14 same-tree run `33967128218`.
- Evidence Bundle: `.engineering/reports/EVIDENCE-BUNDLE-PROMPT-011-ASSURANCE-STABILIZATION-001.md`
- Checkpoint Delta: `.engineering/checkpoints/CHECKPOINT-DELTA-PROMPT-011-ASSURANCE-STABILIZATION-001.md`
