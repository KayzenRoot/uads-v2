# UADS2-WO-025 — IW1-01 M05 Proof-Aware Model Routing + Model Lock Freeze

Status: CANDIDATE (planning freeze; no runtime implementation claim)
Work Order: UADS2-WO-025
Issue: #75
Owner: M05 Automatic Model Router
Prerequisites: M03 capability truth (frozen boundary), UADS2-WO-024 sequencing/interfaces
Base main SHA: `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`
Risk: HIGH
Readiness: IW1-01 moves ARCH_READY -> PACKAGE_READY through this Work Order.

## 1. Objective

Make M05 model routing consume host capability truth only through the M03 proof-aware consumer boundary, introduce the governed Model Lock contract/runtime as a hard constraint, and project a truthful routing enforcement state — with no silent fallback and no model broadcast.

## 2. Non-goals

- M06 per-task effort truth (IW1-02).
- M07 Economic Safety Envelope, reservations, HARD_STOP and breaker (IW1-03).
- M24 accounting seam and M30 economic projection of spend (IW1-04).
- Host-execution feedback (M15/M16) and any enforcement claim that requires it.
- Ensemble/parallel paid fan-out runtime; broadcast remains unauthorized.
- Vendor-specific active probes; M03 probe policy remains frozen.
- New mandatory infrastructure, dependencies, or dashboard architecture.

## 3. Prerequisite truth (M03)

- `readHostCapabilityProjection()` (`src/adapters/host-capability-consumer.ts`) is the only authorized production capability boundary for M05 (M03 S06.2).
- The passive bridge cannot prove `SUPPORTED` (E1 non-enabling / E2 fixed-false only); projection provenance confidence is always `unknown`.
- WO-011 precedent (`src/adapters/host-dispatch.ts`): dispatch preparation builds the passive bridge with `persist: false` and persists the projected runtime; plan currency compares `runtimeIdentityDigest` exactly.
- Consumer rule (IF-001): only current valid SUPPORTED evidence at sufficient CEL may enable a capability; UNKNOWN never means ALLOW.

## 4. Frozen architecture decisions for IW1-01

### 4.1 Capability acquisition (closes Gap A)

Every M05 surface that needs host capability truth — `routeWorkOrder` (`src/kernel/model-router.ts`), the execution plan currency/creation path `ensureCurrentModelPlan` (`src/kernel/execution.ts`), `uads models route/status` (`src/commands/models.ts`) and the model block of `uads status` (`src/commands/status.ts`) — acquires it exclusively through `readHostCapabilityProjection()`.

- Adapter identity is explicit: routing accepts an adapter identity (`cursor | codex | generic-agent-skills`). When the routing surface has no adapter identity, M05 evaluates against a conservative all-UNKNOWN capability set with `capabilityTruth.adapterId = null` and reason code `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED`. There is no implicit legacy-snapshot enablement and no placeholder side-effect creation.
- M05 must not use, as enabling truth: `readRuntimeCapabilitySnapshot()`, `runtimeSnapshotFromHostDetection()`, persisted `registry/runtime/capabilities/*` files, or any adapter-declared capability value.
- The plan records a bounded `capabilityTruth` block: `adapterId` (string or null), `runtimeIdentityDigest` (digest of the projection actually evaluated), `subjectDigest`, `adapterContractDigest`, `provenanceConfidence` (always `unknown` in this slice), and per-capability support truth over the fixed capability key set (`SUPPORTED | UNSUPPORTED | UNKNOWN | BLOCKED`), derived from the projection evaluation. `SUPPORTED` may only appear when the projection evaluates effective state SUPPORTED.
- Plan `runtimeIdentityDigest` equals the evaluated projection identity digest. When the dispatch-time projection for the same adapter differs, the existing visible stale/mismatch failure stands; it must not be weakened.

### 4.2 Model Lock contract (closes Gap B)

A governed routing-mode state owned by M05, persisted workspace-scoped in the global sidecar (`model-routing` workspace state; the exact file name is an executor detail, the location and lifecycle semantics below are frozen):

