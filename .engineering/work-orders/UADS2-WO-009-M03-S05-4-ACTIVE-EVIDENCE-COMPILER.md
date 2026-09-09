# Work Order — UADS2-WO-009

Status: ACTIVE — M03 S05.4 CONTRACT FROZEN
Module: M03 — Host Capability Detector
Slice: S05.4 — Active Evidence Contract & Generic PCCR Compiler
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-009-m03-active-evidence-compiler`
Base SHA: `fbdd1927af7ea250fadac7db0725144dd4873b91`
Issue: #34
Risk: HIGH
ADR: ADR-UADS2-012 — ACCEPTED

## Objective

Complete the generic active-evidence semantic bridge before any Cursor/Codex-specific probe is authorized.

This slice evolves PCCR backward-compatibly and creates a schema-closed active evidence contract that can normalize a safe ProbeReceipt into conservative PCCR state.

## PCCR compatibility requirement

Current persisted PCCR 1.0 records MUST remain readable and evaluable.

New compiler emits PCCR 1.1.

PCCR 1.1 adds exactly two NPC negative proof kinds:
- `active-probe-recognized-unsupported`;
- `complete-enumeration-exclusion`.

Existing:
- `adapter-contract-impossible`.

A PCCR 1.0 record carrying either new 1.1 negative kind MUST be rejected.

No old proof may be silently rewritten.

## Active Evidence Contract

Create closed/versioned contract containing at minimum:
- contractId;
- availability PRODUCTION | TEST_ONLY;
- adapterId;
- capabilityId;
- probeId;
- descriptorDigest;
- parserId;
- resultMode EXACT_ACTIVE_RESULT | COMPLETE_ENUMERATION;
- supportedSummaries;
- unsupportedSummaries;
- evidenceClass E3;
- validityClass LEASED;
- leaseMs;
- policyDigest;
- contractDigest.

Contract is code-registered. Runtime callers select contractId only.

WO-009 production registry is intentionally EMPTY.
Only TEST_ONLY contracts/fixtures are permitted.

## Receipt binding

Before semantic mapping, require:
- receipt normalizes and digest validates;
- subjectDigest equals current subject;
- contract adapterId equals current basis adapterId;
- receipt probeId equals contract probeId;
- receipt capabilityId equals contract capabilityId;
- receipt descriptorDigest equals contract descriptorDigest;
- receipt parserId equals contract parserId;
- SUCCEEDED receipt has coherent reason/status/summary;
- identity-drift inconsistency cannot masquerade as success.

Any forged/inconsistent receipt fails closed.

## Mapping

### No receipt
UNKNOWN, non-enabling.

### BLOCKED
BLOCKED, non-enabling.

### FAILED / TIMED_OUT / OUTPUT_LIMIT / IDENTITY_DRIFT
UNKNOWN, non-enabling.

### SUCCEEDED + exact supported summary
SUPPORTED, E3, finite LEASED proof.

### SUCCEEDED + exact unsupported summary / EXACT_ACTIVE_RESULT
UNSUPPORTED, E3,
`negativeProofKind=active-probe-recognized-unsupported`.

### SUCCEEDED + exact unsupported summary / COMPLETE_ENUMERATION
UNSUPPORTED, E3,
`negativeProofKind=complete-enumeration-exclusion`.

### SUCCEEDED + unrecognized summary
UNKNOWN, never UNSUPPORTED.

## Validity

Active basis must bind:
- current subjectDigest;
- current adapterId/runtimeVersion;
- current adapterContractDigest;
- exact probe descriptorDigest as probeDefinitionDigest;
- exact active contract policyDigest;
- current configurationDigest.

Finite lease required.

Root/config/runtime/descriptor/policy drift or lease expiry makes proof STALE through existing CLDS evaluation.

## Evidence privacy

Evidence digest hashes normalized identity only.
Do not persist raw stdout/stderr, executable path or environment.

## Test-only probe fixtures

Minimal fixed TEST_ONLY probe descriptors may be added to `src/kernel/host-capability-probe.ts` for:
- supported exact result;
- unsupported exact result;
- complete enumeration exclusion;
- unrecognized result.

No production vendor descriptor.

## Required S04 closure

- M03-T011 missing receipt/executable context => UNKNOWN, not UNSUPPORTED.
- M03-T012 missing host context => UNKNOWN, not UNSUPPORTED.
- M03-T013 blocked/permission style result => BLOCKED/UNKNOWN.
- M03-T014 timeout => UNKNOWN/BLOCKED.
- M03-T015 unrecognized output => UNKNOWN.
- M03-T016 complete version/contract-bound enumeration exclusion => UNSUPPORTED.
- M03-T017 recognized exact unsupported active result => UNSUPPORTED.
- strengthen M03-T051 forged status/parser/evidence inconsistency fails closed.
- strengthen M03-T052 PCCR 1.0 cannot use 1.1 negative kinds.
- positive synthetic E3 path proves SUPPORTED only under exact TEST_ONLY contract.
- lease/descriptor/policy/config drift tests.

All WO-006/007/008 regressions remain mandatory.

## Out of scope

- no Cursor/Codex-specific probe;
- no production Active Evidence Contract;
- no real host capability claim;
- no future capability IDs;
- no host-dispatch migration;
- no M03 S07 freeze;
- no new package;
- no network/mutation/cost-bearing probe.

## Stop condition

STOP if:
- PCCR 1.0 compatibility breaks;
- absence/error becomes UNSUPPORTED;
- unrecognized summary becomes UNSUPPORTED;
- active UNSUPPORTED uses adapter-contract-impossible;
- forged receipt can enable truth;
- test-only contract can run as production contract;
- any vendor-specific host claim enters;
- HIGH/CRITICAL defect remains.
