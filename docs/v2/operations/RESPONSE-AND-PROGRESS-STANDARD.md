# UADS V2 — Response & Progress Standard

Status: CANONICAL OPERATING CONTRACT IN REVIEW

User-facing language: pt-BR. Technical canon: English-first where practical.

## Required review/status response
For material project responses show, when evidence exists:

1. **VERDICT/STATE** — APPROVED / CORRECTION REQUIRED / BLOCKED / DISCOVERY.
2. **What changed** — concise factual delta.
3. **Evidence** — SHA, PR, CI, tests, artifacts and findings.
4. **Architecture/flow** — compact ASCII diagram when it improves understanding.
5. **Progress dashboard** with separate metrics, never one misleading percentage:
   - Bootstrap/governance completion;
   - V2 planning completion;
   - V2 implementation completion;
   - active module completion;
   - active session completion;
   - tests/evidence status.
6. **Completed vs remaining**.
7. **Risk/blockers**.
8. **Estimated remaining effort/time** only when inferable; label uncertainty.
9. **Next NECESSARY action**.

## Graphical convention
Use compact bars such as `██████░░░░ 60%`, architecture arrows, status icons and small tables. Visual density must not replace evidence.

## Percentage rules
- Planning does not count as implementation.
- A module stub counts as inventory, not designed capability.
- A design session counts only after approval and Git update.
- Implementation counts only from merged, tested behavior.
- Known failing mandatory evidence prevents 100% for its gate.

## Handoff invariant
A fresh chat using the continuity protocol must reproduce the same response structure and statistics from repository state without requiring screenshots or user re-explanation.
