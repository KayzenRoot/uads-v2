# M03 S04 — Test & Benchmark Design

Status: FROZEN CANDIDATE — WO-005 HEDS PENDING

Testing is frozen before S05 implementation.

## Test strategy

Core proof semantics are validated with deterministic synthetic fixtures first.
Vendor-specific active probes are separate EXPERIMENT cases and cannot be required for the first PCCR slice.

## Mandatory test corpus

### A. Proof state and projection
- M03-T001 valid E2/E3 SUPPORTED proof projects `true`.
- M03-T002 valid NPC UNSUPPORTED proof projects `false`.
- M03-T003 UNKNOWN projects `unknown`.
- M03-T004 BLOCKED projects `unknown`.
- M03-T005 STALE projects `unknown`.
- M03-T006 declaration below minimum CEL rung cannot project `true`.
- M03-T007 legacy `true` cannot self-upgrade into PCCR SUPPORTED.
- M03-T008 same inputs produce same proof digest.
- M03-T009 changed evidence produces a different proof digest.
- M03-T010 malformed/unknown capability ID fails schema validation.

### B. Negative Proof Contract
- M03-T011 missing executable => UNKNOWN, not UNSUPPORTED.
- M03-T012 missing host directory => UNKNOWN/host unavailable, not UNSUPPORTED.
- M03-T013 permission denied => BLOCKED/UNKNOWN.
- M03-T014 timeout => UNKNOWN/BLOCKED.
- M03-T015 unrecognized output => UNKNOWN.
- M03-T016 complete version-bound enumeration excluding feature => UNSUPPORTED.
- M03-T017 recognized exact unsupported active-probe result => UNSUPPORTED.
- M03-T018 static impossible-by-contract fact with matching contract digest => UNSUPPORTED.
- M03-T019 changed contract digest invalidates prior static negative proof.
- M03-T020 partial enumeration cannot create negative proof.

### C. Freshness and drift
- M03-T021 runtime version drift => STALE.
- M03-T022 executable/subject identity drift => STALE.
- M03-T023 target-root identity drift => STALE.
- M03-T024 adapter contract digest drift => STALE.
- M03-T025 probe definition/parser digest drift => STALE.
- M03-T026 policy digest drift => STALE/re-evaluation.
- M03-T027 evidence artifact digest mismatch => rejected.
- M03-T028 finite lease expiry => STALE.
- M03-T029 wall-clock regression sanity failure => STALE/UNKNOWN.
- M03-T030 unchanged identity-bound proof remains reusable.

### D. Probe safety
- M03-T031 arbitrary command descriptor rejected.
- M03-T032 shell execution descriptor rejected for automatic policy.
- M03-T033 unbounded/free-form arguments rejected.
- M03-T034 inherited secret-like environment does not reach child.
- M03-T035 stdout ceiling enforced.
- M03-T036 stderr ceiling enforced.
- M03-T037 timeout aborts hung probe.
- M03-T038 mutating probe auto-run is BLOCKED.
- M03-T039 network probe auto-run is BLOCKED.
- M03-T040 cost-bearing probe auto-run is BLOCKED.
- M03-T041 unsafe executable resolution/PATH shadow fails closed.
- M03-T042 executable identity changes between pre/post check => no proof commit.
- M03-T043 two concurrent same-capability probes single-flight to one authoritative commit.
- M03-T044 crash before atomic write leaves no trusted partial proof.

### E. Security / replay / privacy
- M03-T045 cross-host proof replay rejected.
- M03-T046 cross-adapter proof replay rejected.
- M03-T047 cross-root proof replay rejected.
- M03-T048 tampered proof digest rejected.
- M03-T049 control-character/secret-like evidence rejected/redacted.
- M03-T050 durable record contains no absolute host path.
- M03-T051 forged reason/evidence state inconsistent with parser rejected.
- M03-T052 old schema proof cannot silently downgrade validation.

### F. Consumer and governance boundaries
- M03-T053 M04 model capability cannot make host proof true.
- M03-T054 M06 effort policy cannot make `reasoningEffortControl` true.
- M03-T055 M23 peer declaration cannot overwrite local host truth.
- M03-T056 proven `parallelAgents=true` does not bypass ADR-UADS2-002.
- M03-T057 M30 transport failure does not mutate proof result.
- M03-T058 Hive absent preserves complete SOLO detection path.
- M03-T059 rollback to legacy compatibility never increases enabled capability set.
- M03-T060 unknown future capability fails closed.

### G. Cross-platform
- M03-T061 Linux executable identity fixture.
- M03-T062 Windows executable identity fixture.
- M03-T063 case-sensitive root identities remain distinct.
- M03-T064 case-insensitive/equivalent root handling follows existing v2 binding.
- M03-T065 Windows hidden process/no-shell probe contract.
- M03-T066 POSIX no-shell probe contract.

## Benchmark plan

### B1 — Warm proof validation
Input: current valid proof, no active probe.
Target: p95 ≤ 50 ms.

### B2 — Local probe set
Input: initial M03 capability vocabulary with synthetic/local read-only probes.
Target: p95 ≤ 2 s per host; no individual automatic probe > 5 s.

### B3 — Proof storage
Target: ≤ 64 KiB durable proof state per host under initial vocabulary.

### B4 — Safety corpus
Target:
- unsafe enablement false positives = 0;
- tamper/replay acceptance = 0;
- covered drift miss rate = 0;
- absence→UNSUPPORTED mistakes = 0.

### B5 — Probe storm
100 simultaneous callers for the same subject/capability.
Target:
- one authoritative active probe in flight by default;
- all callers receive same committed result;
- no unbounded queue/memory growth.

### B6 — M30 telemetry overhead
Compare probe/proof path with event emission enabled/disabled.
Target: operational event emission adds <5% median CPU-time overhead in synthetic local benchmark, or an explicit justified exception.

### B7 — Recovery
Inject crash/corrupt/partial state.
Target: zero partial/corrupt proof accepted; deterministic re-probe/recovery.

## Acceptance hierarchy

1. Safety/correctness.
2. Determinism/integrity.
3. Privacy/security.
4. Resilience.
5. Performance.

A performance win can never justify an unsafe TRUE.

## First S05 slice proof obligations

The first PCCR/passive-proof slice must satisfy at minimum:
T001-T010, T018-T030, T045-T060, B1, B3, B4 and B7.

Active-probe-specific T031-T044 and B2/B5 become mandatory before any host-specific active probe is promoted beyond EXPERIMENT.
