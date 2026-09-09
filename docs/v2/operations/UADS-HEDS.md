# UADS V2 — HEDS Review & Engineering Delivery System

Status: CANONICAL OPERATING STANDARD IN REVIEW  
Date: 2026-09-09  
Upstream process source: Hive V2 HEDS at `KayzenRoot/hive-v2@ead0c8d92c9e84739e5c24913329e329f36ec251`

## 1. Decision

UADS V2 adopts the HIVE Engineering Delivery System (HEDS) as its canonical engineering delivery and review model.

UADS V2 does **not** fork HEDS into an incompatible second process. It implements a standalone-capable HEDS execution surface and, when Hive V2 is connected, exchanges compatible manifests/evidence with Hive rather than duplicating Hive's canonical governance authority.

Operating modes:

- `SOLO`: UADS executes HEDS locally and stores project-local governance/evidence in the repository plus operational runtime state in the global UADS sidecar.
- `HIVE_CONNECTED`: UADS executes the same bounded HEDS pipeline while Hive contributes canonical truth, macro-governance and promotion authority through explicit contracts.

Hive absence MUST NOT block normal UADS operation.

## 2. Primary objective

Optimize **Time-to-Trusted-Merge (TTTM)** rather than raw coding or raw review speed.

A review is considered improved only when it reduces orientation, verification, review or correction cost **without** increasing escaped defects, invalid proof reuse, security risk, architecture drift or correction loops.

## 3. Canonical HEDS pipeline in UADS V2

```text
SOURCE LOCK
  ↓
WORK ORDER
  ↓
CONTEXT CAPSULE
  ↓
IMPLEMENT
  ↓
CHANGE IMPACT MANIFEST
  ↓
RISK ROUTING
  ↓
SELECTED VERIFICATION
  ↓
EVIDENCE BUNDLE
  ↓
DELTA-FIRST REVIEW
  ↓
VERIFIED CORRECTION LOOP (if needed)
  ↓
TRUSTED MERGE
  ↓
CHECKPOINT UPDATE
  ↓
LEARNING FEEDBACK
```

No stage may silently substitute chat memory for repository evidence.

## 4. Core HEDS technologies adopted by UADS V2

### 4.1 Review Manifest (RM)
Machine-readable review entrypoint containing immutable Work Order/base/head identity, scope, impact, risk, evidence and verification references.

Default reviewer entrypoint is RM, not repository-wide scanning.

### 4.2 Context Capsule (CC)
Minimal deterministic context package for executor/reviewer.

Includes only relevant checkpoint pointer, decisions, requirements/DoD, architecture contracts, changed/required symbols/files, relevant tests/incidents and explicit exclusions.

UADS Context Intelligence C0-C5 is the runtime mechanism used to construct and expand the capsule progressively.

### 4.3 Proof Cache (PC)
Reusable evidence indexed by complete validity fingerprint.

Reuse is permitted only when every declared validity input remains unchanged. Unknown validity is not PASS. Broader proof reuse remains experiment-gated until benchmark evidence proves safety.

### 4.4 Correction Delta Protocol (CDP)
For `CORRECTION REQUIRED`, review resumes from rejected-head → corrective-head, unresolved findings, invalidated proof fingerprints and new evidence.

Still-valid evidence is retained. Accepted unchanged areas are not reviewed from zero by default.

### 4.5 Risk-Adaptive Review Router (RARR)
Routes every Work Order/PR into `LOW`, `STANDARD`, `ELEVATED` or `HIGH_ASSURANCE` and determines verification depth, independent checks, security/runtime requirements and proof-reuse eligibility.

### 4.6 Defect Learning Loop (DLL)
Material or escaped defects become structured learning:

`change → symptom → root cause → missed guard → permanent regression → selector/review rule update → defect-memory record`.

UADS Failure Memory / Experience Engine are the natural execution-layer homes for this data. Global/cross-project promotion remains Hive authority when connected.

### 4.7 Trusted Merge Queue (TMQ)
Where repository capabilities permit, approved PRs are revalidated at exact integration state before merge. UADS may orchestrate/verify readiness; repository/Hive governance retains merge authority.

### 4.8 Action Fingerprint Cache (AFC)
Build/test/lint/typecheck actions may reuse outputs only when declared inputs, toolchain and environment fingerprints are identical and inspectable.

Cache hit is evidence with provenance, never an assumption.

### 4.9 Time-to-Trusted-Merge (TTTM)
Primary delivery metric.

Required submetrics where observable:
- orientation time;
- implementation time;
- time-to-first-failure;
- verification wall-clock;
- review wall-clock;
- correction cycles;
- context/token cost;
- redundant work avoided;
- escaped defects;
- workers spawned / max concurrent workers;
- model/effort escalation.

## 5. Proprietary HEDS concepts adopted as design targets

These concepts originate in the Hive V2 HEDS process. UADS implements execution-layer support only where it complements Hive rather than duplicating canonical ownership.

### HEDS-P01 — Work Intent Graph (WIG)
Bounded graph linking Work Order intent to requirements, ADRs, modules, symbols, tests, runtime journeys and acceptance evidence.

UADS role: derive/use the task-local projection. Hive role when connected: provide/promote canonical graph truth.

### HEDS-P02 — Context Signal Budget (CSB)
Token/file budget for executor/reviewer context. Expansion requires unresolved uncertainty or risk.

