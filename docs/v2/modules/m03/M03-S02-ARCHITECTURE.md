# M03 S02 — Detailed Architecture & Boundaries

Status: FROZEN CANDIDATE — WO-005 HEDS PENDING

## Architecture objective

Create a deterministic host capability proof pipeline:

```text
Host Identity
    |
Passive Facts / Declaration / Safe Probe
    |
Evidence Normalizer
    |
Per-Capability Proof Compiler
    |
Freshness + Drift Validator
    |
Proof Store (sidecar)
    |
Compatibility Projector
    +----> M01/M04/M06/M23
    |
    +----> M30 operational events
```

## Components

### 1. Host Subject Resolver
Reuses adapter/root identity primitives.
Produces a privacy-safe subject identity containing only digests/bounded version metadata.

Must distinguish:
- adapter identity;
- runtime/executable identity when available;
- local vs cloud/headless execution class where proven;
- platform/architecture when relevant to a probe.

### 2. Probe Registry
Static, schema-closed registry of supported probe definitions.
No user-supplied arbitrary commands.

Each definition is content-digested and versioned.

### 3. Probe Planner
For each capability:
1. inspect reusable current proof;
2. try passive deterministic facts;
3. consume documented local declaration/enumeration as E1 discovery input; promote a complete identity-bound enumeration to E2 only when completeness and subject binding are proven;
4. choose safe active probe only if required;
5. otherwise return UNKNOWN/BLOCKED.

The planner uses CEL minimum evidence requirements with a global enabling floor of E2. E1 can never produce SUPPORTED.

### 4. Bounded Probe Executor
Initial design:
- no shell by default;
- fixed executable + args;
- sanitized/minimal environment;
- bounded stdout/stderr;
- timeout + AbortSignal;
- temp cwd where needed;
- no network/mutation in automatic initial policy;
- structured parser with version/digest.

### 5. Evidence Normalizer
Turns raw probe result into privacy-safe structured evidence.
Raw paths/secrets are not durable.

### 6. Proof Compiler
Produces PCCR records and deterministic `proofDigest`.

### 7. Freshness & Drift Validator
Applies CLDS before every proof reuse/projection.

### 8. Proof Store
Sidecar-only, content-addressed or deterministic per host/capability path.
Repository remains zero-project-footprint for runtime proof state.

### 9. Compatibility Projector
Maps rich M03 state back to existing `true | false | unknown`.
Only current valid SUPPORTED maps to true.

### 10. Operational Event Emitter
M03 emits semantic events such as:
- capability.probe.started
- capability.probe.completed
- capability.proof.updated
- capability.proof.stale
- capability.proof.blocked
- capability.drift.detected

These are logical event families. M30 owns final transport/schema/versioned operational surface.

## Planned proof record

```text
HostCapabilityProofRecord
  schema/version
  capabilityId
  state
  evidenceClass
  subjectDigest
  adapterId
  runtimeVersion?          privacy-safe/bounded
  probeId
  probeDefinitionDigest
  observedAt
  validUntil?              when time-bounded
  validityClass
  policyDigest
  evidenceDigest
  reasonCodes[]
  proofDigest
```

## Validity classes

- `IDENTITY_BOUND`: valid until subject/probe/policy basis changes.
- `LEASED`: identity-bound plus finite expiry.
- `ONE_SHOT`: not reusable across a decision boundary.

Exact TTL values are not hard-coded by S02. S04 benchmarks and later policy profile work determine safe defaults. A finite lease is mandatory for volatile host behavior.

## Negative proof rules

NPC is mandatory. Missing/timeout/denied/unrecognized results never become UNSUPPORTED.

## Ownership boundaries

M03 owns:
- host capability evidence semantics;
- probe definitions/execution safety for capability detection;
- proof state/freshness/drift;
- compatibility projection of host capability fact.

M03 does not own:
- model profile truth (M04);
- route selection (M05);
- effort choice (M06);
- worker execution policy (M01/M02);
- peer negotiation (M23);
- final telemetry transport/dashboard (M30);
- host-specific broad integration (M15/M16).

## Migration architecture for S05

Do not break current consumers in the first slice.

Planned migration:
1. introduce rich proof schema/store alongside current runtime snapshot;
2. compile/prove a bounded subset of capabilities;
3. project rich proofs into existing snapshot;
4. move consumers to proof-aware APIs incrementally;
5. deprecate coarse snapshot-wide provenance only after compatibility evidence.

## Enterprise classifications

### M27 Capacity/Load — COVERED BY DESIGN
Bound probe count/time/output; warm cache path; benchmark latency/bytes.

### M28 Resilience/Recovery — COVERED BY DESIGN
Atomic sidecar writes, corrupt proof fails closed, interrupted probe yields UNKNOWN, stale recovery deterministic.

### M29 Operational Security — COVERED BY DESIGN
No arbitrary shell, sanitized env, no durable secrets/absolute paths, static probe registry, spoof/tamper/replay tests.

### M30 Observability — COVERED BY DESIGN
Every probe/proof/drift transition emits privacy-safe attributable operational events.

### M31 Safe Operations — COVERED BY DESIGN
Additive compatibility-first schema rollout, feature-flagged proof-aware projection, rollback to conservative legacy UNKNOWN path.

## First S05 slice after approval

Recommended first vertical slice:
**PCCR core + compatibility projector for passive/deterministic-local evidence only.**

No host-specific active probe in the first slice.

That slice proves the proof/freshness architecture before adding mutable vendor-specific probes.
