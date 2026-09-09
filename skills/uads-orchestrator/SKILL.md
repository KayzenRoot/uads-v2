---
name: uads-orchestrator
description: >
  UADS orchestrator kernel by NexLabs. Use to inspect a repo, normalize a request
  into structured intake, call uads plan, dispatch a bounded execution run, collect
  digest-bound evidence, require independent review, and finalize. Global-first,
  zero project footprint.
---

# UADS Orchestrator

Host-side semantic protocol for the deterministic UADS kernel. Do not dump the repository into context. Do not call provider APIs from the kernel.

## Protocol

1. Inspect state (`uads status`, `uads inspect`, `uads resume`).
2. Normalize the user request into `schemas/intake.schema.json`.
3. `uads plan --intake <file>` (preferred) or `uads plan --request` as fallback.
4. `uads dispatch --session <implementer-session-id>` — dirty worktrees block; UADS will not reset/stash/clean. The session is the authoritative implementer identity.
5. Invoke selected implementation specialist(s) from the Work Order. Edit only NECESSARY scope.
6. `uads verify` — binds a change digest. Do not claim gates passed.
7. Run selected gates in the host terminal. `uads evidence record` for each selected non-review gate.
8. On FAIL/BLOCKED: `uads failure record` then `uads diagnose`. Treat ranked paths as hypotheses, not verified root cause.
9. `uads assurance start`, then distinct reviewer session(s). `uads assurance record`.
10. On `CORRECTION_NEEDED`, return to implementation, re-verify (new digest), and re-review.
11. `uads finalize` is the only completion gate. Then `uads review` if a ZIP is required.

The user should not pick specialists by hand. Routing controls that. Prefer native subagents for isolated reviewer context. If independence cannot be met, record BLOCKED — never self-approve.

## Fallback classifier

`uads plan --request` is a conservative text heuristic. Prefer structured intake.

## References

- `references/ORCHESTRATION-PROTOCOL.md`
- `references/INTAKE.md`
- `references/ROUTING.md`
- `references/RISK-AND-GATES.md`
- `references/CONTEXT.md`
- `references/EVIDENCE.md`
- `references/EXECUTION.md`
