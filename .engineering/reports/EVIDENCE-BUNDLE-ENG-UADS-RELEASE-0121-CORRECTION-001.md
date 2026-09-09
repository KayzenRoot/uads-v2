# Evidence Bundle - `ENG-UADS-RELEASE-0121-CORRECTION-001`

Status: `COMPLETE`
Repository: `KayzenRoot/uads`
Baseline Git SHA: `da05b3ecdeec5febf3ffdfd65c008ea311ccb8b3`
Head Git SHA: `0c9a51aeafb3c5e89beedf5732f5c6d46dbacef3`

## Claims

| Claim | Kind | Reference | Status | Notes |
| --- | --- | --- | --- | --- |
| Context Lock | file/github | `.engineering/context-locks/ENG-UADS-RELEASE-0121-CORRECTION-001.md` | PASS | Locked baseline, tag, release absence, failed run, and correction audit before writes |
| Root cause | github/file | Release run `34177150747` / job `101908720321`; `scripts/release/publish-release.mjs` | PASS | Publisher discarded the validated changelog before title derivation |
| Immutable tag | github | `v0.12.0` tag object `82c99cb84097c11634c1b713c8370df2144d6e60`; peeled commit `da05b3ecdeec5febf3ffdfd65c008ea311ccb8b3` | PASS | No tag mutation authorized or performed |
| Absent `v0.12.0` release | github | GitHub release lookup | PASS | Release remains absent |
| Generic title correction | file/test | `scripts/release/publish-release.mjs`; `tests/release-engineering.test.ts`; focused 23/23 | PASS | Generic path receives authoritative changelog notes; malformed sources fail closed |
| Version metadata | file | `VERSION`, `package.json`, `package-lock.json` | PASS | All root versions are exactly `0.12.1` |
| Changelog correction | file | `CHANGELOG.md` | PASS | `[Unreleased]` preserved; `0.12.1` documents partial `0.12.0` state |
| Historical immutability | github | `v0.11.1`, `v0.11.0`, and prior release evidence | PASS | Read-only verification found no mutation |
| Local gates | command | `npm ci`, build, engineering validation, lint, typecheck, focused tests, npm audit | PASS | Complete local Windows suite did not conclude; no failure emitted |
| Hosted gates | github | Foundation `34221385391`; CodeQL `34221385385`; Dependency Review `34221385397`; Compatibility `34221385370` | PASS | Exact head; 49 files / 409 tests; HEB01-HEB52; all evals; finalVerdict PASS |
| Independent review | github | Correction PR | PENDING | PR must remain open and unmerged |

## Identity binding

- Work Order: `.engineering/work-orders/ENG-UADS-RELEASE-0121-CORRECTION-001.md`.
- Context Lock: `.engineering/context-locks/ENG-UADS-RELEASE-0121-CORRECTION-001.md`.
- Baseline: `.engineering/baselines/ENG-UADS-RELEASE-0121-CORRECTION-001.md`.
- Correction Delta: `.engineering/checkpoints/CORRECTION-DELTA-ENG-UADS-RELEASE-0121-CORRECTION-001.md`.
- Checkpoint Delta: `.engineering/checkpoints/CHECKPOINT-DELTA-ENG-UADS-RELEASE-0121-CORRECTION-001.md`.
- Change summary: PR #22, audited head `0c9a51aeafb3c5e89beedf5732f5c6d46dbacef3`; governance evidence is bounded to this correction.

## Hosted proof details

- Foundation: run `34221385391`, job `102045063462`, success; 49 test files,
  409 tests, HEB01-HEB52, all evals, npm audit clean, finalVerdict PASS.
- CodeQL: run `34221385385`, job `102045062987`, success; aggregate CodeQL
  check `102045387618`, success.
- Dependency Review: run `34221385397`, job `102045062792`, success.
- Linux Node 20: run `34221385370`, job `102045063108`, success; source tree
  `2799ef084fcbf60e3ee284a706d4107e36b734ab`; evidence digest
  `f47671d881432071d5460a5a27396649531f515afabea6f242004ef8a7e2827c`.
- Windows Node 20: run `34221385370`, job `102045062831`, success; source tree
  `2799ef084fcbf60e3ee284a706d4107e36b734ab`; evidence digest
  `c929b509b0d1d4ca80b9f6f5cb6abe99ed916ae864dfc413df52411a96543c6a`.
- PR: `https://github.com/KayzenRoot/uads/pull/22`, open and merge state
  clean; no merge performed.

## Privacy review

- [x] No credentials, raw tokens, private keys, customer data, or absolute host paths.
- [x] Generated/cache/vendored material is excluded.
- [x] Local and hosted gate outputs are recorded above.
- [ ] Independent reviewer has audited the exact correction head.

This bundle is evidence for independent review, not a self-approval record.
