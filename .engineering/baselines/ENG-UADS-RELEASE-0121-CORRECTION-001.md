# Baseline - `ENG-UADS-RELEASE-0121-CORRECTION-001`

Status: `COMPLETE`
Repository: `KayzenRoot/uads`
Baseline Git SHA: `da05b3ecdeec5febf3ffdfd65c008ea311ccb8b3`
Baseline tree: `8a62c6f4cb6f765ecaa89a18de8a8ad5884fcd0e`
Branch: `fix/eng-uads-release-0121-correction-001`

## Baseline identity

- `main` and `origin/main` matched the exact Context Lock before branch
  creation.
- PR #21 is merged into the baseline main.
- The final release-ready audit is PR #21 comment `5577648629`.
- The correction audit is PR #21 comment `5582933499`.
- Failed Release workflow `34177150747` / job `101908720321` failed only at
  publication because `releaseTitle("0.12.0")` received no changelog.
- The existing annotated `v0.12.0` tag object is
  `82c99cb84097c11634c1b713c8370df2144d6e60`, peeled to the baseline commit.
- GitHub Release `v0.12.0` is absent and must remain absent in this Work Order.

## Allowed correction delta

- Pass the authoritative changelog section to generic release-title derivation.
- Add release-title regression tests, including the exact `0.12.0` failure
  pattern and fail-closed malformed-source cases.
- Bump only the root version metadata to `0.12.1`.
- Add the corrective `0.12.1` changelog entry.
- Add matching governance and evidence records.

## Forbidden changes

- No tag move/delete/recreation, force-push, GitHub Release creation, asset
  repair, or release workflow dispatch.
- No dependency graph, runtime, schema, workflow, provider, or product-scope
  changes.
- No mutation of `v0.11.1` or earlier historical releases.

## Baseline conclusion

The smallest safe correction is a publisher-boundary fix plus regression
coverage and a patch-version metadata increment. The immutable partial
`v0.12.0` publication remains historical evidence, not a release to repair.
