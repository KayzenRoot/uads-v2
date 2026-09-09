# M01 — Sequential Agent Orchestrator
Status: DISCOVERY | Class: NECESSARY

Mission: replace review/worker fan-out with deterministic coordinator + bounded sequential queue. Default max active specialist = 1.

## S00 source lock
UADS2-WO-001 is the accepted V1 baseline. M01 S00 consumes that evidence rather than repeating unavailable V1 telemetry. V1 Duplicate Analysis Rate remains `UNAVAILABLE (0/0)` under the owner-approved B-001 amendment.

## Enterprise dependencies
M27 load/backpressure; M28 crash/restart/replay; M29 worker isolation; M30 lifecycle event/dashboard visibility; M31 release/rollback.

Sessions: S00 accepted baseline; S01 scheduler technology; S02 queue/state architecture; S03 crash/cancel/stale-worker model; S04 concurrency/fault/token/load benchmarks; S05 implementation slices; S06 host integration; S07 freeze.

Mandatory tests: max concurrency=1, queue order, cancellation, crash recovery, stale worker rejection, duplicate spawn prevention, token regression, event attribution and dashboard freshness.
