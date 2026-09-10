# UADS V2 Technology Acquisition Radar — Wave 2

Status: CANDIDATE — research/deep-dive only
Scope: UADS V2 only. Hive V2 owns deep RAG/context/memory research. UGAS V2 owns media/generation/marketing-production research.

## 1. Durable Execution Fabric (DEF)

### Market signal
Durable workflow systems demonstrate the value of persisted execution state, deterministic replay, idempotent activities, explicit retries, and recovery after process/host failure.

### UADS decision
**ADAPT** durable-execution semantics into a dependency-light UADS-native fabric before considering any mandatory external workflow engine.

### Required DEF invariants
1. Every resumable execution has a stable execution identity and durable checkpoint lineage.
2. Replay separates deterministic decisions from side effects.
3. No side effect is repeated merely because replay re-enters a step.
4. Retry ownership is singular and bounded by M21/M07.
5. Crash/restart preserves ESE reservations, consumed budget, idempotency state, and terminal/unknown outcomes.
6. UNKNOWN_OUTCOME reconciles before any repeated external mutation.
7. Resume/replay never requires an LLM call merely to reconstruct deterministic state.
8. Checkpoint schema/version/runtime compatibility is proven through RCE/HDD before resume.
9. Old checkpoints can become STALE/INCOMPATIBLE rather than being force-loaded.
10. M30 exposes execution/checkpoint/replay/reconciliation truth.

### Candidate sub-technologies
- Durable Checkpoint Ledger (DCL)
- Replay Boundary Contract (RBC)
- Resume Compatibility Gate (RCG-DEF)
- Deterministic Decision Journal (DDJ)

## 2. Side-Effect Isolation Registry (SIR)

### UADS decision
**PROMOTE AS DESIGN TARGET**.

Every action classifies its effect profile before execution:
- PURE: deterministic computation, freely replayable when inputs/version match.
- CACHEABLE_READ: bounded external/local read whose cache/freshness semantics are explicit.
- IDEMPOTENT_EFFECT: external mutation with stable idempotency key and reconciliation proof.
- NON_IDEMPOTENT_EFFECT: must never be replayed blindly.
- IRREVERSIBLE_EFFECT: requires elevated authorization, explicit blast radius, recovery/compensation declaration, and audit evidence.

SIR record fields SHOULD include effectClass, ownerModule, tool/capability identity, idempotency strategy, reconciliation method, compensation/rollback support, proof refs, freshness/runtime compatibility, audit requirements, and maximum retry policy.

### Core invariant
`REPLAY_SAFE = deterministic path + effect classification + idempotency/reconciliation proof`.

No generic retry layer may assume that a successful-looking tool call is safe to repeat.

## 3. Safe Feature Rollout Fabric (SFRF)

### Market signal
Vendor-neutral feature-evaluation standards demonstrate the value of separating feature/control semantics from providers and enabling gradual release.

### UADS decision
**ADOPT semantics, ADAPT control plane**.

Required modes:
- OFF
- SHADOW
- CANARY
- LIMITED
- GENERAL
- DRAINING
- ROLLBACK
- KILLED

Every feature/capability rollout MUST declare owner, compatibility requirements, cohort/percentage or deterministic selector, success/failure metrics, economic budget, rollback/kill mechanism, max exposure window, and audit trail.

Model/router/harness changes SHOULD support SHADOW mode before promotion when cost permits.

Candidate inventions:
- Shadow Harness (SH)
- Rollout Evidence Envelope (REE)
- Capability Promotion Gate (CPG)
- Safe Rollback Receipt (SRR)

## 4. Supply-Chain Provenance & Attestation

### Market signal
GitHub Artifact Attestations and SLSA provenance provide verifiable linkage between an artifact and its source/build identity.

### UADS decision
**ADOPT provenance/attestation principles** for releasable artifacts.

Production release target:
`source SHA -> reviewed PR -> workflow identity -> immutable dependency/action pins -> build -> SBOM -> provenance attestation -> artifact digest -> release`.

M29 owns supply-chain/security policy; M31 owns release gates; M30 renders state; HEDS consumes attestation evidence where applicable.

Candidate inventions:
- Release Provenance Graph (RPG)
- Trusted Build Receipt (TBR)
- Attestation Continuity Gate (ACG)

## 5. High-Assurance Sandboxing

