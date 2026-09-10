# M03 — Host Capability Detector

Status: S07 FROZEN — UADS2-WO-013 APPROVED / MERGED
Class: NECESSARY

Mission: prove what the current host can actually do before UADS enables subagents, background execution, model controls, tools, telemetry or other host-dependent behavior.

Standalone: mandatory in SOLO mode. Hive complement: publishes capability facts; Hive never substitutes local host truth.

## Architecture direction

M03 V2 uses **Proof-Carrying Host Capabilities**:
- per-capability proof rather than snapshot-wide trust;
- evidence ladder;
- Negative Proof Contract;
- freshness/lease and deterministic drift invalidation;
- bounded static probe registry;
- conservative compatibility projection.

Canonical accepted ADR:
`docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md`

## Sessions

- S00: FROZEN — `docs/v2/modules/m03/M03-S00-PROBLEM-METRICS.md`
- S01: FROZEN — `docs/v2/modules/m03/M03-S01-TECHNOLOGY-RADAR.md`
- S01.5: FROZEN — `docs/v2/modules/m03/M03-S01.5-TECHNOLOGY-INVENTION-RADAR.md`
- S02: FROZEN / ACCEPTED — `docs/v2/modules/m03/M03-S02-ARCHITECTURE.md`
- S03: FROZEN — `docs/v2/modules/m03/M03-S03-FAILURE-SECURITY-RESILIENCE.md`
- S04: FROZEN — `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md`
- S05.1: APPROVED / MERGED — PCCR core, integrity/freshness/drift, global proof store, conservative legacy projection and M30 best-effort telemetry.
- S05.2: APPROVED / MERGED — stable privacy-safe host subject identity, exact adapter/passive-state digests and passive PCCR evidence bridge.
- S05.3: APPROVED / MERGED — schema-closed Probe Budget Fence, fixed Node-current production self-test, no-shell/no-PATH execution, minimal environment, byte/time ceilings, executable identity, single-flight and privacy-safe receipts.
- S05.4: APPROVED / MERGED — PCCR 1.1 active-evidence semantics, TEST_ONLY trust-boundary hardening, composite executable-identity validity binding, conservative active negative proof and forged-receipt rejection.
- S05.5: APPROVED / MERGED — cross-platform T061-T066 proof, inspectable no-shell/no-PATH PBF policy and B6 telemetry overhead measured as JUSTIFIED_EXCEPTION.
- S06.1: APPROVED / MERGED — host-dispatch migrated from declaration-derived capability truth to proof-aware compatibility projection with conservative fallback.
- S06.2: APPROVED / MERGED — canonical future consumer boundary `readHostCapabilityProjection()` introduced for M01/M04/M06/M23; proof internals remain hidden behind the facade.
- S07: FROZEN — final source audit, contract reconciliation, exact-head CI/security/cross-platform gates and HEDS APPROVED under UADS2-WO-013.

## Frozen contract

1. Only a current valid `SUPPORTED` PCCR proof may project to enabled `true`.
2. Valid NPC `UNSUPPORTED` may project to `false`; absence, timeout, permission denial or unrecognized output may not.
3. `UNKNOWN`, `BLOCKED` and `STALE` project to `unknown`.
4. CEL requires E2 or stronger enabling evidence.
5. CLDS invalidates stale/drifted proof before reuse.
6. Automatic probing remains schema-closed, bounded, no-shell, no-PATH and privacy-safe under the Probe Budget Fence.
7. Future production consumers M01, M04, M06 and M23 MUST consume M03 capability truth through `readHostCapabilityProjection()`.
8. Adapter declarations and `runtimeSnapshotFromHostDetection()` are not authorized production enabling-truth boundaries.
9. M30 telemetry transport is non-authoritative for M03 proof truth.
10. GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT remains mandatory.

## Canonical consumer boundary

Future production consumers M01, M04, M06 and M23 MUST consume M03 capability truth through:

`readHostCapabilityProjection()` from `src/adapters/host-capability-consumer.ts`.

They MUST NOT use adapter-declared capability values or `runtimeSnapshotFromHostDetection()` as enabling truth. The consumer contract is deliberately compatibility-shaped (`true | false | unknown`) so proof storage, passive facts and future active/stored proof resolution can evolve behind the facade without coupling downstream modules to M03 internals.

The current consumer read path is non-persisting by default and preserves GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT semantics.

## Deferred after freeze

- Vendor-specific Cursor/Codex active probes and positive capability claims remain separately governed experiments requiring real host/source evidence.
- B6 telemetry overhead is a documented `JUSTIFIED_EXCEPTION`, tracked as M30 performance debt by Issue #39; it is not a capability-truth correctness blocker.
- Repository administration debt in Issue #9 is independent from M03 runtime correctness.

## HARD consumers

M01, M04, M06 and M23.

## Enterprise gates

- M27 capacity/load: COVERED.
- M28 resilience/recovery: COVERED.
- M29 operational security: COVERED.
- M30 observability: COVERED WITH ACCEPTED PERFORMANCE DEBT (#39).
- M31 safe release: COVERED.
