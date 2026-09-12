# EVIDENCE — UADS2-WO-025

Status: COMPLETE_CANDIDATE — reconciled onto the merged WO-026 baseline; the historical NEEDS_ARCHITECTURE state is explicitly SUPERSEDED by this reconciliation (proof: execution X7 9/9, fault-injection 32/32). Independent HEDS and hosted exact-head gates are still pending. DO NOT MERGE before a fresh HEDS APPROVED verdict on the exact head plus CI/CodeQL/Dependency Review/Cross-Platform SUCCESS on that same head.
Module: M05 Automatic Model Router
Session: IW1-01 Proof-Aware Model Routing + Model Lock
Issue: #75
PR: #77
Risk: HIGH
Terminal state: COMPLETE_CANDIDATE (reconciliation; review pending)

## Exact identities
- Reviewed planning base (Context Lock / Test Plan / freeze): `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`
- Stale PR #77 head (pre-reconciliation, pre-WO-026): `5889e0251ce8aa515902a05e1753f5882374bc3c`
- Reconciled base (current `main` at dispatch, verified with `git rev-parse origin/main`): `5b55eb8d06fde7d616ac72d31a3b1e31a1b4381` — matches the resume prompt exactly; main did not advance beyond it (no delta to record).
- Reconciliation commits on top of the base: `276efaf` (M05 replay) + `fd757a5` + `c73145f` (runtime evidence docs) + `e0c34e5` (semantic WO-026 facade fix). All local proof below ran on working-tree content byte-identical to `e0c34e5` for every code/test/schema/eval path.
- Evidence bundle commit: the commit that adds this document; the exact final head is recorded in PR #77 and in the execution report. The evidence commit touches only this document; code-blob invariance versus `e0c34e5` is verified post-commit with `git hash-object` and recorded in the PR reconciliation comment.
- Branch: `feat/uads2-wo-025-iw1-01-model-routing-lock`
- Reconciliation method: rebase replay of the stale PR implementation onto `origin/main` (linear history; `git merge-base --is-ancestor origin/main HEAD` passes), plus one targeted semantic fix commit. No merge commit, no blanket ours/theirs.
- Node version: `v24.18.0` (npm `11.16.0`)
- OS/platform: Windows `10.0.26200` x64, PowerShell `7.6.5`, git `2.55.0.windows.3`, AMD Ryzen 3 4300GE (8 logical cores, 15.8 GB RAM), host `D:\Projekt Codexx\uads-v2`
- Executor/host model routing state: `UNKNOWN` (`NO_HOST_EXECUTION_EVIDENCE`) — the host exposes no per-subtask model/effort control to the executor and this slice owns no host-execution evidence; `VERIFIED_MATCH`/`HOST_FIXED` are never claimed.
- Requested effort / applied effort: requested HIGH (capability-truth/lock integration per the dispatch binding "Model / effort routing"); applied effort `UNKNOWN` (not observable or controllable on this host).

