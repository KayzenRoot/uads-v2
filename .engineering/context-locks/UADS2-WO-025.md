# UADS2-WO-025 — Context Lock

Status: LOCKED / CODEX_READY
Module: M05 Automatic Model Router
Session: IW1-01 Proof-Aware Model Routing + Model Lock
Issue: #75
Base main SHA: `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`
Risk: HIGH

## Frozen inputs
- M03 capability truth / Host Capability Projection boundary (IF-001) and S06.2 consumer discipline
- `docs/v2/planning/UADS2-WO-025-IW1-01-MODEL-ROUTING-FREEZE.md` (IW1-01 planning freeze)
- `docs/v2/planning/UADS2-IWAVE-0-4-INTERFACE-FREEZE.md` (WO-024 sequencing/interfaces)
- M30 S03 token-spend safety doctrine
- M30 S04 proof/benchmark matrix (RT-001/002/003/009/010/011, ES-013/014)
- ADR-UADS2-011 S05 Vertical Implementation Slices
- Existing Model Execution Plan schema and sidecar conventions (GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT)
- UADS2-WO-020 merge at `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53` (current reconciled planning base)

## Governing truths
1. M05 consumes host capability truth only through `readHostCapabilityProjection()` (`src/adapters/host-capability-consumer.ts`); legacy runtime snapshots, persisted `registry/runtime/capabilities/*` files and adapter-declared values never enable a capability.
2. UNKNOWN never means ALLOW: only current valid SUPPORTED evidence at sufficient CEL may enable; missing adapter identity yields conservative all-UNKNOWN truth with `CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED`.
3. The Model Lock is a hard routing constraint; locked-profile unavailability fails visibly (`MODEL_LOCK_UNAVAILABLE`) and never substitutes another profile.
4. Routing itself performs zero model-bearing calls; fan-out per routing decision is exactly 1; ensemble/broadcast is rejected with `ENSEMBLE_NOT_AUTHORIZED`.
5. Enforcement projection claims only router-side provable states (`ENFORCED | MISMATCH | UNKNOWN`); `VERIFIED_MATCH`/`HOST_FIXED` remain UNKNOWN without host-execution evidence owned by M06/M15/M16.
6. Enforcement truth is never weakened to look better; MISMATCH is never hidden.
7. Model Lock state is workspace-scoped in the global sidecar; no project-local UADS state; lock revisions are immutable and auditable; corrupt state fails closed with explicit operator recovery.
8. The Model Execution Plan schema moves to `0.9.0` (dedicated constant) with new required fields `routingMode, modelLock, capabilityTruth, routingEnforcement`; the runtime capability snapshot contract (`MODEL_ROUTING_SCHEMA_VERSION` `0.8.0`) is unchanged.
9. Persisted plans with a prior schema version degrade truthfully (defined legacy/UNAVAILABLE outcome with explicit reason), never silently upcast, never throw through status/cockpit.
10. M30 projections are read-only over owner evidence; absence renders UNKNOWN/UNAVAILABLE, never zero/default success; no fabricated ENFORCED.
11. No new dependencies, no vendor-specific active probes, no paid provider calls in tests/evidence; M07 admission/reservation/breaker logic is out of scope.
12. M27-M31 enterprise constraints apply from this slice.

## Source baseline at dispatch preparation
Base main: `9eb5b713a70dbb2a836b4c2fb5bfefd6019a9f53`.
Critical source identities (verified at freeze time):
- `src/kernel/model-router.ts`: blob `c46061746bb0221557b091279b99e7f587ef8441`
- `src/kernel/model-types.ts`: blob `df4ac2159c6df0cf1fe7c176ef14ed06bf39b435`
- `src/kernel/model-requirements.ts`: blob `2a0b325061a949f303ae0c1a6910f5cbab5f37fb`
- `src/kernel/model-runtime.ts`: blob `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62`
- `src/kernel/model-registry.ts`: blob `30af33571e776df2d50ce46cf7a6166d166ca3c8`
- `src/kernel/model-persist.ts`: blob `c0d0799a064a48e87dbdbd26407cb47563037a59`
- `src/adapters/host-capability-consumer.ts`: blob `6e4035a5c6790ffe6272a4e93dd99c24908ff936`
- `src/adapters/host-capability-passive.ts`: blob `edd37b91bee623730f43bbdc6422084e6e63f7f9`
- `src/kernel/host-capability-proof.ts`: blob `ff79a8f6280e8be0ae4563e9b6e62b9e216df76b`
- `src/commands/models.ts`: blob `9be44ab26c9e6a264bbae37eaa57ed59aff630ec`
- `src/adapters/host-dispatch.ts`: blob `97bfebbc62570a5a245a7dd8512f37b57fe2e1b0`
- `tests/model-routing.test.ts`: blob `47c2bdbad80c1e63366cdb4dd04720c91ba98ee1`
- `schemas/model-execution-plan.schema.json`: blob `ef7b91217a11d5ae8dc2444bc8bc094176980536`

Before executor dispatch, verify these identities against the branch. Any unexpected source movement is a controlled baseline delta, not permission to redesign.

## Scope lock
Deliver one thin end-to-end M05 increment: proof-aware capability acquisition on every routing surface, the governed Model Lock contract/runtime/CLI, truthful routing enforcement projection, and plan schema evolution to `0.9.0`. Do not expand into effort truth (IW1-02), economic safety (IW1-03), accounting/M30 spend projection (IW1-04), ensemble runtime, or unrelated modules.

## Executor behavior
The executor implements and proves. It does not redesign architecture. If a frozen ownership/interface is materially incompatible with source reality, stop as `NEEDS_ARCHITECTURE` with evidence.

## Stop conditions
Stop and mark CORRECTION REQUIRED if implementation can: enable a capability from UNKNOWN/legacy/adapter-declared truth; bypass or weaken an active Model Lock; hide MISMATCH; claim VERIFIED_MATCH/HOST_FIXED without host-execution evidence; silently fall back to a different (potentially more expensive) profile; emit multi-model broadcast intents; perform model-bearing calls during routing/status/dashboard refresh; leak secrets/host paths into routing state; break atomic persistence or lock-revision auditability; or weaken M03/M06/M07/M24/M30 authority.