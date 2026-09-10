# M30 S04 — Proof & Benchmark Matrix

Status: CANDIDATE
Work Order: UADS2-WO-019
Issue: #63
Risk: HIGH with CRITICAL economic-safety subset

## 1. Purpose
Turn frozen M30 S00-S03 requirements into reproducible proof obligations, benchmark profiles and release-blocking acceptance rules. This document specifies what must be proven; it does not claim that runtime implementation has already passed.

## 2. Proof result classes
Each proof produces exactly one of:
- PASS — evidence satisfies the declared release floor.
- FAIL — evidence violates the declared floor.
- BLOCKED — required environment/capability unavailable; never treated as PASS.
- NOT_APPLICABLE — only when the governed feature is explicitly disabled/not shipped in the evaluated profile.

CRITICAL economic-safety proofs may not use generic JUSTIFIED_EXCEPTION to ship a failing production path.

## 3. Evidence classes
Every measurement is tagged:
- LOCAL_MEASURED
- PROVIDER_REPORTED
- SIMULATED
- DERIVED
- UNKNOWN

UNKNOWN cannot become zero, healthy, cheap, current or PASS by assumption.

## 4. Economic safety proof family ES

### ES-001 Finite Economic Safety Envelope
For every model-bearing dispatch, prove a finite pre-dispatch ESE exists with hard token/cost/call/retry/delegation/context/lifetime ceilings. Missing hard limits MUST deny dispatch in production profile.
Release class: CRITICAL / BLOCKING.

### ES-002 Hierarchical budget conservation
Concurrent parent/child/descendant reservations must conserve budget. Child creation cannot mint capacity. Prove active reservations + consumed + remaining never exceed original parent hard budget beyond explicit accounting tolerance.
Release class: CRITICAL / BLOCKING.

### ES-003 Delegation depth ceiling
Attempt recursive agent spawning past configured max depth. Boundary request must be denied before model-bearing child dispatch.
Release class: CRITICAL / BLOCKING.

### ES-004 Descendant ceiling
Attempt breadth/depth combinations that exceed max total descendants. New descendant must be denied without resetting counters through alternate branches.
Release class: CRITICAL / BLOCKING.

### ES-005 Concurrency/fan-out ceiling
Flood spawn requests above concurrent-model-agent limit. Prove semaphore/queue bounds, no optimistic overbooking, no duplicate reservation and no budget breach.
Release class: CRITICAL / BLOCKING.

### ES-006 Semantic recursive delegation breaker
Repeated equivalent delegation fingerprints must trigger a bounded circuit breaker before the hard ESE can be exhausted.
Release class: CRITICAL / BLOCKING.

### ES-007 Single retry owner
Inject retryable failures at provider, adapter, orchestrator and agent boundaries. Exactly one governed layer may own retry scheduling; total calls must remain within one finite retry budget.
Release class: CRITICAL / BLOCKING.

### ES-008 Non-retryable failure classification
Deterministic, policy, malformed-context, budget, unsupported capability and unsafe UNKNOWN outcome failures must not auto-retry.
Release class: CRITICAL / BLOCKING.

### ES-009 Progress-free loop breaker
Create repeating model/tool cycles with no measurable progress. Prove termination within configured call/token/time bounds and emit `TOKEN_SPEND_GUARD_TRIPPED`.
Release class: CRITICAL / BLOCKING.

### ES-010 Duplicate expensive-call protection
Inject duplicate dispatch requests before/after uncertain receipts. Prove fingerprint/idempotency/reconciliation prevents blind duplicate paid calls where semantics allow deduplication.
Release class: CRITICAL / BLOCKING.

### ES-011 Context growth ceiling
Attempt recursive transcript/tool/evidence reinjection. Prove token/byte growth stays bounded, duplicate content is not reinjected blindly, and oversized context fails/degrades before dispatch.
Release class: CRITICAL / BLOCKING.

### ES-012 RAG retrieval ceiling
Attempt recursive/expansive retrieval. Prove top-K, source count, per-source size and total token/byte limits, plus dedup/provenance preservation.
Release class: CRITICAL / BLOCKING.

### ES-013 Fallback cost guard
Make selected model unavailable. Prove fallback cannot silently move to a materially more expensive profile outside operator policy + ESE budget.
Release class: CRITICAL / BLOCKING.

### ES-014 Ensemble/broadcast guard
Attempt accidental multi-model fan-out. Default path MUST invoke one model only. Ensemble requires explicit policy flag and separate finite ESE allocation.
Release class: CRITICAL / BLOCKING.

