# Context Lock — UADS2-REPO-001-C01

Status: LOCKED
Base main SHA: `5752d1ff7716027071464308eaec6e0a0aef3892`
Branch: `fix/uads2-repo-001-c01-scorecard-private`
Parent issue: #9

## Critical source fingerprints

| Source | Blob SHA |
| --- | --- |
| `.github/workflows/scorecard.yml` | `98b619a258eff7312c02d71918eb3d848ab29fdd` |
| `docs/v2/11-CHECKPOINT.md` | `b012d4996cd9c6eb600a991d4576ee9fa69fffae` |
| `docs/v2/10-DECISIONS-LEDGER.md` | `a1b27c26032f35f18a4e9b98ee431bbd955a5fec` |
| `docs/v2/03-SCOPE.md` | `80c9df3dec13caeb5ec2cbc65c57e233755ae611` |
| `docs/v2/09-DEFINITION-OF-DONE.md` | `65fbcde8adfc70ceebb69b1ff43be4ab3fd8edc0` |
| `docs/v2/04-ARCHITECTURE.md` | `187e8c7e49c35464fc79e3743548ab49afb3b824` |
| `docs/v2/05-SECURITY.md` | `3c425675950f9058275a488ad31e0d7576ac4d87` |

## External failure identity

- main promotion commit: `5752d1ff7716027071464308eaec6e0a0aef3892`
- OpenSSF run: `34421995799`
- job: `102699232525`
- failing step: `Run Scorecard`
- error class: `githubv4.Query: Resource not accessible by integration`
- operation: `ListCommits`

## Lock rule

If main, the Scorecard workflow, Security, Architecture, Scope, DoD or a relevant accepted ADR changes before implementation, mark this lock STALE and relock before continuing.
