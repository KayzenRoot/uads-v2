# UADS V2 — Review Protocol

Status: CANONICAL OPERATING OVERLAY IN REVIEW  
Canonical model: **HIVE Engineering Delivery System (HEDS)**  
UADS HEDS contract: `docs/v2/operations/UADS-HEDS.md`

## Source order

Before a material verdict:
1. V2 checkpoint;
2. V2 Decisions Ledger / accepted ADRs;
3. V2 Scope;
4. V2 DoD;
5. V2 Architecture;
6. V2 Requirements;
7. inherited V1 canonical docs;
8. active Work Order / Review Manifest / Evidence Bundle.

## Canonical HEDS sequence

```text
SOURCE / CONTEXT LOCK
→ WORK ORDER
→ CONTEXT CAPSULE
→ IMPLEMENT
→ CHANGE IMPACT MANIFEST
→ RISK ROUTING
→ SELECTED VERIFICATION
→ EVIDENCE BUNDLE
→ DELTA-FIRST REVIEW
→ VERIFIED CORRECTION LOOP, if needed
→ TRUSTED MERGE
→ CHECKPOINT UPDATE
→ LEARNING FEEDBACK
```

For audit presentation this resolves to:
1. CONTEXT LOCK;
2. PREFLIGHT;
3. REVIEW MANIFEST identity;
4. CONTEXT CAPSULE / CHANGE IMPACT;
5. RISK ROUTING;
6. SELECTED VERIFICATION;
7. EVIDENCE BUNDLE;
8. DELTA-FIRST AUDIT;
9. VERDICT: `APPROVED`, `CORRECTION REQUIRED` or `BLOCKED`;
10. CHECKPOINT DELTA only after objective approval.

## Core review technologies

Mandatory HEDS concepts:
- Review Manifest (RM);
- Context Capsule (CC);
- Change Impact Manifest;
- Proof Cache / proof-validity fingerprints;
- Correction Delta Protocol (CDP);
- Risk-Adaptive Review Router (RARR);
- Defect Learning Loop (DLL);
- Trusted Merge Queue semantics when repository capabilities permit;
- Action Fingerprint Cache (AFC);
- Time-to-Trusted-Merge (TTTM) metrics.

Architectural design targets HEDS-P01–P10 and research candidates are defined in `docs/v2/operations/UADS-HEDS.md`.

## Progressive disclosure

R0: identity / Work Order / PR / risk.  
R1: changed files / symbols / impact.  
R2: impacted requirements / ADRs / contracts / tests.  
R3: patches and failing evidence.  
R4: complete affected files / dependency neighborhoods.  
R5: repository-wide review only when risk, uncertainty or evidence justifies it.

Reviewer starts from the Review Manifest and bounded impact/context artifacts rather than scanning the repository by default.

## UADS-specific review guards

Review MUST explicitly inspect:
- specialist spawn count;
- maximum worker concurrency;
- unexpected background work;
- visible worker conversation count;
- token/quota amplification;
- retries and repair convergence;
- model/profile and effort escalation;
- capability assumptions;
- stale evidence reuse;
- context over-expansion;
- host/session fragmentation;
- SOLO/HIVE_CONNECTED behavior.

## Correction Delta Protocol

`CORRECTION REQUIRED` stays in the same Work Order/PR when safe.

Review resumes from:
- rejected head SHA;
- corrective head SHA;
- unresolved findings;
- invalidated proof fingerprints;
- newly added evidence.

Still-valid evidence is retained. Unchanged accepted areas are not reviewed from zero by default.

## Proof validity

Deterministic proof may be reused only when its complete validity fingerprint survives unchanged. Unknown or incomplete validity is not PASS.

Broader proof reuse remains experiment-gated until benchmark evidence proves safety. HIGH_ASSURANCE may prohibit reuse entirely for selected proof obligations.

## Risk tiers

LOW: targeted deterministic checks.  
STANDARD: impacted unit/integration + lint/typecheck/build as applicable.  
ELEVATED: wider regression + relevant persistence/security/recovery/runtime checks.  
HIGH_ASSURANCE: independent proof obligations, broad regression and rollback/roll-forward evidence.

Risk drives verification depth, independent review, security/runtime requirements and reuse eligibility.

## Time-to-Trusted-Merge

Primary optimization target is **TTTM**, not raw review speed.

Track where observable:
- executor orientation;
- implementation;
- time-to-first-failure;
- verification wall-clock;
- review wall-clock;
- correction cycles;
- context/tokens;
- redundant work avoided;
- workers spawned/concurrency;
- model/effort escalation;
- escaped defects.

A review that spends fewer tokens but increases escaped defects, invalid proof reuse or correction loops is a regression.

## Operating modes

### SOLO
UADS generates and consumes HEDS review artifacts locally without Hive dependency.

### HIVE_CONNECTED
UADS consumes canonical bounded context/proof obligations from Hive and returns HEDS-compatible evidence through `UADSQualityBundle`. Hive decides canonical promotion.

Review semantics remain the same in both modes.
