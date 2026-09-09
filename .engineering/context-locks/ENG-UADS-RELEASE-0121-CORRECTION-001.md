# Context Lock - `ENG-UADS-RELEASE-0121-CORRECTION-001`

State: `FRESH`
Repository: `KayzenRoot/uads`
Baseline Git SHA: `da05b3ecdeec5febf3ffdfd65c008ea311ccb8b3`
Generated at: `2026-09-08T10:41:03Z`

## Required fingerprints

| Source | Relative path or deterministic sentinel | SHA-256 |
| --- | --- | --- |
| Checkpoint | `.engineering/checkpoints/CHECKPOINT-DELTA-ENG-UADS-RELEASE-0120-001.md` | `c24298cd0748bd1d5f280c8d35893f85b5d8ea44a9d8a5c3803154549956973b` |
| Decisions | `.engineering/DECISIONS.md` | `7c6b9f3f93ffed0005a65fe621c142d0979235204ccdf0e346fea92a9f7b2619` |
| Scope | `docs/03-SCOPE.md` | `6279be976392994255ed380ff10c52d2a17629015b3766d9a236c8dd76fc7f73` |
| Definition of Done | `docs/13-DEFINITION-OF-DONE.md` | `f6f624adfe2dd02872cb31e60ec490c7351fca9ac207eacb20213d48cefda818` |
| Architecture | `docs/04-ARCHITECTURE.md` | `2034034d02ae39d4431886a58242e5f2bb729a2c27fbbb2a75a5db30aedada8a` |
| Project overview | `docs/01-PROJECT-OVERVIEW.md` | `4ccd56665245bf91a9832f38212dab730d1790d654e947d0798b7e76fc049337` |
| Quality gates | `docs/07-QUALITY-GATES.md` | `fcf75d7aea8b96dd8889022850be3610e8c6dd5663b93a097c8ae9665fad392d` |
| Executor rules | `.engineering/PROTOCOL.md` | `f1ccaf41ae75ba578ed0d548e0d601ed56fe30dd0eff9d7cef00028ec71a60cf` |

## Locked external identities

- Baseline tree: `8a62c6f4cb6f765ecaa89a18de8a8ad5884fcd0e`.
- `v0.12.0` tag object:
  `82c99cb84097c11634c1b713c8370df2144d6e60`.
- `v0.12.0` peeled commit:
  `da05b3ecdeec5febf3ffdfd65c008ea311ccb8b3`.
- Failed release workflow/job: `34177150747` / `101908720321`.
- Release-ready audit: PR #21 comment `5577648629`.
- Correction audit: PR #21 comment `5582933499`.
- GitHub Release `v0.12.0`: absent at lock time.

## Stale events

- None after preflight. Any change to the locked main, tag, release, or
  correction identity requires stopping, re-inspection, and relocking.

## Relock evidence

- Re-inspection: `git fetch --prune origin`; exact main/tag/release/PR/run
  queries recorded before branch creation.
- New lock or reason blocked: this Context Lock.
