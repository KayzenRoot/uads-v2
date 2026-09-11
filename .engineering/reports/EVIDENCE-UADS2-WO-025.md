# EVIDENCE — UADS2-WO-025

Status: NEEDS_ARCHITECTURE — runtime candidate implemented, tested and published; production dispatch is blocked by construction under the frozen capability-acquisition rule (freeze §4.1: adapter-unspecified truth is a conservative all-UNKNOWN set) combined with the unconditional `requireProvenRuntime` router policy, so this increment cannot reach COMPLETE_CANDIDATE and requires an architecture decision before merge (see "Architecture conflict").
Module: M05 Automatic Model Router
Session: IW1-01 Proof-Aware Model Routing + Model Lock
Issue: #75
PR: #__PR__
Risk: HIGH
Terminal state: NEEDS_ARCHITECTURE

## Exact identities
- Reviewed planning base (Context Lock / Test Plan / freeze): `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`
- Reconciled main at runtime dispatch: `a0a778e5fa4a28750540246fa5894c91a92d0b2b`
- Implementation head SHA (implementation + tests): `5f13ac6e8c8554eaaadc01b194433ee4206bbbcf`
- Evidence bundle commit: the commit that adds this document; the exact final head is recorded in PR #__PR__ and in the execution report
- Branch: `feat/uads2-wo-025-iw1-01-model-routing-lock`
- Node version: `v24.18.0` (npm `11.16.0`)
- OS/platform: Windows `10.0.26200` x64, PowerShell `7.6.5`, git `2.55.0.windows.3`, AMD Ryzen 3 4300GE (8 logical cores, 15.8 GB RAM), host `D:\Projekt Codexx\uads-v2`
- Executor/host model routing state: `UNKNOWN` (`NO_HOST_EXECUTION_EVIDENCE`) — the host exposes no per-subtask model/effort control to the executor and this slice owns no host-execution evidence; `VERIFIED_MATCH`/`HOST_FIXED` are never claimed.
- Requested effort / applied effort: requested HIGH (capability-truth/lock integration per the dispatch binding "Model / effort routing"); applied effort `UNKNOWN` (not observable or controllable on this host).

