# M03 S05.1 — PCCR Core Implementation Contract

Status: FROZEN FOR EXECUTION
Work Order: UADS2-WO-006
Issue: #28

## Intent

Build the proof substrate first. Do not solve vendor detection yet.

## Recommended module API

The executor may refine names for type safety, but the behavior below is mandatory.

### Core constants/types
- host capability proof schema/version;
- proof states;
- CEL evidence classes;
- validity classes supported in Slice 1: IDENTITY_BOUND, LEASED;
- bounded negative proof kind for Slice 1: adapter-contract-impossible.

### Required behaviors/functions
1. deterministic canonical proof digest excluding `proofDigest`;
2. strict proof normalization + schema validation;
3. proof compiler enforcing E2 floor and NPC;
4. proof evaluation against a caller-supplied current validity basis;
5. atomic global proof persistence;
6. strict proof read/rejection;
7. conservative legacy RuntimeCapabilitySnapshot projection;
8. best-effort M30 evidence lifecycle telemetry on persistence.

## Storage

```text
<UADS_HOME>/
  registry/
    runtime/
      capabilities/
        proofs/
          <subjectDigest>/
            <capabilityId>.json
```

Derive the proof directory from existing `paths.runtimeCapabilities`; do not add a new UadsPaths field unless objectively necessary.

## Proof subject rule

Do **not** use the existing `RuntimeCapabilitySnapshot.identityDigest` as PCCR `subjectDigest` because that digest includes capability values/provenance and changes when projection changes.

Slice 1 receives a stable privacy-safe `subjectDigest` from the caller/current validity basis.

A later host integration slice may standardize subject construction from host/root/executable facts.

## Canonical PCCR fields

Recommended shape:

```text
schema
schemaVersion
capabilityId
state
evidenceClass
subjectDigest
adapterId
runtimeVersion
probeId
validityBasis {
  adapterContractDigest
  probeDefinitionDigest
  policyDigest
  configurationDigest
}
observedAt
validUntil
validityClass
evidenceDigest
negativeProofKind
reasonCodes[]
proofDigest
```

No raw evidence.

## Compile rules

SUPPORTED:
- evidenceClass >= E2;
- negativeProofKind = null.

UNSUPPORTED:
- evidenceClass >= E2;
- Slice 1 requires negativeProofKind = adapter-contract-impossible;
- adapterContractDigest must be bound.

UNKNOWN/BLOCKED:
- may represent weaker/incomplete evidence but never enable.

STALE:
- always projects unknown.

LEASED:
- validUntil required and later than observedAt.

IDENTITY_BOUND:
- validUntil must be null unless implementation gives a stricter safe rule and tests it.

## Evaluation rules

Before projection/reuse:
1. proof integrity/schema valid;
2. subjectDigest exact match;
3. adapterContractDigest exact match;
4. probeDefinitionDigest exact match;
5. policyDigest exact match;
6. configurationDigest exact/null semantics match;
7. if LEASED, now <= validUntil;
8. if now < observedAt in a clock-regression scenario, fail closed to STALE/UNKNOWN.

Basis drift produces effective STALE, not TRUE/FALSE reuse.

Tamper/corruption is rejected, not silently converted to a valid proof.

## Legacy projector

Input:
- a legacy RuntimeCapabilitySnapshot for metadata;
- PCCR records for zero or more of the ten current capability IDs;
- current validity basis per capability.

Output:
- same legacy schema;
- all capability values begin at `unknown`;
- only valid evaluated PCCR changes them;
- valid SUPPORTED => true;
- valid UNSUPPORTED => false;
- all other states => unknown;
- recompute identityDigest;
- keep snapshot-wide provenance conservative, not falsely `proven`.

A legacy input `true` with no PCCR MUST become `unknown`.

## Telemetry

Do not change M30 event enums.

Use existing:
- eventType: `evidence.lifecycle`;
- sourceComponent: `m03.host-capability`.

Durable payload may contain bounded IDs/digests/state, never raw paths/evidence.

Proof persistence succeeds independently from telemetry. A telemetry write failure is surfaced separately but cannot roll back truth or transform the proof state.

## Tests

Test names or metadata MUST map clearly to the frozen S04 IDs:
T001-T010, T018-T030, T045-T060.

Do not silently mark an S04 ID covered by a test that does not actually exercise it.

## Benchmark implementation

Benchmarks may be embedded in focused tests/evidence scripts if deterministic and bounded. Avoid flaky wall-clock assertions in ordinary unit tests. Report measured values separately while keeping correctness assertions deterministic.

## STOP

Do not proceed into active probe executor architecture in this slice.