## Reconciliation onto the WO-026 baseline
Base movement `a0a778e5..5b55eb8` is the merged WO-026 runtime (PR #80): proven capability resolution + dispatch adapter binding — `src/adapters/host-capability-consumer.ts` (source-aware stored/active PCCR facade with optional workspace `paths`), `src/kernel/host-capability-resolver.ts`, `src/commands/dispatch.ts` (`--adapter`), `src/kernel/execution.ts` (`resolveDispatchRuntimeCapability` hard-block, dispatch-threaded `modelRuntime`), WO-026 eval/test updates and docs. No `src/`, `tests/`, `schemas/`, `evals/`, `scripts/` or workflow movement outside that increment.
Replay fidelity: `git diff 5f13ac6..276efaf --stat` is exactly the WO-026 main-side delta (37 files) — the stale M05 implementation was replayed faithfully, with zero silent content change.
Conflict hot spots (files changed on BOTH sides, proven with `Compare-Object` over both diffs): exactly two — `src/cli.ts` and `src/kernel/execution.ts`. No other file required conflict handling.
Semantic resolutions (never blanket ours/theirs; both sides' changes are present in the reconciled head, verified by diff):
- `src/cli.ts`: WO-026 dispatch `--adapter <id>` wiring (explicit governed adapter identity `cursor | codex | generic-agent-skills`) preserved byte-for-byte; M05 additions are purely additive — `models lock show|set|clear|recover` subcommands and `--adapter`/`--host-home` on `models status`/`models route`.
- `src/kernel/execution.ts`: WO-026 `resolveDispatchRuntimeCapability` (missing-identity `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` hard-block, unknown-identity block, BLOCKED-detection block), `persistRuntimeCapabilitySnapshot` at dispatch, and `ensureCurrentModelPlan({ runtime: modelRuntime })` threading preserved; M05 adds only lock currency to plan reuse (`current.routingMode === currentMode && current.modelLock.revision === currentLockRevision`) plus the `modelRoutingLockInput`/`readModelRoutingState`/`DEFAULT_MODEL_ROUTING_MODE` wiring.
- `src/kernel/model-router.ts` + `src/commands/models.ts` (`e0c34e5`): the M05 acquisition boundary `resolveRoutingCapabilityTruth` calls `readHostCapabilityProjection` with the workspace `paths` forwarded, so stored/active PCCR evidence resolves behind the WO-026 facade against the current basis; the orphaned legacy `readRuntimeCapabilitySnapshot` import is removed. Adapter-absent callers still receive the conservative all-UNKNOWN snapshot. No `requireProvenRuntime`, Model Lock, or UNKNOWN fail-closed semantics weakened.
Final changed files versus reconciled base `5b55eb8` (16 paths, all inside freeze §6; no new dependencies, no project-local UADS state, no broad refactor): `.engineering/reports/EVIDENCE-UADS2-WO-025.md`, `evals/model-routing/cases.json`, `schemas/model-execution-plan.schema.json`, `schemas/model-routing-state-revision.schema.json`, `schemas/model-routing-state.schema.json`, `src/cli.ts`, `src/commands/models.ts`, `src/eval/model-routing.ts`, `src/kernel/execution.ts`, `src/kernel/model-lock.ts`, `src/kernel/model-persist.ts`, `src/kernel/model-router.ts`, `src/kernel/model-types.ts`, `src/lib/workspace.ts`, `tests/model-lock.test.ts`, `tests/model-routing.test.ts`.
Forbidden-boundary check versus `5b55eb8`: `git diff --name-only` contains none of `src/adapters/host-dispatch.ts`, `src/kernel/model-requirements.ts`, `src/kernel/model-registry.ts`, `src/adapters/host-capability-consumer.ts`, `src/adapters/host-capability-passive.ts`, `src/kernel/host-capability-proof.ts`, `src/eval/execution.ts`, `src/eval/fault-injection.ts`, `scripts/`, `.github/` — 0 violations.
Invariant pins on the reconciled head: runtime snapshot contract `0.8.0` (`MODEL_ROUTING_SCHEMA_VERSION`, unchanged from main); plan schema `0.9.0` (`MODEL_EXECUTION_PLAN_SCHEMA_VERSION`, M05 only); `requireProvenRuntime` policy line identical to main; UNKNOWN never maps to ALLOW (conservative snapshot + `NO_PROVEN_CAPABILITY` rejection intact).

## Source baseline verification (historical dispatch preflight, retained)
Method at original dispatch: frozen identity from `.engineering/context-locks/UADS2-WO-025.md`, verified with `git rev-parse a0a778e5:<path>` versus `git hash-object <path>` (pre-edit working tree) and versus the committed implementation head.

| Path | Frozen blob (`a0a778e5`) | Implementation head blob | Status |
| --- | --- | --- | --- |
| `src/kernel/model-router.ts` | `c46061746bb0221557b091279b99e7f587ef8441` | `1c9540b96311f46a4d31371374d2832aa6d9d8c6` | CONTROLLED DELTA (allowed: capability-truth acquisition, lock mode, enforcement projection) |
| `src/kernel/model-types.ts` | `df4ac2159c6df0cf1fe7c176ef14ed06bf39b435` | `4ee3885b2046eee92ed1e5ab0751122b30f718bc` | CONTROLLED DELTA (allowed: plan/routing contract additions) |
| `src/kernel/model-requirements.ts` | `2a0b325061a949f303ae0c1a6910f5cbab5f37fb` | `2a0b325061a949f303ae0c1a6910f5cbab5f37fb` | UNCHANGED (forbidden boundary) |
| `src/kernel/model-runtime.ts` | `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62` | `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62` | UNCHANGED (snapshot contract stays `0.8.0`) |
| `src/kernel/model-registry.ts` | `30af33571e776df2d50ce46cf7a6166d166ca3c8` | `30af33571e776df2d50ce46cf7a6166d166ca3c8` | UNCHANGED (forbidden boundary) |
| `src/kernel/model-persist.ts` | `c0d0799a064a48e87dbdbd26407cb47563037a59` | `7d85b99a6ed2b42d79ca614b9ebdd9eedf406ead` | CONTROLLED DELTA (allowed: truthful `0.9.0`/legacy plan reads) |
| `src/adapters/host-capability-consumer.ts` | `6e4035a5c6790ffe6272a4e93dd99c24908ff936` | `6e4035a5c6790ffe6272a4e93dd99c24908ff936` | UNCHANGED (consumed through the contract only) |
| `src/adapters/host-capability-passive.ts` | `edd37b91bee623730f43bbdc6422084e6e63f7f9` | `edd37b91bee623730f43bbdc6422084e6e63f7f9` | UNCHANGED (forbidden boundary) |
| `src/kernel/host-capability-proof.ts` | `ff79a8f6280e8be0ae4563e9b6e62b9e216df76b` | `ff79a8f6280e8be0ae4563e9b6e62b9e216df76b` | UNCHANGED (forbidden boundary) |
| `src/commands/models.ts` | `9be44ab26c9e6a264bbae37eaa57ed59aff630ec` | `bdb3a3e03fd6ade655aa41c6c5d3ae4f841d5743` | CONTROLLED DELTA (allowed: lock CLI + adapter identity) |
| `src/adapters/host-dispatch.ts` | `97bfebbc62570a5a245a7dd8512f37b57fe2e1b0` | `97bfebbc62570a5a245a7dd8512f37b57fe2e1b0` | UNCHANGED (forbidden boundary) |
| `tests/model-routing.test.ts` | `47c2bdbad80c1e63366cdb4dd04720c91ba98ee1` | `ff7b7f1ab3cb3d2f5e3d329db20474818dc497c8` | CONTROLLED DELTA (allowed: T1..T10 proofs) |
| `schemas/model-execution-plan.schema.json` | `ef7b91217a11d5ae8dc2444bc8bc094176980536` | `e544cf91b757a8599efee39b040d59cc126f6f5b` | CONTROLLED DELTA (allowed: plan schema `0.9.0`) |

13/13 frozen identities matched the Context Lock at dispatch preflight (`BASE_MATCH` in every row); 7 stayed byte-identical and 6 moved as controlled deltas inside the allowed source boundary. The reconciliation replay preserves these boundaries against the new base (see "Reconciliation" + "Forbidden-boundary check" above).

## Changed files (what each path carries on the reconciled head)
| Path | Change | Rationale |
| --- | --- | --- |
| `src/kernel/model-router.ts` | modified | `resolveRoutingCapabilityTruth` (consumer-boundary acquisition with `paths` forwarded to the WO-026 facade), lock-aware mode/lock resolution, `routingEnforcement` projection, cheapest-price discipline, `ENSEMBLE_NOT_AUTHORIZED` single-target rule, plan `0.9.0` fields |
| `src/kernel/model-types.ts` | modified | plan/routing type contract for `routingMode`, `modelLock`, `capabilityTruth`, `routingEnforcement` and bounded reason codes (runtime snapshot contract untouched) |
| `src/kernel/model-persist.ts` | modified | persist/read plan `0.9.0`; prior-schema and corrupt plan state degrade truthfully without throwing or silently upcasting |
| `src/kernel/execution.ts` | modified | WO-026 dispatch-threaded runtime preserved; plan capability-acquisition path adds lock-state currency only |
| `src/kernel/model-lock.ts` | new | governed lock state: modes, monotonic immutable revision audit, digest coverage, atomic writes, corrupt-state fail-closed with explicit operator recovery, secret/host-path rejection |
| `src/commands/models.ts` | modified | `models lock show / set --profile / clear / recover`; `--adapter`/`--host-home` on `models status / route` (facade `paths` forwarded) |
| `src/cli.ts` | modified | wiring only: lock subcommands and adapter identity options (WO-026 dispatch `--adapter` preserved) |
| `src/lib/workspace.ts` | modified | sidecar path/layout only: workspace-scoped routing-state location |
| `schemas/model-execution-plan.schema.json` | modified | plan schema `0.9.0`: new required fields, closed (`additionalProperties: false`), bounded capability key set |
| `schemas/model-routing-state.schema.json` | new | closed (`additionalProperties: false`) routing-state contract `0.1.0` |
| `schemas/model-routing-state-revision.schema.json` | new | closed (`additionalProperties: false`) immutable revision-record contract `0.1.0` |
| `tests/model-routing.test.ts` | modified | router-side T1..T10 proofs and negative scenarios |
| `tests/model-lock.test.ts` | new | lock state, revision audit, corruption/fail-closed, legacy/corrupt plan degradation proofs |
| `src/eval/model-routing.ts` | modified | deterministic eval extension MR23..MR31 |
| `evals/model-routing/cases.json` | modified | eval case registry for MR23..MR31 |

## Proof results (reconciliation re-run on head `e0c34e5`, base `5b55eb8`)
Labels: PASS / FAIL / BLOCKED / NOT_APPLICABLE. Test references are test names in `tests/model-routing.test.ts` (router side) and `tests/model-lock.test.ts` (lock state side); `MR` references are deterministic eval cases. All T1..T10 PASS.

- RT-001 Model Lock hard constraint + audit trail: PASS — "WO-025 T2: an active Model Lock is a hard constraint that suppresses fallback substitution" (router), "WO-025 T2: set/clear persist immutable revision records with monotonic revisions" (state); `MR23`, `MR24`.
- RT-002 cheapest-claim discipline: PASS — "WO-025 T4: cheapest-qualified claims require objective price evidence"; `MR27`, `MR12`.
- RT-003 quality/capability floor: PASS — "WO-025 T5: the quality floor survives cheapest mode"; `MR3`, `MR4`, `MR14`.
- RT-009 latest/successor model requires proof: PASS — "WO-025 T6: an unproven successor model is rejected like any other candidate"; `MR31`.
- RT-010 enforcement-state truth (router-side subset only): PASS — "WO-025 T7: enforcement projection only claims router-side provable states" (`ENFORCED`/`MISMATCH`/`UNKNOWN` plus `NO_ACTIVE_LOCK`/`NO_HOST_EXECUTION_EVIDENCE`/`ROUTING_STATE_UNAVAILABLE`); `VERIFIED_MATCH`/`HOST_FIXED` are never claimed because host-execution evidence does not exist in this slice.
- RT-011 locked-profile unavailability: PASS — "WO-025 T3: an unresolvable or inadmissible lock fails closed without substitution"; `MR24`.
- ES-013 no silent expensive fallback: PASS — lock path empties `fallbackProfileIds` (`MODEL_LOCK_FALLBACK_FORBIDDEN`) and automatic-mode fallbacks stay advisory; "WO-025 T2: ... suppresses fallback substitution", `MR14`.
- ES-014 single target / no broadcast: PASS — "WO-025 T9: routing rejects ensemble/broadcast intents and emits one model target"; `MR26`.
- T1 capability-truth boundary and UNKNOWN discipline: PASS — "WO-025 T1: capability truth comes from the evaluated runtime and adapter-unspecified truth never enables" (router), "WO-025 T1: a legacy all-true runtime snapshot does not enable routing" and "WO-025 T1/T3: production routing without a proven adapter identity stays conservative and a lock never weakens" (state); `MR28`.
- T2 lock hard constraint and audit: PASS — T2 tests above; `MR23`.
- T3 lock fail-closed availability: PASS — "WO-025 T3: corrupt lock state fails closed with explicit operator recovery and archived raw bytes", "WO-025 T3: digest tampering, schema drift and project mismatch are rejected without throwing", plus the router-side T3 test; `MR24`, `MR25`.
- T4 cheapest-claim discipline: PASS — T4 test; `MR27`.
- T5 quality floor: PASS — T5 test; `MR3`, `MR4`.
- T6 latest-model resolution: PASS — T6 test; `MR31`.
- T7 enforcement-state truth: PASS — T7 test; `MR23`, `MR29`.
- T8 no silent expensive fallback: PASS — T2/`MR14` evidence above (automatic-mode fallbacks advisory; locked path forbids substitution).
- T9 no broadcast / single target: PASS — T9 test; `MR26`.
- T10 schema evolution, legacy compatibility, baseline integrity: PASS — "WO-025 T10: the plan schema is closed at 0.9.0 with deterministic digests" (router), "WO-025 T10: current plan reads degrade truthfully and never throw", "WO-025 T10: routing state rejects secret-like or host-path content at write time" (state); `MR29`, `MR30`; plus the baseline tables above.
- RT-004/005/006/007/008 (effort autopilot family): NOT_APPLICABLE — owner IW1-02 (M06).
- RT-012 (cost-quality comparison benchmark): NOT_APPLICABLE — owner IW1-03 (economic envelope).
- ES-015..019 (accounting/breaker/kill-switch family): NOT_APPLICABLE — owner IW1-03/IW1-04.
Absence of proof for the NOT_APPLICABLE families is not a failure of this slice and is never claimed as proven.

## Tests
### Focused (M05 model-routing/model-lock)
Command: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/model-routing.test.ts tests/model-lock.test.ts`
Result: `2 files passed / 41 tests passed (41), exit 0, 10.66 s` on head `e0c34e5`.

### Touched WO-026 M03/dispatch seams
Command: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/host-capability-resolver.test.ts tests/host-dispatch-adapter-binding.test.ts tests/execution-happy.test.ts tests/execution-gates.test.ts`
Result: `4 files passed / 31 tests passed (31), exit 0, 124.41 s` on head `e0c34e5`. WO-026 invariants (explicit adapter identity, missing-adapter hard-block, source-aware stored/active PCCR, snapshot `0.8.0`) intact.

Build/lint: `npm run build` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0 (all on head `e0c34e5` content).

### Full suite
Command: `npm test` (`vitest run --maxWorkers=1`)
Result: 63 files — 62 passed / 1 failed; 622 tests — 621 passed / 1 failed; duration 2049.97 s; worktree clean before and after.
Sole failure: `tests/release-security-proof.test.ts` — "RG14 keeps v0.11.0 outside corrected-release proof semantics and immutable" (`git ls-remote origin refs/tags/v0.11.0` returns empty because `KayzenRoot/uads-v2` has 0 tags; the historical tag exists only in the predecessor lineage `KayzenRoot/uads`, `d5cb361274cb19f70c8bd02dd023b596b8babf13`).
Inherited proof (base evidence, not relabeling): `git ls-remote origin refs/tags/` returns 0 lines on this host (remote state, identical for base `5b55eb8` by construction); `tests/release-security-proof.test.ts` is byte-identical between base `5b55eb8` and this head (absent from the branch diff) and imports only `node:` builtins, `vitest`, `src/lib/json-schema.ts` and `src/github/*` — none of which this branch touches; isolated run gives 25 tests — 24 passed / 1 failed with the identical `ls-remote`-empty assertion. The file passes 25/25 when `origin` is temporarily repointed to the frozen V1 lineage — the same repoint CI performs for the Test and Validate-foundation steps (`.github/workflows/ci.yml`). No new failure is classified as inherited.
The suite ran on working-tree content byte-identical to head `e0c34e5` for all 15 code/test/schema/eval paths (worktree `git status --porcelain` empty before and after; the only following commit touches this document alone).

### Deterministic evaluations (reconciled head `e0c34e5`, same toolchain; base reference `5b55eb8` / WO-026 PR #80 evidence for unchanged paths)
| Eval | Head | Base reference | Status |
| --- | --- | --- | --- |
| `eval:orchestrator` | 9/9 | 9/9 | PASS |
| `eval:execution` | 9/9 (X7 PASS) | 9/9 | PASS — historical X7 "model routing blocked dispatch" resolved by WO-026 merge + facade reconciliation |
| `eval:context` | 19/19 | 19/19 | PASS |
| `eval:fault` | 18/18 | 18/18 | PASS |
| `eval:cost` | 27/27 (CC1..CC27) | 27/27 family green in WO-026 | PASS — previously INCONCLUSIVE, now completed locally |
| `eval:model-routing` | 31/31 (MR1..MR31) | 22/22 (MR1..MR22) | PASS (9 new cases) |
| `eval:specialist-routing` | 26/26 | 26/26 | PASS |
| `eval:adapters` | 40/40 | 40/40 | PASS |
| `eval:host-execution` | PASS via full suite (`tests/host-execution.test.ts` inside the 62 passed files) | green in WO-026 | PASS (standalone local run exceeded the 5-minute foreground window under parallel load; the full-suite pass plus hosted CI are the binding proofs) |
| `eval:assurance` | 22/22 | 22/22 | PASS |
| `eval:fault-injection` | 32/32 (FI4/FI5/FI8/FI9/FI10 PASS) | 32/32 | PASS — historical FI4/FI5/FI8/FI9/FI10 "model routing blocked dispatch" resolved by WO-026 merge + facade reconciliation |
Commands: `npm run eval:<name>` (evals run against `npm run build` output for the head under test).

### Protocol validation
`npm run validate:engineering` → `{"ok":true,"identity":"ENG-PROTOCOL-ADOPTION-001","requiredFiles":23,"schemas":6,"records":6}`, exit 0.
Full `npm run validate` (foundation) is not re-run locally end-to-end: its Test gate is the same `npm test` evidenced above (sole inherited RG14), and its Validate-foundation/packaging steps run authoritatively in hosted CI on the exact head (see "Repository gates"). No local PASS is claimed for it.

## Runtime scenarios (explicit negatives, re-verified on the reconciled head)
- legacy-snapshot-only truth: an all-true legacy runtime snapshot does not enable routing (state test T1).
- adapter-unspecified truth: no adapter identity ⇒ conservative all-UNKNOWN with `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED`; never ALLOW (router test T1, state test T1/T3).
- dispatch without adapter identity: hard-block `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` before routing (WO-026 seam tests; `resolveDispatchRuntimeCapability` preserved).
- lock set/show/clear: every set/clear persists an immutable revision record with a monotonic `lockRevision` (state test T2; CLI surface `models lock show|set --profile|clear|recover`).
- locked-profile removal/inadmissibility: visible `MODEL_LOCK_UNAVAILABLE`, no substitution (router test T3).
- corrupt lock state: fails closed with explicit operator recovery and archived raw bytes; digest tampering, schema drift and project mismatch are rejected without throwing (state tests T3).
- prior-schema plan: degrades truthfully, no throw through status surfaces, no silent upcast (state test T10, router test T10, `MR30`).
- enforcement derivation: only `ENFORCED`/`MISMATCH`/`UNKNOWN` with bounded reason codes; `VERIFIED_MATCH`/`HOST_FIXED` never emitted (router test T7).
- broadcast: ensemble/broadcast intents rejected with `ENSEMBLE_NOT_AUTHORIZED`; exactly one model target (router test T9, `MR26`).
- zero model-bearing routing calls: routing/status/dispatch-plan paths import no network or process API — verified over `src/kernel/model-router.ts`, `src/kernel/model-lock.ts`, `src/kernel/model-persist.ts`, `src/commands/models.ts`, `src/kernel/execution.ts` (no `node:http(s)`, `node:net`, `child_process`, provider client or API-key usage).
- secret/host-path hygiene: routing state rejects secret-like or host-path content at write time (state test T10).

## Performance observation
Environment: executor Windows host above; observations only, no production SLO/capacity claim.
- Routing decision: OBSERVATION — `node dist/eval/model-routing.js` completes 31 routing decisions (registry load, capability evaluation, lock resolution, digest computation and plan persistence per case) in-process with zero model-bearing calls; 31/31 green on the reconciled head.
- Cost eval: OBSERVATION — `node dist/eval/cost.js` 27/27 green on the reconciled head; routing performs zero model-bearing calls.
- Status/dashboard projection: OBSERVATION/TARGET — read-only projections over the persisted plan/lock state; no production SLO claim is made from a developer/CI host.
- Issue #39 comparison: no interaction. Issue #39 (M30 `evidence.lifecycle` hot-path overhead, `JUSTIFIED_EXCEPTION`, still open) is untouched, remains visible, and this slice adds no `evidence.lifecycle` work and no paid-provider benchmark.

## Security/privacy
- secret/host-path leakage into routing state: PASS — write-time rejection (state test T10).
- bounded reason codes / no raw provider payloads: PASS — closed reason-code set (`CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED`, `MODEL_LOCK_UNAVAILABLE`, `MODEL_LOCK_ALIAS_UNSUPPORTED`, `MODEL_LOCK_FALLBACK_FORBIDDEN`, `ROUTING_STATE_UNAVAILABLE`, `ENSEMBLE_NOT_AUTHORIZED`, `NO_PROVEN_CAPABILITY`, `NO_ACTIVE_LOCK`, `NO_HOST_EXECUTION_EVIDENCE`).
- closed schemas (`additionalProperties: false`): PASS — plan `0.9.0`, routing state `0.1.0`, revision record `0.1.0`.
- no project-local UADS state; global sidecar only: PASS — `src/lib/workspace.ts` sidecar layout only.

## GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT
No project-local UADS operational state, no new dependency, no sidecar relocation beyond the workspace-scoped routing-state path; lock state, revisions and plans live in the global sidecar.

## Historical NEEDS_ARCHITECTURE — SUPERSEDED by this reconciliation
The six blocking facts from the stale-head investigation, and their resolutions (each independently checkable on the reconciled head):
1. The execution plan path had no adapter identity → RESOLVED: dispatch now resolves an explicit governed adapter identity (`resolveDispatchRuntimeCapability`, WO-026 merged) and threads the evaluated `modelRuntime` into `ensureCurrentModelPlan`; M05 CLI surfaces accept `--adapter`/`--host-home`.
2. Adapter-absent acquisition returned all-UNKNOWN with nothing proven downstream → RESOLVED: with an adapter identity, `resolveRoutingCapabilityTruth` evaluates the live WO-026 projection (stored/active PCCR behind the facade, `paths` forwarded by `e0c34e5`); the UNKNOWN branch remains only for the adapter-absent conservative case, which never enables.
3. The passive bridge hard-coded `provenance.confidence: "unknown"` → SUPERSEDED at the prerequisite level: WO-026 (PR #80, HEDS-approved and merged) implemented source-aware stored/active PCCR resolution with CEL/NPC rules, so current valid PCCR evidence can now ground proven capability truth through the consumer boundary.
4. `requireProvenRuntime: true` rejected every candidate → CONSISTENT now: the policy is unchanged (not weakened), but proven runtime evidence is obtainable via the merged M03 path, so eligible candidates route instead of blocking with `NO_PROVEN_CAPABILITY`.
5. Every production dispatch ended `BLOCKED` → RESOLVED: proven end-to-end; `eval:execution` X7 now PASS (9/9).
6. Removing the legacy snapshot removed the only enabling source → INTENT UPHELD: no legacy snapshot enablement was restored; the enabling source is the governed WO-026 projection instead.
Resolution proof: `eval:execution` head 8/9→9/9 (X7 fixed); `eval:fault-injection` head 27/32→32/32 (FI4/FI5/FI8/FI9/FI10 fixed); all failures previously shared the single cause "model routing blocked dispatch" and no other eval or test regresses relative to base. No architecture redesign, no Model Lock bypass/advisory downgrade, no `requireProvenRuntime` weakening, no missing-adapter compatibility path was introduced to achieve this.

## Repository gates on exact final head
- Local, on head `e0c34e5` content: `npm run build` exit 0; `npm run typecheck` exit 0; `npm run lint` exit 0; focused M05 suites 41/41; WO-026 seam suites 31/31; full suite 621/622 (sole inherited RG14, base-evidenced above); `npm run validate:engineering` exit 0; all deterministic evals green (execution 9/9, fault-injection 32/32, cost 27/27, model-routing 31/31, orchestrator 9/9, context 19/19, fault 18/18, specialist-routing 26/26, adapters 40/40, assurance 22/22, host-execution via full suite).
- Hosted gates (CI, CodeQL, Dependency Review, Cross-Platform) are evaluated on the exact final head after publication; run IDs and conclusions are recorded in PR #77. Any later commit invalidates earlier receipts.

## Remaining debt / known limitations
1. Historical NEEDS_ARCHITECTURE — SUPERSEDED (see above); the supersession itself awaits independent HEDS confirmation. Do not merge before a fresh APPROVED verdict.
2. `tests/release-security-proof.test.ts` RG14 is environment-dependent (0 tags on `KayzenRoot/uads-v2`); inherited with base evidence above, and masked by CI's temporary origin repoint. Not a release blocker, but it keeps a bare local `npm run validate` red at the Test gate.
3. `VERIFIED_MATCH`/`HOST_FIXED` enforcement states remain unreachable without host-execution evidence; RT-010 is proven for the router-side subset only.
4. M30 operational-event emission for lock changes is deferred to IW1-04; the immutable revision record is the audit trail in this slice.
5. Before any active-evidence contract is promoted to PRODUCTION, M03 must independently derive/attest the active current context inside the M03 host/probe boundary (WO-026 forward requirement, unchanged).

## HEDS
Review ID: PENDING — the reconciled head returns to independent final audit outside the executor (ChatGPT HEDS) after publication; the executor does not approve its own increment. The historical NEEDS_ARCHITECTURE review state is explicitly superseded by this reconciliation evidence; a fresh verdict on the new exact head is required.

## Final verdict
COMPLETE_CANDIDATE (not APPROVED, not merged). PR #77 is reconciled onto current main with WO-026 semantics preserved, M05 behavior preserved, T1–T10 green, execution 9/9, fault-injection 32/32, Evidence Bundle bound to the reconciled head, and hosted exact-head gates awaited. Merge only after fresh HEDS APPROVED plus exact-head CI, CodeQL, Dependency Review and Cross-Platform SUCCESS.
