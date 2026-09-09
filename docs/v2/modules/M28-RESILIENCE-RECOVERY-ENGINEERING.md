# M28 — Resilience & Recovery Engineering
Status: DISCOVERY | Class: NECESSARY

Mission: guarantee bounded behavior and recovery across crashes, dependency failures, partial writes, restarts and degraded environments.

Owns timeout/idempotency policy, circuit breakers/bulkheads when justified, graceful degradation/fail-closed rules, restart/replay safety, dependency outage handling, FMEA/fault injection, backup/restore, recovery verification and RTO/RPO where applicable.

Composes with M10, M18, M20 and M21.

Mandatory tests: crash during transition, replay/idempotency, dependency outage, restart recovery, corrupted/partial state, backup/restore drill and RTO/RPO evidence where applicable.
