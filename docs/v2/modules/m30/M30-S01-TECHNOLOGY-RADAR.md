# M30 S01 — Technology Radar

Status: CANDIDATE — exact-head gates + HEDS pending
Date: 2026-09-10

## Decision frame
M30 must remain useful in a standalone local-first UADS installation while preserving a standards-compatible path to enterprise-scale observability. Technologies are classified as ADOPT, ADAPT, EXPERIMENT or REJECT FOR DEFAULT.

## Radar

### OpenTelemetry semantics and OTLP
**Verdict: ADOPT as compatibility contract; EXPERIMENT as runtime integration.**

Adopt OpenTelemetry-compatible naming/resource/correlation semantics and an OTLP interoperability boundary so UADS telemetry can leave the product without proprietary translation lock-in. Do not make the OpenTelemetry SDK or Collector mandatory in the default runtime yet. Collector pipelines are powerful but introduce additional process/configuration/failure surface, and fan-out can include synchronous propagation inside a pipeline.

Use current OpenTelemetry semantic conventions as an external compatibility vocabulary, but version/pin the subset UADS depends on because convention families may have different stability levels.

### Prometheus/OpenMetrics metric semantics
**Verdict: ADOPT metric semantics; EXPERIMENT exporter/scrape surface.**

Counters, gauges and histogram semantics are appropriate for M30 SLI/SLO work. Prometheus-compatible exposition should be optional. Native histograms are now stable in Prometheus 3.8+, but activation and ecosystem support still require deliberate configuration, so UADS should not assume native-histogram availability everywhere.

Exemplars are valuable for linking metric outliers to trace/event evidence when cardinality and privacy budgets permit.

### UADS immutable operational event spine
**Verdict: ADAPT and retain as local-first canonical operational journal.**

Keep the existing versioned, privacy-safe, hash-verified event journal as the standalone default. It remains authoritative only for the telemetry records it stores, never for source-domain truth. Rework its performance, indexing/compaction and loss/freshness semantics in later sessions rather than replacing it prematurely.

### SSE for operator dashboard delivery
**Verdict: ADAPT as default.**

SSE remains the preferred default for one-way server-to-operator telemetry because it matches the current dashboard interaction model and avoids protocol/dependency expansion. WebSocket is not justified merely for faster-looking real-time UI.

### WebSocket
**Verdict: EXPERIMENT / future conditional use.**

Reserve WebSocket for truly bidirectional control surfaces, collaborative operator sessions or high-frequency interaction patterns that SSE cannot satisfy. It is not part of the default M30 telemetry contract.

### Trace-derived metrics
**Verdict: EXPERIMENT.**

Potentially useful for latency/error/service relationship views without duplicating instrumentation, but should not become the only source of core SLIs. Sampling, dropped spans and tail policies can distort derived metrics unless uncertainty is explicitly surfaced.

### Native histograms
**Verdict: EXPERIMENT.**

Use only after benchmark evidence shows material value for long-tail latency or dynamic distributions. Keep classic histogram compatibility until the runtime/export path proves native-histogram support end-to-end.

### Grafana/Loki/Mimir/Tempo stack
**Verdict: REJECT FOR DEFAULT; ALLOW AS OPTIONAL BACKEND PROFILE.**

Do not require the Grafana observability stack for a normal UADS install. UADS should export into such systems rather than depend on them for correctness. Their architectures remain valuable references for scale-out design.

### Kafka-compatible durable ingest
**Verdict: REJECT FOR DEFAULT; EXPERIMENT at enterprise scale.**

Modern Mimir and Tempo architectures use Kafka-compatible durable queues to decouple read/write paths and improve resilience at scale, while Tempo monolithic mode explicitly avoids Kafka. UADS should mirror the architectural principle, not the dependency: start in-process/local-first; introduce a durable ingest fabric only when M27 load/durability evidence crosses a defined threshold.

### Read/write path separation
**Verdict: ADOPT as scale-stage architectural invariant, not immediate decomposition.**

Design contracts so ingest durability and query/dashboard load can scale independently later. Do not create microservices before load evidence requires them.

