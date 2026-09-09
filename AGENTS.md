# AGENTS.md — UADS V2 Executor Bootstrap

This repository builds **UADS V2** using the existing globally installed UADS runtime while V2 itself is under development.

## Mandatory source order

1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/03-SCOPE.md`
4. `docs/v2/09-DEFINITION-OF-DONE.md`
5. `docs/v2/04-ARCHITECTURE.md`
6. `docs/v2/02-REQUIREMENTS.md`
7. `docs/v2/13-REVIEW-PROTOCOL.md`
8. inherited V1 canonical docs when not superseded;
9. active Work Order / Context Lock / Evidence Bundle / PR.

Never treat chat memory as canonical project truth.

## UADS runtime bootstrap

When the execution host has the globally installed UADS:
1. run `uads doctor`;
2. run `uads status`;
3. detect/prepare the appropriate host adapter according to the inherited UADS adapter contract when needed;
4. use `skills/uads-orchestrator/SKILL.md`;
5. keep operational state in the global sidecar, not this repository.

If UADS is unavailable or unhealthy, report BLOCKED rather than silently bypassing required governance.

## Execution contract

ANALYZE → SOURCE CHECK → NEXT NECESSARY INCREMENT → WORK ORDER → CONTEXT LOCK → PREFLIGHT → EXECUTOR → TESTS/EVIDENCE → PR → AUDIT → APPROVED / CORRECTION REQUIRED / BLOCKED → CHECKPOINT DELTA → MERGE.

Every increment uses a stable Work Order ID.

Before editing:
- inspect repository and Git state;
- freeze base SHA;
- read only relevant canonical context;
- verify Context Lock freshness;
- classify risk and required proof.

During implementation:
- change only Work Order scope;
- prefer deterministic Git/AST/static/test evidence over LLM inference;
- preserve modular boundaries;
- do not perform broad cleanup;
- do not mutate UADS V1;
- never invent host/model capabilities.

After implementation:
- run selected tests plus required risk gates;
- correct introduced failures;
- capture Evidence Bundle;
- push and update PR;
- audit against Scope, Architecture, Requirements, acceptance criteria and DoD.

## V2-specific resource guard

Until the corresponding V2 fixes are implemented and proven:
- do not manually launch more than one specialist worker at a time;
- avoid separate user-visible specialist conversations when the host can execute internally;
- do not repeat valid deterministic analysis without a reason;
- do not default simple tasks to the strongest reasoning mode.

These are construction-time guards, not claims that the V2 runtime already enforces them.

## Review model

Use `docs/v2/13-REVIEW-PROTOCOL.md`.

Primary metric: **Time-to-Trusted-Merge**, while preserving quality, security and required assurance.

Do not generate the next implementation increment while the current one is CORRECTION REQUIRED, BLOCKED, awaiting mandatory evidence, or otherwise unvalidated.
