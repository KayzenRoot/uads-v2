# M24 — Observability & Cost Ledger
Status: DISCOVERY | Class: IMPORTANT

Mission: make worker count, concurrency, model/effort, tokens, retries, context radius, cache, gates and TTTM measurable per Work Order.

Standalone: local privacy-safe ledger. Hive complement: optional aggregate metrics may flow upward through explicit contract.

Candidate technology radar, UNAPPROVED: event-sourced Work Order telemetry; OpenTelemetry-compatible spans; cost attribution graph; QPT/TTTM dashboards.

Sessions S00–S07 cover metric semantics, telemetry technology, architecture, privacy/cardinality, accuracy tests, implementation, Hive export, freeze.

Mandatory tests: double-count prevention, missing telemetry explicit, privacy redaction, exact WO attribution, low overhead benchmark.
