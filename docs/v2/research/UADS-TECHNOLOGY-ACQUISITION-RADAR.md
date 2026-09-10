# UADS V2 Technology Acquisition Radar

Status: ACTIVE DISCOVERY
Work Order: UADS2-WO-023
Issue: #70
Scope: UADS V2 only
Cross-project boundary: Hive V2 owns deep context/RAG/memory; UGAS V2 owns media/generation/marketing-production systems.

## Purpose

This radar continuously mines external technologies, protocols, architectural patterns, and research ideas that can strengthen UADS V2 as an agentic execution, orchestration, review, safety, observability, and operations platform.

External technologies are evidence and inspiration, not automatic dependencies. Every candidate must be classified as ADOPT, ADAPT, EXPERIMENT, or REJECT DEFAULT and mapped to an owning UADS module before implementation.

## Evaluation dimensions

Each candidate is evaluated on maturity, architecture fit, dependency weight, performance impact, security impact, economic impact, portability, offline/local-first compatibility, observability, recovery semantics, proofability, migration risk, and cross-project ownership.

## Wave 1 Technology Cards

### TAR-001 — Temporal durable execution concepts
Disposition: ADAPT
Primary value: crash/restart-resilient workflow execution, durable state progression, retry/recovery semantics, long-lived execution.
UADS fit: M21 retry ownership, M28 resilience/recovery, orchestration runtime, Harness/Graph program.
Decision: adopt the durable-execution principles, deterministic replay discipline, explicit activities/side effects, durable timers, idempotency, and reconciliation concepts. Do not make Temporal Server a mandatory UADS dependency at this stage.
Reason: UADS is local-first/global-first and must remain lightweight by default. A heavy control-plane service is premature until M27/M28 benchmarks justify it.
Candidate invention unlocked: Durable Execution Fabric (DEF), a UADS-native bounded durable execution layer.
Proof required: crash recovery, exact-once effect intent via idempotency/reconciliation, bounded retry ownership, restart accounting conservation, deterministic-state compatibility.

### TAR-002 — Cedar authorization model
Disposition: ADAPT
Primary value: explicit principal-action-resource-context authorization semantics with deny-by-default behavior.
UADS fit: M29 operational security, LOCP governed commands, Tool Capability Firewall, agent delegation.
Decision: use PARC-style authorization semantics as a design reference for a UADS-native policy envelope. Evaluate Cedar engine embedding separately before any runtime dependency decision.
Candidate invention unlocked: Policy Decision Fabric (PDFab), combining actor/agent identity, requested capability, resource, execution context, proof level, economic envelope, and blast radius.
Proof required: deterministic allow/deny, fail-closed unknowns, policy version identity, audit evidence, no privilege gain through delegation.

### TAR-003 — Open Policy Agent / Rego
Disposition: EXPERIMENT
Primary value: mature general-purpose policy-as-code engine and decision/enforcement separation.
UADS fit: M29 policy enforcement, CI governance, release gates, runtime command policies.
Decision: valuable reference and potential optional policy backend, but not a mandatory dependency yet. Cedar-style request semantics may better fit capability authorization while OPA may fit broader compliance/pipeline policy.
Proof required: startup/runtime overhead, local embedding/sidecar tradeoff, policy testability, versioning, fail-closed behavior, Windows portability, schema alignment.

### TAR-004 — OpenFeature
Disposition: ADOPT SEMANTICS / EXPERIMENT RUNTIME
Primary value: vendor-neutral feature-flag evaluation, providers, hooks, context, events, and observability conventions.
UADS fit: M31 safe release engineering, M30 dashboard, runtime profiles, experimental capabilities, emergency feature disable.
Decision: adopt provider-neutral typed flag semantics and lifecycle concepts. Evaluate direct SDK dependency only after runtime proof.
Candidate invention unlocked: Safe Feature Rollout Fabric (SFRF), extending feature flags with proof gates, ESE, blast-radius classes, automatic rollback eligibility, and M30 truth projection.
Proof required: deterministic local provider, offline behavior, fail-safe defaults, no stale flag shown as authoritative, rollout evidence and rollback audit.

### TAR-005 — MCP 2026-07-28
Disposition: ADOPT COMPATIBILITY TARGET
Primary value: current interoperability standard for agent/tool integration.
Notable architecture changes: stateless protocol core, self-describing requests, header-based routing, cacheable deterministic list results, Tasks extension, authorization hardening, formal extensions, deprecation of legacy patterns.
UADS fit: Tool Capability Firewall, host capability proof, adapter layer, task execution, routing/security.
Decision: UADS MCP work should target the current specification semantics instead of freezing around legacy session assumptions. No MCP-declared capability may become trusted execution authority without UADS capability proof/policy checks.
Candidate invention unlocked: Runtime Compatibility Envelope (RCE), binding protocol version, extension set, tool schema digest, authorization proof, host capability evidence, and compatibility state.
Proof required: protocol-version negotiation/identity, schema validation, cache correctness, auth issuer binding, stale catalog invalidation, tool capability firewall enforcement.

### TAR-006 — OpenTelemetry GenAI semantic conventions
Disposition: ADOPT COMPATIBILITY / ADAPT PRIVACY
Primary value: standardized GenAI telemetry vocabulary for model operations, token usage, latency, tools, traces, metrics, and events.
UADS fit: M30 Living Operations Organism, M24 cost attribution, M05 model routing, M06 effort, M07 economic safety.
Decision: preserve OTEL-compatible naming/export boundaries while keeping UADS operational truth authoritative. Raw prompt/completion/tool content remains opt-in and privacy-gated, never default telemetry.
Candidate invention unlocked: Agent Flight Recorder (AFR), a bounded evidence-linked operational history for agent/model/tool trajectories.
Proof required: cardinality budgets, redaction, token/cost reconciliation, correlation stability, low overhead, no prompt/secret leakage.

