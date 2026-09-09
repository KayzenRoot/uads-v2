# UADS V2 — Global Module System Contract Matrix

Status: FROZEN CANDIDATE — UADS2-WO-004 HEDS PENDING
Date: 2026-09-09

This document is system-level architecture. It freezes responsibility boundaries, not detailed technology choices.

Logical event families below are conceptual integration families. They do **not** automatically extend the currently versioned M30 runtime eventType enum. Runtime schema changes require the owning module's S02/ADR/versioning gate.

| Module | Owns | Primary input | Primary output | HARD predecessors for freeze | Explicit non-ownership | Logical event family |
| --- | --- | --- | --- | --- | --- | --- |
| M01 Sequential Agent Orchestrator | orchestration; queue/run state; worker eligibility | Work Order, capability/budget facts, queue state | ordered execution transitions + lifecycle events | M03, M07, M30 | host capability truth, model policy, review verdicts | `orchestrator.lifecycle` |
| M02 Background Worker Runtime | worker execution; worker receipt; background isolation | bounded worker envelope, capability proof, cancellation | worker result/receipt + lifecycle events | M01, M03 | orchestration policy, host capability truth | `worker.lifecycle` |
| M03 Host Capability Detector | host capability facts; capability snapshot provenance | host/runtime/adapters, probe results | versioned capability snapshot | none | routing decisions or adapter policy | `capability.host` |
| M04 Model Capability Registry | model/profile capability registry; profile provenance | host/model evidence, profile definitions | versioned model capability profiles | M03 | model selection or effort selection | `model.registry` |
| M05 Automatic Model Router 2.0 | model routing decision; routing rationale | task risk/complexity, M04 profiles, M07 budget, M25 policy | model selection plan | M04, M07, M25 | model capability truth, effort policy, budget ownership | `model.route` |
| M06 Effort Autopilot | reasoning/effort decision; effort escalation receipt | task risk, host effort capability, budget/policy | effort selection plan | M03, M07, M25 | model registry truth or quota accounting | `effort.route` |
| M07 Token & Quota Governor 2.0 | token/quota budget; reservation/release state; budget backpressure | Work Order budget, token/quota usage, retry/spawn requests | budget decision/reservation/backpressure | none | quality verdicts or provider capability truth | `budget.lifecycle` |
| M08 Review Pipeline 2.0 | HEDS runtime; review manifest/verdict; correction delta | Work Order, context/impact, gate plan, evidence, faults | review evidence bundle/verdict/trusted-merge readiness | M09, M10, M14, M19, M20, M21, M22, M24, M30 | Hive canonical governance, model routing, cost truth | `review.lifecycle/review.analysis` |
| M09 Smart Gate Selector | verification/gate plan; proof selection rationale | impact/risk/proof obligations, policy | selected verification plan | M14, M25 | test execution results or review verdicts | `gate.selection` |
| M10 Fault Resolution Engine 2.0 | fault diagnosis; reproducer/repair proof | failure record, logs/evidence, context | ranked hypotheses + verified repair evidence | M30 | durable failure memory truth or retry policy | `fault.lifecycle` |
| M11 Experience Engine | outcome observations; candidate experience | completed Work Order outcomes and M24/M30 telemetry | candidate experience observations | M24, M30 | canonical policy or autonomous activation | `experience.observed` |
| M12 Policy Memory | candidate policy ledger; policy provenance/expiry | verified candidate lessons/policies | versioned candidate policies | M11 | canonical Scope/ADR truth or self-promotion | `policy.candidate` |
| M13 Adaptive Routing Learner | learned routing recommendation; offline/champion-challenger evaluation | verified outcomes, policy memory, routing history | safe routing recommendation | M05, M06, M11, M12, M22 | safety floors or canonical policy | `learning.routing` |
| M14 Context Radius Optimizer | context radius decision; context expansion rationale | task/impact/repository context signals | context radius/expansion decision | none | canonical context truth or Hive durable memory | `context.radius` |
| M15 Cursor Adapter V2 | Cursor host adapter state; Cursor capability/receipt | UADS contracts + Cursor host capability | Cursor handoff/receipt | M01, M03, M23 | core orchestration or canonical model availability | `adapter.cursor` |
| M16 Codex Adapter V2 | Codex host adapter state; Codex capability/receipt | UADS contracts + Codex host capability | Codex handoff/receipt | M01, M03, M23 | core orchestration or canonical model availability | `adapter.codex` |
| M17 Project Resume Bootstrap | resume/bootstrap manifest; stale-resume detection | Git state, checkpoint, sidecar continuity | resume packet/continuity delta | none | canonical project truth beyond Git/sidecar reconciliation | `resume.lifecycle` |
| M18 UADS-Hive Integration Bridge | HiveTaskEnvelope/UADSQualityBundle bridge; Hive connectivity state | Hive/UADS envelopes, identity/version/capability | validated cross-system envelope/bundle | M23, M29, M30 | Hive canonical truth or UADS core execution authority | `bridge.hive` |
| M19 Evidence Cache 2.0 | evidence reuse decision; validity/invalidation receipt | proof artifact + validity basis/fingerprints | reuse/reject receipt | none | proof generation or foreign proof trust | `evidence.cache` |
| M20 Failure Memory 2.0 | verified failure signature/repair memory; recurrence signal | verified diagnosis/repair evidence | verified failure-memory entry/recurrence signal | M10 | unverified guesses or active diagnosis | `failure.memory` |
| M21 Retry Controller | retry allow/reject decision; retry novelty/budget | failure/retry state, novelty evidence, budget | retry decision + bounded attempt state | M07, M10, M20 | fault diagnosis or model selection | `retry.lifecycle` |
| M22 Evidence-Driven Escalation | escalation decision; reason provenance | uncertainty/evidence + available escalation levers | escalation/de-escalation decision | M05, M06, M07, M09, M14, M21 | underlying model/effort/context/gate implementations | `escalation.lifecycle` |
| M23 Capability Negotiation Layer | capability negotiation transcript; feature downgrade result | peer capability sets and contract versions | negotiated capability contract | M03 | capability facts or peer implementation | `capability.negotiation` |
| M24 Observability & Cost Ledger | Work Order cost/telemetry ledger; TTTM/QPT attribution | M30 events + Work Order identity/cost inputs | attributed Work Order telemetry/cost metrics | M30 | production telemetry transport/health/dashboard | `cost.ledger` |
| M25 Configuration & Policy Profiles | configuration/policy profile; precedence/provenance | global/project/operator policy layers | effective operational policy profile | none | canonical project truth or destructive privilege | `policy.profile` |
| M26 Safe Learning / Rollback | learning rollout/canary/rollback state; kill switch | candidate learned policy + rollout evidence | shadow/canary/rollback decision | M12, M13, M31 | canonical policy truth or general release rollback | `learning.rollout` |
| M27 Capacity & Load Engineering | capacity envelope; load/backpressure proof | runtime telemetry, workload profile, resource limits | capacity plan + load evidence | M30 | functional scheduling semantics | `capacity.signal` |
| M28 Resilience & Recovery Engineering | resilience/recovery policy; FMEA/RTO/RPO proof | failure/recovery telemetry and state transitions | resilience/recovery proof | M30 | fault diagnosis semantics or retry policy | `resilience.lifecycle` |
| M29 Operational Security & Supply Chain | security operating controls; threat/supply-chain/incident proof | architecture/trust boundaries, dependencies, secrets, runtime controls | security readiness evidence + incident controls | none | functional module behavior | `security.lifecycle` |
| M30 Production Observability & Real-Time Operations | operational event spine; health/alerts/dashboard | operational events and existing objective state | event stream, health projection, alerts/dashboard | none | Work Order cost-ledger semantics or review semantics | `operational.*` |
| M31 Release Engineering & Safe Operations | release/migration/rollback state; post-deploy verification | release candidate, migration/compatibility/health evidence | release readiness/rollback/post-deploy evidence | M29, M30 | learned-policy rollback semantics | `release.lifecycle` |

## Data/state authority rules

1. A datum has one primary owner. Consumers may cache/projection-copy it only with provenance and invalidation.
2. M03 owns host capability truth; adapters and routers consume it.
3. M04 owns model/profile capability truth; M05 owns the routing decision.
4. M07 owns resource-budget state; M24 records attribution but does not set budget policy.
5. M08 owns UADS review-runtime artifacts/verdict readiness; Hive remains canonical program-governance authority when connected.
6. M24 owns Work Order cost/metric attribution; M30 owns event transport, operational health and dashboard projection.
7. M10 owns active diagnosis; M20 owns verified durable failure/repair memory; M21 owns retry permission.
8. M11/M12/M13/M26 cannot mutate canonical project truth or bypass M25/M29/M31 constraints.
9. M18 owns translation/bridge state, never Hive truth or UADS core execution authority.
10. M27-M31 own proof/gate disciplines, not functional business behavior of modules they govern.

## Contract-change rule

Changing a frozen owner/non-owner boundary, adding a new HARD predecessor, or creating a cycle requires:
- impact analysis;
- ADR/checkpoint delta;
- exact-head HEDS;
- dependency graph regeneration.
