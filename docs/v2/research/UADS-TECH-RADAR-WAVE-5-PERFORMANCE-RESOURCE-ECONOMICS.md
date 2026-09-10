# UADS Technology Acquisition Radar — Wave 5

Status: CANDIDATE / DISCOVERY
Scope: UADS V2 only
Theme: performance engineering, adaptive scheduling, resource governance, backpressure, queue engineering and economic efficiency at scale.

## Mission

Make UADS faster without equating speed with uncontrolled parallelism. Scheduling MUST jointly optimize wall-clock time, quality floor, economic budget, host pressure, provider quota and conflict risk.

## Market signals adapted

- Linux PSI demonstrates that CPU/memory/I/O contention should be measured as productive-time loss, not inferred only from raw utilization. UADS should ADAPT pressure-aware scheduling semantics where the host exposes trustworthy pressure evidence.
- cgroup v2 demonstrates enforceable CPU/I/O/resource boundaries on supported Linux hosts. UADS should EXPERIMENT with host-specific enforcement only behind M03 capability proof; it is not a portable default.
- NVIDIA NVML exposes GPU compute/memory utilization and hardware state. UADS should ADAPT a GPU telemetry boundary when M03 proves an NVIDIA-capable host; absence MUST remain UNAVAILABLE rather than zero.
- Node worker_threads are useful for CPU-intensive JavaScript, while asynchronous I/O is generally preferable for I/O-bound work. UADS should classify work before choosing a local execution primitive.
- Adaptive concurrency-control designs such as Gradient/Vegas demonstrate that latency/queue signals can dynamically reduce concurrency before saturation. UADS should ADAPT the principle, not import an external Java runtime dependency.

## UADS-native candidate technologies

### 1. RAE — Resource Awareness Envelope
A proof-backed snapshot/lease describing resources relevant to one scheduling decision:
- CPU capacity/utilization/pressure when available;
- RAM available/pressure;
- GPU identity, utilization and VRAM when supported;
- storage capacity/I/O pressure;
- network/provider quota signals;
- Node event-loop utilization where applicable;
- freshness/evidence level and UNKNOWN/UNAVAILABLE semantics.

RAE is evidence, not a promise of capacity.

### 2. AQS — Adaptive Qualified Scheduler
Schedules ready DAG nodes using:
- dependency readiness;
- specialist qualification;
- model/effort admissibility;
- RAE resource pressure;
- ESE remaining budget;
- provider quota/rate limits;
- conflict/fencing state;
- deadline/priority;
- estimated critical-path gain.

AQS MUST NOT create new economic capacity.

### 3. PCG — Pressure-Conscious Concurrency Governor
Continuously computes a bounded concurrency ceiling. It can increase concurrency only after healthy evidence and backs off on latency, queue, resource pressure, quota or error signals.

States:
`CONSERVATIVE -> PROBING -> HEALTHY -> PRESSURED -> SHEDDING -> RECOVERING`.

The user-selected cockpit mode (OFF/ECO/BALANCED/TURBO/CUSTOM) is a maximum policy envelope, never an instruction to saturate that maximum.

### 4. BQF — Bounded Queue Fabric
Every queue declares:
- capacity;
- priority policy;
- admission rule;
- deadline/TTL;
- fairness class;
- retry owner;
- cancellation semantics;
- overflow behavior;
- durable/non-durable class;
- observability contract.

Unbounded queues are REJECT DEFAULT.

### 5. BPC — Backpressure Propagation Contract
Pressure MUST propagate upstream instead of producing hidden queues. Valid reactions include delay admission, reduce parallelism, shed optional work, degrade observability detail, pause restartable work, or reject new work with explicit reason.

### 6. WAF — Workload Affinity Fabric
Classifies a task as predominantly:
- MODEL_BOUND;
- CPU_BOUND;
- GPU_BOUND;
- IO_BOUND;
- NETWORK_BOUND;
- MIXED;
- UNKNOWN.

The classification influences local primitive, specialist selection and scheduling. UNKNOWN must not be treated as free capacity.

### 7. CPO — Critical Path Optimizer
Prioritizes work that actually reduces total DAG completion time. It prevents the scheduler from maximizing agent count while the real critical path remains serial.

