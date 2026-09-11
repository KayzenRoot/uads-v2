# UADS2-WO-026 — Context Lock

Status: LOCKED / CODEX_READY
Module: M03 Host Capability Detector — proven capability resolution (dispatch adapter-identity binding frozen jointly with the M05 dispatch seam)
Session: M03 proven capability resolution + dispatch adapter binding (planning freeze; no runtime implementation)
Issue: #78
Base main SHA: `a0a778e5fa4a28750540246fa5894c91a92d0b2b`
Risk: HIGH

## Frozen inputs
- IF-001 Host Capability Projection and S06.2 consumer discipline (`docs/v2/modules/m03/M03-S06.2-CONSUMER-BOUNDARY.md`)
- HEDS independent review `5178444951` on PR #77 — `NEEDS_ARCHITECTURE — NOT APPROVED / DO NOT MERGE` — which mandates this Work Order
- M03 S05.1 PCCR implementation contract, S05.2 subject/passive evidence contract, S05.3 probe/budget fence, S05.4 active-evidence contract
- M03 probe policy and capability vocabulary (`docs/v2/modules/m03/M03-PROBE-POLICY.json`, `docs/v2/modules/m03/M03-CAPABILITY-VOCABULARY.json`)
- M05 IW1-01 routing freeze (`docs/v2/planning/UADS2-WO-025-IW1-01-MODEL-ROUTING-FREEZE.md`) with its `requireProvenRuntime` + `effectiveCapability` fail-closed semantics
- Runtime capability snapshot contract `0.8.0` and the M03 proof schema family (`1.0.0` / `1.1.0`)
- UADS2-WO-025 approved merge + canonical reconcile at `a0a778e5fa4a28750540246fa5894c91a92d0b2b` (current baseline)

## Governing truths
1. IF-001 remains the only authorized enabling-truth boundary for M05: `readHostCapabilityProjection()`. M05 — and any other consumer — must never read legacy runtime snapshots, adapter declarations or raw PCCR files directly as enabling truth.
2. The implementation behind `readHostCapabilityProjection()` evolves using the existing optional `paths` input to resolve current stored/active PCCR evidence. The consumer-facing surface stays unchanged; consumers remain coupled only to the facade.
3. Current host subject, adapter-contract digest and current proof basis are always computed first. Stored proof is usable only when subject, adapter, runtime version, contract/probe/policy/configuration basis and lease/currentness all match.
4. Positive capability TRUE requires a current valid PCCR SUPPORTED proof at the evidence class required by M03 semantics (global enabling floor E2; stricter per-capability rungs where defined). Negative FALSE requires a current valid UNSUPPORTED proof satisfying NPC rules.
5. Missing, rejected, stale, mismatched, corrupt or expired proof remains UNKNOWN and non-enabling. UNKNOWN never maps to ALLOW and is never converted to TRUE to preserve compatibility.
6. Projection provenance may be `proven` only when the returned compatibility snapshot is PCCR-backed by current validated proof evidence. Individual capabilities remain independently true/false/unknown, so `requireProvenRuntime` plus `effectiveCapability` continues to fail closed for any required capability without positive proof.
7. The passive bridge remains the fallback/current-basis provider and may still generate E1 UNKNOWN / E2 fixed-false proof. It must never manufacture positive SUPPORTED; adapter-declared TRUE is not proof.
8. A bounded positive-proof acquisition seam owned by M03 is frozen: local-first, deterministic where possible, no paid provider call by default, no secret/path leakage, no arbitrary shell execution, no project-local state. Host-specific active probes may exist only behind versioned probe definitions and bounded evidence contracts.
9. If a host cannot obtain positive proof safely, capability remains UNKNOWN and dispatch remains visibly blocked. Support is never invented.
10. Dispatch entry paths carry explicit host adapter identity as governed input, supplied by bootstrap/CLI/host integration and validated against actual detection/subject identity. It is never inferred from legacy capability state; absent identity yields conservative UNKNOWN and fail-closed dispatch.
11. Runtime capability snapshot contract remains `0.8.0`; no version bump unless an unavoidable versioned migration is proven — preference is no bump.
12. Model Lock hard constraint, no-broadcast/single-target semantics, M06/M07/M24 ownership boundaries and GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT are preserved by this design.
13. No paid model/provider calls, hidden retries, vendor API credentials or unbounded probes in any part of this Work Order or its later runtime increment.
14. M27–M31 enterprise constraints apply from this freeze.

