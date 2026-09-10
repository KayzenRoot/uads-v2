# UADS V2 — Parallel Specialist Execution Proof Matrix

Status: CANDIDATE proof design
Scope: pre-Wave 5 architecture verification.

## Decomposition and DAG
- PSE-001 — governed prompt compiles to a schema-valid PPG before worker dispatch.
- PSE-002 — dependency edge omission is detected in seeded fixtures.
- PSE-003 — cyclic task graph is rejected or explicitly replanned; never executed as an acyclic graph.
- PSE-004 — tiny adjacent tasks are merged when orchestration overhead exceeds expected gain.
- PSE-005 — shared irreversible transaction is not split into independent branches.
- PSE-006 — unknown dependency yields conservative serialization/discovery, not guessed independence.
- PSE-007 — every node has objective, acceptance criteria, evidence contract and integration boundary.
- PSE-008 — decomposition is reproducible when prompt/policy/context digest are unchanged.

## Specialist registry and routing
- PSE-009 — every dispatched worker maps to a current SAR specialty record.
- PSE-010 — expired/stale competency proof cannot authorize specialist selection.
- PSE-011 — agent persona/name alone provides zero competency authority.
- PSE-012 — missing required tool/capability blocks incompatible specialist.
- PSE-013 — security-critical task cannot route below required assurance level.
- PSE-014 — identical routing inputs/policy produce deterministic SARM outcome unless adaptive mode is explicitly declared.
- PSE-015 — cheaper qualified specialist/model is preferred when quality floor is equivalent.
- PSE-016 — routing rationale is reconstructable from evidence.

## Per-task model and effort
- PSE-017 — every model-bearing node has requested model/profile and requested effort state.
- PSE-018 — requested vs applied model/effort are recorded separately.
- PSE-019 — child effort cannot exceed parent/task ceiling without evidence-driven escalation authorization.
- PSE-020 — retry does not automatically raise effort.
- PSE-021 — MAX is never routine/default.
- PSE-022 — host lacking override support reports HOST_FIXED/MISMATCH/UNKNOWN.
- PSE-023 — model lock dispatches zero paid calls to an unapproved model.
- PSE-024 — effort escalation consumes finite remaining ESE capacity.

## Parallelism Worthiness Gate
- PSE-025 — independent disjoint tasks can be approved PARALLEL_BOUNDED.
- PSE-026 — hard shared write-set conflict is serialized.
- PSE-027 — uncertain shared state produces BLOCKED_UNKNOWN_DEPENDENCY or conservative serialization.
- PSE-028 — parallel plan cannot exceed max concurrent model-bearing agents.
- PSE-029 — parallel plan cannot exceed parent economic reservation.
- PSE-030 — predicted coordination/integration cost is included in the worthiness decision.
- PSE-031 — speculative workers require explicit budget reservation.
- PSE-032 — a seeded task where parallelism is slower is correctly routed sequential/hybrid after learned benchmark policy is enabled.

## Concurrency fence and effects
- PSE-033 — workers with disjoint write sets can commit independently where policy allows.
- PSE-034 — same schema migration ownership serializes.
- PSE-035 — same irreversible effect serializes.
- PSE-036 — only one retry owner exists for a failed effectful node.
- PSE-037 — SIR NON_IDEMPOTENT_EFFECT cannot blind retry through worker reassignment.
- PSE-038 — worker cancellation during effect leaves explicit UNKNOWN_OUTCOME until reconciliation.
- PSE-039 — stale worker cannot write after lease/fence loss.
- PSE-040 — duplicate worker completion cannot duplicate authoritative mutation.

## Specialist context
- PSE-041 — worker receives only declared context refs plus governing contract.
- PSE-042 — unrelated secret/prompt/context is absent from seeded specialist package.
- PSE-043 — dependency output provenance is preserved when passed downstream.
- PSE-044 — untrusted retrieved/tool data cannot promote itself to policy/authority in a specialist context.
- PSE-045 — context-size budget is finite per worker.

## Integration referee
- PSE-046 — MIR detects overlapping incompatible edits.
- PSE-047 — interface/schema mismatch between parallel outputs blocks synthesis.
- PSE-048 — semantic conflict triggers replan/fresh review rather than arbitrary last-writer-wins.
- PSE-049 — combined result retains contribution provenance by task/worker.
- PSE-050 — integration tests run after synthesis before HEDS.
- PSE-051 — worker self-approval cannot satisfy final assurance.

