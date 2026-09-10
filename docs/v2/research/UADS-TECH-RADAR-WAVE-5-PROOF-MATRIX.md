# UADS Technology Acquisition Radar — Wave 5 Proof Matrix

Status: CANDIDATE / PRE-IMPLEMENTATION

## Resource awareness — RES
- RES-001 CPU evidence is freshness-bound.
- RES-002 RAM pressure cannot silently map UNKNOWN to healthy.
- RES-003 GPU absent/unsupported renders UNAVAILABLE, not 0%.
- RES-004 VRAM evidence is tied to proved GPU identity.
- RES-005 storage pressure is visible before destructive exhaustion where host signals permit.
- RES-006 provider quota/rate-limit evidence participates in scheduling.
- RES-007 Node event-loop saturation is distinguishable from host CPU utilization.
- RES-008 stale RAE cannot raise concurrency.
- RES-009 resource telemetry collection overhead is bounded.
- RES-010 host-specific resource controls require M03 proof.

## Adaptive scheduling — SCH
- SCH-001 only dependency-ready DAG nodes dispatch.
- SCH-002 specialist qualification is preserved under pressure.
- SCH-003 model/effort policy remains enforced.
- SCH-004 ESE conservation remains exact while concurrency changes.
- SCH-005 concurrency increases only within configured ceiling.
- SCH-006 latency/queue pressure causes bounded backoff.
- SCH-007 error/timeout spike causes bounded backoff.
- SCH-008 provider quota pressure causes bounded backoff.
- SCH-009 recovery increases capacity gradually, not instantaneously to max.
- SCH-010 scheduler decisions are auditable with reason codes.
- SCH-011 deterministic identical evidence/policy yields compatible decisions or explicit adaptive-state reason.
- SCH-012 scheduler overhead is benchmarked against baseline.

## Queue/backpressure — QUE
- QUE-001 every queue has finite capacity.
- QUE-002 queue overflow has explicit behavior.
- QUE-003 priority inversion scenario is detected/mitigated.
- QUE-004 low-priority TURBO cannot starve protected work.
- QUE-005 cancellation removes or safely drains queued work.
- QUE-006 expired work is not executed as current work.
- QUE-007 retry ownership cannot create duplicate queue storms.
- QUE-008 upstream admission slows when downstream is pressured.
- QUE-009 optional work sheds before protected critical work.
- QUE-010 backpressure state is visible in M30.
- QUE-011 restart preserves durable queue semantics where declared durable.
- QUE-012 non-durable loss is explicit after restart.

## Critical path / parallelism — PAR
- PAR-001 more agents are not added when critical path cannot improve.
- PAR-002 independent ready nodes can execute concurrently within fences.
- PAR-003 shared-write conflict blocks unsafe parallelism.
- PAR-004 estimated speedup includes integration overhead.
- PAR-005 observed speedup is compared with estimate.
- PAR-006 negative speedup triggers future plan downgrade evidence.
- PAR-007 OFF mode creates no optional specialist fan-out.
- PAR-008 ECO/BALANCED/TURBO remain ceilings bounded by safe concurrency.
- PAR-009 CUSTOM limits cannot bypass global/project/WO ESE.
- PAR-010 mid-run mode reduction safely drains/cancels according to side-effect class.

## Workload affinity — AFF
- AFF-001 CPU-bound work does not default to I/O-only scheduling assumptions.
- AFF-002 I/O-bound work does not spawn worker threads without measured benefit.
- AFF-003 MODEL_BOUND work accounts for provider concurrency/quota.
- AFF-004 GPU_BOUND work requires proved compatible GPU capability.
- AFF-005 MIXED work declares dominant bottleneck confidence.
- AFF-006 UNKNOWN affinity cannot claim optimization benefit.
- AFF-007 affinity drift can be corrected from measured execution evidence.

