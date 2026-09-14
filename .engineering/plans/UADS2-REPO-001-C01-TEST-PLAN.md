# Test Plan — UADS2-REPO-001-C01

Status: FROZEN BEFORE IMPLEMENTATION

## Deterministic checks

- C01-T001 top-level workflow permissions remain read-only.
- C01-T002 job includes `contents: read`, `actions: read`, `issues: read`, `pull-requests: read`, `checks: read`.
- C01-T003 no `security-events: write` remains in Scorecard job.
- C01-T004 no `id-token: write` remains in Scorecard job.
- C01-T005 `publish_results: false`.
- C01-T006 SARIF artifact upload uses the repository-approved immutable `actions/upload-artifact` SHA.
- C01-T007 artifact retention is bounded.
- C01-T008 no PAT/secret reference is added.
- C01-T009 all actions remain immutable-SHA pinned.

## Hosted PR verification

- Foundation checks;
- CodeQL;
- Dependency Review;
- Linux / Node 20;
- Windows / Node 20.

## Post-merge proof

The Scorecard `push: main` run is authoritative for AC-01/AC-06.

Expected:
`Checkout -> Run Scorecard SUCCESS -> Upload Scorecard artifact SUCCESS`.

If analysis fails again, capture the exact new error and do not label the correction complete.