- Modes: `MODEL_LOCK | CHEAPEST_QUALIFIED | QUALITY_FLOOR_AUTOROUTE` (LLM routing/economic policy section 3).
- State carries: schema identity and version, projectId, mode, locked profile identity (`profileId`, `providerId`, `modelId` or null), monotonic `lockRevision`, `updatedAt`, registry digest at lock time (evidence), and a state digest over the canonical payload.
- Every set/clear persists an immutable revision record (audit trail for this slice). M30 operational-event emission for lock changes is deferred to IW1-04/M30 economic projection; the revision record alone is the audit trail here.
- CLI surface: `uads models lock show | set --profile <profileId> | clear`, plus an explicit operator recovery for corrupt/unreadable state. Lock changes are governed, auditable actions; setting a lock requires only that the profile exists in the registry — admissibility is evaluated at routing time, never assumed at set time.
- Enforcement while `MODEL_LOCK` is active:
  - only the locked profile identity is eligible (exact profileId match); alias coverage is NOT implemented in this slice and must never be widened silently (reason code `MODEL_LOCK_ALIAS_UNSUPPORTED` when the lock cannot be resolved to the exact profile);
  - `selectedProfileId` equals the locked profile or the plan is `BLOCKED` with `MODEL_LOCK_UNAVAILABLE` — a locked-but-unavailable profile fails visibly and is never substituted;
  - `fallbackProfileIds` is empty under `MODEL_LOCK`; suppressed fallbacks are recorded as `MODEL_LOCK_FALLBACK_FORBIDDEN`;
  - the plan records `routingMode` and the active `lockRevision`; Model Lock is a constraint, never a hint.
- Corrupt, unreadable or digest-invalid routing state fails closed (`ROUTING_STATE_UNAVAILABLE`): routing never silently assumes "unlocked" when a lock may exist, and operator recovery is explicit.
- `CHEAPEST_QUALIFIED` retains the existing capability-before-cost policy digest and deterministic tiebreak; `QUALITY_FLOOR_AUTOROUTE` retains existing risk/capability floors. Neither mode may enable on UNKNOWN capability truth.

### 4.3 Routing enforcement-state projection (closes Gap C)

The plan and the status surfaces expose `routingEnforcement` — `ENFORCED | VERIFIED_MATCH | HOST_FIXED | MISMATCH | UNKNOWN` — derived only from objective evidence available in this slice:

- `ENFORCED`: MODEL_LOCK active, plan `SELECTED`, and `selectedProfileId` equals the locked profile — the emitted decision provably respects the lock.
- `MISMATCH`: MODEL_LOCK active, plan `SELECTED`, selection differs from the locked profile. Must be impossible by construction; if ever observed (re-evaluation, currency checks), it surfaces as MISMATCH with fail-closed investigation signal, never hidden.
- `UNKNOWN`: every other state — with explicit reason codes (`NO_ACTIVE_LOCK`, `NO_HOST_EXECUTION_EVIDENCE`, `ROUTING_STATE_UNAVAILABLE`).
- `VERIFIED_MATCH` and `HOST_FIXED` require host-execution evidence owned by M06/M15/M16 that does not exist in this slice; they remain UNKNOWN and must never be claimed. RT-010 is proven for the router-side subset only.

### 4.4 No silent fallback, no broadcast

- Fan-out per routing decision is exactly 1 model call target (M30 S03). Routing surfaces must not emit multi-model dispatch intents; any ensemble/broadcast attempt is rejected with `ENSEMBLE_NOT_AUTHORIZED` (no policy flag or ESE allocation exists in this slice).
- Automatic-mode `fallbackProfileIds` remain advisory and require a new recorded routing decision before any execution; routing itself performs zero model-bearing calls.
- Locked-profile unavailability (RT-011/ES-013) fails visibly and never silently moves to a different, potentially more expensive profile.

### 4.5 Schema and version evolution (frozen)

- The runtime capability snapshot contract (schema + `MODEL_ROUTING_SCHEMA_VERSION` `0.8.0`) is unchanged; it must not be bumped. The plan gets a dedicated version constant so plan evolution cannot invalidate runtime snapshots.
- Model Execution Plan schema version moves to `0.9.0` (dedicated constant) with the new required fields `routingMode`, `modelLock`, `capabilityTruth`, `routingEnforcement`; the schema stays closed (`additionalProperties: false`) with bounded shapes (fixed capability key set).
- A persisted plan with a prior schema version degrades truthfully: current-plan reads must not throw through status/cockpit surfaces and must not be silently upcast; they render a defined legacy/UNAVAILABLE outcome with an explicit reason.
- New routing-state schema is closed, versioned and digest-covered, following existing sidecar conventions and atomic-write helpers.

## 5. Interfaces

- Consumes: IF-001 Host Capability Projection (M03) through the consumer boundary; existing Model Profile Registry; existing context pack hints; existing Work Order routing digests.
- Produces: IF-002 Model Routing Decision with all frozen fields — selected model/provider/profile or BLOCKED/UNKNOWN, rationale codes, considered/rejected candidates, requested capability set, decision evidence refs — extended with `routingMode`, `modelLock`, `capabilityTruth`, `routingEnforcement`.
- Model Lock state is a new M05-owned governed contract; no other module may reinterpret or bypass it.

## 6. Source boundary

Allowed primary sources:

