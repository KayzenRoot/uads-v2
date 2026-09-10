# M30 S02 — State & Command Contracts

Status: CANDIDATE
Risk: HIGH
Work Order: UADS2-WO-017
Issue: #55

## 1. Purpose
Define the canonical architecture contracts by which the Living Operations Organism observes state, evaluates confidence, preserves continuity, presents projections and invokes governed actions without becoming a second source of truth.

## 2. Operational State Envelope
Every operator-visible state item MUST be represented by a bounded versioned envelope.

Required fields:
- `stateEnvelopeVersion`
- `sourceId`
- `sourceOwnerModule`
- `sourceSchemaVersion`
- `subjectId`
- `observedAt`
- `evaluatedAt`
- `freshnessLeaseMs`
- `truthClass`: SOURCE | DERIVED | INFERRED
- `truthState`: CURRENT | STALE | DEGRADED | UNAVAILABLE
- `continuityState`: CONTIGUOUS | GAP_KNOWN | GAP_UNKNOWN | REPLAYING | UNAVAILABLE
- `reasonCode`
- `correlationIds` through PSCF
- `lineageRefs`
- `evidenceRefs`
- bounded `value` only when permitted by source/schema

Invariant: an absent or expired source cannot produce a CURRENT projection.

## 3. Freshness state machine

### CURRENT
Objective source evidence exists, schema is valid, freshness lease is valid and no higher-priority integrity failure exists.

### STALE
Last known valid source evidence exists but its freshness lease expired. The last known value may remain visible only with its original timestamp and STALE label.

### DEGRADED
Some evidence is usable but one or more integrity, continuity, quality, dependency or policy conditions prevent full trust.

### UNAVAILABLE
No sufficient usable evidence exists. No synthetic fallback may be presented as live truth.

Allowed transitions include:
- UNAVAILABLE -> CURRENT after valid evidence arrives;
- CURRENT -> STALE on lease expiry;
- CURRENT -> DEGRADED on continuity/integrity/policy defect;
- STALE/DEGRADED -> CURRENT only after fresh validating evidence;
- any state -> UNAVAILABLE if the source becomes unusable or unsupported.

## 4. Continuity state machine

### CONTIGUOUS
The observed event range is accounted for according to the source contract.

### GAP_KNOWN
A specific missing/rejected/dropped range is known.

### GAP_UNKNOWN
Continuity cannot be proven and the missing range cannot be bounded precisely.

### REPLAYING
The system is actively reconciling a gap or reconnect cursor using owner-supported replay semantics.

### UNAVAILABLE
The source exposes no sufficient continuity evidence.

Continuity and freshness are orthogonal: fresh data can still be degraded by a known gap.

## 5. Projection contract
Every dashboard projection MUST preserve:
- truthClass;
- source/lineage references;
- freshness state;
- continuity state where applicable;
- derivation version for DERIVED data;
- uncertainty metadata for INFERRED data.

Derived and inferred values MUST never overwrite source-owned state.

## 6. Governed Command Envelope
Every operator action routed through LOCP MUST use a versioned command envelope.

Required fields:
- `commandEnvelopeVersion`
- `commandId`
- `commandType`
- `commandVersion`
- `ownerModule`
- `subjectId`
- `actorContextRef`
- `authorizationPolicyRef`
- `riskClass`
- `preconditionRefs`
- `idempotencyKey`
- `requestedAt`
- `deadlineAt` or bounded timeout policy
- `requestedEffect`
- `blastRadiusClass`
- `rollbackOrRecoveryCapabilityRef`
- `auditCorrelationId`

M30 MUST reject UI-originated ad-hoc mutations that do not map to an advertised owner capability.

## 7. Command lifecycle state machine
Canonical lifecycle:
- PROPOSED
- AUTHORIZING
- REJECTED
- ACCEPTED
- RUNNING
- SUCCEEDED
- FAILED
- CANCELLED
- TIMED_OUT
- UNKNOWN_OUTCOME

Rules:
- authorization failure -> REJECTED;
- accepted does not imply succeeded;
- timeout without owner evidence -> TIMED_OUT only when timeout semantics define a terminal owner-confirmed state, otherwise UNKNOWN_OUTCOME;
- network/UI loss cannot be interpreted as failure;
- retry MUST reuse or deterministically derive idempotency semantics;
- rollback/recovery is a new governed command, not mutation of historical receipts.

## 8. Command Receipt
Each owner module response MUST emit an immutable bounded receipt including:
- commandId/idempotencyKey;
- ownerModule;
- acceptance/rejection state;
- owner-observed timestamps;
- terminal outcome when known;
- reason code;
- evidence refs;
- resulting source-state refs where available.

LOCP displays receipts but never rewrites them.

## 9. UNKNOWN_OUTCOME reconciliation
UNKNOWN_OUTCOME is mandatory whenever the system cannot prove the terminal result of a command.

Reconciliation paths:
1. query owner by commandId/idempotencyKey;
2. correlate later owner evidence through PSCF;
3. if supported, execute a read-only diagnostic capability;
4. remain UNKNOWN_OUTCOME if proof remains insufficient.

A second mutating command MUST NOT be emitted merely to discover whether the first succeeded unless the owner contract explicitly defines the action as safe and idempotent.

## 10. AOBC priority classes
Observability work is partitioned into:
- P0: truth/integrity/command audit evidence, protected;
- P1: health/freshness/continuity and critical operational diagnostics;
- P2: routine metrics/aggregates;
- P3: high-detail traces, exports and optional analytics.

Under pressure AOBC MUST degrade from P3 toward P2 before impairing P1/P0. Any dropped or sampled detail MUST itself generate bounded degradation evidence.

## 11. Security and privacy constraints
- opaque correlation IDs, not raw prompts/credentials/paths;
- authorization decisions owned by policy/owner modules, not visual UI state;
- no secret-bearing command parameters in telemetry projections;
- bounded command payload schemas;
- replay protection through command identity/idempotency/version semantics;
- all privileged controls must expose risk/blast-radius metadata.

## 12. Architecture handoff to S03/S04
S03 must threat-model race conditions, command spoofing/replay, stale preconditions, privilege confusion, gap manipulation and dashboard compromise.

S04 must prove state-machine determinism, no fabricated CURRENT state, command idempotency/receipt integrity, UNKNOWN_OUTCOME reconciliation, AOBC degradation order, bounded cardinality and privacy-safe correlation.