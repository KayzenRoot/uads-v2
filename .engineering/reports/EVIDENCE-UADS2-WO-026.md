# UADS2-WO-026 — M03 Proven Capability Resolution + Dispatch Adapter Binding — Runtime Evidence Bundle

Status: COMPLETE_CANDIDATE — P6 correction applied on top of the implementation revision; P1–P10 proofs, focused/full tests, deterministic evals and this Evidence Bundle are complete on the correction content; exact-head gates and the independent HEDS re-audit are PENDING on the new final head
Issue: #78
Risk: HIGH

## Correction history
- HEDS `5180347417` returned **CORRECTION REQUIRED** on the previously published head `081bcda9888bfed5135ea46b0b6882427bee2c4f` (PR #80, branch `feat/uads2-wo-026-m03-proven-capability-resolution`).
- Defect: dispatch without an explicit governed adapter identity was permitted to proceed through a conservative all-UNKNOWN (`host-managed`) capability snapshot instead of hard-blocking, so a caller that never named an adapter could still reach routing.
- Correction: `resolveDispatchRuntimeCapability` (`src/kernel/execution.ts`) now throws `ExecutionBlockedError` with reason `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` before any routing whenever the adapter identity is absent — independent of registry size, risk class, host-managed compatibility or legacy runtime state. No implicit adapter inference, no host-managed exception, no UNKNOWN→ALLOW. `requireProvenRuntime`, `readRuntimeCapabilitySnapshot` enablement and M05 router semantics are unchanged.
- Gate receipts produced on `081bcda`: CI `34614389348`, CodeQL `34614389331`, Dependency Review `34614389145`, Cross-Platform `34614389132` — **INVALIDATED** by this revision (the head moved); all four are re-run on the new final head.
- PR #77 remains untouched at `5889e0251ce8aa515902a05e1753f5882374bc3c`. No merge has been performed.

## Exact identities
- Base main SHA: `6da568505bbc218273b622ef0ae7d3223ea16182` (verified equal to `origin/main` after `git fetch origin`; branch `feat/uads2-wo-026-m03-proven-capability-resolution` created from / equal to it)
- Context Lock / TEST-PLAN recorded freeze base: `a0a778e5fa4a28750540246fa5894c91a92d0b2b` — controlled source-baseline delta to `6da5685` is docs/governance-only (see "Source baseline verification"; zero runtime/source/schema identity movement)
- Correction commit (current implementation revision): `047fae18b6210f6d05db43b1b25a70d62c2e0818` — `fix(UADS2-WO-026): block dispatch without explicit adapter identity (P6 correction)` (22 files changed, +143/−84). Supersedes implementation commit `91f08cc70174fffa5b8cab0bf7a3c44fc5a47b91` and rejected head `081bcda9888bfed5135ea46b0b6882427bee2c4f`.
- This Evidence Bundle is committed as the immediately following revision — the resulting final head is a new revision and receives fresh exact-head gates; the final head SHA is recorded in the PR body.
- Node version: `v24.18.0`
- OS/platform: `win32 10.0.26200` (Windows, PowerShell) — developer host; Windows/Linux determinism is additionally covered by the Cross-Platform Compatibility workflow on the exact final head
- Executor/host model routing state: global UADS `v0.12.1` — `uads doctor`: all foundation checks passed (node/git/git-repository/uads-home/global-layout/sidecar-workspace/host-adapters `cursor=SUPPORTED/INSTALLED/CLEAN, codex=SUPPORTED/INSTALLED/CLEAN, generic-agent-skills=SUPPORTED/INSTALLED/CLEAN`); `uads status`: `modelRegistryStatus: valid` (2 profiles), `specialistRegistryStatus: valid` (25 profiles), `zeroProjectFootprint: true`, sidecar workspace not created. No specialist worker was launched for this increment (V2 resource guard: single executor, sequential internal execution).
- Requested effort / applied effort: single Codex Desktop executor session; no effort override recorded by this increment; no paid provider/model calls executed (implementation, fixtures and evals are zero-cost local execution).

## Source baseline verification
- All 26 frozen source identities listed in `.engineering/context-locks/UADS2-WO-026.md` (M03 boundary/substrate, dispatch seam, eval fixtures, schemas, focused tests) were re-verified at branch base `6da5685` with `git rev-parse HEAD:<path>` against the frozen blob list: **0 mismatches / 26 OK**.
- Pre-edit delta `a0a778e..6da5685` (3 commits) is docs/governance-only: `.engineering/checkpoints/CHECKPOINT-DELTA-UADS2-WO-026.md`, `.engineering/context-locks/UADS2-WO-026.md`, `.engineering/plans/UADS2-WO-026-TEST-PLAN.md`, `.engineering/reports/EVIDENCE-UADS2-WO-026-TEMPLATE.md`, `docs/v2/11-CHECKPOINT.md`, `docs/v2/continuity/CURRENT.json`, `docs/v2/planning/UADS2-WO-026-DISPATCH-BINDING.md`, `docs/v2/planning/UADS2-WO-026-M03-PROVEN-CAPABILITY-RESOLUTION-FREEZE.md` (`git diff --name-status a0a778e..6da5685`). No `src/`, `tests/` or `schemas/` movement — no source-baseline delta beyond governance docs.

## Changed files
- `src/kernel/host-capability-resolver.ts` (new) — M03 stored-proof resolution behind IF-001: computes the current host subject/adapter-contract/proof basis from the passive projection, resolves stored PCCR only through M03 read/evaluate/project primitives, and returns a per-capability contribution table (`stored-proof` vs `passive`, `supported`/`unsupported`/`unknown`, bounded reason codes) plus `proofBacked`. Read-only; never writes proof state; never throws for missing/rejected/stale/mismatched/expired/clock-regressed evidence (those stay UNKNOWN and non-enabling).
- `src/adapters/host-capability-consumer.ts` — facade evolution: `readHostCapabilityProjection()` now resolves current basis-bound stored proof through the resolver; TRUE only from current valid SUPPORTED proof at the required evidence class; FALSE only from current valid NPC-compliant UNSUPPORTED; everything else UNKNOWN; provenance `proven` only when PCCR-backed by validated evidence for this read; passive/legacy/adapter-declared TRUE stays UNKNOWN.
- `src/kernel/execution.ts` — dispatch adapter identity / plan capability input: `resolveDispatchRuntimeCapability` accepts explicit adapter identity as governed input, validates it against actual host detection/subject identity and blocks visibly on unknown/blocked identity (`CAPABILITY_TRUTH_ADAPTER_UNKNOWN:<id>` / `CAPABILITY_TRUTH_ADAPTER_BLOCKED`). **Correction (this revision):** an absent identity now hard-blocks with `ExecutionBlockedError` reason `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` before any routing — the previous conservative all-UNKNOWN (`host-managed`) resolution is gone from this seam, at any registry size, risk class or legacy runtime state; adapter-bound dispatch still forces the generic runtime identity.
- `src/commands/dispatch.ts` — command layer threads the explicit adapter identity into `runDispatch`.
- `src/cli.ts` — CLI entry passes the explicit adapter identity through to the dispatch command.
- `src/eval/execution.ts` — X7 fixture migration: proven legacy runtime-snapshot seeding replaced by deterministic PCCR proof fixtures compiled/persisted through public M03 APIs under the test environment (same public/current basis inputs the production facade evaluates). Correction: every dispatch call site carries the explicit governed `adapterId`.
- `src/eval/fault-injection-normative.ts` — FI4/FI5/FI8/FI9/FI10 fixture migration: same public-API PCCR proof seeding; no legacy snapshot enablement and no `requireProvenRuntime` relaxation. Correction: the dispatch call sites now pass `adapterId` unconditionally (conditional spreads removed).
- `src/eval/context.ts`, `src/eval/cost.ts`, `src/eval/fault.ts` — legacy dispatch call sites updated to carry the explicit governed `adapterId`.
- `tests/host-capability-resolver.test.ts` (new, 12 tests) — P1–P4/P9 resolution proofs.
- `tests/host-dispatch-adapter-binding.test.ts` (9 tests) — P5×4 / P6×3 / P7×2 dispatch binding proofs (incl. static import-graph checks).
- `tests/cli-smoke.test.ts` — CLI negative proof: `dispatch` without an adapter identity exits non-zero with `explicit governed adapter identity` on stderr (guarded by the existing `dist/cli.js` presence skip).
- `tests/host-execution.test.ts`, `tests/cache-cost.test.ts`, `tests/execution-correction-01.test.ts`, `tests/execution-correction.test.ts`, `tests/execution-digest.test.ts`, `tests/execution-gates.test.ts`, `tests/execution-happy.test.ts`, `tests/execution-lifecycle.test.ts`, `tests/execution-reviewers.test.ts`, `tests/execution-scope.test.ts`, `tests/execution-security.test.ts`, `tests/fault-correction-01.test.ts`, `tests/fault-correction-02.test.ts`, `tests/specialist-dispatch-correction-01.test.ts` — legacy dispatch fixtures updated to pass an explicit governed adapter identity (the previous implicit path is now an enforced block).
- `.engineering/reports/EVIDENCE-UADS2-WO-026.md` (this bundle; updated and committed as the final head — the resulting final head is a new revision and receives fresh exact-head gates + HEDS).

No `schemas/` change: runtime capability snapshot contract stays `0.8.0`; proof schema family unchanged. No `requireProvenRuntime` change. PR #77 untouched at `5889e0251ce8aa515902a05e1753f5882374bc3c`.

## Proof results
- P1 current SUPPORTED projects TRUE / passive TRUE stays UNKNOWN: **PASS** — `tests/host-capability-resolver.test.ts` "P1 projects TRUE only from a current valid SUPPORTED PCCR and marks provenance proven" + "P1 never enables a passive declaration or legacy snapshot TRUE without PCCR evidence".
- P2 missing/stale/expired/corrupt/subject-mismatch/basis-mismatch/clock-regression stays UNKNOWN: **PASS** — resolver suite P2 tests (missing; record-stale; lease-expired; corrupt file without consumer crash; subject mismatch; basis mismatches incl. policy + runtime version; clock regression).
- P3 valid NPC UNSUPPORTED projects FALSE / invalid negative proof cannot: **PASS** — resolver suite "P3 projects FALSE from a current NPC-compliant UNSUPPORTED proof and never from invalid ones".
- P4 provenance `proven` only from validated PCCR-backed evidence: **PASS** — resolver suite "P4 keeps passive-only truth non-proven and per-capability independence"; P1 provenance assertion.
- P5 explicit dispatch adapter identity bound to detection/subject; mismatch blocks visibly: **PASS** — dispatch-binding suite "P5 validates, records and applies explicit adapter identity without writing proof state", "P5 blocks an ungoverned adapter identity visibly", "P5 blocks a governed adapter identity whose host detection is BLOCKED", "P5 threads explicit adapter identity from the dispatch command layer".
- P6 dispatch without an explicit adapter identity hard-blocks before routing, independent of registry/risk/host-managed compatibility/legacy state: **PASS** — dispatch-binding suite "P6 blocks absent adapter identity before routing when profiles and legacy state exist" (valid model registry + legacy runtime snapshot present), "P6 blocks absent adapter identity and persists no runtime state when no profiles exist", "P6 blocks the dispatch command without adapter identity and does not advance" (command layer); each asserts `ExecutionBlockedError` code `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` and **zero** execution-run artifacts persisted. CLI negative: `tests/cli-smoke.test.ts` asserts `dispatch --session imp-1` exits 1 with `explicit governed adapter identity` on stderr.
- P7 consumers use IF-001 only; no raw proof-store/probe coupling: **PASS** — dispatch-binding suite "P7 keeps M05 dispatch on the IF-001 facade only" + "P7 confines proof-store/probe imports to the M03 boundary and authorized fixtures" (static import-graph assertions).
- P8 no paid/model call by default; probes bounded, auditable, privacy-safe: **PASS** — no network/shell primitives in resolver/consumer/proof modules (`rg` check, zero hits); proof resolution performs zero model-bearing calls by construction (no provider imports); probe policy (`README_ONLY_LOCAL` profile: network DENY, bounded registry) unchanged; existing privacy assertions (no host-path leakage) remain in force and are re-exercised by P9 path-safety test.
- P9 Windows/Linux deterministic identity and proof evaluation: **PASS (local Windows)** — resolver suite "P9 keeps subject, basis and projection identity deterministic and path-safe"; Linux determinism is proven by the Cross-Platform Compatibility workflow on the exact final head (receipt captured on the final head via the Cross-Platform Compatibility workflow and returned to HEDS with the PR).
- P10 PR #77 X7/FI regressions removable without legacy enablement or weakened requirement: **PASS** — `node dist/eval/execution.js` → **9 passed / 0 failed** (X7 recovered); `node dist/eval/fault-injection.js` → **32 passed / 0 failed** (FI4/FI5/FI8/FI9/FI10 recovered) with fixtures seeded through public M03 APIs, no legacy snapshot enablement, `requireProvenRuntime` untouched.
- M05 RT/ES (RT-001/002/003/009/010/011, ES-013/014), M06 (RT-004..008), M07/M24 families, M03 V1 proofs: **NOT_APPLICABLE** (owners: resumed IW1-01 / IW1-02 / IW1-03 / IW1-04; frozen V1 module — per `.engineering/plans/UADS2-WO-026-TEST-PLAN.md` out-of-scope list).

## Tests
### Focused
Command: `npx vitest run --maxWorkers=1 tests/host-capability-consumer.test.ts tests/host-capability-proof.test.ts tests/host-capability-resolver.test.ts tests/host-capability-passive.test.ts tests/host-capability-active-evidence.test.ts tests/host-capability-probe.test.ts tests/host-capability-cross-platform.test.ts tests/host-dispatch-adapter-binding.test.ts tests/host-dispatch-proof-aware.test.ts`
Result: **9 files / 146 tests / 146 passed / 0 failed**, exit 0, duration 78.17s (tests 69.96s) — re-run at the correction content after commit `047fae1` (`src/`+`tests/` byte-identical to the committed tree; `git diff 047fae1 -- src tests` clean). P5×4 + P6×3 + P7×2 included.

### Full suite
Command: `npm test` (`vitest run --maxWorkers=1`)
Result: **1 failed | 61 passed (62) files; 1 failed | 597 passed (598) tests; duration 1596.97s (26.6 min)**, exit 1 (vitest exit reflects the single pre-existing failure). The single failure is `tests/release-security-proof.test.ts > RG1-RG25 release security proof > RG14 keeps v0.11.0 outside corrected-release proof semantics and immutable` — pre-existing and unrelated: the test requires remote tag `refs/tags/v0.11.0` (`git ls-remote origin refs/tags/v0.11.0` returned empty in this clone; expected `d5cb361274cb19f70c8bd02dd023b596b8babf13`). Same sole failure as the pre-correction run (1 failed | 595 passed (596) at `081bcda`); 598 = 596 + 2 new tests (P6 third dispatch-binding test + CLI negative test), so **zero new failures**; the WO-007 p95 benchmark in `tests/host-capability-passive.test.ts` passed in this full run.

### Build / typecheck / lint
- `npm run build` (`tsc -p tsconfig.json`): exit 0 on the correction content (dist rebuilt before the eval batch; `dist/` is not committed).
- `npm run typecheck` / `npm run lint` (`tsc -p tsconfig.json --noEmit`): exit 0 after the correction edits (both commands are the same invocation).

## Deterministic evals
All ten CI evals ran on the correction content with `dist/` built from it:
- `node dist/eval/run.js` → 9 passed / 0 failed
- `node dist/eval/execution.js` → 9 passed / 0 failed (X7 recovered)
- `node dist/eval/context.js` → 19 passed / 0 failed
- `node dist/eval/fault.js` → 18 passed / 0 failed
- `node dist/eval/cost.js` → 27 passed / 0 failed
- `node dist/eval/model-routing.js` → 22 passed / 0 failed
- `node dist/eval/specialist-routing.js` → 26 passed / 0 failed
- `node dist/eval/adapters.js` → 40 passed / 0 failed
- `node dist/eval/assurance.js` → 22 passed / 0 failed
- `node dist/eval/fault-injection.js` → 32 passed / 0 failed (FI4/FI5/FI8/FI9/FI10 recovered)

## Runtime scenarios
- current stored SUPPORTED proof resolution → TRUE + `proven`: resolver P1.
- passive-only fallback projection (provenance `unknown`): resolver P4 + existing consumer boundary suite.
- passive TRUE declaration (no PCCR evidence) → UNKNOWN: resolver P1 (negative half).
- missing proof / stale proof / expired lease / corrupt proof file: resolver P2 tests (corrupt case asserts no consumer crash; UNKNOWN outcome).
- subject mismatch / runtime-version basis mismatch / adapter-contract & probe/policy/configuration basis mismatch / clock regression: resolver P2 tests.
- non-NPC negative proof: resolver P3 negative half.
- dispatch with explicit adapter identity (valid): dispatch-binding P5 tests (adapterId recorded, `generic-runtime` runtime identity, no proof writes).
- dispatch without adapter identity: dispatch-binding P6 tests — hard block `ExecutionBlockedError` `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` before routing, no persisted runtime state, no execution-run artifacts, even with a valid registry and a legacy runtime snapshot present; CLI negative in `cli-smoke`.
- dispatch with mismatched/ungoverned adapter identity: dispatch-binding P5 tests (visible block; never inferred from legacy state); detection-BLOCKED identity → `CAPABILITY_TRUTH_ADAPTER_BLOCKED`.
- no model-bearing calls during proof resolution: by construction (no provider/network imports in resolver/consumer/proof modules; `rg` evidence above); no paid provider/model call executed anywhere in this increment.

## Performance observation
Environment: developer host `win32 10.0.26200`, Node `v24.18.0`, local sidecar proof store; no paid benchmark; not a production SLO/capacity claim.
- Focused 9-file re-run at the correction content: 146 tests in 78.17s (tests 69.96s; includes fixture setup/teardown).
- Stored-proof resolution is in-process, single-pass file reads of bounded JSON + schema validation; no model-bearing calls, no network, no unbounded probes; no per-call latency instrumentation was added (out of scope for this increment).

## Security/privacy
- secret/host-path leakage into proof/projection artifacts: no hits in projection artifacts; P9 path-safety test asserts projection JSON carries `path.basename(host)` only, never absolute host paths; no secrets introduced.
- bounded reason codes / no raw provider payloads: resolver returns fixed-set reason codes (`PROOF_MISSING`, `PROOF_REJECTED`, evaluator codes such as stale/lease/clock semantics, `CAPABILITY_TRUTH_ADAPTER_UNKNOWN:<id>`/`_BLOCKED`, `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED`); no raw payload echo.
- fail-closed dispatch seam: absent/mismatched adapter identity cannot be silently upgraded to an executable plan (no UNKNOWN→ALLOW; P6 asserts no execution-run artifacts).
- closed schemas: no schema files changed; existing `additionalProperties: false` families unchanged (`schemas/host-capability-proof.schema.json`, `schemas/runtime-capability-snapshot.schema.json` blobs verified identical to the frozen baseline).
- no project-local UADS state; global sidecar only: `uads status` → `zeroProjectFootprint: true`, `workspaceExists: false`; proof fixtures use the global sidecar layout under the test environment (or isolated temp homes for tests).
- no arbitrary shell / unbounded probes / vendor credentials: no `child_process`/shell/network primitives in the changed modules (`rg` check); probe registry policy unchanged.

## Repository gates on exact final head
- CI: PENDING — exact-head receipt is captured on the new final head via the PR; the receipt from `081bcda` (run 34614389348) is INVALIDATED by this revision
- CodeQL: PENDING — same as CI (receipt 34614389331 on `081bcda` invalidated)
- Dependency Review: PENDING — same as CI (receipt 34614389145 on `081bcda` invalidated)
- Cross-Platform: PENDING — same as CI (receipt 34614389132 on `081bcda` invalidated)
Any new commit after these receipts invalidates the exact-head claims above.

## HEDS
Prior review: `5180347417` — **CORRECTION REQUIRED** on `081bcda9888bfed5135ea46b0b6882427bee2c4f` (historical; the P6 defect is corrected in this revision and its receipt is not a current approval)
Re-audit: PENDING — independent final audit runs on the new final head after exact-head gates
Verdict: PENDING

## Final verdict
COMPLETE_CANDIDATE — correction revision + complete Evidence Bundle at the final head; exact-head CI/CodeQL/Dependency Review/Cross-Platform receipts and the independent HEDS re-audit remain the outer gate. No merge.

Do not mark APPROVED while any release-blocking capability-truth, provenance, basis-matching, adapter-identity, exact-head gate or privacy requirement is FAIL/BLOCKED.