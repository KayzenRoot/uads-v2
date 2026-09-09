# Checkpoint Delta — `ENG-PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001`

Status: `ACCEPTED`
Canonical promotion: `PROMOTED`
Work Order identity: `ENG-PROMPT-012-HOST-EXECUTION-IMPLEMENTATION-001`

## Lifecycle transition

- Before: `Prompt 012 scope freeze accepted on main c8ce23e; implementation not started`
- After approved: `bounded Host Execution/Receipt implementation accepted and promoted for protected merge on the exact feature branch; post-merge verification pending`

## Completed steps

- Revalidated the parent scope-freeze SHA/tree and created the exact
  implementation branch from `origin/main`.
- Added the closed Host Execution Receipt schema, global sidecar paths, common
  adapter API, handoff seam, receipt state machine, CLI surface, and focused
  HEB01–HEB20 coverage.
- Applied Correction 01: receipt mutations now reconstruct current dispatch
  authority before writing, and approval-gated Work Orders fail closed with
  `APPROVAL_AUTHORIZATION_MISSING` when no durable exact-identity proof exists.
- Added HEB21–HEB27 coverage for execution/orchestration/host/bundle drift,
  unchanged transition continuity, approval rejection, and completed-receipt
  non-substitution.
- Applied Correction 02: the planner now preserves the global
  `requiresApproval` policy catalog while deriving the fixed-vocabulary
  `activeApprovalGatedActions` projection for the current requested work.
  Active classification is bound into Work Order and Host Dispatch identity;
  only a non-empty active projection blocks handoff with
  `APPROVAL_AUTHORIZATION_MISSING`.
- Removed the fixture behavior that rewrote `requiresApproval` to an empty
  array and added HEB28–HEB44 coverage for safe handoff, each active gated
  class, classification tamper, caller-boolean bypass attempts, caller-prose
  rejection, lifecycle compatibility, ambiguous sensitive intent, and
  promotion-to-production classification, and requested-artifact binding.
  Host Dispatch recomputes the active projection from all persisted canonical
  Work Order action signals.
- Applied Correction 03: the active approval corpus now includes persisted
  `constraints` and `acceptanceCriteria`, and `constraints` participates in
  the existing Work Order routing digest. Host Dispatch requires persisted
  constraints and fails closed for legacy Work Orders that lack them instead
  of treating absence as `[]` or evidence of safety.
- Added HEB45–HEB52 coverage for constraints-only and acceptance-criteria-only
  package publication, constraints-only production deployment, post-prepare
  approval-classification drift, legacy missing constraints, benign
  constraints, caller authorization bypass, and completed-receipt
  non-substitution.
- Preserved provider neutrality, global-first/ZPF behavior, existing gate and
  assurance authority, release immutability, and Architecture Freeze v0.2.
- Recorded passing local implementation evidence in the linked Evidence Bundle;
  exact source-head hosted checks and independent audit are approved by PR #19
  comment `5572564086`; the single bounded promotion delta is authorized.

## Post-approval promotion

- External audit comment `5572564086` records `APPROVED` for source head
  `6087d29380c456ba2f44551c7f9388e8b4439b7f` / tree
  `1e5d0d2326a69cf38d112775aae12bf921c5c7bf` against base
  `c8ce23e7797ff158772128fc8ed97ffbab056b4f`.
- Foundation `34133880887` / job `101780177395`, CodeQL
  `34133880910` / job `101780177650`, Dependency Review
  `34133880987` / job `101780177243`, and Compatibility
  `34133881041` jobs `101780177946` and `101780178026` passed on the exact
  approved source head.
- Work Order and Evidence Bundle are promoted for one governance/evidence-only
  status delta. Fresh checks must run on that new promotion head before the
  protected squash merge; post-merge identities are read directly from GitHub.

## Open items

- Push the single bounded promotion commit to the existing PR #19 branch and
  rerun the exact-head hosted checks.
- Protected squash merge PR #19 through the normal branch-protection flow only
  after every required check passes.
- Read the resulting main SHA/tree and all post-merge proof runs directly from
  GitHub; no recursive closeout commit is permitted.
- Complete the independent final post-merge audit before marking Prompt 012
  closed or starting a future capability.

## Safety statement

This delta authorizes only the bounded governance/evidence promotion state,
fresh exact-head checks, protected squash merge, and read-only post-merge
verification described by external audit comment `5572564086`. It does not
authorize provider invocation, arbitrary command execution, implementation or
schema/test changes, version/release/tag mutation, or any broader capability.
Prompt 012 remains open until the required post-merge audit is complete.