### ES-015 Conservative UNKNOWN accounting
Remove trustworthy usage response. Prove reservation remains unavailable/conservatively accounted until reconciliation/explicit bounded expiry; UNKNOWN usage cannot create new spend capacity.
Release class: CRITICAL / BLOCKING.

### ES-016 Restart/recovery accounting persistence
Crash/restart with consumed and outstanding reservations. Prove counters/reservations do not reset to zero and outstanding work is reconciled before new equivalent spend.
Release class: CRITICAL / BLOCKING.

### ES-017 Burn-rate/velocity breaker
Generate anomalous token, cost, model-call, retry and agent-spawn velocities. Prove deterministic state transitions NORMAL -> WARN -> THROTTLED -> HARD_STOP -> RECONCILING according to versioned thresholds.
Release class: CRITICAL / BLOCKING.

### ES-018 Local HARD_STOP
Trip HARD_STOP with provider unavailable and without making another LLM call. New model-bearing work in affected scope MUST be denied locally/deterministically.
Release class: CRITICAL / BLOCKING.

### ES-019 Scoped kill switches
Exercise agent, execution, WO, project/workspace and provider/model-profile kill switches where supported. Prove authorization, bounded blast radius, audit receipt and no inference requirement for stop action.
Release class: CRITICAL / BLOCKING.

### ES-020 Dashboard budget truth
With fresh, stale, gapped and unknown accounting, prove cockpit labels remaining/reserved/consumed budget truthfully and never displays UNKNOWN as CURRENT/zero.
Release class: CRITICAL / BLOCKING.

## 5. Routing & effort proof family RT

### RT-001 Model Lock
Select one proven model/profile in cockpit and attempt routing to another. Dispatch MUST be blocked or visibly require governed policy change; host mismatch must not be hidden.

### RT-002 Cheapest Qualified
Given multiple proven compatible profiles and objective price metadata, choose the least-cost admissible profile after quality/capability floors. If price is UNKNOWN, do not claim cheapest.

### RT-003 Quality-Floor Autoroute
Prove selection never drops below declared risk/capability/quality floor solely to save tokens/cost.

### RT-004 Effort Autopilot trivial task
Mechanical/low-risk prompts must resolve to the lowest safe supported effort or host minimum. HIGH/XHIGH/MAX requires explicit reason receipt.

### RT-005 Effort escalation
Increase ambiguity/risk/proof burden and prove deterministic evidence-backed escalation. Retry alone must not imply escalation.

### RT-006 Effort de-escalation
After uncertainty/risk falls, prove effort can de-escalate with hysteresis and without oscillation.

### RT-007 Unsupported effort truth
Host/profile without requested effort support must report HOST_FIXED/UNSUPPORTED/MISMATCH truthfully; UADS may not pretend another effort was applied.

### RT-008 No MAX default
Across representative task corpus, MAX must never be default. Any MAX use requires exceptional-use reason, explicit budget admission and measurable audit rate.

### RT-009 Latest-model resolution
A 'latest Grok' or successor selector must require proven host availability/capabilities/policy compatibility; lexical/version-number ordering alone cannot authorize a new model.

### RT-010 Routing enforcement state
Prove cockpit reports ENFORCED | VERIFIED_MATCH | HOST_FIXED | MISMATCH | UNKNOWN from objective host evidence.

### RT-011 No silent expensive fallback
Routing failure cannot silently select a materially more expensive model/effort outside active policy/ESE.

### RT-012 Cost-quality comparison
Compare adaptive routing/effort against fixed-model + fixed-high-effort baseline using identical task corpus, proof obligations and pass criteria. Report tokens/cost/latency and quality outcome separately; no single blended score may hide regressions.

## 6. M30 truth/control proof family OP

### OP-001 OTCL freshness transitions
Prove CURRENT/STALE/DEGRADED/UNAVAILABLE transitions from timestamps, leases and integrity state.

### OP-002 TCL gap visibility
Known/unknown gaps and replay must remain explicit; silence never implies contiguous/healthy.

### OP-003 Event integrity
Corrupt/forged hash or schema mismatch must reject/degrade without fabricating data.

### OP-004 Governed command authorization
Spoofed owner, actor or capability combinations are rejected fail-closed.

### OP-005 Command idempotency/replay
Duplicate/replayed command must not multiply side effects.

### OP-006 UNKNOWN_OUTCOME reconciliation
Disconnect after potential execution must preserve UNKNOWN_OUTCOME until authoritative owner evidence resolves it.