## Critical path scheduling
- PSE-052 — scheduler respects all DAG dependencies.
- PSE-053 — scheduler respects worker/model/provider concurrency caps.
- PSE-054 — scheduler preserves capacity for integration/review stages.
- PSE-055 — high fan-out blocker can be prioritized when it shortens predicted critical path.
- PSE-056 — priority never bypasses security/economic fences.

## Adaptive escalation and replanning
- PSE-057 — transient retry-safe failure may retry within owner/budget bounds.
- PSE-058 — deterministic defect is replanned rather than blindly retried.
- PSE-059 — underpowered worker may escalate effort only within policy/evidence limits.
- PSE-060 — stronger model escalation records why cheaper qualified candidates became insufficient.
- PSE-061 — replan round count is finite.
- PSE-062 — unresolved terminal state becomes BLOCKED, not infinite agent spawn.
- PSE-063 — replan cannot resurrect exhausted economic capacity.

## Economic conservation
- PSE-064 — sum child reservations never exceeds parent remaining reservation.
- PSE-065 — parallelism creates zero new economic capacity.
- PSE-066 — HARD_STOP yields zero new model-bearing dispatch.
- PSE-067 — unused reservation returns exactly once.
- PSE-068 — spent capacity never returns on worker restart/retry.
- PSE-069 — multi-model broadcast is zero unless explicitly declared/authorized/budgeted.
- PSE-070 — integration and review reserve cannot be consumed by worker fan-out.

## Wall-clock / performance benchmark
- PSE-071 — benchmark records single-agent wall time, parallel wall time and speedup.
- PSE-072 — benchmark records total token/cost amplification.
- PSE-073 — benchmark records integration/rework overhead.
- PSE-074 — benchmark records critical-path efficiency.
- PSE-075 — benchmark records defect/regression delta vs single-agent baseline.
- PSE-076 — no global speedup claim is made from one machine/task family.
- PSE-077 — representative task suites include low-coupling, medium-coupling and high-coupling coding work.
- PSE-078 — production default parallelism threshold is not frozen before evidence.

## M30 / audit truth
- PSE-079 — cockpit renders actual DAG state, never phantom worker/progress.
- PSE-080 — requested/applied model and effort are visible per worker when evidence exists.
- PSE-081 — missing usage/cost is UNKNOWN, not zero.
- PSE-082 — predicted and actual speedup are separately labeled.
- PSE-083 — predicted and actual token/cost amplification are separately labeled.
- PSE-084 — stale worker telemetry cannot render CURRENT.
- PSE-085 — routing/replan/escalation events correlate to AFR/HEP and WO identity.

## Cross-platform / host capability
- PSE-086 — unsupported Codex subagent control degrades truthfully without fabricated enforcement.
- PSE-087 — unsupported Cursor model/effort override degrades truthfully.
- PSE-088 — Windows and Linux host capability states are independently proven where relevant.
- PSE-089 — host concurrency cap is evidence-backed and bounded.

## Release floors
The following are release-blocking for an enabled production path:
- PSE-RF-001 — worker spawn without finite ESE.
- PSE-RF-002 — child privilege amplification.
- PSE-RF-003 — unbounded parallelism/descendants.
- PSE-RF-004 — blind retry of NON_IDEMPOTENT_EFFECT.
- PSE-RF-005 — silent model/effort mismatch represented as enforced.
- PSE-RF-006 — HARD_STOP still permits new model dispatch.
- PSE-RF-007 — workers can exhaust protected integration/review reserve.
- PSE-RF-008 — hard write-set conflict executes concurrently without explicit proven strategy.
- PSE-RF-009 — final synthesis can skip independent verification required by risk policy.
- PSE-RF-010 — missing telemetry/cost renders fabricated CURRENT/zero.

## Initial benchmark hypotheses, not production SLOs
- For suitably parallel low-coupling tasks, target material wall-clock reduction versus the same quality floor on a single-agent baseline.
- Do not require N-way speedup from N agents; orchestration overhead and critical-path limits make linear scaling unrealistic.
- BALANCED mode should minimize `wall_time + normalized_cost + defect_penalty` under hard safety/quality constraints.
- A parallel plan that saves little time but materially multiplies cost should normally lose to sequential/hybrid routing.

## Exit requirement for future implementation
No production promotion until exact-head tests/benchmarks cover the applicable PSE proof IDs, M27-M31 implications are resolved, economic release floors pass, and HEDS approves the implementation slice.
