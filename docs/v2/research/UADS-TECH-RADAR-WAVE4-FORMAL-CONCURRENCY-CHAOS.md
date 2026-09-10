# UADS V2 Technology Acquisition Radar — Wave 4

Status: CANDIDATE — research/deep-dive only
Scope: UADS V2 only. Hive V2 owns deep RAG/context/memory research. UGAS V2 owns media/generation/marketing-production research.

## 1. Formal State-Machine Engineering

### Market signal
Formal methods such as TLA+ are designed for concurrent/distributed systems and are valuable for checking safety properties that ordinary example-based tests can miss.

### UADS decision
**ADAPT** formal specification/model-checking principles for HIGH/CRITICAL invariants; do not require every feature to be written in a formal language.

### Target
Critical protocols SHOULD have a compact executable or model-checkable state machine with declared states, transitions, guards, terminal states, forbidden states, and safety/liveness invariants.

Candidate invention: **VSC — Verified State Contract**.

Required examples:
- ESE breaker: NORMAL -> WARN -> THROTTLED -> HARD_STOP -> RECONCILING
- governed command lifecycle
- rollout lifecycle
- durable execution/replay lifecycle
- agent delegation/lease lifecycle
- capability proof lease/drift lifecycle

## 2. Invariant Compilation

UADS already has ADR/DoD/policy invariants. Wave 4 promotes the idea that high-value invariants should become machine-checkable whenever practical.

Candidate invention: **EIC — Execution Invariant Compiler**.

Input sources:
- ADRs
- Definition of Done
- security policies
- economic safety floors
- state-machine contracts
- module dependency graph

Outputs may include runtime guards, property tests, model-check assertions, CI checks, graph constraints, and HEDS evidence requirements.

Core rule: prose-only invariant is weaker than executable invariant when the property can be represented mechanically.

## 3. Deterministic Replay Discipline

### Market signal
Durable workflow systems separate deterministic workflow decisions from non-deterministic external activities so history can be replayed safely.

### UADS decision
**ADAPT** this separation into DEF + SIR + DDJ.

Mandatory rule:
`REPLAY = deterministic decision reconstruction`; external effects are reconciled or re-invoked only through explicit SIR policy.

Candidate inventions:
- **DDJ — Deterministic Decision Journal**
- **RBC — Replay Boundary Contract**
- **RSC — Replay Safety Certificate**

Model/LLM calls, clock/randomness, network reads, database reads, filesystem mutations, GitHub writes, deployments and payments are never silently treated as deterministic replay operations.

## 4. Concurrency Correctness

### UADS decision
**PROMOTE AS DESIGN TARGET**.

Required concerns:
- duplicate delivery
- lost update
- stale write
- double spend
- double merge/deploy
- lease races
- cancellation races
- parent/child budget races
- concurrent retries
- command acknowledgement races
- checkpoint/write ordering

Candidate invention: **CIG — Concurrency Invariant Guard**.

Techniques:
- idempotency keys
- compare-and-swap/version checks
- monotonic sequence identities where required
- single retry ownership
- leases with explicit expiry semantics
- bounded queues/backpressure
- reconciliation instead of blind repetition
- deterministic conflict resolution only where semantically valid

## 5. Transaction and Saga Engineering

Not every cross-module operation can be a database transaction. UADS needs explicit distributed-operation semantics.

Candidate invention: **GTS — Governed Transaction Saga**.

Every multi-step effectful operation declares:
- ordered steps
- authoritative owner per step
- commit point(s)
- idempotency/reconciliation method
- compensation or no-compensation truth
- partial-success state
- timeout/cancel semantics
- UNKNOWN_OUTCOME treatment
- evidence/audit events

No operation may label itself "rolled back" unless authoritative effects are actually reversed or compensated.

## 6. Distributed Coordination

### UADS decision
**ADAPT minimal coordination semantics; reject consensus infrastructure by default** until M27/M28 proof requires it.

Needed concepts:
- work ownership leases
- fencing tokens for stale workers
- heartbeat/freshness semantics
- duplicate leader/worker detection
- bounded takeover
- deterministic queue ownership
- explicit partition/degraded behavior