### OP-007 Blast-radius enforcement
R3/R4 action whose declared target exceeds allowed blast radius must be rejected before mutation.

### OP-008 Partial source failure
One failed telemetry/source adapter must degrade only dependent projections/actions while preserving bounded useful independent views.

### OP-009 Privacy/sanitization
Secrets, raw prompts and sensitive arbitrary paths must not enter bounded correlation/labels by default.

### OP-010 COG/AAE safety
Inference remains INFERRED and evidence-linked; attention ranking cannot suppress unresolved HIGH/CRITICAL/UNKNOWN states from audit/drill-down.

## 7. Resource/performance proof family PF

### PF-001 AOBC degradation ladder
Under load, optional P3 then P2 detail is reduced before P1/P0 truth/health/audit evidence. Shedding itself emits visible evidence.

### PF-002 Cardinality firewall
Adversarial attribute values cannot produce unbounded series/keys/labels.

### PF-003 SSE fan-out/backpressure
Slow/reconnecting clients cannot cause unbounded memory/work growth or false continuity.

### PF-004 Disk pressure
Full/read-only/corrupt storage yields PRESSURED/SHEDDING_OPTIONAL/DEGRADED/WRITE_UNAVAILABLE truth without corrupting domain workload.

### PF-005 Event ingest benchmark
Measure sustained ingest throughput, p50/p95/p99 latency, saturation and error/drop behavior under bounded profiles.

### PF-006 Snapshot/query benchmark
Measure bounded snapshot/query p50/p95/p99, dataset size and source count. Historical ~1.66s p50/~2.17s p95 is a baseline observation only, not an accepted production SLO.

### PF-007 Telemetry overhead regression
Benchmark Issue #39/M03 B6 path using paired telemetry-off vs telemetry-on workloads. Preserve CPU/time/resource identity. The old >300% observations are debt baselines, not acceptable targets.

### PF-008 Retention pressure
Prove retention caps, deletion/compaction behavior and bounded work under pressure without deleting mandatory audit/truth evidence outside retention policy.

## 8. Benchmark environment profiles
Every result records at minimum:
- OS/version/architecture
- CPU model/logical cores
- RAM
- GPU/VRAM when relevant
- storage medium/filesystem/free space
- Node/runtime version
- UADS commit SHA
- dependency-lock digest
- power/performance mode where obtainable
- warm/cold state
- test profile/version
- sample count/warmup count
- concurrent load
- source/dataset size
- model/provider/profile and pricing evidence when model-bearing calls are exercised.

Profiles:
- BENV-LOCAL-DEV: developer host observation; never alone defines production SLO.
- BENV-CI-LINUX: repeatability/correctness and bounded synthetic benchmark.
- BENV-CI-WINDOWS: cross-platform repeatability/correctness and bounded synthetic benchmark.
- BENV-PROD-REP: future representative production hardware/load; required before claiming production SLO/capacity.

## 9. Statistical method
For latency/throughput tests where meaningful:
- documented warmup before sampling;
- at least 30 measured samples for micro/short tests unless scenario duration is the bounded unit;
- report p50/p95/p99 and max, plus failures/timeouts;
- report throughput with concurrency and saturation point;
- retain raw bounded result artifact or deterministic digest;
- outlier removal is forbidden unless a predeclared objective rule is reported both before and after filtering.

## 10. Threshold classes
Each numeric threshold MUST declare one class:
- RELEASE_FLOOR — violation blocks release.
- TARGET — desired value; miss creates debt but does not automatically block unless linked to a floor.
- EXPERIMENT_GATE — required to promote an experimental mechanism.
- OBSERVATION — measurement only, never a pass criterion.

No benchmark may silently turn a historical observation into a release floor/SLO.

## 11. Exception policy
- CRITICAL economic-safety release floors: no generic justified exception for production-enabled path.
- Security/integrity release floors: exception requires explicit risk acceptance by owning governance authority and feature containment/disablement; M30 alone cannot waive domain-owner policy.
- Performance targets: measurable debt may be accepted only if correctness/safety floors still pass and degradation is visible/bounded.
- BLOCKED evidence remains BLOCKED, not PASS.

## 12. Freeze gate
S04 may freeze only when every S03 HIGH/CRITICAL path maps to stable proof IDs, all CRITICAL economic-safety requirements have reproducible scenarios and release-blocking rules, benchmark methodology distinguishes observation from target/floor, cross-module ownership is explicit, and exact-head CI/CodeQL/Dependency Review/Cross-Platform/HEDS pass.