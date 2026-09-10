# UADS V2 — Graph + Harness Engineering Program

Status: CANDIDATE CROSS-MODULE ARCHITECTURE
Work Order: UADS2-WO-022
Issue: #68
Risk: HIGH

## 1. Decision
UADS V2 adopts Graph Engineering and Harness Engineering as transversal engineering disciplines. They are implemented through existing authoritative modules and shared contracts rather than by creating duplicate domain owners.

Primary objective: improve correctness, context precision, cost efficiency, reproducibility, impact analysis, evidence quality, and long-term maintainability while preserving GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT and local-first operation.

## 2. Graph Engineering
The graph fabric models explicit typed relationships among requirements, ADRs, modules, files, symbols, tests, evidence, Work Orders, agents, executions, model calls, costs, incidents, releases and operational state.

### 2.1 Engineering Graph Compiler (EGC)
Compile canonical repository/runtime sources into a deterministic typed graph snapshot. Every node/edge has stable type, stable identity, source provenance, source version/head/root, observed/compiled timestamp, confidence/truth class where applicable, and evidence references.

EGC is a compiler/projection, not the source of domain truth.

### 2.2 Graph Impact Radius (GIR)
Compute bounded change radius using typed reachability and declared ownership. Standard classes:
- LOCAL
- MODULE
- CROSS_MODULE
- SYSTEM
- RELEASE

GIR informs HEDS risk routing, Context Capsule expansion, proof selection, AEG critic selection, regression scope and cockpit visualization. Unknown/incomplete graph coverage increases uncertainty rather than reducing scope.

### 2.3 Graph Context Selector (GCS)
Select the smallest evidence-sufficient context slice from the engineering graph. Expansion requires an unresolved dependency, uncertainty, proof obligation or risk signal. Hard node/file/token/depth ceilings apply. Cycles and dense hubs use bounded traversal rules.

### 2.4 Graph Proof Gate (GPG)
Map impacted graph nodes/edges to required proof obligations. A change cannot claim trusted readiness while mandatory proof nodes are FAIL/BLOCKED/UNKNOWN where policy requires proof. GPG consumes proof truth from authoritative systems; it does not manufacture PASS.

### 2.5 Graph Diff & Lineage
Every material graph snapshot supports deterministic diff: added/removed/changed nodes, edges, ownership, source refs and proof relationships. Provenance must allow an operator/reviewer to trace a projected relationship back to the canonical source.

### 2.6 Structural safeguards
- cycle detection and declared-cycle policy;
- forbidden-edge rules;
- ownership-boundary checks;
- orphan requirement/test/evidence detection;
- dead/unreachable contract candidates;
- dependency centrality and blast-radius indicators;
- bounded cardinality and graph size budgets;
- stale source/edge visibility.

## 3. Harness Engineering
Harness Engineering governs how models/agents/tools execute, not the business/domain truth they act upon.

### 3.1 Harness Contract
Every governed execution resolves a machine-readable Harness Contract containing:
- execution/WO/project/root identity;
- harness version/fingerprint;
- allowed context sources and budget;
- allowed tools/capabilities and permission envelope;
- model/profile/effort policy;
- Economic Safety Envelope reference;
- retry owner/policy;
- proof obligations;
- stop conditions;
- timeout/cancellation;
- output/evidence schema;
- observability/event contract.

### 3.2 Harness Episode Package (HEP)
Each execution can emit a replayable/auditable episode package containing bounded references to input intent, context slice/digest, graph slice/digest, tools invoked, model/profile/effort truth, decisions/actions, retries, timing, token/cost accounting, tests, evidence, findings, terminal state and harness fingerprint.

HEP must avoid storing raw secrets/private prompts by default. Sensitive data uses references/redaction according to policy.

### 3.3 Behavioral Eval Harness
Evaluate whether the agent behaved correctly, not only whether the final output looked correct. Examples: correct tool selection, capability proof use, Model Lock adherence, bounded context, retry ownership, stop-condition compliance, deterministic-first preference, evidence production and no unauthorized side effects.

### 3.4 Trajectory Verification
Validate the ordered execution path:
`intent -> context -> routing -> tool/model action -> observation -> correction/retry -> evidence -> terminal verdict`.

Unsafe or economically invalid trajectories may fail even when the final textual/output result is superficially correct.

### 3.5 Harness Regression Suite
Versioned corpus compares harness/model/prompt/tool/policy revisions on quality, seeded defect recall, false pass, tokens, monetary cost, latency, tool calls, retries, context growth, escalations, proof coverage and TTTM. No harness optimization is promoted solely because it is faster/cheaper.

