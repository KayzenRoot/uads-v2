# UADS V2 — Review Protocol

Status: CANONICAL OPERATING OVERLAY IN REVIEW  
Derived from the current Hive V2 Review Standard v2 / HEDS operating model.

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

## Canonical sequence

1. CONTEXT LOCK: base/head/WO + critical fingerprints.
2. PREFLIGHT: scope, architecture, risk, stale-context detection.
3. CHANGE IMPACT: Git diff, symbols, contracts, dependencies, schemas/config.
4. SELECTED VERIFICATION: explain each selected test/proof.
5. EVIDENCE BUNDLE: tests, lint/typecheck/build, security/architecture/runtime evidence.
6. AUDIT: compare against scope, architecture, requirements, acceptance criteria and DoD.
7. VERDICT: APPROVED / CORRECTION REQUIRED / BLOCKED.
8. CHECKPOINT DELTA: only after objective approval.

## Progressive disclosure

R0: identity/WO/PR/risk.  
R1: changed files/symbols/impact.  
R2: impacted requirements/ADRs/contracts/tests.  
R3: patches and failing evidence.  
R4: complete affected files/dependency neighborhoods.  
R5: repository-wide review only if risk/uncertainty justifies it.

## UADS-specific review guards

Review MUST explicitly inspect:
- specialist spawn count;
- maximum worker concurrency;
- unexpected background work;
- token/quota amplification;
- duplicate analysis;
- retries and model/effort escalation;
- capability assumptions;
- stale evidence reuse;
- context over-expansion;
- host/session fragmentation.

## Correction Delta

CORRECTION REQUIRED stays in the same Work Order/PR when safe. Review starts from rejected-head → corrected-head and reuses only still-valid prior evidence. Do not restart from zero by default.

## Proof validity

Deterministic proof may be cached only when its complete validity fingerprint remains unchanged. Hive ADR-024 is still EXPERIMENT REQUIRED, therefore broader proof reuse in UADS V2 is not considered fully approved until benchmarked. HIGH_ASSURANCE may forbid reuse.

## Risk tiers

LOW: targeted checks.  
STANDARD: unit/integration + lint/typecheck/build as applicable.  
ELEVATED: wider regression + relevant persistence/security/recovery/runtime checks.  
HIGH_ASSURANCE: independent proof obligations, broad regression and rollback/roll-forward evidence.

## Primary optimization target

Time-to-Trusted-Merge, not raw review speed.

A review that spends fewer tokens but increases escaped defects or correction cycles is a regression.
