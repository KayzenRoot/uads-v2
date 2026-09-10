# Work Order — UADS2-WO-011

Status: ACTIVE — M03 S06.1 CONTRACT FROZEN
Module: M03 — Host Capability Detector
Slice: S06.1 — Proof-Aware Host Dispatch Integration
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-011-m03-proof-aware-host-dispatch`
Base SHA: `e9e5a456e4629ded387c7f8a3ff2716a2a5e8bdb`
Issue: #40
Risk: HIGH
ADRs: ADR-UADS2-011 / ADR-UADS2-012 — ACCEPTED

## Objective

Migrate the first HARD consumer of M03 from declaration-derived capability snapshots to the proof-aware compatibility projection.

## Technology decisions surfaced before freeze

Reuse only:
- `buildPassiveHostCapabilityBridge()`;
- existing `RuntimeCapabilitySnapshot` persistence;
- existing host presence, ownership and root-binding gates;
- existing dispatch schema and executionProjection fallback;
- Vitest + existing adapter evals.

No new dependency.

## Trust boundary

Host presence and ownership remain prerequisites for dispatch preparation, but they are NOT capability evidence.

The dispatch runtime capabilities MUST be derived from the M03 proof-aware passive bridge, never from `runtimeSnapshotFromHostDetection()`.

## Integration algorithm

After current detection is SUPPORTED and ownership is clean:

1. resolve the current host target;
2. build an in-memory passive M03 bridge with the same adapter/home;
3. require bridge detection remains SUPPORTED;
4. require `bridge.subject.targetRootDigest === hostTarget.targetRootDigest`;
5. require bridge adapter identity matches requested adapter;
6. persist only `bridge.projectedRuntime` as the compatibility snapshot expected by existing dispatch;
7. use that proof-aware snapshot for:
   - bundle `hostCapabilities`;
   - runtimeIdentityDigest;
   - `executionProjection()`.

Do NOT persist ten passive proofs on each dispatch.

## Required behavior

### Cursor / Codex
When host target is present and ownership is clean:
- all current host capability fields remain `unknown` absent future valid production PCCR;
- no adapter/vendor declaration may create TRUE;
- dispatch execution remains conservative:
  - `parallel=false`;
  - `roleDispatch=role-cycling`.

### Generic adapter
When target is present/current:
- `subagents=false`;
- `parallelAgents=false`;
- all other capability fields remain `unknown`;
- dispatch remains sequential and role-cycling.

### Drift
If passive bridge target identity differs from dispatch-resolved root identity, preparation fails closed before bundle persistence.

### Compatibility
Existing host presence/ownership/root checks, model-plan checks, bundle schema, bundle staleness and privacy behavior remain intact.

## Test obligations

Create focused integration tests proving:
- declaration-derived snapshot is no longer used by host-dispatch capability truth;
- Cursor present cannot manufacture TRUE;
- Codex present cannot manufacture TRUE;
- Generic has only two exact FALSE values and no TRUE;
- all three adapters stay sequential/role-cycling without positive proof;
- bundle runtimeIdentityDigest changes consistently with proof-aware capabilities;
- passive bridge and bundle share exact targetRootDigest;
- no passive proof files are written during dispatch preparation;
- root switch still stales/rejects bundle;
- privacy remains intact;
- current legacy adapter/runtime tests continue passing.

## Benchmark

Measure bounded host-dispatch preparation before/after only as local CI evidence if practical.
No universal SLO claim.

## Out of scope

- production active vendor probe;
- active PCCR arbitration in host-dispatch;
- real local Cursor/Codex capability claim;
- M01/M04/M06/M23 redesign;
- future capability IDs;
- M30 performance optimization;
- M03 S07 freeze.

## Stop condition

STOP if:
- `runtimeSnapshotFromHostDetection()` remains capability-truth input to host-dispatch;
- any adapter declaration TRUE reaches bundle as TRUE without PCCR;
- root identity mismatch is tolerated;
- ten passive proof files are written in hot dispatch path;
- sequential fallback regresses;
- HIGH/CRITICAL defect remains.
