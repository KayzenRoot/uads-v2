# Work Order — UADS2-REPO-001-C01

Status: FROZEN BEFORE IMPLEMENTATION
Parent issue: #9 — UADS2-REPO-001
Repository: `KayzenRoot/uads-v2`
Branch: `fix/uads2-repo-001-c01-scorecard-private`
Base main SHA: `5752d1ff7716027071464308eaec6e0a0aef3892`
Risk: STANDARD / SECURITY-GOVERNANCE

## OBJECTIVE

Restore truthful OpenSSF Scorecard execution on the private UADS V2 repository after the post-merge main run failed before analysis with GitHub GraphQL `Resource not accessible by integration`.

## CONTEXT

The failure occurred on OpenSSF Scorecard run `34421995799`, job `102699232525`, at the `Run Scorecard` step while resolving `ListCommits`.

Official OpenSSF guidance for private repositories documents additional read permissions for `issues`, `pull-requests`, and `checks`. UADS V2 already capability-gates CodeQL publication for the private repository.

## SCOPE

- update only `.github/workflows/scorecard.yml` runtime behavior;
- add least-privilege reads required for private-repository Scorecard queries;
- explicitly disable public Scorecard publication;
- preserve SARIF as a bounded Actions artifact;
- remove unnecessary write/OIDC permissions when publication/code-scanning upload is not used;
- add evidence/governance artifacts for this correction.

## OUT OF SCOPE

- branch-protection administration;
- GitHub Advanced Security enablement;
- PAT/secret creation;
- CodeQL workflow changes;
- Dependency Review changes;
- M03 runtime/module work;
- broad workflow cleanup;
- dependency upgrades;
- release/deployment changes.

## FILES / SOURCES TO READ

1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/03-SCOPE.md`
4. `docs/v2/09-DEFINITION-OF-DONE.md`
5. `docs/v2/04-ARCHITECTURE.md`
6. `docs/v2/05-SECURITY.md`
7. `.github/workflows/scorecard.yml`
8. Issue #9
9. Failed run `34421995799` / job `102699232525`

## REQUIREMENTS

- keep top-level `permissions: read-all`;
- job permissions may only include reads actually required by Scorecard in the private repository;
- `publish_results` must be explicit and truthful for the private-repository capability;
- no PAT is introduced automatically;
- result evidence must remain retrievable from GitHub Actions when the job succeeds;
- action dependencies remain pinned to immutable full SHAs.

## ARCHITECTURE RULES

- M29 owns supply-chain/security posture; this correction must not create a second security authority.
- Unsupported external publishing is `UNAVAILABLE`, not fabricated PASS.
- Least privilege beats convenience.
- Repository security evidence and runtime product truth remain separate.

## CONSTRAINTS

- no force push;
- no secret creation;
- no write permission unless objectively necessary;
- no new dependency;
- no change to UADS application runtime;
- same correction branch/PR until completion.

## ACCEPTANCE CRITERIA

- AC-01: Scorecard no longer fails at GraphQL ListCommits due to missing default-token reads.
- AC-02: workflow does not request `security-events: write` or `id-token: write` when public publication/code-scanning upload is disabled.
- AC-03: `publish_results: false` is explicit.
- AC-04: SARIF is uploaded as an Actions artifact with bounded retention using an already-pinned repository action.
- AC-05: standard PR CI / CodeQL / Dependency Review / Cross-Platform gates remain green.
- AC-06: after merge, the main-branch Scorecard run reaches successful analysis or a new, separately evidenced capability blocker.
- AC-07: no existing security gate is weakened.

## TESTS

- repository foundation/action-pin validation;
- YAML/workflow structure inspection through GitHub;
- exact PR hosted gates;
- post-merge OpenSSF Scorecard execution on main;
- verify artifact-upload step executes when Scorecard analysis succeeds.

## DELIVERABLES

- corrected `.github/workflows/scorecard.yml`;
- Correction/Evidence Bundle;
- PR linked to Issue #9;
- exact-head review verdict;
- post-merge Scorecard outcome recorded.

## REVIEW FORMAT

HEDS delta-first review against base SHA, failed-run evidence, official private-repository Scorecard permission contract and this Work Order.

## STOP CONDITION

STOP with CORRECTION REQUIRED/BLOCKED if the fix requires a PAT/secret, broad write permissions, GitHub Advanced Security purchase/enablement, unrelated workflow changes, weakens another security gate, or the Scorecard still cannot execute and the remaining limitation cannot be solved safely through repository code.
