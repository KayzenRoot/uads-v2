# M30 — Production Observability & Real-Time Operations
Status: DISCOVERY — S00 FROZEN / S01 FROZEN / S01.5 FROZEN / S02 QUEUED BEHIND WO-014G GOVERNANCE REPAIR | Class: NECESSARY

Mission: provide the event-backed operational nervous system and canonical UADS V2 dashboard/operator surface required by ADR-UADS2-009.

Owns structured event spine, logs/metrics/traces where applicable, correlation/request/Work-Order IDs, SLI/SLO, alert rules, health/degraded/UNAVAILABLE states, real-time dashboard contracts, diagnostics and runbook/incident links.

Boundary: M24 owns Work Order/cost ledger semantics. M30 owns production telemetry transport, health/alerts and dashboard presentation.

B-001: M08 emits privacy-safe identity-bound review-analysis events; M30 carries the authoritative event surface; M24 attributes them to the Work Order. The unchanged duplicate rule must yield deterministic numerator, denominator, rate and raw-event hashes.

No dashboard element may claim real-time state from fabricated/stale mock data.

Mandatory tests: correlation continuity, event identity/hash stability, missing telemetry explicit, no double count, privacy/cardinality controls, alert correctness, dashboard freshness, degraded-source behavior, B-001 non-zero denominator on required V2 workloads and low telemetry overhead.

## Discovery sessions

- S00: FROZEN — problem framing, objective operator outcomes, measurable correctness/freshness/latency/durability/loss/cardinality/usefulness metrics, foundation reconciliation and anti-fabrication rules.
- S01: FROZEN — `docs/v2/modules/m30/M30-S01-TECHNOLOGY-RADAR.md`; standards-compatible observability posture, local-first default and evidence-gated enterprise scale path.
- S01.5: FROZEN — `docs/v2/modules/m30/M30-S01.5-PROPRIETARY-INVENTION-RADAR.md`; proprietary shortlist approved in UADS2-WO-016 and merged as `8cfe046bc14458914642de8f02e137e2a728cacf`.
- S02: QUEUED — Issue #55 / UADS2-WO-017 architecture. Material S02 authoring remains paused until WO-014G governance reconstruction completes.

## Frozen S01 technology posture

- ADOPT standards-compatible OpenTelemetry semantic/OTLP boundary without mandatory runtime dependency.
- ADOPT Prometheus/OpenMetrics-compatible metric semantics; exporter remains optional/experimental.
- ADAPT the UADS immutable event spine and SSE local-first dashboard delivery.
- EXPERIMENT with trace-derived metrics, native histograms, pluggable OTLP/Prometheus export and evidence-gated distributed ingest.
- REJECT mandatory Grafana/Kafka/SaaS stacks, unbounded cardinality and synchronous heavy telemetry on critical paths.

## Frozen S01.5 proprietary shortlist

PROMOTED to S02 architecture:
- OTCL — Operational Truth Confidence Layer.
- TCL — Telemetry Continuity Ledger.
- AOBC — Adaptive Observability Budget Controller, including the CBF cardinality firewall function.
- TPSC — Truth/Projection Separation Contract.
- PSCF — Privacy-Safe Correlation Fabric.
- LOCP — Living Operations Control Plane.

EXPERIMENT architecture hooks:
- LDCB — Local-to-Distributed Continuity Bridge.
- COG — Causal Operations Graph.
- AAE — Adaptive Attention Engine.

## Living Operations Organism direction

The dashboard is the primary operational control plane, not a passive reporting page. It must maximize practical visibility over modules, work, resources, health, errors, costs, evidence, releases, security, freshness and telemetry continuity, while invoking only governed commands owned by the authoritative module.

No dashboard projection may become a second source of truth. No command path may bypass module contracts, authorization, auditability, blast-radius limits or recovery semantics.

## Governance note

WO-014 technical S00 decisions remain approved. A post-merge audit found missing Context Lock, Test Plan and Evidence Bundle artifacts plus a stale project checkpoint. Issue #56 / UADS2-WO-014G repairs that process evidence truthfully before S02 proceeds.