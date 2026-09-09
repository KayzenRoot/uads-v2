# M30 — Production Observability & Real-Time Operations
Status: DISCOVERY | Class: NECESSARY

Mission: provide the event-backed operational nervous system and canonical UADS V2 dashboard/operator surface required by ADR-UADS2-009.

Owns structured event spine, logs/metrics/traces where applicable, correlation/request/Work-Order IDs, SLI/SLO, alert rules, health/degraded/UNAVAILABLE states, real-time dashboard contracts, diagnostics and runbook/incident links.

Boundary: M24 owns Work Order/cost ledger semantics. M30 owns production telemetry transport, health/alerts and dashboard presentation.

B-001: M08 emits privacy-safe identity-bound review-analysis events; M30 carries the authoritative event surface; M24 attributes them to the Work Order. The unchanged duplicate rule must yield deterministic numerator, denominator, rate and raw-event hashes.

No dashboard element may claim real-time state from fabricated/stale mock data.

Mandatory tests: correlation continuity, event identity/hash stability, missing telemetry explicit, no double count, privacy/cardinality controls, alert correctness, dashboard freshness, degraded-source behavior, B-001 non-zero denominator on required V2 workloads and low telemetry overhead.