Source-baseline reconciliation: reviewed main advanced `9eb5b713..a0a778e5` (8 files; `docs/v2` governance/checkpoint/continuity and the Issue #75 freeze package only). No `src/`, `tests/`, `schemas/`, `evals/`, `scripts/` or workflow movement, no redesign implication, and all 13 frozen blob identities still matched at preflight (below).

## Source baseline verification
Method: frozen identity from `.engineering/context-locks/UADS2-WO-025.md`, verified with `git rev-parse a0a778e5:<path>` versus `git hash-object <path>` (pre-edit working tree) and versus the committed implementation head.

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

13/13 frozen identities matched the Context Lock at dispatch preflight (`BASE_MATCH` in every row); 7 stayed byte-identical and 6 moved as controlled deltas inside the allowed source boundary.

Forbidden-boundary check: `git diff --name-only a0a778e5 -- src/adapters/host-dispatch.ts src/kernel/model-requirements.ts src/kernel/model-registry.ts src/adapters/host-capability-consumer.ts src/adapters/host-capability-passive.ts src/kernel/host-capability-proof.ts src/eval/execution.ts src/eval/fault-injection.ts scripts .github` → empty output (0 violations).

## Changed files
15 paths, all inside freeze §6; no new dependencies, no project-local UADS state, no broad refactor.

| Path | Change | Rationale |
| --- | --- | --- |
| `src/kernel/model-router.ts` | modified | `resolveRoutingCapabilityTruth` (consumer-boundary acquisition), lock-aware mode/lock resolution, `routingEnforcement` projection, cheapest-price discipline, `ENSEMBLE_NOT_AUTHORIZED` single-target rule, plan `0.9.0` fields |
| `src/kernel/model-types.ts` | modified | plan/routing type contract for `routingMode`, `modelLock`, `capabilityTruth`, `routingEnforcement` and bounded reason codes (runtime snapshot contract untouched) |
| `src/kernel/model-persist.ts` | modified | persist/read plan `0.9.0`; prior-schema and corrupt plan state degrade truthfully without throwing or silently upcasting |
| `src/kernel/execution.ts` | modified | plan capability-acquisition path only: capability truth now comes from the consumer boundary; lock state participates in plan currency |
| `src/kernel/model-lock.ts` | new | governed lock state: modes, monotonic immutable revision audit, digest coverage, atomic writes, corrupt-state fail-closed with explicit operator recovery, secret/host-path rejection |
| `src/commands/models.ts` | modified | `models lock show|set --profile|clear|recover`; `--adapter`/`--host-home` on `models status|route`; truthful legacy/UNAVAILABLE rendering |
| `src/cli.ts` | modified | wiring only: lock subcommands and adapter identity options |
| `src/lib/workspace.ts` | modified | sidecar path/layout only: workspace-scoped routing-state location |
| `schemas/model-execution-plan.schema.json` | modified | plan schema `0.9.0`: new required fields, closed (`additionalProperties: false`), bounded capability key set |
| `schemas/model-routing-state.schema.json` | new | closed (`additionalProperties: false`) routing-state contract `0.1.0` |
| `schemas/model-routing-state-revision.schema.json` | new | closed (`additionalProperties: false`) immutable revision-record contract `0.1.0` |
| `tests/model-routing.test.ts` | modified | router-side T1..T10 proofs and negative scenarios |
| `tests/model-lock.test.ts` | new | lock state, revision audit, corruption/fail-closed, legacy/corrupt plan degradation proofs |
| `src/eval/model-routing.ts` | modified | deterministic eval extension MR23..MR31 |
| `evals/model-routing/cases.json` | modified | eval case registry for MR23..MR31 |

## Proof results
Labels: PASS / FAIL / BLOCKED / NOT_APPLICABLE. Test references are test names in `tests/model-routing.test.ts` (router side) and `tests/model-lock.test.ts` (lock state side); `MR` references are deterministic eval cases.

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
- T8 no silent expensive fallback: PASS — T2/`MR14` evidence above.
- T9 no broadcast / single target: PASS — T9 test; `MR26`.
- T10 schema evolution, legacy compatibility, baseline integrity: PASS — "WO-025 T10: the plan schema is closed at 0.9.0 with deterministic digests" (router), "WO-025 T10: current plan reads degrade truthfully and never throw", "WO-025 T10: routing state rejects secret-like or host-path content at write time" (state); `MR29`, `MR30`; plus the 13-blob baseline table above.
- RT-004/005/006/007/008 (effort autopilot family): NOT_APPLICABLE — owner IW1-02 (M06).
- RT-012 (cost-quality comparison benchmark): NOT_APPLICABLE — owner IW1-03 (economic envelope).
- ES-015..019 (accounting/breaker/kill-switch family): NOT_APPLICABLE — owner IW1-03/IW1-04.
Absence of proof for the NOT_APPLICABLE families is not a failure of this slice and is never claimed as proven.

## Tests
### Focused
Command: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/model-routing.test.ts tests/model-lock.test.ts`
Result: `2 files passed / 41 tests passed (41), exit 0, 2.96 s`

Build/lint: `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run build` → exit 0 (tsc, committed head content).

### Full suite
Command: `npm test` (`vitest run --maxWorkers=1`)
Result: 61 files — 60 passed / 1 failed; 593 tests — 592 passed / 1 failed; duration 1624.35 s.
Sole failure: `tests/release-security-proof.test.ts` — "RG14 keeps v0.11.0 outside corrected-release proof semantics and immutable" (`git ls-remote origin refs/tags/v0.11.0` returns empty because `KayzenRoot/uads-v2` has 0 tags; the historical tag exists only in the predecessor lineage `KayzenRoot/uads`, `d5cb361274cb19f70c8bd02dd023b596b8babf13`).
Inherited proof: the same failure reproduces at base `a0a778e5` with the same toolchain, and the file passes 25/25 when `origin` is temporarily repointed to the frozen V1 lineage — the same repoint CI performs for the Test and Validate-foundation steps (`.github/workflows/ci.yml:73-81`, `:166-174`).
The suite ran on working-tree content byte-identical to the implementation head `5f13ac6e8c8554eaaadc01b194433ee4206bbbcf` for all 15 changed paths (verified with `git hash-object` against the committed blobs; see the baseline table) and no source file changed after the run.

### Deterministic evaluations (head vs base `a0a778e5`, same toolchain)
| Eval | Head | Base | Status |
| --- | --- | --- | --- |
| `eval:orchestrator` | 9/9 | 9/9 (unchanged path) | PASS |
| `eval:execution` | 8/9 — X7 FAIL "model routing blocked dispatch" | 9/9 | FAIL (introduced; see Architecture conflict) |
| `eval:context` | 19/19 | 19/19 | PASS |
| `eval:fault` | 18/18 | 18/18 | PASS |
| `eval:model-routing` | 31/31 (MR1..MR31) | 22/22 (MR1..MR22) | PASS (9 new cases) |
| `eval:specialist-routing` | 26/26 | 26/26 | PASS |
| `eval:adapters` | 40/40 | 40/40 | PASS |
| `eval:host-execution` | covered by the full suite (`tests/host-execution.test.ts`) | — | PASS |
| `eval:assurance` | 22/22 | 22/22 | PASS |
| `eval:fault-injection` | 27/32 — FI4/FI5/FI8/FI9/FI10 FAIL | 32/32 | FAIL (introduced; see Architecture conflict) |
| `eval:cost` | NOT COMPLETED (bounded attempt) | not run | INCONCLUSIVE — see debt 3 |
Commands: `node dist/eval/<name>.js` (evals run against the built head; base runs used an equivalent detached worktree at `a0a778e5` with its own build).

### Protocol validation
`npm run validate:engineering` → `{"ok":true,"identity":"ENG-PROTOCOL-ADOPTION-001","requiredFiles":23,"schemas":6,"records":6}`, exit 0.
`npm run validate` → FAIL (exit 1) at the Test gate: lint/typecheck/build PASS; Test 61 files — 60 passed/1 failed, 593 tests — 592 passed/1 failed (1792.68 s); the sole failure is the inherited RG14 environment artifact (reproduced in isolation: 25 tests — 24 passed/1 failed); the script fails fast, so the eval steps after Test are not reached.

## Runtime scenarios (explicit negatives)
- legacy-snapshot-only truth: an all-true legacy runtime snapshot does not enable routing (state test T1).
- adapter-unspecified truth: no adapter identity ⇒ conservative all-UNKNOWN with `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED`; never ALLOW (router test T1, state test T1/T3).
- lock set/show/clear: every set/clear persists an immutable revision record with a monotonic `lockRevision` (state test T2; CLI surface `models lock show|set --profile|clear`).
- locked-profile removal/inadmissibility: visible `MODEL_LOCK_UNAVAILABLE`, no substitution (router test T3).
- corrupt lock state: fails closed with explicit operator recovery and archived raw bytes; digest tampering, schema drift and project mismatch are rejected without throwing (state tests T3).
- prior-schema plan: degrades truthfully, no throw through status surfaces, no silent upcast (state test T10, router test T10, `MR30`).
- enforcement derivation: only `ENFORCED`/`MISMATCH`/`UNKNOWN` with bounded reason codes (router test T7).
- broadcast: ensemble/broadcast intents rejected with `ENSEMBLE_NOT_AUTHORIZED`; exactly one model target (router test T9, `MR26`).
- zero model-bearing routing calls: routing/status/dashboard paths import no network or process API — verified over `src/kernel/model-router.ts`, `src/kernel/model-lock.ts`, `src/kernel/model-persist.ts`, `src/commands/models.ts`, `src/kernel/execution.ts` (no `fetch`, `node:http(s)`, `node:net`, `child_process`, provider client or API-key usage).
- secret/host-path hygiene: routing state rejects secret-like or host-path content at write time (state test T10).

## Performance observation
Environment: executor Windows host above; observations only, no production SLO/capacity claim.
- Routing decision: OBSERVATION — `node dist/eval/model-routing.js` completes 31 routing decisions (registry load, capability evaluation, lock resolution, digest computation and plan persistence per case) in `0.94` s wall time; routing itself is pure in-process computation with zero model-bearing calls.
- Status/dashboard projection: OBSERVATION/TARGET — read-only projections over the persisted plan/lock state; no production SLO claim is made from a developer/CI host.
- Issue #39 comparison: no interaction. Issue #39 (M30 `evidence.lifecycle` hot-path overhead, `JUSTIFIED_EXCEPTION`, still open) is untouched, remains visible, and this slice adds no `evidence.lifecycle` work and no paid-provider benchmark.

## Security/privacy
- secret/host-path leakage into routing state: PASS — write-time rejection (state test T10).
- bounded reason codes / no raw provider payloads: PASS — closed reason-code set (`CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED`, `MODEL_LOCK_UNAVAILABLE`, `MODEL_LOCK_ALIAS_UNSUPPORTED`, `MODEL_LOCK_FALLBACK_FORBIDDEN`, `ROUTING_STATE_UNAVAILABLE`, `ENSEMBLE_NOT_AUTHORIZED`, `NO_PROVEN_CAPABILITY`, `NO_ACTIVE_LOCK`, `NO_HOST_EXECUTION_EVIDENCE`).
- closed schemas (`additionalProperties: false`): PASS — plan `0.9.0`, routing state `0.1.0`, revision record `0.1.0`.
- no project-local UADS state; global sidecar only: PASS — `src/lib/workspace.ts` sidecar layout only.

## GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT
No project-local UADS operational state, no new dependency, no sidecar relocation beyond the workspace-scoped routing-state path; lock state, revisions and plans live in the global sidecar.

## Architecture conflict — why this is NEEDS_ARCHITECTURE
Facts, each independently checkable:
1. `src/kernel/execution.ts` (`ensureCurrentModelPlan`) acquires capability truth through `resolveRoutingCapabilityTruth({ adapterId: null, schemaRoot })` — the execution path has no adapter identity (`HOST_ADAPTER_IDS` is used there only by the artifact/cleanup inventory).
2. `resolveRoutingCapabilityTruth` without adapter identity returns `conservativeRuntimeCapabilitySnapshot()`: every capability `unknown`, `provenance.confidence: "unknown"`, reason `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` (freeze §4.1).
3. The production capability boundary (`readHostCapabilityProjection` → `host-capability-passive.ts`) hard-codes `provenance.confidence: "unknown"` (`src/adapters/host-capability-passive.ts:110-112`); the passive bridge cannot prove `SUPPORTED` (freeze §3).
4. `src/kernel/model-requirements.ts:148` sets `requireProvenRuntime: true` unconditionally (forbidden boundary, not editable by this Work Order) and `src/kernel/model-router.ts` rejects every candidate when `requireProvenRuntime && confidence !== "proven"` (`NO_PROVEN_CAPABILITY`).
5. Therefore every production dispatch through the execution path ends `BLOCKED` (`NO_ELIGIBLE_MODEL`) with `ExecutionBlockedError` at `src/kernel/execution.ts:637`.
6. Base behaviour for comparison: `ensureCurrentModelPlan` read the persisted runtime snapshot (`readRuntimeCapabilitySnapshot(paths, "generic-runtime", schemaRoot)`) — exactly the legacy enablement path the freeze forbids. Removing it removed the only enabling source M05 has in this slice.
Consequence: no enabling path exists inside the allowed source boundary. Options for the architecture owner: (a) define/authorize a proven-capability source for M05 in this slice (M06/M15/M16 host-execution evidence); (b) thread a real adapter identity plus proven capability evidence into the execution plan path; or (c) amend freeze §3/§4.1 together with the `requireProvenRuntime` policy so the fail-closed rule and the dispatch requirement are consistent.
Introduced-regression evidence (proven against base, not merely labelled pre-existing):
- `eval:execution`: head 8/9 (X7 FAIL) versus base 9/9.
- `eval:fault-injection`: head 27/32 (FI4/FI5/FI8/FI9/FI10 FAIL) versus base 32/32.
All failures share one cause: "model routing blocked dispatch". No other eval, and no other full-suite test, regresses relative to base.

## Repository gates on exact final head
- Local, on the implementation head content: `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0; focused suites PASS; full suite 60/61 files; `npm run validate:engineering` exit 0; `npm run validate` → FAIL (exit 1) at the Test gate — inherited RG14 environment artifact; see "Protocol validation".
- Hosted gates (CI, CodeQL, Dependency Review, Cross-Platform) are evaluated on the exact final head after publication; run IDs and conclusions are recorded in PR #__PR__ and in the execution report. Expected CI outcome: the Test step passes (CI repoints `origin` to the frozen V1 lineage), and the job fails at the Execution eval step on the introduced X7 regression documented above.

## Remaining debt / known limitations
1. Architecture conflict above — blocking; requires an architecture decision before merge.
2. `tests/release-security-proof.test.ts` RG14 is environment-dependent (0 tags on `KayzenRoot/uads-v2`); inherited, reproduced identically at base, and masked by CI's temporary origin repoint. Not a release blocker, but it makes a bare local `npm run validate` red at the Test gate.
3. `npm run eval:cost` was not completed locally and is not reached in CI (the job fails earlier at the Execution eval step). Recorded as INCONCLUSIVE, never as PASS.
4. `VERIFIED_MATCH`/`HOST_FIXED`/`MISMATCH`-beyond-construction remain unreachable without host-execution evidence; RT-010 is proven for the router-side subset only.
5. M30 operational-event emission for lock changes is deferred to IW1-04; the immutable revision record is the audit trail in this slice.

## HEDS
Review ID: PENDING — independent final audit is performed outside the executor (ChatGPT) after publication; the executor does not approve its own increment.

## Final verdict
NEEDS_ARCHITECTURE (not APPROVED, not merged). The increment is implemented, tested, evidenced and published; the release-blocking dispatch conflict must be resolved by an architecture decision before this branch can be treated as mergeable.