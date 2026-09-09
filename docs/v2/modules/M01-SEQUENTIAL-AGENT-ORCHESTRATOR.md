# M01 — Sequential Agent Orchestrator
Status: DISCOVERY | Class: NECESSARY

Mission: replace review/worker fan-out with a deterministic coordinator plus a bounded sequential specialist queue. Hard invariant: maximum one active specialist worker by default.

Standalone: core scheduler works with no Hive dependency. Hive complement: may consume task/risk context but never delegates concurrency authority to Hive.

Candidate technology radar, UNAPPROVED: lease-based worker slot; deterministic queue journal; capability-aware spawn gate; work-conservation without parallel fan-out; digest-bound worker handoff.

Sessions: S00 metrics/fan-out reproduction; S01 scheduler technology; S02 queue/state architecture; S03 crash/cancel/stale-worker model; S04 concurrency/fault/token benchmarks; S05 implementation slices; S06 host integration; S07 freeze.

Mandatory tests: max concurrency=1, queue order, cancellation, crash recovery, stale worker rejection, duplicate spawn prevention, token-amplification regression.
