# UADS V2 — IW0 Implementation Test Plan Draft

Status: DRAFT FOR NEXT IMPLEMENTATION WO
Prepared under: UADS2-WO-024
Target: M30 S05.1 Truth Kernel + Living Cockpit

## Mandatory proof mapping
The next implementation WO must map executable tests/evidence to at least: OP-001, OP-002, OP-003, OP-008, OP-009, PF-001, PF-002, PF-003, PF-004, ES-020.

## Functional tests
IW0-T001 — valid fresh source produces CURRENT only while freshness evidence is valid.
IW0-T002 — freshness lease expiry produces STALE deterministically.
IW0-T003 — missing source produces UNAVAILABLE/UNKNOWN, never zero/current.
IW0-T004 — corrupt/hash-mismatched/unsupported persisted data cannot become healthy/current.
IW0-T005 — SOURCE, DERIVED and INFERRED projection classes remain distinguishable.
IW0-T006 — known and unknown continuity gaps are visible.
IW0-T007 — replaying continuity state is explicit when used.
IW0-T008 — payload/cardinality/read/retention bounds fail safely.
IW0-T009 — privacy sanitization prevents raw secret/prompt/path leakage by default.
IW0-T010 — loopback-only dashboard binding remains enforced.
IW0-T011 — SSE clients remain bounded and disconnected clients are cleaned up.
IW0-T012 — SSE reconnect/gap semantics do not imply false continuity.
IW0-T013 — dashboard failure cannot mutate/corrupt authoritative source state.
IW0-T014 — missing M05/M06/M07/M24 truth renders UNKNOWN/UNAVAILABLE.
IW0-T015 — dashboard rendering/refresh performs zero paid/model-bearing calls.

## Regression tests
IW0-R001 — existing operational event canonical hashing remains deterministic.
IW0-R002 — immutable record semantics remain intact.
IW0-R003 — adjacent sidecar state remains protected.
IW0-R004 — existing B-001 bridge behavior remains compatible unless explicitly versioned.
IW0-R005 — current CLI/dashboard entry behavior remains compatible unless a governed migration is documented.

## Performance tests
IW0-P001 — event write/read benchmark reported with environment identity.
IW0-P002 — snapshot p50/p95/p99 measured on developer host and labeled non-production SLO evidence.
IW0-P003 — SSE delivery/reconnect overhead measured or bounded by deterministic test evidence.
IW0-P004 — telemetry overhead compared with historical Issue #39 debt; material regression is visible.
IW0-P005 — boundedness under pressure does not silently drop protected P0/P1 operational truth.

## Security tests
IW0-S001 — path traversal remains rejected.
IW0-S002 — security headers remain present.
IW0-S003 — raw secrets cannot appear in default snapshot/event projection.
IW0-S004 — malformed schema input fails closed.
IW0-S005 — project attribution mismatch is rejected.

## Platform matrix
- Windows: full focused tests + repository gate.
- Linux: full focused tests + repository gate.
- GPU is not required for IW0.

## Evidence classes
LOCAL_MEASURED / CI_MEASURED / DERIVED / SIMULATED / UNKNOWN.
No UNKNOWN result may be relabeled PASS.

## Exit criteria
All applicable IW0 tests and mandatory S04 proof IDs pass, full suite passes, exact-head CI/CodeQL/Dependency Review/Cross-Platform are green, Evidence Bundle is complete, and independent HEDS approves the exact implementation head.