UADS role: enforce/measure through Context Intelligence and Token & Quota Governor.

### HEDS-P03 — Proof Decay Index (PDI)
Estimates staleness risk from changed validity inputs, dependency/toolchain drift, flaky history and prior selector misses.

UADS role: use as a conservative invalidation/escalation signal, never a truth oracle.

### HEDS-P04 — Review Attention Router (RAR)
Ranks review surfaces by consequence × uncertainty × novelty × defect history × contract centrality.

UADS role: order review work sequentially so the single specialist/reviewer sees highest-information-value surfaces first.

### HEDS-P05 — Regression Escape Radar (RER)
Detects areas where tests/selectors historically underperform and temporarily increases verification strength.

### HEDS-P06 — Modular Boundary Sentinel (MBS)
Detects forbidden dependencies, cross-module leakage, cycles, oversized modules, unstable contracts and ownership ambiguity.

### HEDS-P07 — Complexity Budget Gate (CBG)
Requires justification when a Work Order adds materially more structural complexity than the approved requirement needs.

### HEDS-P08 — Rework Cost Ledger (RCL)
Classifies repeated review/correction cost: unclear Work Order, missing source, architecture ambiguity, weak test, executor error, stale environment, flaky CI, reviewer false positive or other structured causes.

### HEDS-P09 — Acceptance Evidence Compiler (AEC)
Compiles acceptance criteria into expected machine-readable proof obligations before implementation.

### HEDS-P10 — Project Bootstrap Contract Compiler (PBCC)
Generates canonical project/repository delivery skeletons from a template manifest. UADS may execute generation; Hive remains canonical owner when managing a Hive project.

## 6. HEDS research technologies to evaluate in UADS V2

These remain `CANDIDATE / EXPERIMENT REQUIRED` until module-session evidence promotes them:

- Change Isolation / Blast-Radius Budget;
- deterministic executor navigation index;
- executable contract-first acceptance;
- Independent Review Adversary;
- staleness/documentation drift gate;
- failure-budgeted autonomy;
- performance regression attribution;
- reproducible environment contract;
- Dependency Change Firewall;
- HEDS benchmark corpus;
- flaky-test containment/trust;
- dead-code/orphan-contract intelligence;
- change-aware documentation compiler;
- observability-by-contract;
- Change Entropy Index (CEI);
- Evidence Sufficiency Frontier (ESF);
- Context Waste Profiler (CWP);
- Repair Convergence Index (RCI);
- Architecture Friction Map (AFM);
- Verification Debt Ledger (VDL).

Each candidate must be reconciled against Hive V2 before UADS implementation to prevent duplication.

## 7. UADS-specific HEDS extensions

The following UADS concerns are mandatory additions to HEDS review because they are runtime-specific:

- specialist spawn count;
- maximum concurrent specialist workers;
- visible worker conversation count;
- background-worker capability truth;
- model/profile selection;
- reasoning/effort selection;
- quota/token amplification;
- retry convergence;
- context radius expansion;
- Evidence Cache reuse/invalidations;
- Failure Memory references;
- host capability assumptions;
- standalone vs Hive-connected behavior.

## 8. Review execution policy

Default review path:
1. validate Review Manifest identity;
2. inspect Work Intent Graph / Change Impact Manifest;
3. classify risk;
4. inspect selected verification and proof validity;
5. inspect highest-ranked changed symbols/patches;
6. validate runtime/resource behavior when applicable;
7. validate architecture/security/data integrity;
8. expand context only when evidence or risk justifies it.

Default specialist concurrency remains coordinator + maximum one active specialist worker.

## 9. Quality guardrails

All review acceleration fails closed.

Escalate toward fuller verification when:
- impact/context graph is stale/incomplete;
- dependency/config/toolchain blast radius is uncertain;
- selector confidence is insufficient;
- prior selector miss exists in the area;
- core security/persistence/migration/public contract changes;
- release/final gates require it;
- HIGH_ASSURANCE applies;
- proof validity cannot be demonstrated.

A missed HIGH/CRITICAL defect or unsafe proof reuse blocks promotion regardless of token/time improvement.

## 10. Standalone/Hive interoperability contract

### SOLO
UADS generates and consumes RM, CC, Change Impact Manifest, selected verification, Evidence Bundle, Correction Delta and local checkpoint delta without Hive dependency.

### HIVE_CONNECTED
Hive may supply canonical identity/scope/architecture/proof obligations via `HiveTaskEnvelope`. UADS returns an HEDS-compatible `UADSQualityBundle`. Hive reconciles and decides canonical promotion.

The same review semantics apply in both modes.

## 11. Implementation ownership

The main implementation home is **M08 Review Pipeline 2.0**, with supporting responsibilities in:
- M07 Token & Quota Governor;
- M09 Smart Gate Selector;
- M10 Fault Resolution Engine;
- M14 Context Radius Optimizer;
- M18 Hive Integration Bridge;
- M19 Evidence Cache 2.0;
- M20 Failure Memory 2.0;
- M21 Retry Controller;
- M22 Evidence-Driven Escalation;
- M24 Observability & Cost Ledger.

## 12. Promotion rule

This document makes the **HEDS model canonical for UADS V2 delivery**. It does not claim every automated HEDS technology above is already implemented in runtime code.

Runtime capability is promoted module-by-module only after tests, benchmarks, evidence and objective review.
