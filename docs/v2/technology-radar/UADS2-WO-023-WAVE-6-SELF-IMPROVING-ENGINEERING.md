# UADS2-WO-023 — Wave 6: Governed Self-Improving Engineering

Status: CANDIDATE / RESEARCH ARCHITECTURE
Scope: UADS V2 only
Runtime adoption: NOT AUTHORIZED by this document

## Mission

Allow UADS to improve engineering decisions from measured execution outcomes without silently rewriting policy, weakening quality floors, expanding privileges, increasing economic capacity, or absorbing Hive-owned deep memory/RAG responsibilities.

The system may learn operational preferences and propose/promote bounded strategies only through evidence-backed governance.

## Core principle

Learning may optimize choices inside an authorized envelope. Learning MUST NOT redefine the envelope.

Immutable/authoritative boundaries include security policy, economic hard limits, release floors, authorization, project ownership boundaries, HEDS quality floors, and user Model Lock/parallelism controls.

## Architecture

Execution -> AFR/HEP evidence -> Outcome Normalizer -> Strategy Attribution -> Comparative Evaluator -> Candidate Strategy Registry -> Shadow Evaluation -> Canary Evaluation -> Promotion Gate -> Versioned Strategy Policy -> Scheduler/Router/Decomposer

M30 projects every active strategy, confidence, evidence age, rollback state, cost/quality delta and whether a decision is learned, static or user-locked.

## Proprietary candidates

### 1. Engineering Outcome Ledger (EOL)
Bounded operational ledger of engineering outcomes. Stores structured evidence references, not deep project memory. Captures task class, strategy fingerprint, model/profile/effort, specialist assignment, decomposition topology, concurrency, elapsed time, tokens/cost, retries, integration conflicts, tests, AEG/HEDS findings, regressions and terminal outcome.

### 2. Strategy Evidence Envelope (SEE)
Machine-verifiable evidence package for a candidate strategy: population, task classes, confidence interval/uncertainty, recency, quality delta, latency delta, cost delta, failure/regression delta, environment/host constraints and provenance.

### 3. Specialist Competence Passport (SCP)
Evidence-backed competence profile for a specialist role. No self-declared expertise. Competence is scoped by task class, environment, tool set and evidence age. It can decay to UNKNOWN when stale or distribution shifts.

### 4. Decomposition Quality Score (DQS)
Evaluates prompt decomposition after execution using dependency correctness, conflict rate, critical-path reduction, integration rework, duplicate work, defect escape and economic efficiency. Diagnostic/ranking input only, never sole release authority.

### 5. Strategy Promotion Gate (SPG)
Promotes a learned strategy only after sufficient evidence, shadow comparison, quality-floor preservation, economic safety, policy compatibility and rollback readiness. Promotion states: CANDIDATE -> SHADOW -> CANARY -> PROMOTED; with REJECTED, QUARANTINED and ROLLED_BACK.

### 6. Learning Blast-Radius Fence (LBF)
Limits where a learned strategy may apply: task class, project, host class, provider/model family, risk class, tool set and time lease. No global promotion from narrow evidence.

### 7. Counterfactual Strategy Evaluator (CSE)
Uses safe replay/simulation and historical evidence to compare alternative decompositions/routing/scheduling without paying for unnecessary live model calls whenever possible. Counterfactual estimates MUST be labeled ESTIMATED/SIMULATED, never LIVE truth.

### 8. Engineering Drift Sentinel (EDS)
Detects when previously successful strategies stop performing because model versions, host capabilities, tools, repository architecture, provider behavior or workload distributions changed. Drift can demote confidence or force revalidation.

### 9. Safe Exploration Budget (SEB)
Finite budget for experimentation. Exploration can never consume production hard budget without explicit reservation. Controls number of experiments, token/cost ceiling, concurrency, risk class and wall time.

### 10. Strategy Rollback Receipt (SRR-S)
Evidence that a strategy rollback restored the prior policy/strategy version and stopped new dispatches under the bad strategy. In-flight side effects follow SIR/DEF reconciliation rules.

## Decisions UADS may learn

- decomposition templates for recurring task classes;
- specialist-role selection;
- model/provider preference inside capability, Model Lock and policy constraints;
- per-task effort selection;
- concurrency within cockpit/user ceilings and PWG/PCG safety;
- scheduling and critical-path priorities;
- critic mix/AEG depth within bounded review policy;
- retry timing inside single-owner retry limits;
- operational cache/warm-pool decisions;
- observability detail inside AOBC limits.

## Decisions UADS may NOT autonomously learn away

- hard economic budgets;
- kill switches/HARD_STOP;
- authorization/identity/capability requirements;
- secret handling and sandbox requirements;
- user Model Lock;
- release-blocking proof floors;
- HEDS independence;
- project ownership boundaries;
- maximum delegation/fanout hard caps;
- provenance requirements;
- prohibition on fabricated operational truth.

## Multi-objective optimization

No single reward such as speed is sufficient. Candidate strategies are evaluated against a Pareto-like frontier across:

1. quality/defect escape;
2. wall-clock latency;
3. token and monetary cost;
4. reliability/rework;
5. security/policy violations;
6. integration conflict rate;
7. resource pressure;
8. operator preference.

A faster strategy that materially worsens quality or violates a hard floor is not an improvement.

## Cold start and confidence

When evidence is insufficient, report UNKNOWN and use governed baseline strategy. No invented competence score. Confidence must account for sample size, recency, workload similarity, environment compatibility and variance.

## Exploration vs exploitation

Default production behavior is conservative exploitation of proven strategies. Exploration occurs only inside SEB and preferably in SHADOW/simulation. HIGH/CRITICAL mutation paths require stronger evidence and may forbid live exploration entirely.

## Anti-gaming

Agents cannot grade themselves. Builder output is evaluated by independent tests/critics/HEDS. Strategy success cannot be inferred merely from task completion. Reward signals must include regressions, later corrections and integration defects where observable.

## Cockpit controls

Living Cockpit surfaces:
- Self-Improvement: OFF / OBSERVE / SHADOW / CANARY / GOVERNED AUTO;
- learning scope: execution / WO / project / global;
- exploration budget;
- minimum confidence;
- current strategy version;
- promoted/candidate/quarantined strategies;
- specialist competence evidence;
- quality/time/cost deltas;
- drift warnings;
- rollback control;
- WHY THIS STRATEGY decision explanation.

OFF disables learning-driven decisions but does not erase evidence. OBSERVE records/evaluates only. SHADOW compares without changing production decisions. CANARY applies to bounded eligible work. GOVERNED AUTO may promote only within SPG/LBF and never across hard policy boundaries.

## Cross-project boundary

Hive V2 owns deep context, RAG, semantic memory, knowledge retrieval and forgetting/freshness of project knowledge. UADS owns bounded execution evidence and operational strategy learning. If Hive is later integrated, UADS consumes explicit interfaces rather than duplicating Hive memory semantics.

UGAS V2 owns media/generation/marketing-domain learning. UADS may optimize orchestration of UGAS workflows but not absorb UGAS domain models.

## Enterprise pillars

M27: evidence segmentation, bounded ledgers, scalable evaluation.
M28: strategy rollback, stale evidence handling, drift demotion, baseline fallback.
M29: no policy self-modification, provenance, anti-gaming, bounded exploration.
M30: truthful learned/static/user-locked decision projection and live controls.
M31: promotion gates, canary, rollback and release proof.

## Release principle

No self-improving runtime path ships merely because average benchmark performance improves. It must preserve all applicable security, economic, truth, replay and release invariants and prove rollback.