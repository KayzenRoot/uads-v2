# UADS V2 — Adaptive Evidence Gauntlet (AEG)

Status: CANDIDATE CROSS-MODULE CONTRACT
Work Order: UADS2-WO-021
Issue: #66
Risk: HIGH with CRITICAL economic-safety subset

## 1. Purpose

Adaptive Evidence Gauntlet (AEG) is the UADS-native adversarial review loop used when risk, uncertainty, novelty or failed proof justifies review beyond the normal single-pass path.

AEG is not an unlimited builder/critic loop. Every run is bounded by evidence, budget, time, critic count, concurrency, correction rounds and escalation policy.

Primary objective: increase trusted defect detection and correction convergence while minimizing Time-to-Trusted-Merge, token spend and redundant analysis.

## 2. Ownership

- M08 Review Pipeline 2.0 owns AEG orchestration and verdict integration.
- M07 Token & Quota Governor owns Economic Safety Envelope admission/reservation and hard-stop enforcement.
- M22 Evidence-Driven Escalation owns reasons for adding critic depth, context, model capability or effort.
- M21 Retry Controller owns retry semantics; AEG cannot create an independent retry layer.
- M19 Evidence Cache owns reusable proof validity.
- M20 Failure Memory receives escaped/material defect learning.
- M24 owns Work Order token/cost attribution.
- M30 projects AEG state into the Living Operations Organism cockpit.
- M31 consumes AEG/HEDS evidence as part of safe release policy.

## 3. Activation policy

AEG modes:

- OFF: LOW-risk/mechanical work where standard HEDS evidence is sufficient.
- LIGHT: one independent critic, maximum one correction round by default.
- STANDARD: risk-selected critics executed sequentially, bounded correction rounds.
- HIGH_ASSURANCE: independent adversarial coverage selected from declared risk surfaces, strongest proof obligations and final HEDS independence gate.

Activation and mode MUST be derived from RARR/M22 evidence, not habit or model availability.

## 4. Critic roles

Critics are capabilities, not permanently spawned agents. Candidate roles:

- correctness
- regression
- security
- architecture/boundary
- performance/resource
- economic/token-spend
- data integrity/migration
- UX/accessibility
- release/operations

The Critic Selection Contract chooses only roles supported by the Work Order risk/impact graph. Fixed all-critic fan-out is prohibited.

## 5. Critic Selection Contract (CSC)

Every critic invocation records:

- criticRunId
- Work Order / PR / exact head
- role
- risk surfaces covered
- independence class
- context capsule digest
- proof obligations
- model/profile and requested/applied effort
- ESE reservation
- timeout
- expected output schema
- prohibited assumptions

Independence classes:

- SELF: implementer-generated self-check; useful but never satisfies independent-review requirement.
- FRESH_CONTEXT: independent invocation with bounded fresh context.
- BLIND_DELTA: critic receives acceptance bar + relevant evidence/delta without implementer rationale unless needed later.
- DIVERSE_PROFILE: optional evidence-gated model/profile diversity. Never mandatory merely to create diversity and never bypasses Model Lock.

HIGH_ASSURANCE requires at least one independent class other than SELF for relevant high-consequence surfaces.

## 6. Adversarial Proof Bar (APB)

A critic does not answer merely whether a change 'looks good'. It evaluates explicit proof obligations derived from:

- Work Order acceptance criteria
- DoD
- frozen ADR/architecture contracts
- S04 proof IDs where applicable
- security/economic invariants
- relevant regression tests
- benchmark floors/targets

Each finding maps to a stable obligation/evidence reference or is marked exploratory with confidence and required follow-up.

## 7. Gauntlet Evidence Trail (GET)

AEG emits one append-only logical trail containing:

- run identity and exact source/head
- activation rationale
- mode and budgets
- critic selection decisions
- critic results/findings
- disagreement/uncertainty
- correction deltas
- evidence reused/invalidated
- model/effort escalations and reasons
- tokens/cost/time consumed and reserved
- convergence signals
- breaker/kill-switch events
- final unresolved finding set
- terminal outcome

Terminal outcomes:

- PASS_TO_HEDS_FINAL
- CORRECTION_REQUIRED
- BLOCKED
- HARD_STOPPED
- ABORTED_BY_POLICY

AEG never directly produces TRUSTED_MERGE.

## 8. Review Convergence Guard (RCG)

RCG prevents endless correction loops.

Every round computes bounded convergence signals:

