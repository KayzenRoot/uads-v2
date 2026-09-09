# Releasing UADS

UADS uses a reproducible SemVer 2.0.0 release lifecycle. The project is pre-1.0: PATCH fixes a compatible defect, MINOR adds a compatible capability, and MAJOR is reserved for the post-1.0 breaking-change policy. Pre-release identifiers use normal SemVer suffixes such as `-rc.1`. `CHANGELOG.md` is curated and authoritative; generated GitHub notes are supplementary.

## Sources of truth and invariants

For a current release, `package.json`, `VERSION`, and the root package-lock entry must contain the same version. The immutable tag is `vX.Y.Z`. A tag is never moved, force-pushed, or reused for another commit. Historical releases are explicitly marked as retrospective and use the original canonical commit; they are not rebuilt as historical binaries.

## Release gate

From a clean `main` checkout whose commit is already on `origin/main`:

```bash
npm ci
npm run validate:direct-review
npm run validate:ci-receipt
npm run release:validate -- --output tmp/release-validation-report.json --ci-binding tmp/ci-binding.json --direct-review tmp/direct-review/github-direct-review-evidence.json
npm run release:verify -- 0.8.1 --ci-binding tmp/ci-binding.json --direct-review tmp/direct-review/github-direct-review-evidence.json
npm run release:build -- 0.8.1 --output release --validation-report tmp/release-validation-report.json --ci-binding tmp/ci-binding.json --direct-review tmp/direct-review/github-direct-review-evidence.json --repo KayzenRoot/uads
npm run release:publish -- 0.8.1 --artifacts release
```

The canonical GitHub Actions workflow is `.github/workflows/release.yml` and accepts a manual `X.Y.Z` input. It validates the exact successful Foundation CI run, locates exactly one successful `UADS Direct Review Evidence` run for that SHA, and downloads its exact `uads-direct-review-<SHA>` artifact. Before any tag or release mutation, `release:verify`, `release:build`, and `release:publish` independently reconstruct the corrected security proof set: exact-SHA CodeQL, push-to-main Scorecard, and exact-SHA or same-tree PR Dependency Review. Scorecard event/ref identity, exact merged-PR/source-PR binding, distinct-run ambiguity, and the deterministic proof digest are part of the contract; missing, ambiguous, failed, mismatched, or digest-inconsistent proof stops the workflow. It records the CI binding as `ci-binding.json`, runs the complete local gate, builds the npm tarball, SPDX SBOM, validation report, release manifest, canonical direct-review evidence, `github-review-index.json`, and SHA-256 checksums, then creates an immutable pre-release and uploads the final direct-review derivative. UADS is not published to npm.

Before publishing, generate the final external-review evidence with `npm run review:release -- 0.8.1`. The resulting ZIP is created in the global sidecar and must contain only the source snapshot plus one canonical `github/` and `release/` evidence set. The release reviewer rejects stale or conflicting manifests, mismatched commit identities, ephemeral CI-binding paths, and a dirty final worktree. The historical `v0.8.0` tag remains immutable; the corrected release uses `v0.8.1`.

## Historical reconstruction

`npm run release:historical` verifies the canonical v0.1.0-v0.6.0 commit/version map, creates missing annotated tags without force, and creates transparent retrospective pre-releases. Any tag conflict stops the operation.

## Rollback, yank, and deprecation

Never retag a commit. If a release is defective, publish a corrective patch, mark the affected GitHub release with a clear warning, and deprecate the affected line in the changelog. Deleting or replacing tags/releases requires an explicit conflict-resolution decision and is not automated. Release assets are immutable evidence; checksums and SBOMs must be regenerated only for a new release.

## Security and provenance

The release workflow uses least-privilege permissions, immutable action pins, and no stored credentials. SHA-256 covers every uploaded asset except the checksum file itself. Artifact attestation is attempted when GitHub supports it; unsupported or plan-gated provenance is reported as a limitation rather than fabricated.
