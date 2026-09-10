# UADS2-WO-023 — P0 Technology Deep Dive

Status: CANDIDATE
Scope: UADS V2 only
Date: 2026-09-10

## 1. MCP 2026-07-28 + Tool Capability Firewall / Runtime Compatibility Envelope

### External signal
MCP 2026-07-28 moves the protocol core to stateless request/response, adds header-based routing, cacheable list results, formal extensions, Tasks extension, authorization hardening and a deprecation window. Legacy HTTP+SSE, Roots, Sampling and Logging are deprecated for new implementations.

### UADS decision
ADOPT compatibility target; ADAPT into UADS-native enforcement.

### UADS-native mechanisms
- TCF: Tool Capability Firewall.
- RCE: Runtime Compatibility Envelope.
- MCP Policy Gateway.
- Tool Catalog Integrity Record.
- Capability Lease + version/deprecation awareness.

### Required invariants
1. No tool is executable because it merely appears in a catalog.
2. Tool execution requires capability proof, policy authorization, economic allowance and risk admissibility.
3. Tool catalogs are cacheable only with identity/version/integrity/freshness evidence.
4. Header-based routing metadata must not become an authorization bypass.
5. Deprecated MCP features never become new UADS defaults.
6. Runtime mismatch is explicit UNKNOWN/BLOCKED, never silently compatible.
7. MCP integration must remain optional and adapter-bound; UADS core authority stays local.

## 2. Cedar + OPA -> Policy Decision Fabric (PDFab)

### External signal
Cedar structures authorization as principal/action/resource/context and separates policy from business logic. OPA generalizes policy-as-code through a Policy Decision Point queried by Policy Enforcement Points with structured input.

### UADS decision
ADAPT concepts, do not mandate either engine initially.

### Policy Decision Fabric
PDFab should provide a deterministic UADS authorization contract over:
- principal: user, agent, service, workflow, critic or system actor;
- action: command/tool/model/release/read/write capability;
- resource: file, repository, module, budget, provider, deployment, secret handle, tool target;
- context: request-scoped posture such as risk tier, runtime proof, ESE state, environment and freshness;
- obligations: audit evidence, confirmation, sandbox profile, allowed blast radius, rollback prerequisite;
- decision: ALLOW, DENY, REQUIRE_STEP_UP, REQUIRE_SANDBOX, REQUIRE_EVIDENCE, UNKNOWN.

### Required properties
- default deny for privileged effects;
- explicit forbid precedence for hard safety rules;
- deterministic policy digest/version;
- auditable decision reason and determining policies;
- local low-latency evaluation path;
- policy simulation/shadow mode before promotion;
- no network dependency for emergency stop;
- fail closed for mutation, fail visible for observability.

### Candidate external engine strategy
Cedar: strongest candidate for typed authorization semantics.
OPA/Rego: candidate for broader infrastructure/release policy.
Neither becomes mandatory until benchmarked against UADS-native evaluator for latency, footprint, debuggability and cross-platform packaging.

## 3. Agent Flight Recorder (AFR)

### External signal
Modern agent observability systems model executions as traces/trees spanning model calls, tool calls, handoffs, errors, latency and cost; trajectory evaluation inspects ordered tool-call sequences instead of final output alone.

### UADS decision
PROMOTE as UADS-native architecture candidate.

### Mission
AFR is the durable, bounded, privacy-safe black box of an agent execution. It must make an execution reconstructable enough for diagnosis, HEDS/AEG review and replay analysis without requiring raw hidden reasoning.

### Episode graph
Execution -> Agent -> Step -> Decision Record -> Tool/Model Call -> Result -> Evidence -> Finding -> Correction -> Terminal Outcome.

### Minimum AFR record
- execution/WO/project IDs;
- agent identity and ancestry;
- harness fingerprint;
- graph slice digest;
- model/provider/profile and requested/applied effort;
- tool identities, capability proofs and policy decisions;
- bounded context provenance refs and digests;
- token/cost reservations and consumption;
- retry/delegation lineage;
- timestamps and durations;
- errors/timeouts/cancellations;
- Evidence Bundle refs;
- AEG/HEDS findings and verdicts;
- side-effect identities and reconciliation state;
- terminal status.

### Privacy/safety
- no chain-of-thought storage requirement;
- raw prompts/content excluded by default;
- secret/token values forbidden;
- structured decision rationale and evidence refs replace hidden reasoning capture;
- retention bounded and tiered;
- integrity hash/chaining for audit-sensitive records.

## 4. AEG/HEDS trajectory integration

AEG must be able to inspect AFR trajectory evidence without trusting builder self-assessment.

### New review modes
- OUTPUT_REVIEW: artifacts and tests.
- TRAJECTORY_REVIEW: tool/model/action sequence.
- POLICY_REVIEW: authorization and capability path.
- ECONOMIC_REVIEW: ESE, retries, fanout, escalation and spend.
- SIDE_EFFECT_REVIEW: external effects, idempotency and reconciliation.

### Promotion rule
A HIGH/CRITICAL change may require one or more trajectory review modes selected by risk. A trivial LOW-risk change must not trigger expensive critics by default.

## 5. New proprietary candidates from this deep dive

### MCP Policy Gateway (MPG)
Combines RCE + TCF + PDFab at the tool boundary. It receives MCP metadata/catalog state, validates compatibility and proof, computes authorization and emits one auditable execution grant.

### Tool Catalog Integrity Record (TCIR)
Digest-bound, freshness-bound record of a discovered tool catalog. Prevents stale or replaced catalogs from silently widening capability.

### Policy Obligation Envelope (POE)
A policy decision may carry mandatory obligations such as sandbox=HIGH_ASSURANCE, maxBlastRadius=LOCAL, humanApproval=true, maxCost, or evidence class. Execution is unauthorized until obligations are satisfied.

### Trajectory Assurance Score (TAS)
Deterministic composite of trajectory properties such as unsupported tool attempts, retries, policy denials, no-progress loops, evidence completeness and side-effect reconciliation. It is diagnostic/triage, never a substitute for HEDS proof.

### Replay Safety Certificate (RSC)
Declares which steps of an AFR episode are replay-safe, simulation-only or side-effecting. Replay engines must obey it.

## 6. Proof requirements before runtime promotion

- policy decision latency and deterministic replay;
- capability/tool catalog substitution attack test;
- stale RCE/TCIR rejection;
- MCP deprecated-feature compatibility test;
- auth issuer/routing-confusion negative tests where applicable;
- AFR boundedness and privacy tests;
- crash/restart record continuity;
- side-effect replay safety;
- trajectory regression detection;
- AEG cost/quality delta against current HEDS-only path;
- cross-platform Node/Windows/Linux proof;
- M30 cockpit projection with truthful CURRENT/STALE/DEGRADED/UNAVAILABLE states.

## 7. Cross-project boundary

Hive V2 owns deep context/RAG/memory architecture. UADS may record bounded context provenance and consume Hive interfaces, but AFR/PDFab/TCF/RCE must not absorb Hive's semantic memory responsibilities.

UGAS V2 owns media/generation/marketing production. UADS may govern tools/workflows/cost/policy around UGAS, but does not own media generation algorithms or creative asset pipelines.
