# Context Lock — `ENG-<NAME>-<NNN>`

State: `FRESH | STALE | RELOCKED | BLOCKED`
Repository: `<owner>/<repo>`
Baseline Git SHA: `<40 lowercase hex>`
Generated at: `<ISO-8601 UTC>`

## Required fingerprints

| Source | Relative path or deterministic sentinel | SHA-256 |
| --- | --- | --- |
| Checkpoint | `<path or UNKNOWN:no-active-checkpoint>` | `<64 hex or null>` |
| Decisions | `<path or UNKNOWN:no-ledger>` | `<64 hex or null>` |
| Scope | `<path>` | `<64 hex>` |
| Definition of Done | `<path>` | `<64 hex>` |
| Architecture | `<path>` | `<64 hex>` |
| Project overview | `<path>` | `<64 hex>` |
| Quality gates | `<path>` | `<64 hex>` |
| Executor rules | `<path>` | `<64 hex>` |

## Stale events

Record every critical source change after the lock. Do not continue silently.

- Source: `<path>`
- Reason: `<reason>`
- Action: `<stop, re-inspect, and relock>`

## Relock evidence

- Re-inspection command: `<command>`
- New lock or reason blocked: `<reference>`