Candidate inventions:
- **WOF — Work Ownership Fence**
- **FCL — Fenced Coordination Lease**
- **SWR — Safe Work Reassignment**

## 7. Jepsen-Style History Verification

### Market signal
Jepsen records concurrent operation histories, injects faults, and evaluates whether resulting histories still satisfy correctness models.

### UADS decision
**ADAPT** history-based fault verification for critical UADS coordination/economic/control protocols, without depending on Jepsen as a mandatory runtime component.

Candidate invention: **AHV — Adversarial History Verifier**.

AHV consumes AFR/HEP/DEF histories and validates invariants such as:
- no double economic reservation/charge
- no duplicated irreversible action
- no privileged action after lease revocation
- no child privilege amplification
- no command success without owner evidence
- no release promotion after failed mandatory gate

## 8. Chaos & Fault Engineering

### UADS decision
**ADOPT as release discipline for critical paths**.

Fault classes:
- process crash
- host restart
- network partition/delay/loss
- provider timeout
- MCP disconnect/catalog drift
- storage full/read-only/corruption
- clock skew where relevant
- duplicate delivery
- out-of-order event delivery
- stale capability/policy/credential
- cancellation during effect
- telemetry loss
- quota exhaustion
- budget hard-stop
- sandbox unavailable

Candidate invention: **CDF — Controlled Disruption Framework**.

Every chaos scenario is bounded by environment, blast radius, duration, economic budget, cleanup, expected invariant, and evidence capture.

## 9. Policy Verification

### Market signal
OPA supports policy unit tests, coverage and machine-readable results; this shows policy should be tested as code rather than trusted as static configuration.

### UADS decision
**ADOPT policy-test discipline; ADAPT engine choice**.

Candidate invention: **PVS — Policy Verification Suite**.

Required checks:
- deny-by-default
- privilege monotonicity/non-amplification
- missing/unknown input cannot widen authority
- stale policy blocks privileged action where required
- conflicting policies resolve deterministically
- policy bundles/configuration are versioned and attributable
- coverage floor for HIGH/CRITICAL policy paths

## 10. Formal Assurance Tiers

Candidate UADS assurance tiers:
- **A0 — Example tested**: ordinary unit/integration tests.
- **A1 — Property tested**: generated/property-based invariant tests.
- **A2 — State-machine verified**: transition and forbidden-state exploration.
- **A3 — Fault-history verified**: adversarial concurrent history plus failure injection.
- **A4 — Mechanically proved where justified**: selective formal proof for highest-value invariants.

Risk, blast radius and irreversibility determine the minimum tier. Not every UI feature needs A4; token-spend conservation or release authorization may justify stronger assurance.

Candidate invention: **RAAG — Risk-Adaptive Assurance Governor**.

## 11. New proprietary candidates

1. VSC — Verified State Contract
2. CIG — Concurrency Invariant Guard
3. GTS — Governed Transaction Saga
4. WOF — Work Ownership Fence
5. FCL — Fenced Coordination Lease
6. SWR — Safe Work Reassignment
7. AHV — Adversarial History Verifier
8. CDF — Controlled Disruption Framework
9. PVS — Policy Verification Suite
10. RAAG — Risk-Adaptive Assurance Governor
11. DDJ — Deterministic Decision Journal
12. RSC — Replay Safety Certificate

## 12. Enterprise pillars
- M27 Scale/Load: concurrency, backpressure, work ownership, contention and partition behavior.
- M28 Resilience/Recovery: chaos, replay, sagas, reassignment and reconciliation.
- M29 Operational Security: policy verification, privilege invariants and safe recovery.
- M30 Observability: authoritative histories, fault timeline, state-machine truth and degradation.
- M31 Release Engineering: assurance tier and chaos/formal proof become release inputs.

## 13. Decision
Wave 4 SHOULD move forward as UADS-native assurance architecture. TLA+/formal methods, Jepsen-style histories, Temporal replay semantics and OPA testing are sources of proven engineering ideas, not mandatory platform dependencies. Production promotion requires later owning-module implementation and proof.