- `src/kernel/model-router.ts`
- `src/kernel/model-types.ts`
- `src/kernel/model-runtime.ts` (contract stability only; no version bump)
- `src/kernel/model-persist.ts`
- `src/kernel/execution.ts` (only the plan capability-acquisition path)
- `src/commands/models.ts`
- `src/commands/status.ts`
- `src/commands/dashboard.ts` (only existing status render fields)
- `src/cli.ts` (only wiring for lock commands / adapter identity)
- `src/lib/workspace.ts` (only additional sidecar path + layout)
- `schemas/model-execution-plan.schema.json`, new routing-state schema
- `tests/model-routing.test.ts` and narrowly scoped new routing/lock tests
- `src/eval/model-routing.ts` (deterministic eval extension only)

Forbidden:

- M03 probe, storage or passive-bridge internals (consume via the consumer API only).
- M06/M07/M24 responsibilities (no effort logic, no ESE/reservations/breaker, no accounting).
- Adapter/host-execution behavior changes beyond the consumer boundary.
- Dashboard architecture, SSE, or observability infrastructure changes.
- New dependencies; vendor-specific probes; non-deterministic or model-bearing routing.
- Broad refactors outside the allowed list.

## 7. Risk, blast radius, economic envelope

- Risk: HIGH — routing gates every model-bearing action; an incorrect UNKNOWN-to-enabled mapping could authorize spend, and a weak lock could silently route against operator intent.
- Blast radius: routing decisions and dispatch currency for the project workspace; status/cockpit model projection; no effect on other modules' truth.
- Economic envelope: routing itself performs zero model-bearing calls; fan-out stays 1; no paid benchmarks or provider calls in tests or evidence; the slice must not increase spend capacity and must not preempt M07 admission.

## 8. Proof IDs

- RT-001 Model Lock hard constraint (locked profile never silently bypassed; visible `MODEL_LOCK_UNAVAILABLE`; audited revision).
- RT-002 Cheapest qualified (no cheapest claim without objective price evidence).
- RT-003 Quality floor (risk/capability floor never dropped for cost).
- RT-009 Latest-model resolution (no lexical/version ordering authorizes a newer profile).
- RT-010 Routing enforcement state (router-side subset: ENFORCED/MISMATCH/UNKNOWN with reason codes; VERIFIED_MATCH/HOST_FIXED explicitly deferred and rendered UNKNOWN).
- RT-011 No silent expensive fallback.
- ES-013 Fallback cost guard.
- ES-014 Ensemble/broadcast guard (default path one model only).

## 9. Windows/Linux matrix

- Full suite on the executor Windows host and on Linux CI; the Cross-Platform Compatibility workflow covers linux and windows runners.
- New state files use existing atomic-write helpers; no host-path-dependent assertions; deterministic digests must be byte-stable across platforms.

## 10. M30 projection obligations

- Routing mode, locked profile (or null), `lockRevision`, enforcement state with reason codes, and capability-truth adapter/UNKNOWN discipline must be renderable from owner evidence through `uads status` / `uads models status` and the existing cockpit status panel.
- Read-only projection; zero model-bearing calls on refresh; absence renders UNKNOWN/UNAVAILABLE, never zero/default success; no fabricated ENFORCED.

## 11. Rollback and recovery

- Lock clear/change increments `lockRevision`; prior revisions remain auditable.
- Atomic persistence guarantees a crash leaves the last valid state; restart never resets lock state to unlocked-by-default.
- Corrupt/invalid state fails closed with explicit operator recovery; recovery is itself a governed, recorded action.
- Legacy plan artifacts degrade to a defined UNAVAILABLE/legacy outcome without breaking status surfaces.

## 12. Evidence Bundle

Executor produces `.engineering/reports/EVIDENCE-UADS2-WO-025.md` from `.engineering/reports/EVIDENCE-UADS2-WO-025-TEMPLATE.md`, bound to the implementation head SHA, with per-proof PASS/FAIL/BLOCKED/NOT_APPLICABLE results and exact-head gate results.

## 13. Executor routing and stop condition

- Executor recommendation: model per host-proven availability; effort LOW for mechanical wiring, MEDIUM for ordinary implementation/tests, HIGH for capability-truth/lock integration; MAX is never a default.
- ESE ceiling: no paid fan-out, no provider-credential-dependent tests, bounded deterministic execution only.
- STOP CONDITION: executor stops at COMPLETE_CANDIDATE with implementation + focused/full tests + Evidence Bundle, or at a truthful terminal state (`NEEDS_ARCHITECTURE`, `BLOCKED_EVIDENCE`, `CORRECTION_REQUIRED`). Merge is forbidden until exact-head gates and independent HEDS approve the final head.
- Escalation: any conflict between this frozen architecture and source reality returns `NEEDS_ARCHITECTURE`; the executor never redesigns ownership or interfaces.
