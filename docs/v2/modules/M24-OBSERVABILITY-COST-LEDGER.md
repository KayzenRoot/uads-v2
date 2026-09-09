# M24 — Observability & Cost Ledger
Status: DISCOVERY | Class: IMPORTANT

Mission: make worker count, concurrency, model/effort, tokens, retries, context radius, cache, gates, review-analysis attribution and TTTM measurable per Work Order.

M24 owns Work Order/cost attribution and ledger semantics. M30 owns production event transport, health/alerts, SLI/SLO and the real-time dashboard/operator surface.

Review-analysis events from M08 transported by M30 must remain attributable to exact Work Order/review identity. Missing telemetry is explicit, never silently zero.

Mandatory tests: double-count prevention, missing telemetry explicit, privacy redaction, exact WO attribution, duplicate-rate recomputation identity and low overhead.
