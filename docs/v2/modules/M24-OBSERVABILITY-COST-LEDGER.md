# M24 — Observability & Cost Ledger
Status: DISCOVERY | Class: IMPORTANT

Mission: make worker count, concurrency, model/effort, tokens, retries, context radius, cache, gates and TTTM measurable per Work Order.

Standalone: local privacy-safe ledger. Hive complement: optional aggregate metrics may flow upward through explicit contract.

Candidate technology radar, UNAPPROVED: event-sourced Work Order telemetry; OpenTelemetry-compatible spans; cost attribution graph; QPT/TTTM dashboards.

Sessions S00–S07 cover metric semantics, telemetry technology, architecture, privacy/cardinality, accuracy tests, implementation, Hive export, freeze.

Mandatory tests: double-count prevention, missing telemetry explicit, privacy redaction, exact WO attribution, low overhead benchmark.

## Boundary with M30

M24 owns Work Order/cost attribution and ledger semantics.
M30 owns production event transport, operational aggregation, health/alerts, SLI/SLO and real-time dashboard/operator presentation.

M24 MUST NOT reinterpret missing telemetry as zero.

## B-001 integration

Review-analysis events emitted by M08 and transported by M30 MUST remain attributable to exact Work Order/review identity in M24. Duplicate Analysis Rate must recompute deterministically from raw event hashes and the unchanged canonical signature rule.
