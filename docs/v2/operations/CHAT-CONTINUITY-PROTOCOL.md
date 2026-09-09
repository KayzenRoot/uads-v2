# UADS V2 — Chat Continuity Protocol

Status: CANONICAL OPERATING CONTRACT IN REVIEW

## Trigger
When a new conversation says **“vamos continuar do chat antigo”**, **“continue do chat anterior”**, or equivalent, do not ask the user to reconstruct project history.

## Bootstrap sequence
1. Reconcile `KayzenRoot/uads-v2` current `main`, open PRs and active branch.
2. Read `docs/v2/continuity/CURRENT.json`.
3. Read, in authority order: `docs/v2/11-CHECKPOINT.md`, Decisions Ledger, Scope, DoD, Architecture, Requirements, Review Protocol.
4. Read the active Work Order, Context Lock, Evidence Bundle, Correction Delta and active module/session files named by `CURRENT.json`.
5. Verify Git identities and mark stale continuity if repository truth differs from the manifest.
6. Resume only the next NECESSARY action. Never advance through a CORRECTION REQUIRED/BLOCKED/mandatory-evidence gate.

## Memory independence
Chat memory is convenience only. GitHub is project truth. A fresh session must reconstruct current state, active module/session, decisions, blockers, progress and next action from Git alone.

## Response continuity
Use `docs/v2/operations/RESPONSE-AND-PROGRESS-STANDARD.md` after bootstrap, including graphical progress, architecture when useful, current verdict, evidence, completed/remaining work and estimates.

## Update rule
After every APPROVED module session, material correction, merge, scope/ADR change or checkpoint transition, update `docs/v2/continuity/CURRENT.json` in the same governed increment. Never let it claim unproven implementation.