## Source baseline at freeze time
Base main: `a0a778e5fa4a28750540246fa5894c91a92d0b2b`.
Critical source identities (verified at freeze time):
- `src/adapters/host-capability-consumer.ts`: blob `6e4035a5c6790ffe6272a4e93dd99c24908ff936`
- `src/adapters/host-capability-passive.ts`: blob `edd37b91bee623730f43bbdc6422084e6e63f7f9`
- `src/adapters/host-dispatch.ts`: blob `97bfebbc62570a5a245a7dd8512f37b57fe2e1b0`
- `src/adapters/host-adapter-types.ts`: blob `3117fe83edc5bc385829bdfa70426793a60363af`
- `src/adapters/host-adapter-detect.ts`: blob `43fd8de7c7f8d2bd2457ab484ecdc58977f72802`
- `src/kernel/host-capability-proof.ts`: blob `ff79a8f6280e8be0ae4563e9b6e62b9e216df76b`
- `src/kernel/host-capability-subject.ts`: blob `563f2de0b53f83940b29220504dbd1573b16813c`
- `src/kernel/host-capability-probe.ts`: blob `3ec3da0181e0eeb896124b3bfebb292412283f81`
- `src/kernel/host-capability-active-evidence.ts`: blob `99d8efe5b01498cef5720eb330176da8504c2d8c`
- `src/kernel/model-types.ts`: blob `df4ac2159c6df0cf1fe7c176ef14ed06bf39b435`
- `src/kernel/model-runtime.ts`: blob `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62`
- `src/kernel/model-requirements.ts`: blob `2a0b325061a949f303ae0c1a6910f5cbab5f37fb`
- `src/kernel/execution.ts`: blob `b6a4d8e598f8d24fe7f4399fa625ecba208fe485`
- `src/commands/dispatch.ts`: blob `ff1589ab79e6899458e7b5bcab3d28f328615bc0`
- `src/cli.ts`: blob `2c7bb11df07d8e85834fbfecdd30d1d3e2bb9504`
- `src/eval/execution.ts`: blob `e2d6c7e5c7d724a70d6f7ae7d400d33f39cc8c30`
- `src/eval/fault-injection-normative.ts`: blob `5541e8acad8412dc384e4d23cfb3afad29264f69`
- `schemas/host-capability-proof.schema.json`: blob `aa22c6b3aed3b94bb227234810e2df926c4695a7`
- `schemas/runtime-capability-snapshot.schema.json`: blob `1bc304136e52e7a872c93aef132d76b4027b8475`
- `tests/host-capability-consumer.test.ts`: blob `e8cb8a6e7281518ac079f867f2e6ff33b62a7843`
- `tests/host-capability-proof.test.ts`: blob `1114cfd55f80a4b952a304196b6ebc485a563248`
- `tests/host-capability-passive.test.ts`: blob `37857d6ce417d130734ebf079eece3851ca3577b`
- `docs/v2/modules/m03/M03-S06.2-CONSUMER-BOUNDARY.md`: blob `7427f102f679bc60b8234c2c156dfb20f5a7a56c`
- `docs/v2/modules/m03/M03-S05.4-ACTIVE-EVIDENCE-CONTRACT.md`: blob `5ecd708f7bd90a71e42e807eb7589ba3aed9ce80`
- `docs/v2/modules/m03/M03-PROBE-POLICY.json`: blob `410a3c4f666f9c3359d4925388ae70855d9a2567`
- `docs/v2/modules/m03/M03-CAPABILITY-VOCABULARY.json`: blob `040ef9dceebb6dd2fbaeba13f8a97f9cc9df1f41`

Before executor dispatch, verify these identities against the runtime branch. Any unexpected source movement is a controlled baseline delta, not permission to redesign.

## Scope lock
Freeze and package the M03 proven-capability resolution architecture (current, basis-bound stored/active PCCR resolution behind IF-001; bounded positive-proof acquisition seam; provenance semantics) plus explicit dispatch adapter-identity binding. This planning increment is documentation/governance only: no `src/`, `schemas/` or `tests/` changes, no runtime implementation, no edits to PR #77. Runtime implementation belongs to a later governed increment dispatched from `docs/v2/planning/UADS2-WO-026-DISPATCH-BINDING.md` after this freeze merges with exact-head gates and independent HEDS approval.

## Executor behavior
The later runtime executor implements and proves the frozen architecture. It does not redesign ownership, interfaces, proof-source strategy or source boundaries. If a frozen ownership/interface is materially incompatible with source reality, stop as `NEEDS_ARCHITECTURE` with evidence.

## Stop conditions
Stop and mark CORRECTION REQUIRED if an implementation can: enable a capability from legacy snapshots, adapter declarations or any non-PCCR source; map UNKNOWN to ALLOW; mark passive-declared TRUE as SUPPORTED; set provenance `proven` unconditionally or merely because an adapter exists; bypass basis/lease/currentness matching; infer dispatch adapter identity from legacy state; bump the runtime snapshot contract `0.8.0`; weaken `requireProvenRuntime`; introduce paid provider calls, hidden retries, vendor credentials, unbounded shell probes or project-local UADS state; leak secrets/host paths into proof/projection artifacts; or weaken Model Lock, no-broadcast or M06/M07/M24 ownership.
