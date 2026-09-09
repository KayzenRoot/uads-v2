# M08 — Review Pipeline 2.0
Status: DISCOVERY | Class: NECESSARY

Mission: implement HEDS review/delivery runtime in SOLO and HIVE_CONNECTED without duplicating Hive canonical governance.

## B-001 event contract
V2 review emits privacy-safe identity-bound structured analysis events for `normalized-structured-analysis-signature-v1`.

Minimum fields: `eventType`, `gate`, `normalizedSubjectPath`, `normalizedFindingCode`, `evidenceDigest`, Work Order/review identity and timestamp.

M08 owns semantic emission. M30 owns authoritative event transport/operational surface. M24 owns Work Order/cost attribution. Required benchmark evidence must yield deterministic numerator, denominator, Duplicate Analysis Rate and raw-event hashes. Missing required event evidence fails closed.

## Enterprise dependencies
M27 performance/load; M28 failure/recovery; M29 security/evidence integrity; M30 observability; M31 safe release.

S00 uses approved WO-001 baseline. S01 technology radar; S02 schemas/state; S03 failure/security; S04 tests/benchmarks; S05 slicing; S06 integration; S07 freeze.

Mandatory tests include stale-proof rejection, independent review, max worker=1, explicit verdict, Work Order attribution, deterministic event hashes, non-zero required V2 denominator and identical duplicate-rate recomputation.
