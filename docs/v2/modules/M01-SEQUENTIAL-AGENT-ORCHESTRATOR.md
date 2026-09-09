# M01 — Sequential Agent Orchestrator
Status: DISCOVERY | Class: NECESSARY

Mission: replace review/worker fan-out with a deterministic coordinator plus a bounded sequential specialist queue. Hard invariant: maximum one active specialist worker by default.

Standalone: core scheduler works with no Hive dependency. Hive complement: may consume task/risk context but never delegates concurrency authority to Hive.

Candidate technology radar, UNAPPROVED: lease-based worker slot; deterministic queue journal; capability-aware spawn gate; work-conservation without parallel fan-out; digest-bound worker handoff.

Sessions: S00 metrics/fan-out reproduction; S01 scheduler technology; S02 queue/state architecture; S03 crash/cancel/stale-worker model; S04 concurrency/fault/token benchmarks; S05 implementation slices; S06 host integration; S07 freeze.

Mandatory tests: max concurrency=1, queue order, cancellation, crash recovery, stale worker rejection, duplicate spawn prevention, token-amplification regression.

## UADS2-WO-001 source lock

M01 S00 MUST consume the accepted UADS2-WO-001 frozen-V1 baseline rather than repeat or invent unavailable V1 telemetry. V1 Duplicate Analysis Rate remains `UNAVAILABLE (0/0)` under the owner-approved B-001 amendment.

## Enterprise dependencies

- M27: queue/concurrency/load/backpressure benchmark envelope.
- M28: crash/cancel/restart/replay safety.
- M29: worker scope/tool/approval isolation.
- M30: coordinator/queue/spawn/terminal lifecycle events and dashboard freshness.
- M31: compatibility/release/rollback contract.

The M01 implementation slice is scheduled only after the M30 event/dashboard foundation is available.
