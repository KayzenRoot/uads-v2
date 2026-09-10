# M30 S02 — Architecture

Status: CANDIDATE
Risk: HIGH
Work Order: UADS2-WO-017
Issue: #55

## 1. Architectural thesis
M30 is the operational nervous system and control plane of UADS V2. It observes, correlates, evaluates freshness, projects state and orchestrates governed commands, but it never becomes authoritative for business/domain state owned by other modules.

The dashboard is therefore a **Living Operations Organism** composed from objective module-owned sources and governed command capabilities.

## 2. Core component model

### 2.1 Source Adapter Boundary
Each module exposes bounded operational state/events through versioned adapters. Adapters declare source identity, schema version, observed timestamp, freshness policy and ownership.

Rules:
- no raw arbitrary object ingestion;
- no secrets/raw prompts/sensitive paths by default;
- no implicit health from source silence;
- malformed source data is rejected or degraded, never normalized into fake health.

### 2.2 Operational Truth Confidence Layer (OTCL)
OTCL evaluates operator-visible datum state from evidence.

Canonical states:
- CURRENT
- STALE
- DEGRADED
- UNAVAILABLE

A datum projection carries at minimum sourceId, observedAt, evaluatedAt, freshnessLease, lineage, confidence state and bounded reason code.

OTCL never invents a value when the source is missing.

### 2.3 Telemetry Continuity Ledger (TCL)
TCL records continuity evidence independently of presentation.

Tracks bounded sequence windows, known gaps, rejected events, drops, reconnect boundaries, replay range and unresolved uncertainty.

A stream cannot claim continuity if the ledger has an unresolved gap.

### 2.4 Adaptive Observability Budget Controller (AOBC)
AOBC governs the cost of observability itself.

Budgets:
- CPU/time overhead;
- event/byte throughput;
- storage/retention;
- query work;
- client fan-out;
- cardinality and attribute-value growth.

Degradation ladder is deterministic and evidence-emitting: reduce optional detail/export/sampling before degrading critical workload execution. Mandatory truth/health evidence is protected from optional high-volume telemetry competition.

CBF cardinality firewall behavior is part of AOBC, not a separate top-level subsystem.

### 2.5 Truth/Projection Separation Contract (TPSC)
Every projection is typed as SOURCE, DERIVED or INFERRED.

SOURCE can reference domain-owned evidence but does not transfer ownership to M30.
DERIVED is deterministic computation over cited inputs.
INFERRED is probabilistic/advisory and must expose evidence links and uncertainty.

No DERIVED/INFERRED value may be fed back as authoritative domain truth without the owning module explicitly accepting it through a governed contract.

### 2.6 Privacy-Safe Correlation Fabric (PSCF)
PSCF provides bounded opaque correlation identifiers linking project, Work Order, request, execution, module, model/tool activity, release and host-capability evidence where available.

Raw prompts, credentials, arbitrary paths and private payloads are not correlation keys.

### 2.7 Living Operations Control Plane (LOCP)
LOCP composes a state-and-command graph across modules.

Each node exposes:
- identity/owner;
- lifecycle/health/freshness;
- dependencies;
- active work;
- resource pressure;
- evidence links;
- governed capabilities/actions.

LOCP never mutates domain state directly.

Every command envelope includes:
- commandId and version;
- ownerModule;
- actor/authorization context;
- risk class;
- preconditions;
- idempotency key/semantics;
- requested effect;
- timeout/cancellation semantics;
- blast radius;
- rollback/recovery contract;
- audit correlation;
- terminal outcome state.

Terminal outcomes: SUCCEEDED, FAILED, REJECTED, CANCELLED, TIMED_OUT, UNKNOWN_OUTCOME.
UNKNOWN_OUTCOME must remain explicit until reconciled by owner evidence.

### 2.8 Projection & Query Plane
Builds bounded snapshots, aggregates, SLI/SLO/error-budget projections, alerts, timelines and drill-down views from OTCL/TCL/TPSC-governed inputs.

Queries have explicit result bounds, freshness metadata and degradation information.

### 2.9 Realtime Delivery Plane
SSE remains default for server-to-operator live state/events in local-first mode.

Reconnect uses explicit cursor/continuity semantics integrated with TCL. A reconnect cannot silently skip known gaps.

Bidirectional streaming remains optional and future-only where genuine interaction semantics require it; commands do not require WebSocket because governed request/receipt APIs are sufficient by default.

### 2.10 Local-to-Distributed Continuity Bridge (LDCB)
Architecture seam only.

Local immutable event semantics, identity, truth/confidence and correlation contracts must survive later distributed ingest/query/object-storage adapters unchanged.

