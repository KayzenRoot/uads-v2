# UADS V2 — IW0 Evidence Bundle Template

Status: TEMPLATE
Prepared under: UADS2-WO-024

Use this template in the numbered M30 S05.1 implementation WO. Do not mark sections PASS without executable/runtime evidence.

## Identity
- Implementation WO:
- Issue / PR:
- Base main SHA:
- Source-baseline reconciliation:
- Final exact head:
- Executor host/runtime:
- Requested model/effort:
- Applied model/effort or HOST_FIXED/MISMATCH/UNKNOWN:

## Scope delta
- Files changed:
- New files:
- Files outside frozen source boundary:
- Justification/owner/risk for every boundary expansion:

## Proof matrix
| Proof ID | Result | Evidence class | Evidence reference | Notes |
|---|---|---|---|---|
| OP-001 | | | | |
| OP-002 | | | | |
| OP-003 | | | | |
| OP-008 | | | | |
| OP-009 | | | | |
| PF-001 | | | | |
| PF-002 | | | | |
| PF-003 | | | | |
| PF-004 | | | | |
| ES-020 | | | | |

## Test results
- Focused test files/count:
- Focused tests/count:
- Full suite files/count:
- Full suite tests/count:
- Windows result:
- Linux result:

## Truth/freshness/continuity negatives
- stale source:
- missing source:
- corrupt/hash mismatch:
- unsupported version:
- known gap:
- unknown gap:
- reconnect:
- missing economic/model source:

## Privacy/security
- secret leakage test:
- host path redaction:
- loopback-only:
- CSP/security headers:
- path traversal:
- schema closure:

## Performance
- environment identity:
- event write p50/p95/p99:
- event read p50/p95/p99:
- dashboard snapshot p50/p95/p99:
- SSE delivery/reconnect evidence:
- comparison with Issue #39 / historical baseline:
- production-SLO claim: NO unless separately qualified.

## Runtime claim boundary
State exactly what is implemented and what remains only an interface/hook. M05/M06/M07/M24 truth must not be claimed implemented by IW0 merely because the cockpit has placeholders/projections.

## Corrections / AEG / HEDS
- Builder result:
- Blind critic findings:
- Corrections:
- Fresh critic result:
- HEDS review ID/verdict:

## Exact-head repository gates
- CI:
- CodeQL:
- Dependency Review:
- Cross-Platform:

## Debt / follow-up
- Issue #39 impact:
- unresolved operational debt:
- source-baseline delta debt:

## STOP CONDITION
Verdict must be APPROVED / CORRECTION REQUIRED / BLOCKED. APPROVED requires all mandatory proof floors, exact-head gates and HEDS. No fabricated LIVE/CURRENT value, privacy leak, unauthorized architecture expansion or false production claim may remain.