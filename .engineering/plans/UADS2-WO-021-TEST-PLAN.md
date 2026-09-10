# UADS2-WO-021 — AEG / HEDS 2.1 Test Plan

Status: ACTIVE PLAN
Issue: #66
Risk: HIGH with CRITICAL economic-safety subset

## Contract-level proof obligations

### G-001 Independence
SELF review cannot satisfy an independent-review requirement. FRESH_CONTEXT/BLIND_DELTA invocations must bind separate critic identity and exact head.

### G-002 Risk-selected critics
LOW/mechanical work must not spawn unnecessary critics. HIGH_ASSURANCE must cover declared high-consequence risk surfaces.

### G-003 Economic bounds
Attempt to exceed max rounds, critics, concurrency, tokens, cost, context growth and wall time. New dispatch must be denied before spend.

### G-004 Budget conservation
Critic/correction child reservations cannot mint budget; restart cannot reset consumed/reserved capacity.

### G-005 Retry ownership
Provider/adapter/reviewer failures must not create retry multiplication outside M21.

### G-006 Model Lock integrity
Critic diversity cannot route outside an active proven MODEL_LOCK. Host mismatch remains explicit.

### G-007 Effort economy
Trivial critics use lowest safe supported effort; retry alone does not escalate; MAX is never default.

### G-008 Finding persistence
HIGH/CRITICAL open findings remain in GET until explicitly resolved/invalidated by evidence; omission by later critic cannot hide them.

### G-009 Correction Delta
Still-valid evidence is reused; changed validity inputs invalidate only affected proof; unresolved findings are checked first.

### G-010 Convergence Guard
No-progress and oscillating correction scenarios terminate BLOCKED/HARD_STOPPED inside declared bounds.

### G-011 Exact-head drift
A new commit after critic/HEDS evidence invalidates final readiness until exact-head revalidation.

### G-012 Final authority
AEG PASS_TO_HEDS_FINAL cannot directly produce TRUSTED_MERGE. Final HEDS review + repository gates remain required.

### G-013 Deterministic-first optimization
When deterministic tests/tools can satisfy an obligation, policy prefers them over additional LLM critics unless evidence justifies semantic review.

### G-014 Proof/cache reuse
Valid proof-cache reuse reduces model calls without permitting stale/unknown evidence to PASS.

### G-015 Cockpit truth
M30 projection accurately reports AEG mode, rounds, critics, findings, budget/cost, convergence and breaker state; missing source is UNKNOWN/UNAVAILABLE.

### G-016 Interoperability
SOLO works with Hive absent; HIVE_CONNECTED exchanges GET/quality evidence without duplicating Hive canonical governance.

## Benchmark corpus
Compare standard HEDS vs AEG LIGHT/STANDARD/HIGH_ASSURANCE on a versioned corpus containing trivial, normal, architecture, security, regression and intentionally seeded defect tasks.

Measure separately:
- defect detection / seeded defect recall;
- confirmed-finding precision;
- false-pass and escaped defects;
- correction rounds;
- TTTM;
- tokens and monetary cost where known;
- critic calls and concurrency;
- proof reuse;
- model/effort escalation;
- redundant analysis.

Do not collapse quality and cost into one opaque score.

## Promotion gates
- no unresolved CRITICAL economic-safety contract gap;
- no path from critic verdict directly to merge;
- all exact-head repository gates green;
- final HEDS review APPROVED;
- runtime implementation remains explicitly unclaimed until owning-module S05 slices pass their own proofs.
