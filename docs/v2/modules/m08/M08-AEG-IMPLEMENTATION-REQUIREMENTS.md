# M08 — Adaptive Evidence Gauntlet Implementation Requirements

Status: CANDIDATE REQUIREMENT
Work Order: UADS2-WO-021
Issue: #66
Primary owner: M08 Review Pipeline 2.0

## Runtime responsibility

M08 MUST implement AEG as a bounded review sub-state-machine, not a free-running agent swarm.

States:

`NOT_REQUIRED -> PLANNED -> RUNNING_CRITIC -> FINDINGS_READY -> CORRECTION_REQUIRED -> REVERIFYING -> PASS_TO_HEDS_FINAL`

Exceptional terminal states:

`BLOCKED | HARD_STOPPED | ABORTED_BY_POLICY`.

No state may transition directly from critic PASS to TRUSTED_MERGE.

## Required runtime contracts

M08 implementation must expose machine-readable schemas for:

1. `GauntletRun`
2. `CriticSelectionContract`
3. `CriticFinding`
4. `CorrectionDelta`
5. `GauntletEvidenceTrail`
6. `ReviewConvergenceSnapshot`
7. `FinalHedsReadiness`

All records bind Work Order, project/root identity and exact source/head where applicable.

## Critic execution

Critic roles are selected from risk evidence. Critic role diversity does not require model diversity.

When `MODEL_LOCK` is active, M08 MUST keep every critic inside the locked proven model/profile unless policy is explicitly changed by the authorized owner. Independence may instead be achieved through fresh context, blind delta, role-specific proof obligations and separate invocation identity.

Default concurrency is one critic at a time.

## Findings

Every finding includes:

- stable finding ID/fingerprint;
- severity;
- critic role;
- exact head;
- affected contract/symbol/path when known;
- proof/evidence references;
- confidence class;
- required correction or reason for BLOCKED;
- status OPEN | RESOLVED | REOPENED | INVALIDATED | ACCEPTED_NON_BLOCKING where policy permits.

HIGH/CRITICAL findings cannot disappear merely because a later critic omits them.

## Correction integration

M08 composes AEG with the existing Correction Delta Protocol:

- preserve valid evidence;
- invalidate proof whose validity inputs changed;
- re-check unresolved findings first;
- detect reopened/oscillating findings;
- avoid repository-wide re-review unless risk/evidence expands scope.

## Final HEDS readiness

`FinalHedsReadiness=true` requires:

- required AEG mode completed;
- independence requirement satisfied;
- all blocking findings resolved;
- no hidden HARD_STOP/ABORT/BLOCKED condition;
- RCG convergence accepted;
- budget/economic invariant evidence present;
- exact-head verification evidence current;
- final HEDS independent review still pending or completed separately.

It never means merge is already authorized.

## Observability events

M08 emits privacy-safe events for M30/M24 including:

- `gauntlet.started`
- `gauntlet.critic.selected`
- `gauntlet.critic.completed`
- `gauntlet.finding.opened`
- `gauntlet.finding.resolved`
- `gauntlet.correction.round`
- `gauntlet.escalated`
- `gauntlet.deescalated`
- `gauntlet.convergence.blocked`
- `gauntlet.hard_stopped`
- `gauntlet.pass_to_heds_final`

Events must be bounded, schema-closed and contain opaque correlation identifiers rather than raw prompts/secrets.

## Optimization requirements

- use proof/cache fingerprints before new model calls;
- critic context uses bounded Context Capsule, not full repository by default;
- route cheapest admissible model/effort under M05/M06/M07;
- run highest-information-value critic first using RARR/RAR;
- terminate early when APB is satisfied and mandatory coverage complete;
- do not run additional critics merely because budget remains;
- prefer deterministic tests/tools over LLM criticism when they can prove the same obligation more cheaply and reliably;
- reuse accepted unchanged evidence across correction rounds;
- learn repeated escaped finding classes through M20/DLL.

## Mandatory proofs

M08 deep discovery S03/S04 must include false-PASS, critic self-review, stale-head review, finding disappearance, correction oscillation, model-lock bypass, critic fan-out, duplicate critic invocation and incomplete final-readiness attacks.

Runtime promotion remains blocked until these proofs pass.
