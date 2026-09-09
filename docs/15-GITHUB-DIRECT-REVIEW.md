# 15 — GitHub Direct Review Evidence

UADS records a machine-readable, sanitized proof of the exact GitHub Actions run used for a release. The proof is generated on the runner from GitHub-provided identity fields, the runner's git tree, stable step outcomes, and bounded parsers for test/evaluation/audit output.

## Two-stage CI contract

`.github/workflows/ci.yml` assigns stable IDs to every required gate. Each command streams to the GitHub log while `pipefail` and `tee` capture only bounded parser input under the runner temporary directory. `if: always()` finalization emits `uads-ci-gate-receipt.json` even when a required gate fails, and uploads the sanitized receipt as the pinned artifact:

```text
uads-ci-gate-receipt-<40-character-commit-sha>
```

The receipt is bound to the repository, `main` ref, exact SHA/tree, CI run/attempt, Foundation job and stable gate outcomes. It contains no source snapshot, `.env`, credentials, host paths, or raw logs. The retention target is 90 days. Counts are recorded only when a bounded parser proves them; otherwise the value is `null` and a `COUNT_PARSE_UNAVAILABLE:*` reason code is emitted.

The comparison contract is computed with full Git history. A normal push has a validated base SHA, head SHA, exact changed-file count, lexicographically sorted sanitized paths (bounded to 500 display entries), a SHA-256 digest of the complete path set, and `changedPathsTruncated`. A shallow or otherwise unavailable comparison cannot be represented as an unexplained null: it carries `comparisonStatus` plus a bounded `comparisonReasonCode`. An all-zero initial-push base is explicitly `not-applicable`.

`.github/workflows/compatibility.yml` runs the bounded Node 20 Linux/Windows matrix after the source CI run and publishes per-platform status artifacts. The generator receives an explicit event-aware source SHA, checks out it exactly, proves `git rev-parse HEAD` equality, records the source tree, run/attempt, job/platform and actual Node version, and emits a digest-bound fixed-check summary. `.github/workflows/direct-review.yml` is triggered with `workflow_run` after that compatibility workflow completes. Its privileged publisher locates exactly one successful source CI run for the same SHA, checks out the exact source SHA, requires exactly one receipt artifact, downloads and validates exactly one expected Linux/Windows compatibility artifact by run/artifact identity, queries the source run and Foundation job/steps, rejects mismatched or ambiguous identity, builds the proof contracts on the runner, and performs bounded readiness polling before emitting the canonical `github-direct-review-evidence.json` between the stable markers `UADS_DIRECT_REVIEW_BEGIN` and `UADS_DIRECT_REVIEW_END`. A failed source CI or missing/ambiguous compatibility proof remains explicit failure/incompleteness; it is never converted to PASS.

## Release contract

The release workflow locates exactly one successful Direct Review workflow for the final SHA and downloads its artifact by workflow/artifact identity before release validation. The release package includes the exact canonical `github-direct-review-evidence.json` and the checksummed `github-review-index.json`. After publishing, `scripts/github/finalize-direct-review-evidence.mjs` adds GitHub security-workflow, tag, release-run, asset, and identity cross-checks as `github-direct-review-evidence-final.json` with a separate `.sha256` file.

The final derivative cross-checks, when available, are required to agree:

```text
directReview.commitSha
= main branch SHA
= successful CI head SHA
= ci-binding.headSha
= tag target SHA
= release manifest commit
= validation report commit
```

The canonical evidence uses `workflow.runId` for the Direct Review workflow and `provenance.sourceRunId/sourceRunAttempt` for the source CI. The review index exposes both identities, the evidence file SHA-256, exact security statuses, release run, tag target and release asset table of contents. Missing or contradictory identity is `INCOMPLETE` or a validation failure; it is never silently converted into `PASS`. Release notes derive their Review Evidence block from the validated JSON/index, not from hand-entered counts or SHAs.

### Corrected release security proof

Starting with the corrected release semantics at v0.11.1, a `PASS` requires three typed, reconstructable proofs in both the Direct Review evidence and the review index. CodeQL must be a successful exact-SHA run. Scorecard must be a successful exact-SHA run whose reconstructed GitHub event is `push` and whose `head_branch` is `main`; scheduled, branch-protection, and PR runs cannot satisfy it. Dependency Review may be successful on that exact SHA or on exactly one merged PR into `main` whose head tree equals the final main tree. Same-tree mode independently reconstructs the merged PR and the source-commit PR association, binds the accepted run to that exact PR when run metadata is present, and records the PR number, base repository/ref, source branch, source SHA/tree, final SHA/tree, event, run ID/attempt, repository, run URL, and canonical proof digest. Distinct authoritative run IDs, ambiguous PR associations, missing bindings, failed/pending-after-timeout, mismatched, or tampered results fail closed; a higher `run_attempt` is accepted only when it belongs to the same GitHub run ID (documented rerun identity). Scorecard remains a push-to-main workflow; no PR Scorecard result is fabricated.

Correction 07 aligns workflow coverage with this unchanged proof contract: `.github/workflows/dependency-review.yml` runs for every `pull_request` targeting `main`, including documentation-only changes. Removing trigger path restrictions increases proof availability only; it does not authorize absent or unrelated proof and does not weaken CodeQL, Scorecard, exact-SHA identity, same-tree PR binding, event/ref binding, digest validation, ambiguity handling, or fail-closed behavior.

For the post-main race between compatibility and Scorecard, the Direct Review publisher uses a bounded readiness phase (12 attempts with a 5-second interval in the workflow). Pending or temporarily unavailable proof may be retried; failure, cancellation, skipping, ambiguity, event/ref mismatch, PR mismatch, and digest errors stop immediately. Exhausting the bound produces `SECURITY_PROOF_READINESS_TIMEOUT` and no canonical evidence is published. A timeout is never a `PASS`.

The historical v0.11.0 evidence and release remain governed by their original 0.8.0 contract and are immutable. v0.11.1 is the first release for which the 0.9.0 security-proof contract is authoritative and is already published immutably; Correction 07 changes only Dependency Review trigger coverage and does not create a new release or tag.

## Reviewer path

An independent reviewer can start with the final main SHA, open its exact CI run, follow the Direct Review workflow and its artifact, inspect the marker block, then follow CodeQL/Scorecard, the annotated tag, release assets and the generated Review Evidence block. A local ZIP is not required for ordinary approval when this chain is coherent. `npm run review:release -- 0.10.0` remains the deeper offline path and cross-checks the same canonical evidence. Historical tag checks are data-driven and compare every known prior tag target; tags are never moved or recreated, including v0.10.4 and earlier historical tags.
# Prompt 009 evidence additions

The exact-SHA CI receipt and canonical Direct Review evidence include the required `eval-specialist-routing`, `eval-adapters`, `eval-assurance`, and `eval-fault-injection` gates, their bounded summaries, specialist policy/catalog digests, and Linux/Windows compatibility statuses. For v0.11.0, both compatibility statuses must be successful and bound to the same commit SHA. The release review must preserve the same commit, receipt, Direct Review, release, and checksum identities. Raw registry inputs, provider data, secrets, commands, prompts, and host paths are not copied into the review artifact.
