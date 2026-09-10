# M30 — Production Observability & Real-Time Operations
Status: DISCOVERY — S00 FROZEN / S01 TECHNOLOGY RADAR CANDIDATE | Class: NECESSARY

Mission: provide the event-backed operational nervous system and canonical UADS V2 dashboard/operator surface required by ADR-UADS2-009.

Owns structured event spine, logs/metrics/traces where applicable, correlation/request/Work-Order IDs, SLI/SLO, alert rules, health/degraded/UNAVAILABLE states, real-time dashboard contracts, diagnostics and runbook/incident links.

Boundary: M24 owns Work Order/cost ledger semantics. M30 owns production telemetry transport, health/alerts and dashboard presentation.

B-001: M08 emits privacy-safe identity-bound review-analysis events; M30 carries the authoritative event surface; M24 attributes them to the Work Order. The unchanged duplicate rule must yield deterministic numerator, denominator, rate and raw-event hashes.

No dashboard element may claim real-time state from fabricated/stale mock data.

Mandatory tests: correlation continuity, event identity/hash stability, missing telemetry explicit, no double count, privacy/cardinality controls, alert correctness, dashboard freshness, degraded-source behavior, B-001 non-zero denominator on required V2 workloads and low telemetry overhead.

## Discovery sessions

- S00: FROZEN — problem framing, objective operator outcomes, measurable correctness/freshness/latency/durability/loss/cardinality/usefulness metrics, foundation reconciliation and anti-fabrication rules.
- S01: CANDIDATE — `docs/v2/modules/m30/M30-S01-TECHNOLOGY-RADAR.md`; exact-head gates + HEDS required before promotion.
- S01.5: NEXT after S01 approval — proprietary invention radar. Candidate gaps from S01 are not yet canonized inventions.

## Current technology posture candidate

- ADOPT standards-compatible OpenTelemetry semantic/OTLP boundary without mandatory runtime dependency.
- ADOPT Prometheus/OpenMetrics-compatible metric semantics; exporter remains optional/experimental.
- ADAPT the UADS immutable event spine and SSE local-first dashboard delivery.
- EXPERIMENT with trace-derived metrics, native histograms, pluggable OTLP/Prometheus export and evidence-gated distributed ingest.
- REJECT mandatory Grafana/Kafka/SaaS stacks, unbounded cardinality and synchronous heavy telemetry on critical paths.

All technology selections remain governed discovery decisions until S01 is exact-head approved and merged.