# UADS2-WO-015 — M30 S01 Technology Radar

Status: IN PROGRESS
Module: M30 — Production Observability & Real-Time Operations
Session: S01 — Technology Radar
Issue: #51
Risk: MEDIUM-HIGH

## Objective
Evaluate current observability technologies and architectural patterns against UADS V2 S00 constraints before S01.5 proprietary invention work.

## Source order
Checkpoint > Decisions/ADRs > Scope > DoD > Architecture > Requirements > M30 S00 > historical WO-003 foundation > external primary-source technology documentation.

## Scope
Evaluate:
- OpenTelemetry API/SDK/Collector/OTLP and semantic conventions;
- Prometheus/OpenMetrics metric semantics, exemplars and native histograms;
- trace backends and trace-derived metrics;
- structured log/event pipelines;
- time-series and long-retention architectures;
- SSE versus WebSocket for operator delivery;
- alerting, SLI/SLO and error-budget engines;
- local-first versus distributed modes;
- Kafka-compatible durable ingest only as a scale-stage architecture option.

## Constraints
- GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT;
- standalone default must work without external observability stack;
- telemetry is never authoritative over domain truth;
- missing/stale/uncertain telemetry must remain explicit;
- bounded cardinality, privacy and hot-path overhead;
- no dependency is canonized because of popularity alone;
- Issue #39 B6 overhead debt must influence decisions.

## Acceptance
1. Every technology family receives ADOPT / ADAPT / EXPERIMENT / REJECT verdict and rationale.
2. Local-first default is cleanly separated from enterprise scale-out path.
3. Performance, supply-chain, privacy, cardinality, resilience and operational cost are explicit.
4. No vendor lock-in or premature runtime implementation is introduced.
5. S01.5 receives a concrete gap list for proprietary invention candidates.
6. M27-M31 implications are classified.
7. Exact-head CI, CodeQL, Dependency Review, Cross-Platform and HEDS approve before S01.5.

## Stop condition
STOP at S01 APPROVED/MERGED. Do not implement S01.5 inventions, distributed ingest, external backends, alert engines or new dependencies in this increment.