- unresolved finding count by severity
- newly introduced findings
- findings closed
- reopened findings
- correction delta size
- repeated/similar finding fingerprint rate
- critic disagreement
- proof coverage delta
- token/cost burn delta

RCG MUST stop or block when any configured condition occurs, including:

- max rounds reached
- no material progress for N bounded rounds
- finding oscillation/reopen pattern
- repeated equivalent correction failure
- ESE depletion
- wall-clock deadline
- economic circuit breaker THROTTLED/HARD_STOP
- unresolved CRITICAL requirement lacking admissible correction path

RCG must never request another LLM call to execute emergency stop.

## 9. Economic bounds

Every AEG run requires finite limits for:

- maxRounds
- maxCriticInvocations
- maxConcurrentCritics
- maxTokens
- maxMonetaryCost where price truth exists
- maxWallTime
- maxContextGrowth
- maxModelEscalations
- maxEffortEscalations

Default specialist concurrency remains 1. Parallel critics are EXPERIMENT-GATED and require M27/M07 proof that parallelism improves TTTM without unacceptable cost/duplication.

No critic or correction round may mint budget. Child reservations conserve the parent Work Order/ESE budget.

## 10. Model and effort policy

AEG obeys the same routing policy as the rest of UADS:

- MODEL_LOCK is authoritative when active and proven enforceable.
- CHEAPEST_QUALIFIED may choose the lowest-cost admissible profile.
- M06 Effort Autopilot selects the lowest safe supported effort.
- Escalation requires M22 reason evidence.
- Retry alone is not reason to raise effort/model cost.
- MAX effort is never default.
- no silent multi-model broadcast or expensive fallback.

Critic diversity MUST NOT silently override operator Model Lock.

## 11. HEDS integration

HEDS pipeline becomes:

SOURCE LOCK -> WORK ORDER -> CONTEXT CAPSULE -> IMPLEMENT -> CHANGE IMPACT -> RISK ROUTING -> SELECTED VERIFICATION -> EVIDENCE BUNDLE -> AEG WHEN ROUTED -> DELTA-FIRST CORRECTION -> HEDS FINAL INDEPENDENT REVIEW -> TRUSTED MERGE -> CHECKPOINT -> LEARNING.

HEDS final review validates:

- exact-head identity
- required critic independence
- all HIGH/CRITICAL findings resolved or explicitly blocking
- proof validity and staleness
- economic bounds respected
- no hidden AEG abort/timeout/HARD_STOP
- convergence acceptable
- required release gates green

The final reviewer may use GET as evidence but cannot merely copy the last critic verdict.

## 12. Cockpit projection

M30 should expose:

- AEG mode/state
- active/total critics
- current round / max rounds
- selected critic role and reason
- unresolved findings by severity
- corrections and convergence trend
- proof coverage
- tokens/cost/reservations
- model/effort and escalation receipts
- breaker/kill state
- exact head under review
- final HEDS readiness

Missing data is UNKNOWN/UNAVAILABLE, never fabricated healthy/current.

## 13. Metrics

Track at minimum:

- false-pass rate
- escaped defects
- critic precision / confirmed finding rate
- critic disagreement rate
- correction rounds per trusted merge
- Repair Convergence Index candidate
- proof reuse rate and invalidation rate
- redundant analysis rate
- tokens/cost per trusted merge
- TTTM delta vs standard HEDS
- model/effort escalation rate
- blocked/hard-stopped run rate

## 14. Mandatory tests before runtime promotion

- implementer SELF cannot satisfy independent-review requirement;
- fixed all-critic fan-out is rejected by policy;
- critic selection only covers risk-supported roles;
- max rounds/critics/tokens/cost/time cannot be exceeded;
- repeated no-progress loop terminates BLOCKED/HARD_STOPPED;
- critic retries do not multiply M21 retry budget;
- Model Lock cannot be bypassed for critic diversity;
- unsupported effort/model never fabricated;
- correction delta preserves still-valid evidence and unresolved findings;
- exact-head drift invalidates final readiness;
- final HEDS review cannot approve with unresolved CRITICAL finding;
- cockpit accurately renders AEG budget/state/freshness;
- SOLO mode works without Hive;
- HIVE_CONNECTED exchanges evidence without duplicating Hive canonical authority.

## 15. Promotion rule

This contract may be promoted as an HEDS design capability before full runtime implementation, but runtime claims remain module-by-module proof-gated. No module may claim AEG enforcement until its owning slice has passed tests, Evidence Bundle, exact-head gates and HEDS.
