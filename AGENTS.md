# AGENTS.md — UADS V2 Executor Bootstrap

This repository builds **UADS V2** using the existing globally installed UADS runtime while V2 itself is under development.

## Fresh-chat / fresh-session continuity

If the user says **“vamos continuar do chat antigo”**, **“continue do chat anterior”**, or equivalent:
1. reconcile current GitHub `main`, open PRs and active branch;
2. read `docs/v2/continuity/CURRENT.json`;
3. follow `docs/v2/operations/CHAT-CONTINUITY-PROTOCOL.md`;
4. use `docs/v2/operations/RESPONSE-AND-PROGRESS-STANDARD.md` for the same graphical status/progress format;
5. do not ask the user to re-explain project history that Git can resolve.

GitHub is canonical project memory. Chat memory is not project truth.

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

## Module/session planning

All module inventory lives under `docs/v2/modules/`. Planning follows `docs/v2/operations/MODULE-SESSION-LIFECYCLE.md`.

An idea is `CANDIDATE` until approved. After every approved session, update the module source plus all affected Requirements/Architecture/ADRs/Backlog/Checkpoint and `docs/v2/continuity/CURRENT.json` before continuing.

UADS V2 is **standalone-first**. `SOLO` mode is mandatory; Hive integration is optional through the M18 bridge and may not become a core runtime dependency.

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
- design tests with architecture, not after it;
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

## HIVE v1.0.3 context-first work and prompt contract

The current HIVE executor-context baseline is the published **v1.0.3** read-only MCP surface. This is a context and prompt-preparation baseline; it does **not** change this repository's product dependency, runtime, compatibility pin, or HIVE V1/V2 integration contract. Keep those project-specific pins unchanged unless their own authorized Work Order validates and admits an upgrade. This repository's Git state, approved checkpoint, source hierarchy, decisions, scope, and active Work Order remain authoritative over HIVE-derived memory/context.

### Preflight

1. Confirm the exact repository, branch, HEAD/base SHA, and active Work Order or issue before building context. Read this repository's checkpoint/source hierarchy and the Work Order's scope, allowed files, acceptance criteria, and stop condition.
2. When HIVE MCP is available in this execution surface, verify the handshake and the reported v1.0.3 context baseline. Resolve this repository by its actual registered identity; use only an existing, canonical task ID. Never guess a project or task ID.
3. Use only read-only tools actually exposed by the handshake. The v1.0.3 reference surface includes `project.list`, `project.status`, `context.build`, `context.search`, `memory.search`, `memory.get`, and `checkpoint.read`. Build task context only for a valid task ID. Retrieve the minimum context needed for this Work Order; do not load unrelated history or the whole corpus.
4. Record the exact Git basis and only HIVE version, project/task identity, source references, or context fingerprint actually returned. A HIVE summary is derived context, not canonical approval or evidence that an unobserved check passed.
5. If HIVE is absent, stale, mismatched, or not exposed here, label it accurately and continue from canonical repository sources whenever the Work Order permits. Finish independent authorized work and do not stop for routine confirmation. Mark BLOCKED only when an explicit gate requires unavailable HIVE evidence. Never claim local HIVE access from a hosted execution surface, or vice versa.
6. Do not synchronize/reindex a corpus, create tasks, write a database, call a provider, or mutate remote/runtime state unless the active Work Order explicitly authorizes that operation.

### Compact HIVE-grounded executor prompt

When preparing a Codex/Cursor or other executor prompt, include only the task-relevant context and these fields:

- **Identity:** repository/path, Work Order/issue, branch, exact base and current HEAD.
- **Authority:** canonical checkpoint and source paths; the active Work Order and Context Lock, if present.
- **HIVE context:** v1.0.3 handshake status, verified project/task IDs, and returned source references/fingerprint — or the truthful status `UNAVAILABLE`, `STALE`, or `NOT_REQUIRED`.
- **Work:** objective, exact allowed change surface, acceptance criteria, required focused checks, evidence to return, exclusions, and stop condition.
- **Execution direction:** complete every authorized step, fix review findings within scope, perform the required review, and report which checks actually ran. Do not ask for routine confirmation; do not widen scope or claim unperformed work.

Prefer canonical file paths and short HIVE context references over copying full documents or chat history. Keep stable policy, Work Order-specific requirements, and volatile runtime evidence in separate, compact sections.

Preserve the standalone-first `SOLO` mode and the existing optional M18 Hive V2 bridge. HIVE v1.0.3 as executor context does not change product interoperability or runtime dependencies.
