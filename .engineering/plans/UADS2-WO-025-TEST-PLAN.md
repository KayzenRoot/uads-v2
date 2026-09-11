# UADS2-WO-025 — IW1-01 Test / Proof Plan

Status: LOCKED / CODEX_READY
Risk: HIGH
Base main SHA: `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`

## Purpose
Prove the M05 proof-aware model-routing + Model Lock increment preserves capability-truth discipline, lock hard-constraint semantics, no-silent-fallback economic guarantees, enforcement truthfulness and schema determinism.

## Mandatory proofs
### T1 Capability-truth boundary and UNKNOWN discipline
- every routing surface acquires capability truth exclusively through `readHostCapabilityProjection()`;
- legacy runtime snapshots / persisted capability files / adapter-declared values cannot enable a capability (legacy TRUE is not enabling);
- missing adapter identity yields conservative all-UNKNOWN truth plus `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED`;
- UNKNOWN never maps to ALLOW/selection enablement.
Maps: IF-001, IF-002.

### T2 Model Lock hard constraint and audit trail
- with `MODEL_LOCK` active and the locked profile available, routing selects the locked profile regardless of other candidates;
- every set/clear persists an immutable revision record with monotonic `lockRevision`.
Maps: RT-001.

### T3 Model Lock fail-closed availability
- locked profile removed/inadmissible/unresolvable produces visible `MODEL_LOCK_UNAVAILABLE`, with no substitution of another profile;
- corrupt/unreadable lock state fails closed with explicit operator recovery, never unlocked-by-default.
Maps: RT-001, RT-011.

### T4 Cheapest-claim discipline
- `CHEAPEST_QUALIFIED` selects the least-cost admissible profile only with objective price evidence;
- missing/unknown price evidence produces no cheapest claim (explicit UNKNOWN reason).
Maps: RT-002.

### T5 Quality floor
- selection never drops below the declared risk/capability/quality floor solely to save cost.
Maps: RT-003.

### T6 Latest-model resolution
- a successor/"latest" selector requires proven host availability/capabilities/policy compatibility; lexical/version ordering alone cannot authorize a new model.
Maps: RT-009.

### T7 Enforcement-state truth
- router-side states only: ENFORCED/MISMATCH/UNKNOWN with explicit reason codes (`NO_ACTIVE_LOCK`, `NO_HOST_EXECUTION_EVIDENCE`, `ROUTING_STATE_UNAVAILABLE`);
- VERIFIED_MATCH/HOST_FIXED never claimed without host-execution evidence;
- MISMATCH surfaces visibly if ever observed (must be impossible by construction).
Maps: RT-010.

### T8 No silent expensive fallback
- automatic-mode fallbacks remain advisory and require a new recorded routing decision;
- selected/locked model unavailability never silently moves to a materially more expensive profile outside operator policy.
Maps: RT-011, ES-013.

### T9 No broadcast / single target
- routing emits exactly one model call target per decision;
- ensemble/broadcast attempts are rejected with `ENSEMBLE_NOT_AUTHORIZED`.
Maps: ES-014.

### T10 Schema evolution, legacy compatibility and baseline integrity
- plan schema `0.9.0` with `routingMode, modelLock, capabilityTruth, routingEnforcement` required, closed and bounded (fixed capability key set); runtime snapshot contract stays `0.8.0`;
- legacy persisted plan (prior version) degrades truthfully without throwing through status/cockpit and without silent upcast;
- deterministic digests byte-stable across hosts/platforms;
- executor confirms the 13 critical source identities before material edits; drift is reported as a controlled baseline delta.
Maps: RT-001 (schema/version clause); evidence integrity.

## Out-of-scope proof IDs (NOT_APPLICABLE for IW1-01)
- RT-004/005/006/007/008 (effort autopilot family): owned by IW1-02 (M06).
- RT-012 (cost-quality comparison benchmark): requires IW1-03 economic envelope ownership.
- ES-015..019 (accounting/breaker/kill-switch family): owned by IW1-03/IW1-04.
The executor records these as NOT_APPLICABLE with owner reference; absence of proof is not failure for this slice but may never be claimed as proven.

## Performance evidence
Record routing-decision and status/dashboard projection measurements as OBSERVATION or TARGET only. Routing performs zero model-bearing calls; no paid provider benchmarks. Do not declare production SLO/capacity from developer/CI hosts. Preserve hooks for Issue #39.

## Required execution evidence
- focused Vitest suites for model routing/lock/plan schema;
- full repository test suite;
- negative scenarios: legacy-snapshot-only capability truth, adapter-unspecified truth, missing/inadmissible lock, corrupt lock state, prior-schema plan, mismatch surfacing, broadcast rejection;
- Windows/Linux CI evidence;
- exact-head CI, CodeQL, Dependency Review and Cross-Platform success;
- Evidence Bundle tied to the implementation SHA;
- final independent HEDS before merge.

## Enterprise pillars
M27: bounded workload profiles; bounded routing decision cost; zero model-bearing routing calls.
M28: corrupt/unavailable lock and registry failure semantics; crash-safe atomic persistence.
M29: closed schemas, no secrets/host paths in routing state, sanitized reason codes.
M05: owned runtime slice.
M30: read-only truthful projection of routing mode/lock/enforcement.
M31: exact-head CI, CodeQL, Dependency Review, Cross-Platform + HEDS.

## Release gate
Any failure that can enable from UNKNOWN/legacy truth, bypass or weaken the Model Lock, hide MISMATCH, claim unproven enforcement states, silently fall back to a materially more expensive profile, emit broadcast/fan-out above one, perform model-bearing routing calls, or break plan/schema determinism is release-blocking for this slice.