# Work Order - `ENG-UADS-RELEASE-0121-CORRECTION-001`

Status: `READY_FOR_REVIEW`
Repository: `KayzenRoot/uads`
Branch: `fix/eng-uads-release-0121-correction-001`
Baseline Git SHA: `da05b3ecdeec5febf3ffdfd65c008ea311ccb8b3`
Head Git SHA: `0c9a51aeafb3c5e89beedf5732f5c6d46dbacef3`
Scope class: `local`
Risk: `HIGH`

## Objective

Correct the release publisher so valid future versions derive a deterministic
professional title from the authoritative changelog, add fail-closed
regression coverage for the title source, prepare the compatible corrective
patch `0.12.1`, and deliver an auditable PR without mutating the immutable
`v0.12.0` tag or creating a GitHub Release for it.

## Included scope

- `scripts/release/publish-release.mjs`: pass the authoritative release
  changelog section into generic title derivation.
- `tests/release-engineering.test.ts`: future-version, exact `0.12.0`, and
  missing/malformed title-source regression coverage.
- `VERSION`, root `package.json`, and root `package-lock.json`: consistent
  patch version `0.12.1`.
- `CHANGELOG.md`: dated `0.12.1` correction entry and explicit `0.12.0`
  partial-publication immutability statement.
- Matching Work Order, Context Lock, Baseline, Correction Delta, Checkpoint
  Delta, Evidence Bundle, and Portuguese executor report.

## Explicitly out of scope

- Moving, deleting, force-updating, or recreating `v0.12.0`.
- Creating or repairing a GitHub Release for `v0.12.0`.
- Publishing `0.12.1`, creating its tag, or dispatching its release workflow.
- Runtime behavior, schemas unrelated to release correction, dependencies,
  provider execution, dashboards, or new product functionality.
- Historical release/tag/asset mutation, force-push, or manual release notes.

## Dependencies and assumptions

- `main` and `origin/main` remain at the locked baseline SHA/tree.
- `v0.12.0` remains annotated object
  `82c99cb84097c11634c1b713c8370df2144d6e60` peeled to
  `da05b3ecdeec5febf3ffdfd65c008ea311ccb8b3`.
- GitHub Release `v0.12.0` remains absent.
- Failed release run `34177150747`, job `101908720321`, and correction audit
  comment `5582933499` remain the authoritative failure evidence.

## Acceptance criteria

- [x] Generic title derivation works for `0.12.1` and future valid changelog
      `Highlights` sections without a per-version map entry.
- [x] Missing, malformed, or wrong-version title sources fail closed.
- [x] Historical mapped titles and stale-title protections remain unchanged.
- [x] `VERSION`, package metadata, and root lock metadata are exactly `0.12.1`.
- [x] Changelog records the correction and preserves `[Unreleased]`.
- [x] Focused local validation passes without dependency graph changes; the
      complete equivalent Foundation validation passes on the exact PR head.
- [x] Required hosted PR-head checks pass on the implementation head.
- [x] Evidence Bundle proves base/head identities, changed files, tests,
      hosted gates, tag immutability, absent `v0.12.0` release, risks, and
      proposed Checkpoint Delta.
- [x] PR #22 remains open for independent review; no merge or publication
      occurs.

## Required gates and evidence

- Gates: `git diff --check`, `npm ci`, `npm run validate:engineering`,
  `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run eval:host-execution`, `npm run validate`,
  `npm audit --audit-level=high`, and release-title-specific tests/verification.
- Hosted: Foundation/CI, CodeQL, Dependency Review, Linux Node 20, Windows
  Node 20, and all current mandatory branch-protection checks.
- Hosted evidence: Foundation `34221385391` / job `102045063462` recorded
  49 files, 409 tests, HEB01-HEB52, and finalVerdict PASS; CodeQL
  `34221385385` / job `102045062987`; Dependency Review `34221385397` /
  job `102045062792`; Compatibility `34221385370` / jobs
  `102045063108` and `102045062831`.
- Evidence: `.engineering/reports/EVIDENCE-BUNDLE-ENG-UADS-RELEASE-0121-CORRECTION-001.md`.

## Stop conditions

- Context Lock, tag, main, or release identity diverges materially.
- `v0.12.0` GitHub Release appears unexpectedly.
- Any required gate fails or is ambiguous.
- The fix expands into runtime, dependency, tag, release, or unrelated scope.
- Independent audit, merge, or release authority is requested before this PR
  reaches the review boundary.

## Autonomy boundary

- Safe autonomous actions: inspect, make bounded edits, add tests and
  governance evidence, run local validation, create the requested branch,
  commit, push, open the PR, and collect read-only hosted checks.
- Requires maintainer/owner action: independent approval, merge, tag/release
  creation, release workflow dispatch, or any scope expansion.

## Review and delivery

- Independent reviewer: repository maintainer / independent technical audit.
- PR title: `fix(ENG-UADS-RELEASE-0121-CORRECTION-001): recover release publication safely`.
- Evidence Bundle: `.engineering/reports/EVIDENCE-BUNDLE-ENG-UADS-RELEASE-0121-CORRECTION-001.md`.
- Checkpoint Delta: `.engineering/checkpoints/CHECKPOINT-DELTA-ENG-UADS-RELEASE-0121-CORRECTION-001.md`.
