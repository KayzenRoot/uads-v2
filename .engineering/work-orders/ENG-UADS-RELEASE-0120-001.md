# Work Order - ENG-UADS-RELEASE-0120-001

Status: APPROVED_FOR_PROTECTED_MERGE
Repository: KayzenRoot/uads
Branch: release/eng-uads-release-0120-001
Baseline Git SHA: 88d9bbea41522fe5cbbbf658c1e216ecc41fd063
Approved source head: a79ccd1e44723c7a4258b754c1a698bfc9ce82c7
Approved source tree: b8862a886d2fc7b5fb9825fffc6389a0b7d8beb4
Promotion and final main identities are returned externally and are not
persisted here as self-referential current/final state.
Scope class: local
Risk: HIGH

## Objective

Prepare the immutable UADS v0.12.0 release metadata in one bounded
release-preparation PR after the Prompt 012 lifecycle was independently closed.
The preparation must make the version sources consistent, curate the v0.12.0
changelog entry, preserve all runtime behavior and historical releases, and
leave publication gated on independent approval and exact-main release proof.

## Authoritative baseline and parent

- Final main SHA: 88d9bbea41522fe5cbbbf658c1e216ecc41fd063.
- Final main tree: 0bad055cc05b7cdff78f14886032b727532e6c49.
- Prompt 012 closeout parent Work Order:
  ENG-PROMPT-012-POST-MERGE-CLOSEOUT-001.
- Prompt 012 final audit: PR #20 comment 5575928265,
  APPROVED - PROMPT 012 FULLY CLOSED.
- Final Prompt 012 evidence: Foundation 34162267349,
  CodeQL 34162267332, Scorecard 34162267358, Compatibility 34162600819,
  and Direct Review 34162713301.
- Architecture Freeze: v0.2.
- Current VERSION, package.json, and package-lock root version: 0.11.1.
- Current latest release: immutable v0.11.1.

## SemVer decision

RELEASING.md is authoritative: in the pre-1.0 lifecycle, PATCH fixes a
compatible defect and MINOR adds a compatible capability. Prompt 012 delivered
a new compatible bounded Host Execution and Receipt capability. The release
target is therefore exactly 0.12.0. A 0.11.2 patch release would not describe
the increment, and v1.0.0 requires a separate product-readiness and
major-release decision.

## Included scope

- Change VERSION from 0.11.1 to 0.12.0.
- Change only the root package.json version to 0.12.0.
- Change only the top-level and packages[""] package-lock.json versions to
  0.12.0; keep dependency versions, integrity hashes, package names, engines,
  and the dependency graph unchanged.
- Move the Prompt 012 delivery from CHANGELOG [Unreleased] into
  ## [0.12.0] - 2026-09-07 with Highlights and Verification headings.
- Keep an empty CHANGELOG [Unreleased] heading at the top.
- Create the matching Work Order, Context Lock, Baseline, Checkpoint Delta,
  and Evidence Bundle for ENG-UADS-RELEASE-0120-001.
- Create one PR titled:
  chore(ENG-UADS-RELEASE-0120-001): prepare UADS v0.12.0

## Explicitly out of scope

- Any src/, schemas/, tests/, evals/, or .github/workflows/ change.
- Runtime, security-proof, release workflow, or dependency behavior changes.
- Any dependency version, integrity hash, package name, engine, or lockfile
  dependency graph change.
- Architecture Freeze v0.2 or any FUTURE feature implementation.
- Provider invocation, arbitrary host execution, durable approval proof,
  dashboards, marketplaces, deep UGAS integration, or live provider adapters.
- Any change to v0.11.1 or older changelog entries, tags, releases, or assets.
- Creating or moving a v0.12.0 tag.
- Creating a GitHub Release, uploading assets, or dispatching release workflow.
- Merging except through normal protected flow after independent audit and
  promotion-head checks.

## Dependencies and assumptions