Kafka-compatible/durable distributed ingest and independent read/write scaling require M27 load evidence and M28 resilience design before promotion.

## 3. Data flow
1. owning module emits bounded state/event evidence;
2. Source Adapter validates schema/identity;
3. PSCF binds privacy-safe correlations;
4. TCL records continuity/gap state;
5. OTCL evaluates freshness/confidence;
6. AOBC enforces observability budgets and records degradation;
7. TPSC labels projection class and lineage;
8. Projection/Query Plane produces bounded operator views;
9. Realtime Delivery distributes updates with cursor/freshness metadata;
10. LOCP renders state/actions and routes commands only to owner contracts.

## 4. Command flow
1. operator selects an advertised governed capability;
2. LOCP resolves owner/version/risk/preconditions;
3. authorization policy is evaluated;
4. command envelope is issued to owning module;
5. owner accepts/rejects and emits audit receipt;
6. subsequent domain-owned evidence updates operational state;
7. LOCP displays terminal or UNKNOWN_OUTCOME truthfully;
8. rollback/recovery is a separate governed command, never an implicit UI mutation.

## 5. Partial failure model
The dashboard degrades by source and capability, not by pretending global health.

If one source fails:
- independent healthy sources remain visible;
- failed source becomes STALE/DEGRADED/UNAVAILABLE with reason;
- actions dependent on uncertain preconditions are disabled/rejected;
- evidence gaps remain visible;
- command outcomes are never inferred from telemetry silence.

## 6. Experimental extensions
### COG — Causal Operations Graph
May correlate temporal/resource/dependency relationships. Causal suggestions are INFERRED unless deterministic evidence proves causality.

### AAE — Adaptive Attention Engine
May rank operator attention using severity, impact, freshness and confidence, but cannot suppress unresolved HIGH/CRITICAL or uncertain evidence from drill-down and audit views.

## 7. Dashboard information architecture
Primary surfaces:
- system pulse/global health;
- module/dependency organism map;
- Work Orders, agents, tasks, queues and model routing;
- compute/resource physiology: CPU/GPU/RAM/VRAM/storage/network/process;
- performance: latency/throughput/saturation/retries/timeouts/cancellations;
- telemetry: events/logs/traces/correlation and continuity;
- economics: tokens/cost/budget/provider/model attribution where objectively available;
- engineering: GitHub/CI/reviews/checkpoints/evidence/releases;
- capability truth: host proof/drift/staleness;
- security/policy/supply-chain posture;
- context/RAG/cache/memory health when owning modules exist;
- incidents/alerts/SLO/error budgets/runbooks;
- observability self-health: freshness/gaps/loss/cardinality/overhead;
- history and causal timeline.

Progressive disclosure: overview -> subsystem -> entity -> raw bounded evidence.

## 8. Enterprise pillar interactions
- M27 Scale/Load: defines capacity targets, benchmark environments and scale-out trigger evidence.
- M28 Resilience/Recovery: defines recovery, replay durability, failover and degraded-mode obligations.
- M29 Operational Security: defines authorization, policy, secret/privacy constraints and supply-chain controls.
- M30 Observability/Ops: owns transport/projection/freshness/continuity/operator surface.
- M31 Release Engineering: consumes M30 health/evidence for release, rollback and continuous-operations decisions.

## 9. S03 failure/security questions
- authorization confusion or command spoofing;
- duplicate commands and replay attacks;
- UNKNOWN_OUTCOME reconciliation;
- stale precondition races;
- telemetry amplification/DoS/cardinality explosion;
- event forgery/corruption/clock skew;
- SSE client storms/backpressure;
- partial disk/full-disk behavior;
- privacy leakage through correlation/diagnostics;
- dashboard compromise blast radius;
- operator mistakes and unsafe controls;
- causal inference presented as fact.

## 10. S04 proof obligations
- deterministic OTCL transitions;
- continuity/gap/replay correctness;
- command idempotency/authorization/audit/rollback behavior;
- bounded resource/cardinality behavior;
- AOBC overhead reduction and B6 regression benchmark;
- snapshot/query latency by target environment;
- ingest throughput and retention pressure;
- partial failure correctness;
- no fabricated live state;
- privacy/sanitization tests;
- semantic continuity of local-to-distributed adapters if promoted.

## 11. Non-negotiable invariants
- telemetry never outranks domain truth;
- dashboard/control plane never becomes a second source of truth;
- no stale/missing value rendered as current;
- no command without owner/version/auth/audit/terminal-state semantics;
- no silent gap/loss claim;
- no unbounded telemetry path;
- no heavy synchronous observability requirement on critical workload execution;
- no mandatory external observability stack for local-first operation;
- GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT.