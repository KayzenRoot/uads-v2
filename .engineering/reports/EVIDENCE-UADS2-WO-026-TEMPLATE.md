# UADS2-WO-026 — Runtime Evidence Bundle Template

Status: TEMPLATE / TO BE FILLED BY EXECUTOR
Issue: #78
Risk: HIGH

## Exact identities
- Base main SHA: `a0a778e5fa4a28750540246fa5894c91a92d0b2b`
- Implementation head SHA: <fill>
- Node version: <fill>
- OS/platform: <fill>
- Executor/host model routing state: <fill>
- Requested effort / applied effort: <fill>

## Source baseline verification
Record pre-edit identities for the frozen blobs listed in `.engineering/context-locks/UADS2-WO-026.md` (M03 boundary/substrate, dispatch seam, eval fixtures, schemas and focused tests). Any drift from the frozen baseline must be explained as a controlled source-baseline delta.

## Changed files
<fill exact paths and rationale; expected shape: consumer facade evolution, proof resolution/projection additions, dispatch adapter-identity plumbing, eval-fixture proof seeding via public APIs, focused tests, and only strictly required versioned schema files if any>

## Proof results
Use PASS / FAIL / BLOCKED / NOT_APPLICABLE with evidence references.
- P1 current SUPPORTED projects TRUE / passive TRUE stays UNKNOWN:
- P2 missing/stale/expired/corrupt/subject-mismatch/basis-mismatch stays UNKNOWN:
- P3 valid NPC UNSUPPORTED projects FALSE / invalid negative proof cannot:
- P4 provenance `proven` only from validated PCCR-backed evidence:
- P5 explicit dispatch adapter identity bound to detection/subject; mismatch blocks visibly:
- P6 no adapter identity → conservative UNKNOWN and fail-closed dispatch:
- P7 no consumer reads PCCR storage/probe internals directly:
- P8 no paid provider/model call by default; probes bounded/auditable/privacy-safe:
- P9 Windows/Linux deterministic identity and proof evaluation:
- P10 PR #77 X7/FI regressions removable without legacy enablement or weakened requirement:
- M05 RT/ES, M06, M07/M24 families: NOT_APPLICABLE (owner: resumed IW1-01 / IW1-02 / IW1-03 / IW1-04)

## Tests
### Focused
Command(s): <fill>
Result: <fill>

### Full suite
Command: <fill>
Files/tests passed: <fill>
Result: <fill>

## Runtime scenarios
Document: current stored SUPPORTED proof resolution, active-evidence compiled proof resolution, passive-only fallback projection (provenance unknown), passive TRUE declaration, missing proof, stale proof, expired lease, corrupt proof file, subject mismatch, runtime-version basis mismatch, adapter-contract basis mismatch, probe/policy/configuration basis mismatch, clock regression, non-NPC negative proof, dispatch with explicit adapter identity, dispatch without adapter identity, dispatch with mismatched adapter identity, and no model-bearing calls during proof resolution.

## Performance observation
Environment: <fill>
Stored-proof resolution latency: <fill>
Probe-path observation (if exercised): <fill>

No developer-host observation may be labeled production SLO/capacity. Proof resolution performs zero model-bearing calls; no paid benchmarks.

## Security/privacy
- secret/host-path leakage into proof/projection artifacts: <fill>
- bounded reason codes / no raw provider payloads: <fill>
- closed schemas (`additionalProperties: false`): <fill>
- no project-local UADS state; global sidecar only: <fill>
- no arbitrary shell / unbounded probes / vendor credentials: <fill>

## Repository gates on exact final head
- CI: <fill>
- CodeQL: <fill>
- Dependency Review: <fill>
- Cross-Platform: <fill>

## HEDS
Review ID: <fill after independent final audit>
Verdict: <fill>

## Final verdict
<APPROVED / CORRECTION REQUIRED / BLOCKED>

Do not mark APPROVED while any release-blocking capability-truth, provenance, basis-matching, adapter-identity, exact-head gate or privacy requirement is FAIL/BLOCKED.
