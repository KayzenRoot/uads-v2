# UADS V2 — HEDS 2.1 Adaptive Evidence Gauntlet Delta

Status: CANDIDATE DELTA
Work Order: UADS2-WO-021
Issue: #66
Base standard: `docs/v2/operations/UADS-HEDS.md`

## Decision

HEDS 2.1 adds the Adaptive Evidence Gauntlet (AEG) as an optional risk-routed adversarial sub-pipeline. It does not replace HEDS, Trusted Merge, exact-head verification, or Hive canonical governance.

Canonical AEG contract: `docs/v2/operations/UADS-ADAPTIVE-EVIDENCE-GAUNTLET.md`.

## Pipeline delta

Existing:

`Evidence Bundle -> Delta-First Review -> Verified Correction Loop -> Trusted Merge`

HEDS 2.1 candidate:

`Evidence Bundle -> AEG when RARR/M22 routes it -> Delta-First Correction -> Final Independent HEDS Review -> Trusted Merge`

LOW/mechanical work may remain on the standard path when risk/evidence does not justify AEG.

## New first-class artifacts

### Gauntlet Evidence Trail (GET)
Append-only logical record of activation rationale, critic selection, findings, disagreement, corrections, proof reuse/invalidations, model/effort changes, cost, convergence and terminal state.

### Critic Selection Contract (CSC)
Machine-verifiable declaration of critic role, risk surface, independence class, context digest, proof bar, model/effort, timeout and Economic Safety Envelope reservation.

### Review Convergence Guard (RCG)
Bounded stop/go logic that prevents endless correction loops and detects no-progress, oscillation, repeated finding fingerprints, budget depletion and deadline breach.

### Adversarial Proof Bar (APB)
Explicit acceptance obligations compiled from WO/DoD/ADR/contracts/tests/security/economic floors. Critics grade evidence against the bar, not subjective confidence.

## HEDS final review upgrade

The final HEDS review MUST validate, when AEG is required:

1. exact reviewed head identity;
2. required critic independence class;
3. critic role coverage against RARR risk surfaces;
4. no unresolved HIGH/CRITICAL finding hidden by later rounds;
5. no stale/invalid proof used as PASS;
6. correction deltas preserve unresolved findings and still-valid evidence;
7. AEG remained within token/cost/time/round/critic/concurrency limits;
8. no model/effort/fallback/broadcast policy bypass;
9. Review Convergence Guard reached an admissible terminal state;
10. required CI/security/release gates are green on the exact final head.

A last-critic PASS is evidence, not final authority. HEDS final review remains independent promotion gate.

## Risk-adaptive modes

- OFF: standard HEDS sufficient.
- LIGHT: one independent critic, one bounded correction round by default.
- STANDARD: sequential risk-selected critics with bounded corrections.
- HIGH_ASSURANCE: adversarial coverage of all required high-consequence surfaces plus final independent review.

Fixed all-critic fan-out is prohibited.

## Economic doctrine

HEDS 2.1 inherits the CRITICAL Economic Safety Envelope doctrine from M30 S03/S04.

Every AEG run requires finite token, monetary-cost-when-known, model-call, critic, round, concurrency, context-growth and wall-time bounds. Default specialist concurrency remains one. M07 admission precedes every model-bearing critic/correction dispatch. HARD_STOP is local and cannot require another model call.

## Model/effort doctrine

- operator MODEL_LOCK remains authoritative when enforceable;
- CHEAPEST_QUALIFIED may select lowest-cost admissible profile;
- Effort Autopilot uses lowest safe supported effort;
- escalation requires M22 evidence;
- retry does not automatically increase effort;
- MAX is exceptional and never default;
- critic diversity cannot silently bypass Model Lock.

## New metrics

HEDS TTTM instrumentation is extended with:

- AEG activation rate;
- critics invoked per trusted merge;
- correction rounds per trusted merge;
- confirmed-finding precision;
- critic disagreement rate;
- false-pass/escaped-defect rate;
- proof reuse and invalidation rates;
- Review Convergence Index candidate;
- tokens/cost per critic and per trusted merge;
- redundant-analysis rate;
- blocked/hard-stopped AEG rate;
- model/effort escalation rate.

## Promotion

This delta becomes canonical only after WO-021 exact-head gates, HEDS review and merge. Runtime capability remains module-by-module proof-gated and MUST NOT be claimed merely because this design delta is merged.