- The locked final main identity remains unchanged before branch creation.
- Prompt 012 is complete and is the parent release input.
- Release publication remains a separate post-merge action requiring independent
  approval and exact-main CI, Direct Review, and security proof.
- Current source delivery status is APPROVED_FOR_PROTECTED_MERGE after the
  independent audit; release publication remains NOT STARTED / NOT AUTHORIZED.
- The release-preparation records do not self-authorize merge or publication.

## Acceptance criteria

- [ ] SemVer target is exactly 0.12.0 and the rationale from RELEASING.md is
      recorded.
- [ ] VERSION, package.json root version, package-lock top-level version, and
      package-lock packages[""] version all equal 0.12.0.
- [ ] CHANGELOG has an empty [Unreleased] heading and a professional
      [0.12.0] - 2026-09-07 section with Highlights and Verification.
- [ ] Highlights and Verification describe only the bounded Prompt 012
      capability and its exact-main proof boundary.
- [ ] No runtime, schema, test, eval, workflow, dependency, security-proof, or
      lockfile graph behavior changed.
- [ ] v0.11.1 and all historical releases, tags, and assets remain unchanged.
- [ ] No v0.12.0 tag or GitHub Release exists.
- [x] Required local gates pass with 49 test files, 406 tests, HEB 52/52,
      full validation, and npm audit at high severity.
- [x] Required hosted PR checks pass on the approved source head; the
      promotion head must be revalidated before protected merge.
- [x] Governance records reflect the independent approval and do not
      self-approve publication.
- [x] The release-preparation PR remains open and unmerged pending the
      promotion-head checks and protected merge.

## Required gates and evidence

- Local: git diff --check; npm ci; npm run validate:engineering;
  npm run lint; npm run typecheck; npm test;
  npm run eval:host-execution; npm run validate;
  npm audit --audit-level=high.
- Local identity: VERSION, package.json, and package-lock root values all equal
  0.12.0 after the bounded edit.
- Hosted: Foundation, CodeQL, Dependency Review, Linux Node 20, and Windows
  Node 20 on the exact release-preparation PR head.
- Historical closed-parent evidence: Prompt 012 final audit comment 5575928265,
  final main SHA/tree above, and post-main runs listed in the parent Work Order.
- Evidence Bundle:
  .engineering/reports/EVIDENCE-BUNDLE-ENG-UADS-RELEASE-0120-001.md.

## Stop conditions

- Final main SHA/tree differs from the locked baseline before branch creation.
- v0.12.0 or v1.0.0 already exists as a tag or release.
- Version sources cannot be made exactly consistent without broader changes.
- Changelog tooling requirements require product or runtime scope.
- Any forbidden file or behavior changes.
- Any required local or hosted gate fails, is missing, cancelled, or ambiguous.
- The PR is merged before independent audit.
- Any tag, release, asset upload, or release workflow dispatch is attempted.

## Autonomy boundary

- Safe autonomous actions: inspect the locked repository, make the bounded
  release metadata and governance edits, run local validation, create the
  branch/commit/PR, and collect read-only hosted evidence.
- Requires maintainer/independent-review action: acceptance of the release
  preparation, merge, tag creation, release publication, asset upload,
  workflow dispatch, or scope expansion.

## Review and delivery

- Independent reviewer: repository maintainer / independent release audit.
- PR title: chore(ENG-UADS-RELEASE-0120-001): prepare UADS v0.12.0
- Evidence Bundle:
  .engineering/reports/EVIDENCE-BUNDLE-ENG-UADS-RELEASE-0120-001.md.
- Checkpoint Delta:
  .engineering/checkpoints/CHECKPOINT-DELTA-ENG-UADS-RELEASE-0120-001.md.
- Delivery status: APPROVED_FOR_PROTECTED_MERGE; publication NOT STARTED /
  NOT AUTHORIZED.
- Do not merge, tag, publish, dispatch release workflow, or upload assets.
