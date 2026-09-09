# Evidence Bundle — `ENG-<NAME>-<NNN>`

Status: `DRAFT | PARTIAL | COMPLETE | BLOCKED`
Repository: `<owner>/<repo>`
Baseline Git SHA: `<40 lowercase hex>`
Head Git SHA: `<40 lowercase hex or pending>`

## Claims

| Claim | Kind | Reference | Status | Notes |
| --- | --- | --- | --- | --- |
| `<claim>` | `command/output/file/test/review/github` | `<relative path, URL, or command>` | `PASS/FAIL/NOT_CONFIGURED/UNKNOWN/SKIPPED` | `<bounded notes>` |

## Identity binding

- Work Order: `ENG-<NAME>-<NNN>`
- Context Lock: `<relative path>`
- Checkpoint Delta: `<relative path>`
- Change summary: `<git diff --stat reference>`

## Privacy review

- [ ] No credentials, raw tokens, private keys, customer data, or absolute host paths.
- [ ] Generated/cache/vendored material is excluded or explicitly classified.
