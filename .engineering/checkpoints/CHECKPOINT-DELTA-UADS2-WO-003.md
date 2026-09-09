# Checkpoint Delta — UADS2-WO-003 / M30

Status: `CORRECTION IMPLEMENTED — HOSTED GATES PASS / READY_FOR_FINAL_HEDS_AUDIT`

Base SHA: `5a6e0d31ec99d2f89136fbd764257a588d625263`

Implementation snapshot: `60b3f26f276a8f22fafb73b7d33f60cef16d053f`

Active branch: `work/uads2-wo-003-m30-event-dashboard-foundation`

Active PR: `#22`

## Completed delta

- Added the closed and versioned `uads.operational-event` v1.0.0 schema and
  TypeScript types.
- Added canonical event hashing, immutable global-sidecar file creation,
  bounded reads, retention and `HEALTHY`/`DEGRADED`/`UNAVAILABLE` projection.
- Added sanitization and bounded payload protection for operational strings,
  including first-class error and diagnostic events.
- Added loopback-only Node HTTP dashboard, objective snapshot/recent-event APIs,
  SSE updates, security headers and an inline dark operator shell.
- Added additive `dashboard` and `observability` CLI inspection/start commands.
- Added focused M30 tests, an isolated benchmark and the two-event B-001 proof.
- Closed HEDS CR-001 with fail-closed size/key, reload, retention-isolation,
  invalid-record, SSE-limit/disconnect, error/diagnostic and unavailable-source
  proof.
- Closed HEDS CR-002 with locale-independent canonical key ordering and nested
  payload insertion-order hash proof, preserving the B-001 signature.
- Closed HEDS CR-003 with bounded Work Order/correlation/execution identity and
  selected existing UADS status panels, using `UNAVAILABLE` for missing fields.

## Proof state

Local npm ci, lint, typecheck, build, focused M30 tests (10/10; regression
selection 31/31), orchestration/execution evals and engineering protocol
validation passed. Full Vitest is INCONCLUSIVE because its runner did not
return a final result; `npm run validate` remains gated by that same condition.
The exact correction implementation snapshot is recorded above. Hosted CI,
CodeQL, Dependency Review and Cross-Platform Compatibility all passed on
audited PR head `1f62e6ae225c7b4e2da0d956e573f5cf95a3b521`; final HEDS is still
pending.

## Safety and rollback

The change is additive to the existing sidecar under
`workspaces/<projectId>/observability/`. No existing V1/V2 state domain is
rewritten, no dependency or version is changed, and removing the M30 code does
not require a destructive migration. The server rejects every non-loopback
binding before listen.

## Next action

Request independent HEDS final audit on the same branch/PR. Remain stopped
until that audit is `APPROVED`; do not merge or begin M01.
