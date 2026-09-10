# UADS2-WO-017 — Context Lock

Status: ACTIVE
Created before S02 candidate canonization.

## Frozen predecessors
- M30 S00 problem/objectives/metrics: FROZEN.
- M30 S01 technology radar: FROZEN.
- M30 S01.5 proprietary invention radar: FROZEN.
- WO-014 governance reconstruction: merged as `edba232a0e2c696dc0638a7cfb6f000116734b81`.

## Locked architectural invariants
1. Dashboard/control plane is not a domain source of truth.
2. Missing or stale source state cannot render as current/healthy.
3. Every command is owned by a module contract and produces audit/evidence state.
4. Telemetry overhead is bounded and may self-degrade before harming workloads.
5. Local-first standalone operation remains the default.
6. Distributed scale path is evidence-gated by M27/M28.
7. Privacy-safe bounded correlation only.
8. GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT.

## Promoted mechanisms for placement
OTCL, TCL, AOBC (including CBF behavior), TPSC, PSCF, LOCP.
Experimental hooks: LDCB, COG, AAE.

Any material change to these constraints requires explicit architecture reconciliation.