### 8. SEC — Speculative Execution Controller
EXPERIMENT only. Duplicate/speculative execution may be useful for bounded, pure/read-only, high-latency work when expected latency benefit exceeds incremental cost. It is prohibited by default for paid model calls and side effects. Any future enablement requires ESE reservation, deduplication, cancellation and measured tail-latency benefit.

### 9. WSC — Warm Specialist Cache
Caches safe, versioned specialist bootstrap artifacts such as validated role definitions, tool schemas, policy digests and immutable planning metadata. It MUST NOT become Hive-owned semantic memory/RAG. Cache entries are digest/freshness bound and invalidated on policy/tool/model/runtime drift.

### 10. EEF — Execution Efficiency Frontier
For each execution plan, UADS estimates a Pareto-style frontier across:
- expected wall-clock;
- expected monetary/token cost;
- quality confidence;
- host/resource pressure;
- integration/conflict risk.

Cockpit ECO/BALANCED/TURBO choose different points on this bounded frontier. If evidence is insufficient, estimates are UNKNOWN.

### 11. SUE — Saturation & Utilization Envelope
Distinguishes useful utilization from harmful saturation. A resource may show moderate raw utilization while suffering pressure/stalls, or high utilization while remaining productive. SUE combines evidence rather than using a single percentage threshold.

### 12. QFR — Quota Fairness Regulator
Allocates scarce provider/model/tool/host capacity across projects/WOs using explicit priorities and fairness rules. One TURBO execution cannot silently starve every other project.

## Cockpit controls

M30 Living Operations Cockpit SHOULD expose, truthfully and with governed commands:
- parallel mode OFF/AUTO/ECO/BALANCED/TURBO/CUSTOM;
- configured vs currently safe concurrency;
- active/queued/draining specialists;
- CPU/RAM/GPU/VRAM/storage/network/provider pressure where evidenced;
- current bottleneck and critical path;
- queue depth/age/saturation;
- backpressure and load-shedding state;
- expected time/cost frontier with confidence;
- current ESE burn/reservation;
- provider quotas/rate-limit pressure;
- why concurrency was raised/reduced;
- per-task workload affinity and model/effort;
- STOP NEW AGENTS and safe drain controls.

Dashboard changes MUST route through authoritative modules. M30 never becomes scheduler truth.

## Performance invariants

1. User concurrency setting is a ceiling, not a target.
2. No queue is unbounded.
3. No adaptive scheduler may bypass ESE, policy, capability proof or side-effect fences.
4. Backpressure must be visible and attributable.
5. Resource UNKNOWN/STALE cannot be rendered as healthy spare capacity.
6. Provider quota pressure participates in scheduling.
7. TURBO cannot starve protected higher-priority work.
8. Scheduler overhead must be materially lower than the work it optimizes.
9. Increasing parallelism requires measured or evidence-backed expected critical-path gain.
10. A performance optimization that lowers the frozen quality floor is a regression.
11. GPU acceleration is optional and proof-gated; no NVIDIA dependency is mandatory.
12. Cache hits require digest/freshness compatibility and never replace Hive semantic memory authority.

## Enterprise pillars

- M27: primary owner relationship for load, saturation, scaling and capacity evidence.
- M28: overload degradation, backpressure, queue recovery and safe draining.
- M29: resource controls cannot bypass identity/policy/sandbox boundaries.
- M30: truthful pressure, queue, bottleneck, efficiency and cockpit projections.
- M31: benchmark/release gates for performance changes and regressions.

## Dispositions

ADOPT:
- bounded queues;
- backpressure semantics;
- critical-path-aware scheduling;
- per-task workload classification;
- explicit saturation and fairness contracts;
- performance regression gates.

ADAPT:
- PSI-style pressure awareness;
- adaptive concurrency-control principles;
- NVML-compatible GPU evidence boundary;
- Node ELU/worker telemetry;
- cgroup-style resource budgets where host-proven.

EXPERIMENT:
- speculative execution;
- automatic Pareto frontier plan selection;
- predictive queue delay;
- learned runtime estimates;
- host-specific hard resource enforcement.

REJECT DEFAULT:
- max-agent-count scheduling;
- unlimited queues;
- raw CPU percentage as sole capacity truth;
- mandatory GPU stack;
- paid multi-model speculation;
- silent load shedding;
- cache reuse across incompatible policy/tool/model digests;
- performance claims without benchmark evidence.

## STOP CONDITION

Wave 5 discovery is complete when architecture candidates and proof requirements exist. No runtime implementation is authorized by this document alone.