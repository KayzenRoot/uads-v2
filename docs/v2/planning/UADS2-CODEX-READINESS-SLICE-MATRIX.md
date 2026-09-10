# UADS V2 — Codex Readiness & Slice Proof Matrix

Status: CANDIDATE
Work Order: UADS2-WO-024
Purpose: ensure future executor prompts arrive implementation-ready and do not spend model time rediscovering architecture.

## Readiness states
- NOT_READY — architecture/interface/proof work still missing.
- ARCH_READY — ownership/interfaces frozen, source boundary still incomplete.
- PACKAGE_READY — executor package complete; runtime execution justified.
- BLOCKED — unresolved prerequisite or truth gap.

## First implementation slices

| Slice | Owner | Prerequisites | Likely source areas | Mandatory proof focus | Risk | Current readiness |
|---|---|---|---|---|---|---|
| IW0-01 M30 Truth Kernel | M30 | M03 frozen boundary | `src/kernel`, observability/event contracts | OP-001/002/003, freshness/integrity, no fabricated LIVE | HIGH | ARCH_READY |
| IW0-02 Living Cockpit read model | M30 | IW0-01 | `src/commands`, dashboard/static/SSE seams | OP-008/009, stale/degraded/unavailable truth | HIGH | ARCH_READY |
| IW1-01 proof-aware model routing | M05 | M03 | adapters/router seams + kernel | model capability before preference, Model Lock, no silent fallback | HIGH | ARCH_READY |
| IW1-02 effort control | M06 | IW1-01 | routing/execution contracts | requested/applied effort truth, no MAX default | MEDIUM/HIGH | ARCH_READY |
| IW1-03 ESE + breaker | M07 | M05/M06 seams | execution/economic kernel | ES-001.. economic conservation/HARD_STOP | CRITICAL economic | ARCH_READY |
| IW1-04 M24 accounting seam | M24 | IW1-03 | accounting/events/projection seams | cost attribution, UNKNOWN no capacity, reconciliation | HIGH | ARCH_READY |
| IW2-01 RCE/TCIR | M29+M03 | M03 | adapters/tool discovery | P0-MCP compatibility/freshness/catalog integrity | HIGH | ARCH_READY |
| IW2-02 TCF/PDFab/POE | M29 | IW2-01 | adapters/security/policy seams | deny-by-default, obligations, non-amplification | CRITICAL privileged | ARCH_READY |
| IW2-03 MCP Policy Gateway | M29 | IW2-02 | MCP adapter boundary | issuer/routing confusion, stale grant, tool substitution | CRITICAL privileged | NOT_READY until exact adapter map |
| IW3-01 retry authority | M21 | economic enforcement | execution/retry seams | single retry owner, bounded attempts, UNKNOWN_OUTCOME | CRITICAL effects | ARCH_READY |
| IW3-02 SIR | M28 | IW3-01 | execution/tool/github effect seams | side-effect classification, replay allowance | CRITICAL effects | ARCH_READY |
| IW3-03 DEF | M28 | IW3-02 | kernel/execution persistence | deterministic state, checkpoint integrity, crash/restart | CRITICAL recovery | ARCH_READY |
| IW4-01 Prompt Planning Graph | orchestration | I-WAVE-1 minima | orchestration/eval | dependency correctness, bounded graph | HIGH | ARCH_READY |
| IW4-02 Specialist Router | orchestration/M05/M06 | IW4-01 | orchestration/router | evidence-backed specialist selection, per-task effort | HIGH | ARCH_READY |
| IW4-03 bounded parallel dispatcher | orchestration/M07/M21 | IW4-01/02 + SIR minima | execution kernel | budget conservation, concurrency fence, no duplicate effects | CRITICAL economic/effects | ARCH_READY |
| IW4-04 cockpit parallel control | M30 projection | IW4-03 | dashboard/command seams | OFF/AUTO/ECO/BALANCED/TURBO/CUSTOM truthful control | HIGH | ARCH_READY |

## CODEX_READY package requirements per slice
Each PACKAGE_READY slice must provide:
1. stable slice ID and exact objective;
2. non-goals;
3. base branch/SHA at dispatch;
4. allowed source areas and forbidden areas;
5. frozen interfaces consumed/produced;
6. precise runtime invariants;
7. proof IDs and test expectations;
8. Windows/Linux matrix where applicable;
9. model/effort recommendation for executor work;
10. executor ESE/budget ceiling where applicable;
11. evidence files to produce;
12. M30 projection obligations;
13. rollback/recovery requirements;
14. STOP CONDITION;
15. escalation rule: NEEDS_ARCHITECTURE rather than redesign.

## First unavoidable executor threshold
The first slice that should require Codex/local executor is IW0-01/IW0-02, because proving the Truth Kernel and Living Cockpit requires TypeScript changes, test execution, HTTP/SSE runtime behavior, freshness/corruption scenarios, and local performance evidence. GitHub can freeze every instruction before that boundary but cannot truthfully substitute for runtime proof.

## Recommended executor routing for initial implementation
Default preference: GPT-5.6 Luna when host proves it is available/admissible.
- mechanical edits: LOW
- normal implementation/tests: MEDIUM
- difficult integration/security reasoning: HIGH
- XHIGH only for unresolved hard defects
- MAX prohibited as routine default
Model Lock must be obeyed when selected by operator; host-fixed mismatch is surfaced truthfully.

## Packaging order before first dispatch
P0: complete exact source boundary for IW0-01/IW0-02.
P0: create dedicated Test Plan + Evidence Bundle template for IW0 slice.
P0: create executor prompt/work order with no unresolved architecture.
P1: pre-package I-WAVE-1 while I-WAVE-0 implementation runs later.

## Stop condition
This matrix is complete when the first executor slice reaches PACKAGE_READY without requiring the executor to decide module ownership, architecture, proof strategy, or source boundaries.