### Time-series / object-storage long retention
**Verdict: EXPERIMENT behind storage interfaces.**

Long-retention metric/trace storage is not required for local-first M30 correctness. Preserve pluggable export/archive boundaries. Object-storage-backed columnar designs are valid enterprise references but not default local dependencies.

### Alerting, SLI/SLO and error budgets
**Verdict: ADOPT concepts; ADAPT execution locally.**

M30 should own health/alert evaluation and objective SLI/SLO/error-budget projections, but initial implementation should be dependency-light and deterministic. External alert managers may be optional integration targets later.

### External SaaS observability
**Verdict: REJECT as mandatory; OPTIONAL exporter only.**

No production truth, dashboard availability or incident visibility may depend on an external SaaS. Export can be user-controlled and fail independently without corrupting local truth.

### Synchronous hot-path telemetry
**Verdict: REJECT.**

Issue #39 proves observability overhead is already a real architectural concern. Critical execution paths must not block on external export, expensive aggregation or dashboard reads. Telemetry loss/degradation must be explicit rather than hidden behind blocking reliability attempts.

### Unbounded labels/cardinality
**Verdict: REJECT.**

All metric/event dimensions require bounded schemas, normalization and cardinality budgets. Raw prompts, arbitrary paths, secrets, model outputs and unconstrained provider identifiers are not acceptable default labels.

## Local-first default profile
- UADS operational event journal;
- bounded local health/SLI projections;
- local dashboard via loopback HTTP + SSE;
- explicit LIVE/CURRENT, STALE, DEGRADED, UNAVAILABLE states;
- optional exporters disabled by default;
- no Kafka, Grafana stack, external SaaS or collector required.

## Enterprise scale-out profile
Only after M27/M28 evidence justifies it:
- optional OTLP exporter/collector profile;
- optional Prometheus-compatible metrics surface;
- separated ingest/query paths;
- optional durable queue compatible with Kafka semantics;
- object-storage / long-retention backend adapters;
- multi-instance aggregation, replay and backpressure controls;
- external dashboard/alert integrations while UADS local truth remains independent.

## Gaps handed to S01.5
1. Need an explicit machine-verifiable freshness/confidence contract per operator-visible datum.
2. Need a deterministic gap/loss/replay ledger so missing telemetry is evidence, not silence.
3. Need telemetry overhead self-governance that can reduce fidelity before observability harms production.
4. Need cardinality budgeting tied to schema and producer identity.
5. Need local-first to distributed migration without changing event semantics or operator truth rules.
6. Need correlation that binds Work Order, execution, request, model/tool activity and host capability evidence without exposing private payloads.
7. Need operator projections that distinguish source truth, telemetry truth and derived inference.

These are invention opportunities, not approved proprietary technologies yet.

## Enterprise pillar impact
- M27 Scale/Load: contracts must permit independent ingest/read scaling and bounded cardinality; distributed queue is evidence-gated.
- M28 Resilience/Recovery: replay, gap detection, durable handoff and explicit degraded states are mandatory design inputs.
- M29 Operational Security/Supply Chain: minimize default dependencies; exporters are isolated; privacy-safe bounded attributes remain mandatory.
- M30 Observability: this radar defines the compatibility and operating posture for the module itself.
- M31 Release/Safe Ops: telemetry schemas/export contracts require versioning, compatibility tests and rollback-safe optional integrations.

## Primary external references reviewed
- OpenTelemetry Collector architecture: https://opentelemetry.io/docs/collector/architecture/
- OpenTelemetry semantic conventions: https://opentelemetry.io/docs/specs/semconv/
- Prometheus native histograms: https://prometheus.io/docs/specs/native_histograms/
- Grafana Mimir ingest storage architecture: https://grafana.com/docs/mimir/latest/get-started/about-grafana-mimir-architecture/about-ingest-storage-architecture/
- Grafana Tempo architecture: https://grafana.com/docs/tempo/latest/reference-tempo-architecture/about-tempo-architecture/

## S01 stop condition
Technology choices above remain architecture/discovery decisions only. No new runtime dependency or distributed backend is authorized until later architecture/test sessions produce explicit evidence and acceptance criteria.