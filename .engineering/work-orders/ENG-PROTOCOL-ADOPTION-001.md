# Work Order — `ENG-PROTOCOL-ADOPTION-001`

Status: `READY_FOR_REVIEW`
Repository: `KayzenRoot/uads`
Branch: `chore/eng-protocol-adoption-001`
Baseline Git SHA: `0936f818ba8dc938b1b2ad41ffab0450c8fb30eb`
Head Git SHA at local validation snapshot: `84bfb02aba6953c704cec575e6d0e9d9f7ba0fb8`
Final PR head: `see pull request head`
Scope class: `cross-cutting`
Risk: `MEDIUM`

## Objective

Adopt a bounded, evidence-backed engineering delivery protocol in the existing UADS repository by recording a reproducible baseline, adding static governance contracts/templates, integrating executor and PR/issue instructions, validating the artifacts in the existing Foundation CI job, and producing a non-destructive cleanup inventory.

## Included scope

- `.engineering/` static protocol, schemas, templates, adoption records, decisions ledger, reports, and proposed checkpoint delta.
- `.cursorrules`, `GOVERNANCE.md`, and `CONTRIBUTING.md` additive protocol integration.
- `.github/pull_request_template.md` additive protocol fields.
- `.github/ISSUE_TEMPLATE/bug.yml` additive evidence/governance fields.
- `.github/ISSUE_TEMPLATE/implementation.yml` bounded implementation intake.
- `scripts/validate/validate-engineering-protocol.mjs` and the `validate:engineering` package command.
- Existing `scripts/validate/validate-foundation.mjs` and `.github/workflows/ci.yml` integration of the new artifact validation.
- `docs/07-QUALITY-GATES.md` additive declaration of the protocol-artifact gate.
- `README.md` layout discoverability for static `.engineering/` governance records.
- Baseline/after gate comparison, GitHub configuration inspection, and cleanup inventory.

## Explicitly out of scope

- Product behavior, runtime TypeScript modules, public CLI contracts, migrations, endpoints, jobs, callbacks, feature flags, or deployment behavior.
- Dependency/framework upgrades, architecture rewrite, renaming-only cleanup, or broad refactoring.
- Deleting any production file, dependency, configuration, test helper, fixture, documentation, or generated artifact based only on suspicion.
- Moving UADS runtime checkpoints, work orders, indexes, evidence, or reviews from the global sidecar into the repository.
- Changing branch protection, required-check names, action pins, release policy, or security workflow semantics.
- Publishing a release or promoting the proposed checkpoint to canonical truth.

## Dependencies and assumptions

- Existing canonical documents under `docs/`, `GOVERNANCE.md`, and `CONTRIBUTING.md` remain authoritative for product architecture and gates.
- GitHub repository access is available for read-only audit and normal branch/PR delivery.
- A separate integration/E2E command is not configured in `package.json`; this is recorded as `NOT_CONFIGURED` rather than treated as PASS.
- No repository decision ledger or active UADS checkpoint was present at baseline; both are represented as `UNKNOWN` until this adoption creates the static ledger and proposal records.

## Acceptance criteria

- [x] Baseline exact SHA and pre-existing validation outcomes are recorded in the baseline report.
- [x] Protocol, source hierarchy, stale-context rule, stop conditions, privacy rules, and cleanup classifications are documented.
- [x] Work Order, Context Lock, Evidence Bundle, Correction Delta, Checkpoint Delta, and Report contracts/templates exist.
- [x] This adoption has one shared identity across branch and all records.
- [x] Existing canonical docs and executor rules are preserved and integrated additively.
- [x] PR and implementation/defect issue governance is compatible with existing GitHub templates.
- [x] Artifact validation is available as `npm run validate:engineering` and runs in the existing Foundation job.
- [x] Cleanup candidates are evidence-backed, classified, ordered by risk, and not deleted.
- [x] Post-adoption validation is no worse than baseline.
- [x] The branch is committed, pushed, and submitted for independent review.

## Required gates and evidence

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run eval:orchestrator`
- `npm run eval:execution`
- `npm run eval:context`
- `npm run eval:fault`
- `npm run eval:cost`
- `npm run eval:model-routing`
- `npm run eval:specialist-routing`
- `npm run eval:adapters`
- `npm run validate:skills`
- `npm run validate:actions`
- `npm run validate:direct-review`
- `npm run validate:ci-receipt`
- `npm run validate:engineering`
- `npm audit --audit-level=high`
- `npm pack --dry-run`
- GitHub `Foundation checks`, Direct Review, CodeQL, Scorecard, and PR review evidence when the branch is pushed.

## Stop conditions

- Baseline identity or the canonical source hierarchy cannot be proven.
- A critical source changes without an explicit stale event and relock.
- The scope expands into product behavior, destructive cleanup, migrations, dependency changes, or architecture rewrite.
- An unresolved HIGH/CRITICAL issue or unknown destructive effect prevents safe continuation.
- GitHub access needed for the requested branch/PR workflow is unavailable.
- Artifact validation or the post-adoption gate comparison regresses.

## Autonomy boundary

- Safe autonomous actions: repository inspection, static documentation/templates, bounded validator code, local gates, branch creation, commit, push, and PR creation for this Work Order.
- Requires maintainer/owner action: independent review, merge, acceptance of decisions, promotion of checkpoint/canonical truth, and any future cleanup deletion.

## Review and delivery

- PR title: `chore: adopt governed engineering delivery protocol`
- Context Lock: `.engineering/context-locks/ENG-PROTOCOL-ADOPTION-001.md`
- Baseline report: `.engineering/baselines/ENG-PROTOCOL-ADOPTION-001.md`
- Cleanup inventory: `.engineering/reports/CLEANUP-INVENTORY.md`
- Evidence Bundle: `.engineering/reports/EVIDENCE-BUNDLE-ENG-PROTOCOL-ADOPTION-001.md`
- Checkpoint Delta: `.engineering/checkpoints/CHECKPOINT-DELTA-ENG-PROTOCOL-ADOPTION-001.md`
