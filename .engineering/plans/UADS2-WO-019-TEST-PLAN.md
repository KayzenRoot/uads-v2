# UADS2-WO-019 — S04 Proof & Benchmark Design Test Plan

Status: ACTIVE PLAN
Risk: HIGH with CRITICAL economic-safety subset
Issue: #63

## Scope
Validate completeness, measurability, traceability and release semantics of the M30 S04 proof design. No runtime implementation is claimed by this Work Order.

## Required design checks
1. Every S03 HIGH/CRITICAL failure path maps to one or more stable S04 proof IDs.
2. Every token-spend CRITICAL requirement maps to ES-* and, where adversarial, EC-* scenarios.
3. Every CRITICAL economic release rule has an objective pass/fail floor.
4. Model Lock, Cheapest Qualified, Quality-Floor Autoroute and Effort Autopilot have distinct proofs.
5. Unsupported/host-fixed model or effort capability cannot be represented as enforced.
6. No MAX-by-default, silent expensive fallback, retry amplification or implicit ensemble path is permitted.
7. UNKNOWN accounting cannot become zero/new spend capacity.
8. HARD_STOP and kill switches require zero LLM calls for enforcement.
9. Benchmark results require environment identity, evidence class and reproducible configuration.
10. Historical developer-host measurements are observations, not production SLOs.
11. Issue #39/B6 remains visible and quantitatively benchmarked.
12. CRITICAL economic floors cannot use generic JUSTIFIED_EXCEPTION while affected autonomy is enabled.

## Hosted governance gates
Exact-head CI, CodeQL, Dependency Review, Cross-Platform Compatibility and HEDS are mandatory before S04 freeze.

## Stop condition
CORRECTION REQUIRED if any S03 HIGH/CRITICAL path lacks a measurable proof, any economic-safety floor is ambiguous/non-blocking, or any candidate threshold fabricates production certainty unsupported by representative evidence.
