# M03 — Host Capability Detector

Status: DISCOVERY — S00-S04 FROZEN / S05.1-S05.5 APPROVED-MERGED / S06.1 APPROVED-MERGED / S06.2 IMPLEMENTED-CANDIDATE / S07 NEXT AFTER HEDS
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

- S00: `docs/v2/modules/m03/M03-S00-PROBLEM-METRICS.md`
- S01: `docs/v2/modules/m03/M03-S01-TECHNOLOGY-RADAR.md`
- S01.5: `docs/v2/modules/m03/M03-S01.5-TECHNOLOGY-INVENTION-RADAR.md`
- S02: `docs/v2/modules/m03/M03-S02-ARCHITECTURE.md`
- S03: `docs/v2/modules/m03/M03-S03-FAILURE-SECURITY-RESILIENCE.md`
- S04: `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md`
- S05.1: APPROVED / MERGED — PCCR core, integrity/freshness/drift, global proof store, conservative legacy projection and M30 best-effort telemetry.
- S05.2: APPROVED / MERGED — stable privacy-safe host subject identity, exact adapter/passive-state digests and passive PCCR evidence bridge. Host presence never becomes positive capability proof.
- S05.3: APPROVED / MERGED — schema-closed Probe Budget Fence, fixed Node-current production self-test, no-shell/no-PATH execution, minimal environment, byte/time ceilings, executable identity, single-flight and privacy-safe receipts.
- S05.4: APPROVED / MERGED — backward-compatible PCCR 1.1 active-evidence semantics, TEST_ONLY trust-boundary hardening, composite executable-identity validity binding, conservative active negative proof and forged-receipt rejection.
- S05.5: APPROVED / MERGED — cross-platform T061-T066 proof, inspectable no-shell/no-PATH PBF policy and B6 telemetry overhead measured as a documented JUSTIFIED_EXCEPTION.
- S06.1: APPROVED / MERGED — host-dispatch migrated from declaration-derived capability truth to proof-aware compatibility projection with conservative fallback.
- S06.2: IMPLEMENTED CANDIDATE — canonical future consumer boundary `readHostCapabilityProjection()` introduced for M01/M04/M06/M23; proof internals remain hidden behind the facade.
- Later vendor-specific S05 experiments remain separately gated and require real source/host evidence before promotion.
- S07: next only after S06.2 exact-head gates and HEDS approval.

## Canonical consumer boundary

Future production consumers M01, M04, M06 and M23 MUST consume M03 capability truth through:

`readHostCapabilityProjection()` from `src/adapters/host-capability-consumer.ts`.

They MUST NOT use adapter-declared capability values or `runtimeSnapshotFromHostDetection()` as enabling truth. The consumer contract is deliberately compatibility-shaped (`true | false | unknown`) so proof storage, passive facts and future active/stored proof resolution can evolve behind the facade without coupling downstream modules to M03 internals.

The current consumer read path is non-persisting by default and preserves GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT semantics.

## Core invariant

Only a current valid `SUPPORTED` proof can project to enabled `true`.
`UNKNOWN`, `BLOCKED` and `STALE` project to legacy `unknown`.

`UNSUPPORTED` is legal only under the Negative Proof Contract. Absence, timeout or permission denial is never sufficient.

## Existing assets to reuse

- `RuntimeCapabilitySnapshot`;
- SHA-256 identity digest;
- sidecar persistence;
- host root identity/binding;
- host adapter detection;
- strict schemas/privacy validation;
- replay/tamper tests.

## HARD consumers

M01, M04, M06 and M23.

## Enterprise gates

M27 capacity/load, M28 resilience/recovery, M29 operational security, M30 observability and M31 safe release apply to every future M03 runtime slice.
