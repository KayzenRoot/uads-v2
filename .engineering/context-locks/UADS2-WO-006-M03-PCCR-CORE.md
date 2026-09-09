# Context Lock — UADS2-WO-006 / M03 S05 Slice 1

Status: LOCKED
Date: 2026-09-09
Base main SHA: `36b2019fc22b4d6c5d250e41edf12e737c4ddcfa`
Branch: `work/uads2-wo-006-m03-pccr-core`
Issue: #28

## Canonical sources

1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/adrs/ADR-UADS2-011-GLOBAL-ARCHITECTURE-DEEP-DISCOVERY-VERTICAL-SLICES.md`
4. `docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md`
5. `docs/v2/modules/M03-HOST-CAPABILITY-DETECTOR.md`
6. `docs/v2/modules/m03/M03-S02-ARCHITECTURE.md`
7. `docs/v2/modules/m03/M03-S03-FAILURE-SECURITY-RESILIENCE.md`
8. `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md`

## Frozen implementation-source fingerprints

| Path | Git blob SHA |
| --- | --- |
| `schemas/runtime-capability-snapshot.schema.json` | `1bc304136e52e7a872c93aef132d76b4027b8475` |
| `src/kernel/model-runtime.ts` | `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62` |
| `src/kernel/model-types.ts` | `df4ac2159c6df0cf1fe7c176ef14ed06bf39b435` |
| `src/lib/workspace.ts` | `bf047bd38eae16065d5dc2f19d3c98f05f6edb48` |
| `src/lib/atomic-write.ts` | `f91e1b439cdb95abbbce251b6834978c4c816f92` |
| `src/lib/hash.ts` | `a2f14f12ca779de684c975c6530bf831e6b4e7e0` |
| `src/lib/json-schema.ts` | `e439980e02bb7bbaddcc93eb413693f866bc2e02` |
| `src/kernel/operational-events.ts` | `c68b5a960c7774b877867ae2aa32505bd3bbff48` |
| `schemas/operational-event.schema.json` | `e029f6ed81098bcdfce8d8f3a515774e2d509ff6` |
| `tests/model-routing.test.ts` | `47c2bdbad80c1e63366cdb4dd04720c91ba98ee1` |
| `tests/host-adapters.test.ts` | `873b6b53916a2b4ea19acc51b54c5b74845c91c0` |
| `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md` | `ef246c48a587072116a89ca87fa26fc2b8d7fd68` |
| `docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md` | `e40e071aac212ddd93be772cd943e1bf5e76b93a` |

## Existing invariants to preserve

- legacy RuntimeCapabilitySnapshot remains schema version 0.8.0 in this slice;
- existing ModelCapability set remains the ten legacy IDs;
- `effectiveCapability` still requires runtime `true`;
- M30 operational event schema remains version 1.0.0;
- no project-local proof state;
- SOLO mode remains complete;
- Hive is not required;
- max specialist worker rule is unrelated and unchanged.

## Design boundary

The new PCCR module may import/reuse:
- ModelCapability / RuntimeCapabilitySnapshot types;
- runtime identity recomputation/normalization;
- SHA-256 helpers;
- strict JSON Schema validation;
- secret/path checks;
- atomic sidecar persistence;
- existing M30 operational-event persistence.

It MUST NOT make those existing owners depend on M03 in Slice 1 unless a narrowly proven integration change is necessary.

## Review lock

Any expansion beyond the bounded runtime file set in the Work Order must be called out explicitly in the Evidence Bundle and justified as NECESSARY before HEDS.
