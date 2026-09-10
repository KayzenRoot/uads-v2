# UADS2-WO-017 — S02 Architecture Test Plan

Status: ACTIVE
Type: documentation/architecture verification

## Verification objectives
- ownership boundaries are explicit and non-overlapping;
- truth ingestion cannot be confused with projection output;
- OTCL state transitions are deterministic;
- TCL continuity semantics expose loss/gaps/replay uncertainty;
- AOBC has bounded resource/cardinality controls and explicit degradation;
- PSCF identifiers are bounded and privacy-safe;
- LOCP commands route only through owning modules;
- command contract covers authorization, idempotency, timeout/cancel, blast radius, rollback/recovery and audit receipt;
- dashboard remains useful under partial source failure;
- local-first profile works without external stack assumptions;
- scale-out remains optional/evidence-gated;
- M27-M31 interfaces are explicit.

## Negative architecture tests
Reject the candidate if any path permits:
- UI direct mutation of domain state;
- telemetry becoming authoritative domain truth;
- fabricated CURRENT/HEALTHY state;
- silent telemetry gaps;
- unbounded labels/payloads/queues;
- synchronous heavy observability on critical workload paths;
- distributed dependencies as default requirements.

## Hosted gates
Exact-head CI, CodeQL, Dependency Review, Cross-Platform Compatibility and HEDS are mandatory before S02 promotion.