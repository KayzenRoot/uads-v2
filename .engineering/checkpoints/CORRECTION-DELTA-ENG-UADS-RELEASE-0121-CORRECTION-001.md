# Correction Delta - `ENG-UADS-RELEASE-0121-CORRECTION-001`

Status: `APPLIED`
Baseline Git SHA: `da05b3ecdeec5febf3ffdfd65c008ea311ccb8b3`

## Problem

The canonical Release workflow built and attested the `0.12.0` artifacts but
failed at publication because the publisher called `releaseTitle(version)`
without passing the authoritative changelog section. Generic future-version
title derivation therefore failed closed before `gh release create`.

## Root cause

`releaseTitle` already supports deterministic changelog-derived titles and
requires changelog evidence for versions absent from the historical title map.
`publish-release.mjs` generated the validated release notes but discarded them
when deriving the title, reproducing the failure at `dist/release/release-title.js:25`.

## Bounded changes

- `scripts/release/publish-release.mjs`: call `releaseTitle(version, notes)`.
- `tests/release-engineering.test.ts`: cover future derivation, exact
  `0.12.0` recovery, and missing/malformed sources.
- `VERSION`, `package.json`, `package-lock.json`: set root version to `0.12.1`.
- `CHANGELOG.md`: record the correction and preserve `v0.12.0` immutability.
- Matching governance/evidence files for this Work Order.

## Verification

- Focused local tests: 23/23 passed; build, lint, typecheck,
  `validate:engineering`, `npm ci`, and npm audit passed.
- Exact PR-head Foundation `34221385391` / job `102045063462`: 49 test files,
  409 tests, HEB01-HEB52, all evals, and finalVerdict PASS.
- CodeQL `34221385385`, Dependency Review `34221385397`, and Linux/Windows
  compatibility `34221385370` all passed on the exact head.
- Complete local Windows test/aggregate attempts did not conclude within the
  execution window; no failure was emitted and the hosted exact-Node-20
  Foundation result is the authoritative complete validation evidence.
- No remote tag or release mutation is part of this correction.

## Remaining risks

- The existing `v0.12.0` tag remains a partial publication state with no
  GitHub Release and requires no repair here.
- `0.12.1` remains unpublished until independent audit and maintainer merge.
