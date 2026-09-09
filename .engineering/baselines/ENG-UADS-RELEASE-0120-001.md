# Baseline - ENG-UADS-RELEASE-0120-001

Status: COMPLETE
Repository: KayzenRoot/uads
Baseline Git SHA: 88d9bbea41522fe5cbbbf658c1e216ecc41fd063
Baseline tree: 0bad055cc05b7cdff78f14886032b727532e6c49
Branch: release/eng-uads-release-0120-001

## Baseline identity

- The branch was created directly from exact origin/main at the locked final
  SHA/tree.
- PR #20 is merged and the independent final audit comment 5575928265 records
  APPROVED - PROMPT 012 FULLY CLOSED.
- Prompt 012 source promotion head was
  ee8e87e487919d0c2f1d732021b3359a5b840e26 with tree
  0bad055cc05b7cdff78f14886032b727532e6c49; merged main retained that tree.
- The parent closeout introduced no release or tag mutation.
- VERSION, package.json, and package-lock root are all 0.11.1.
- The latest immutable release is v0.11.1.
- Architecture Freeze v0.2 remains authoritative.

## Final Prompt 012 proof

| Proof | Result | Evidence |
| --- | --- | --- |
| Final main identity | PASS | SHA 88d9bbea41522fe5cbbbf658c1e216ecc41fd063; tree 0bad055cc05b7cdff78f14886032b727532e6c49 |
| Foundation | PASS | run 34162267349 / job 101866341729; 49 files / 406 tests; HEB01-HEB52 |
| CodeQL | PASS | run 34162267332 / job 101866341610; exact push/main SHA |
| OpenSSF Scorecard | PASS | run 34162267358 / job 101866341449; exact push/main SHA |
| Compatibility | PASS | run 34162600819; Linux 101867306020 and Windows 101867306175 |
| Direct Review | PASS | run 34162713301 / job 101867640148; finalVerdict PASS; reasonCodes empty |
| Same-tree Dependency Review | PASS | PR #20; source tree and final main tree both 0bad055cc05b7cdff78f14886032b727532e6c49; proof digest 745d0c4536d982bef0cd0776ee0bfb60e1b86e2d1dea205ff9f2974b69672b19 |

## SemVer basis

RELEASING.md states that a pre-1.0 PATCH fixes a compatible defect and a MINOR
adds a compatible capability. Prompt 012 added a new compatible bounded
Host Execution and Receipt capability. The correct candidate target is
therefore 0.12.0, not 0.11.2 or 1.0.0. A major-release decision is outside
this Work Order.

## Release immutability baseline

- v0.11.0 annotated tag object:
  b1829d97647067c4287955c9c7ef4df0b3b310b1; target
  d5cb361274cb19f70c8bd02dd023b596b8babf13.
- v0.11.1 annotated tag object:
  c2f3e78bdfe4aa439cf576d2d2122ceec7216fe9; target
  db904219a691dea9509f04ff44ac9e8dff5563fa.
- v0.11.1 GitHub release ID RE_kwDOUH-ap84W2Azt, published
  2026-09-05T13:41:53Z.
- v0.12.0 and v1.0.0 do not exist as tags or releases at baseline.
- No historical tag/release/asset mutation is authorized.

## Allowed release-preparation delta

- VERSION.
- Root package.json version only.
- package-lock.json top-level and packages[""] versions only.
- CHANGELOG.md [Unreleased] and new [0.12.0] section.
- Matching governance records for this Work Order.
- No other product or runtime file is authorized.

## Baseline conclusion

Prompt 012 is fully closed and supplies the compatible capability for the
0.12.0 candidate. The release-preparation branch requires only consistent
release metadata and professional release notes. It does not authorize a tag,
GitHub Release, asset upload, release workflow dispatch, merge, or publication.
