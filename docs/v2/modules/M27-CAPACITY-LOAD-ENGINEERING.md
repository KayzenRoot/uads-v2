# M27 — Capacity & Load Engineering
Status: DISCOVERY | Class: NECESSARY

Mission: make capacity, latency, throughput, concurrency, queueing, saturation and cost/performance measurable and bounded.

Owns capacity models, p50/p95/p99 where meaningful, concurrency envelopes, queue/backpressure/saturation policy, load/stress/soak/burst tests, scaling decisions and cost/performance envelopes.

Composes with M01 scheduling, M07 token policy and M30 telemetry.

Mandatory tests: burst saturation, backpressure, queue growth bound, latency regression, resource exhaustion, soak stability and cost/performance envelope.
