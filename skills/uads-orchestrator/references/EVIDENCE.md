# Evidence

Completion requires commands, outputs, or files for selected gates.

Sidecar evidence lives under `~/.uads/workspaces/<project-id>/evidence/` (foundation) and `execution-runs/<id>/evidence/` (execution ledger).

Execution evidence is bound to the current change digest. Stale digest records do not satisfy finalization.

Command PASS requires `kind=command`, a command string, exit code 0, a sanitized output artifact, and its digest. Summary-only or invariant PASS cannot satisfy a command gate. File evidence uses a relative project path plus SHA-256 of the file bytes (never the raw contents or an absolute host path). Review gates (`security-review`, `performance-check`) are derived from matching reviewer APPROVED records, not generic evidence.

Any current-digest FAIL or BLOCKED remains blocking even if a later PASS is appended for the same digest. Recovery is: fix implementation → `uads verify` (new digest) → new evidence/reviews.

`uads evidence record` stores results; it does not execute the command. Unknown or unselected gate IDs are rejected. Corrupt authoritative evidence JSON fails closed.

Review bundles remain privacy-minimized and are inspected on their final bytes.

Stop if evidence cannot be produced or an approval-gated action is required.
