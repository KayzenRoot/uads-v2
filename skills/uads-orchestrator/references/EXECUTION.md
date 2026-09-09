# Execution

Host loop after a valid plan:

```
uads dispatch
-> selected implementation specialist(s)
-> NECESSARY in-scope edits only
-> uads verify
-> host runs selected gates and records evidence
-> uads assurance start
-> distinct reviewer session(s)
-> uads assurance record
-> on CORRECTION_NEEDED: implement, re-verify, new digest
-> uads finalize
-> uads review when a ZIP is required
```

`uads dispatch --session <id>` binds the authoritative implementer session before implementation/review. Redispatch with a different session is rejected. `uads assurance record` requires review phase after `uads assurance start`; `--implementer-session` may only corroborate the bound run identity.

Command PASS evidence requires `kind=command`, command text, exit 0, and a captured output digest. Review gates are satisfied only by the mapped reviewer record. Current-digest FAIL/BLOCKED stays blocking until `uads verify` produces a new digest. Record the failure with `uads failure record --source … --input <file>` and localize with `uads diagnose --failure <id>`. If the live worktree has moved past the run's stored digest, re-run `uads verify` before recording; do not label a D2 observation with D1 metadata. Ranked candidates are hypotheses (`likely` / `supported-by`), not verified root cause. Repeated diagnosis of the same Failure Record is not a repeated failure. Three distinct observations with the same signature and the same content-aware change identity are `LOOP_DETECTED`: change strategy or expand one diagnostic radius step; never edit or reset user files. Verified resolution must belong to that failure's completed corrective execution and the live canonical digest must still equal that verified digest; later unverified edits cannot be absorbed into prior verified memory.

If isolated reviewer context is unavailable, do not fake approval; record BLOCKED. The implementation agent must not self-approve.

Before host handoff, run `uads adapters prepare <adapter>`. This reconstructs
and validates the current Work Order, Routing Decision, Specialist Selection
Plan, Model Execution Plan, runtime capability identity, and Context/Impact
identity before writing a sidecar-only Host Dispatch Bundle. A host adapter
can narrow concurrency to sequential role cycling when subagents or parallel
agents are not proven; it cannot broaden any UADS selection or quality
obligation and does not call a model provider.

Context expansion is one radius step (`uads context expand --reason ...`). C5 stays exceptional (`--approve-c5`). Expansion is not permission to edit unrelated areas.
