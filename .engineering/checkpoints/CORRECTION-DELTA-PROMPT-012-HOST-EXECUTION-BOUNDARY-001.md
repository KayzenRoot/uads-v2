# Correction Delta — `ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001`

Status: `APPLIED`
Baseline Git SHA: `96f2965d0ec26e00968052999b20876c13578a51`
Correction: `Prompt 012 Scope Freeze — Correction 01 / Necessity & Identity Reconciliation`

## Problem

The independent audit of PR #17 found that the original decision matrix did
not separately evaluate the two roadmap items preceding host execution, so the
claim that host execution was the sole NECESSARY next capability was not yet
objectively closed. The audit also found that the Work Order identity was not
repeated in the branch name or PR title.

## Root cause

The initial planning pass compared host execution mainly with unrelated future
expansions and treated the ordered roadmap as sufficient context. It did not
make the Prompt 009 bounded-catalog result and Prompt 008 provider-neutral /
host-managed result explicit in the matrix, nor did it derive the GitHub
identity fields directly from the Work Order.

## Correction

- Added separate matrix rows for the broader specialist catalog and provider
  adapter mapping.
- Distinguished delivered bounded behavior from future expansion: the current
  catalog and provider-neutral mapping are already delivered; broader catalog
  growth and live provider-specific adapters remain FUTURE.
- Recorded why live provider adapters are not a predecessor: the pre-freeze
  contract explicitly keeps provider invocation host-owned and supports
  host-managed compatibility.
- Retained exactly one `NECESSARY` classification for host execution depth,
  based on pre-freeze roadmap ordering plus the concrete prepare-without-
  execute/receipt gap.
- PR #17 was the original Prompt 012 scope-freeze PR.
- Independent audit comment `5555196483` required Correction 01.
- Replacement branch `docs/eng-prompt-012-host-execution-boundary-001` was
  created from the preserved prior commits/history; the GitHub record is a
  replacement branch/PR, not a simple branch rename.
- PR #18 is the replacement PR, with the Work Order identity in its title.
- PR #17 was closed without merge and is superseded by PR #18.
- Preserved planning-only scope, Prompt 011 history, versions, releases,
  tags, runtime paths, schemas, tests, workflows, and dependencies.

## Verification required

- `git diff --check`
- `npm run validate:engineering`
- `npm run lint`
- `npm run typecheck`
- hosted Foundation, CodeQL, Dependency Review, compatibility, and all other
  applicable checks for the corrected exact PR head
- independent re-audit; no self-approval or merge by the executor

## Evidence boundary

The corrected necessity proof uses only pre-freeze `ROADMAP.md`,
`docs/02-REQUIREMENTS.md`, `docs/03-SCOPE.md`, `docs/06-CONTEXT-AND-COST-
INTELLIGENCE.md`, `docs/11-ADAPTERS.md`, `docs/13-DEFINITION-OF-DONE.md`,
Prompt 009 records, Prompt 011 closure, and the relevant pre-freeze source,
schema, and test records. New Prompt 012 acceptance text is not used as proof.

## Result

The correction is applied on the identity-aligned branch. The PR remains
unmerged and awaits an independent re-audit of the exact corrected head.