### 3.6 Replay and deterministic diagnosis
Replay should reuse recorded HEP/event evidence and deterministic simulators whenever possible. Replay must not silently invoke paid models. A replay requiring fresh model execution is a new governed execution, not a pure replay.

## 4. Harness-Graph Engine (HGE)
HGE is the integration loop, not a new authority.

Inputs from graph:
- relevant context slice;
- impact radius;
- ownership;
- proof obligations;
- risk surfaces;
- dependency/lineage state.

Harness decisions:
- context admission;
- tool/capability selection;
- model/effort/routing request;
- budget admission;
- critic/review obligations;
- stop/termination conditions.

Outputs back into graph/projections:
- execution identity/state;
- evidence refs;
- finding refs;
- cost/token attribution refs;
- test/proof results;
- observed dependency/runtime relationships;
- terminal outcome.

Every feedback edge must preserve source and truth class. Inferred relationships cannot silently become authoritative source truth.

## 5. Additional promoted design targets

### 5.1 Graph Confidence Envelope (GCE)
Every derived graph slice exposes completeness/freshness/provenance confidence sufficient to prevent incomplete graphs from being treated as complete. UNKNOWN coverage increases review/context requirements.

### 5.2 Execution Invariant Compiler (EIC)
Compile approved policy/ADR/DoD invariants into machine-checkable harness assertions where deterministic enforcement is possible. LLM interpretation is a fallback for semantic obligations, never the default for enforceable invariants.

### 5.3 Tool Capability Firewall (TCF)
Before a harness exposes a tool, intersect host-proven capability, Work Order permission, risk policy and task need. Least capability by default. Tool availability alone never grants authorization.

### 5.4 Context Provenance Ledger (CPL)
Record which canonical sources materially influenced an execution/context capsule, their exact identity/digest, and why they were included. Enables stale-context invalidation and token-waste analysis.

### 5.5 Harness Drift Detector (HDD)
Detect material changes in model resolution, tool schemas, host capability, system prompt/policy, runtime version, environment or dependency fingerprints. Drift invalidates affected regression evidence and may trigger bounded requalification.

### 5.6 Decision-to-Proof Trace (DPT)
Bind consequential agent decisions to the evidence/proof obligations supporting them. Missing trace is explicit, not inferred after the fact.

### 5.7 Execution Entropy Budget (EEB)
Bound nondeterministic degrees of freedom in high-assurance work: number of candidate branches, autonomous tool choices, critic escalation and fallback paths. Higher entropy requires stronger proof and economic admission.

### 5.8 Graph-Aware Failure Localization (GAFL)
Use observed failures plus GIR/provenance to rank likely affected nodes/symbols/tests without declaring causality. Causal claims remain evidence-gated.

## 6. Technology disposition
ADOPT: stable typed graph contracts, DAG/cycle analysis, deterministic traversal, graph diff, provenance, bounded graph context selection, behavioral evals, trajectory verification, harness fingerprints, replayable episodes, deterministic stop conditions, regression corpus.

ADAPT: existing MODULE-MANIFEST, GLOBAL-MODULE-DEPENDENCIES, HEDS Work Intent Graph/Context Capsule/Evidence Bundle, AEG GET/CSC/APB/RCG, M30 OTCL/TCL/TPSC/PSCF/LOCP, M24 attribution, M19 proof cache.

EXPERIMENT: graph database, GraphRAG, learned edge ranking, probabilistic causal graph, automatic ontology expansion, adaptive scheduling based on graph centrality, distributed graph storage. Promotion requires M27/M28 benchmarks and migration proof.

REJECT DEFAULT: mandatory Neo4j/Kafka/cloud graph service, unbounded GraphRAG, LLM-generated edges treated as truth, graph-driven model/agent fan-out without M07/M22, paid-model replay by default, harnesses that can override authoritative owner policy.

## 7. Ownership map
- M08: HEDS/harness review trajectory and HEP integration.
- M14: graph-informed bounded context selection.
- M19: graph/evidence validity and cache linkage.
- M20: failure learning and graph-linked defect memory.
- M22: graph/harness evidence-driven escalation.
- M24: token/cost attribution.
- M30: graph/harness operational projection and Digital Operations Office.
- M03/M04/M05/M06/M07: capability/model/effort/economic admission.
- M21: retry authority.
- M27/M28/M29/M31: scale, recovery, security and safe release.

## 8. Promotion rule
This contract may become canonical architecture before all runtime features exist, but runtime capability claims are module-by-module only after deep discovery, implementation tests, benchmark evidence and HEDS approval.