### TAR-007 — GitHub Artifact Attestations + SLSA provenance
Disposition: ADOPT FOR RELEASE ARTIFACTS
Primary value: cryptographically signed build provenance and verifiable linkage between artifact, workflow, repository, commit, and triggering event.
UADS fit: M29 supply-chain security, M31 release engineering, evidence system.
Decision: target attestations for releasable binaries/packages/manifests, not noisy per-test artifacts. Verification policy matters as much as generation.
Candidate invention unlocked: Decision-to-Proof Trace (DPT) extension from source decision through CI/HEDS to release artifact provenance.
Proof required: attestation generation/verification, immutable workflow pinning, SBOM linkage where applicable, reproducible release identity.

### TAR-008 — Dagger pipeline/caching semantics
Disposition: ADAPT / EXPERIMENT
Primary value: portable DAG-style build/test pipelines and content-aware caching.
UADS fit: Harness Engineering, CI portability, deterministic test/eval execution, side-effect classification.
Decision: study its caching and function purity boundaries. Do not replace GitHub Actions or introduce Dagger as mandatory infrastructure yet.
Candidate invention unlocked: Side-Effect Isolation Registry (SIR), explicitly marking pure/cacheable operations versus effectful/non-cacheable operations and required replay/idempotency contracts.
Proof required: cache soundness, side-effect isolation, Windows/local portability, performance benefit, deterministic invalidation.

### TAR-009 — gVisor
Disposition: EXPERIMENT AS HIGH_ASSURANCE PROFILE
Primary value: stronger container isolation from the host kernel and neighboring workloads.
UADS fit: M29 sandboxing, Tool Capability Firewall, untrusted tool/code execution.
Decision: never default for every execution. Evaluate as a Linux HIGH_ASSURANCE sandbox option where risk justifies overhead and the host proves availability.
Proof required: startup/runtime overhead, filesystem/network restrictions, tool compatibility, escape resistance assumptions, degraded behavior on unsupported hosts.

### TAR-010 — UADS Governed Gauntlet Loop / Adaptive Evidence Gauntlet
Disposition: ADAPT, CANDIDATE FOR PROMOTION
Primary value: builder does not grade itself; independent/fresh critics challenge implementation against a concrete quality bar and evidence.
UADS fit: M08 review, M22 evidence-driven escalation, M07 ESE, M05/M06 model routing and effort, M24 cost, M30 cockpit, M31 release gates.
Decision: never import an unbounded external loop. UADS version must be bounded by maxRounds, maxCritics, maxParallelCritics, maxTokens, maxCost, maxWallTime, maxEscalations, stopConditions, qualityBar, and evidenceRequirements.
Terminal unresolved state: GAUNTLET_BLOCKED, not endless delegation.
Critic escalation: cheapest qualified/low effort first; escalate model/effort only when surviving evidence justifies it.
Candidate proprietary system: Adaptive Evidence Gauntlet (AEG) with Gauntlet Evidence Trail consumed by HEDS.
Proof required: measured defect detection improvement, bounded cost, no self-review leakage, critic diversity relevance, deterministic stop conditions, zero ESE bypass.

## Cross-project boundary matrix

UADS V2 owns: execution, orchestration, agents, tools, harnesses, reviews, policy, runtime safety, cost governance, observability, CI/release, operator control plane.

Hive V2 later owns: retrieval architecture, memory tiers, semantic/episodic/project memory, RAG, embeddings/vector/search strategies, context compression, knowledge graphs when used for memory/retrieval authority, memory freshness and forgetting.

UGAS V2 later owns: image/video/audio generation, creative pipelines, media models, asset consistency, storytelling production, marketing/campaign automation, publishing and creative quality systems.

Shared technology must have one authoritative owner plus explicit interfaces. No duplicated truth stores or overlapping control planes.

## Priority queue for Wave 2 deep dives

P0: MCP 2026-07-28 + Tool Capability Firewall + Runtime Compatibility Envelope.
P0: Policy Decision Fabric using Cedar/OPA lessons.
P0: Adaptive Evidence Gauntlet bounded by ESE and evidence-driven escalation.
P0: Agent Flight Recorder + OpenTelemetry-compatible GenAI semantics.
P1: Durable Execution Fabric using Temporal lessons without mandatory Temporal infrastructure.
P1: Safe Feature Rollout Fabric using OpenFeature semantics.
P1: Supply-chain provenance with GitHub attestations/SLSA.
P1: Side-Effect Isolation Registry using reproducible/caching semantics.
P2: gVisor HIGH_ASSURANCE host profile after portability/performance proof.

## Enterprise pillar coverage

M27 Scale/load: bounded queues, traversal, cardinality, caching, and optional later distributed execution.
M28 Resilience/recovery: durable execution, replay/reconciliation, explicit partial failure and restart truth.
M29 Operational security/supply chain: policy-as-code, capability authorization, sandboxing, MCP auth, provenance/attestation.
M30 Production observability/realtime ops: GenAI semantic telemetry, Agent Flight Recorder, truthful rollout/policy/runtime state.
M31 Release engineering/safe ops: feature rollout, attestations, proof gates, rollback, exact-head evidence.

## Initial architectural rule

The radar may freeze a technology decision but MUST NOT silently add a runtime dependency. A dependency enters production only through its owning module's implementation slice with benchmark, security, failure/recovery, economic-safety, exact-head CI, and HEDS evidence.