## Efficiency frontier — EFF
- EFF-001 single-agent baseline records time/tokens/cost/quality/rework.
- EFF-002 parallel plan records same dimensions.
- EFF-003 quality floor is equal or better before speedup is accepted.
- EFF-004 time reduction does not hide increased rework time.
- EFF-005 cost estimates distinguish measured/provider-reported/estimated/unknown.
- EFF-006 ECO prefers lower-cost qualified frontier points.
- EFF-007 TURBO may choose higher-cost frontier points only within ESE and policy.
- EFF-008 unknown estimates are displayed UNKNOWN, never fabricated.
- EFF-009 frontier recommendation includes confidence.
- EFF-010 observed results feed future estimates without becoming Hive semantic memory.

## Speculation/cache — SPC
- SPC-001 paid model speculation is disabled by default.
- SPC-002 side-effecting work cannot speculative-duplicate by default.
- SPC-003 pure/read-only speculative duplicate has finite budget.
- SPC-004 winner cancellation is safe and evidenced.
- SPC-005 speculative benefit is benchmarked at p50/p95/p99.
- SPC-006 warm specialist cache invalidates on role digest drift.
- SPC-007 cache invalidates on tool schema digest drift.
- SPC-008 cache invalidates on policy/model/runtime incompatibility.
- SPC-009 cache content contains no forbidden secret/raw sensitive payload.
- SPC-010 cache miss degrades to normal execution, not failure.

## Saturation/fairness — SAT
- SAT-001 high raw utilization with healthy latency is not automatically classified overloaded.
- SAT-002 moderate utilization with PSI/latency stalls can be classified pressured.
- SAT-003 saturation state has source/evidence/freshness.
- SAT-004 fairness allocation is deterministic under same priority/evidence inputs.
- SAT-005 project-level quota prevents one project from monopolizing provider capacity.
- SAT-006 emergency HIGH/CRITICAL work can preempt only under explicit policy.
- SAT-007 preemption never violates irreversible side-effect safety.
- SAT-008 fairness and throttling decisions appear in AFR/M30 evidence.

## Benchmark suites

### BEN-W5-001 — Single vs specialist-parallel
Run representative coding WOs in single-agent and bounded specialist-parallel modes. Measure wall-clock, tokens, provider cost, test quality, regressions, integration/rework and reviewer findings.

### BEN-W5-002 — Concurrency sweep
Sweep concurrency 1,2,4,8,... only within host/provider safety limits and identify the knee where throughput stops improving or tail latency/cost/rework worsens.

### BEN-W5-003 — Pressure response
Inject CPU/memory/I/O/provider pressure in controlled environments and verify PCG backoff, queue bounds and recovery.

### BEN-W5-004 — Cockpit control
Change OFF/ECO/BALANCED/TURBO/CUSTOM during execution and verify authoritative command routing, safe drain, no ESE reset and truthful state.

### BEN-W5-005 — GPU optionality
On compatible NVIDIA host, measure telemetry overhead and GPU-bound classification. On unsupported host, verify clean UNAVAILABLE behavior and no runtime dependency failure.

## Release blockers

- RB-W5-001 any unbounded execution queue.
- RB-W5-002 stale/unknown resource evidence increases concurrency.
- RB-W5-003 parallel mode bypasses ESE or policy.
- RB-W5-004 TURBO treated as mandatory max concurrency rather than ceiling.
- RB-W5-005 accepted speedup with degraded frozen quality floor.
- RB-W5-006 silent starvation of protected work.
- RB-W5-007 GPU absence represented as healthy/zero usage.
- RB-W5-008 paid speculative model execution enabled by default.
- RB-W5-009 cache reuse across incompatible security/tool/policy digest.
- RB-W5-010 backpressure/load shedding hidden from operational truth.

## Exit criterion
All applicable proof IDs for an implementation slice PASS on the exact candidate head. BLOCKED remains visible; no benchmark target is converted into a production SLO without representative evidence.