### Market signal
Sandbox runtimes such as gVisor add isolation from the host kernel but impose workload-dependent overhead. Current production reports show strong applicability to large agentic workloads, while official guidance cautions against sandboxing every workload indiscriminately.

### UADS decision
**EXPERIMENT as risk-selected profile**, never default solely for fashion.

Candidate profiles:
- STANDARD: native bounded process/tool controls.
- ISOLATED: container/process sandbox appropriate to host.
- HIGH_ASSURANCE: stronger syscall/filesystem/network isolation when host/capability proof and workload justify it.

Selection inputs: risk class, code/tool trust, credential exposure, network requirement, filesystem requirement, host capability proof, latency/I/O sensitivity, and measured overhead.

Candidate invention: Sandbox Assurance Selector (SAS), integrated with M03/M05/M07/M29/M30.

## 6. GenAI Observability / AgentOps

### Market signal
OpenTelemetry GenAI semantic conventions standardize model/tool/agent operation telemetry including model identity, latency, and token usage, while sensitive prompt/completion/tool content remains opt-in territory.

### UADS decision
**ADOPT compatibility, keep UADS truth model authoritative**.

Required mapping:
- UADS operation identities -> OTel-compatible low-cardinality attributes
- model/provider/profile/effort -> semantic attributes where stable
- input/output token usage -> M24 economic ledger attribution + M30 projection
- agent/tool spans -> AFR/HEP correlation
- prompts/completions/raw tool content -> OFF by default; explicit bounded diagnostic opt-in only

UADS OTCL/TCL/TPSC semantics remain authoritative for CURRENT/STALE/DEGRADED/UNAVAILABLE and source-vs-derived truth.

## 7. New cross-cutting proprietary candidates

1. **DCL — Durable Checkpoint Ledger**: append-only checkpoint identity/lineage with compatibility and integrity proofs.
2. **RBC — Replay Boundary Contract**: declares deterministic vs external-effect boundaries per execution step.
3. **REE — Rollout Evidence Envelope**: proves shadow/canary health before promotion.
4. **RPG — Release Provenance Graph**: graph linking source, review, build, SBOM, attestation and artifact.
5. **TBR — Trusted Build Receipt**: compact machine-verifiable build provenance receipt for HEDS/M31.
6. **SAS — Sandbox Assurance Selector**: risk/capability/performance-aware isolation profile selection.
7. **Agent Flight Recorder (AFR)**: reconstructable trajectory record, never hidden chain-of-thought.
8. **Runtime Compatibility Envelope (RCE)**: version/capability/environment proof for execution/resume.

## 8. Proof requirements before runtime promotion

### Durability
- crash after checkpoint then exact resume
- crash after external side effect before acknowledgement
- duplicate retry attempt proves no duplicate mutation
- restart preserves ESE and retry counters
- incompatible runtime/checkpoint refuses unsafe replay

### Rollout
- SHADOW produces no authoritative side effects
- CANARY bounded by deterministic cohort and economic budget
- automatic/manual kill prevents new dispatches
- rollback does not resurrect stale/unsafe state

### Supply chain
- artifact digest verifies against attestation
- wrong SHA/workflow/repository/artifact is rejected
- unsigned/untrusted artifact cannot be promoted through trusted release path

### Sandbox
- untrusted process cannot reach forbidden filesystem/network/tool surface
- host escape probes fail within threat model
- overhead measured independently for CPU/I/O/network classes

### Observability
- no secret/raw prompt leakage by default
- token/cost attribution survives retries/delegation
- missing telemetry never renders healthy/current
- AFR reconstruction remains bounded and privacy-safe

## 9. Enterprise pillars
- M27 Scale/Load: checkpoint throughput, replay pressure, sandbox density, telemetry overhead, rollout cohorts.
- M28 Resilience/Recovery: DEF/RBC/DCL, crash recovery, reconciliation, rollback.
- M29 Security/Supply Chain: SIR, sandbox profiles, provenance/attestation, policy enforcement.
- M30 Production Observability: AFR, AgentOps semantics, rollout and recovery truth.
- M31 Release Engineering: SFRF, attestation gates, trusted build receipts, rollback/kill.

## 10. Decision
Wave 2 should move forward as UADS-native architecture/proof targets. No mandatory Temporal, Dagger, gVisor, OTel Collector, Grafana, Kafka, or SaaS dependency is introduced by this document.