# UADS V2 — Pre-Wave 5 Parallel Specialist Execution Program

Status: CANDIDATE — architecture/research only
Scope: UADS V2 execution/orchestration. No runtime dependency is added by this document.

## 1. Mission
When a governed UADS work prompt is dispatched to Codex/Cursor/another supported host, UADS should analyze it before execution, decompose it into dependency-aware subtasks, identify which subtasks are genuinely parallelizable, assign each subtask to the best-qualified specialist agent, choose model/profile/effort/tool permissions per subtask, execute safe branches concurrently, then integrate, verify, reconcile and review the combined result.

Primary goals:
- reduce wall-clock completion time;
- preserve or improve quality;
- prevent duplicate/conflicting work;
- avoid uncontrolled token/cost amplification;
- keep every agent within explicit identity, capability, budget and side-effect boundaries;
- make every routing/decomposition decision visible in M30 Living Operations Cockpit.

## 2. Market evidence and decision
Current multi-agent systems show material gains when independent work can be delegated in parallel, while also showing substantial token overhead and poorer fit for tightly coupled coding tasks. UADS therefore MUST NOT equate "more agents" with "better".

Decision: **ADAPT and PROMOTE AS DESIGN TARGET** a UADS-native dependency-aware parallel specialist execution layer.

## 3. Core proprietary technologies

### 3.1 PPG — Prompt Planning Graph
Compiles the incoming governed prompt into a versioned task DAG.

Each node declares:
- taskId and stable semantic identity;
- objective and acceptance criteria;
- owner/specialty required;
- dependency edges;
- input/context refs;
- expected outputs/evidence;
- side-effect class from SIR;
- risk and blast radius;
- parallelizability state;
- model capability floor;
- effort floor/ceiling;
- economic reservation;
- retry owner;
- verification requirements;
- integration boundary.

No agent dispatch occurs before the PPG passes schema, dependency and economic validation.

### 3.2 STD — Specialist Task Decomposer
Transforms the prompt into the smallest useful execution units without pathological microtask fragmentation.

Required behaviors:
- detect independent vs sequential work;
- preserve cross-task invariants;
- avoid splitting a transaction or tightly coupled edit into unsafe parallel branches;
- merge tiny adjacent tasks when orchestration overhead would exceed expected execution gain;
- detect shared-file/shared-symbol/shared-state conflict risk;
- flag unknown dependency rather than guessing independence.

### 3.3 SAR — Specialist Agent Registry
Registry of agent roles by proven competence, not decorative personas.

Possible specialist classes include:
- authentication/identity;
- authorization/policy;
- frontend/UI;
- API/backend;
- database/schema/migrations;
- TypeScript/runtime;
- testing/QA;
- security;
- performance;
- release/CI;
- observability;
- documentation/governance;
- dependency/supply-chain;
- integration/reconciliation.

Each specialist record SHOULD include:
- specialtyId/version;
- competency claims;
- supported task classes;
- required tools;
- forbidden tools/actions;
- model capability compatibility;
- historical quality evidence;
- cost/latency profile;
- concurrency limit;
- freshness/expiry;
- proof refs.

Specialist selection is evidence-bearing. Agent names/prompts alone do not prove specialization.

### 3.4 SARM — Specialist Agent Routing Matrix
Scores eligible specialists against each PPG node using:
- competency fit;
- task complexity;
- risk;
- context size;
- tool needs;
- prior measured quality;
- expected latency;
- expected cost;
- host support;
- current load/queue;
- sandbox requirement;
- policy/ESE constraints.

The router MUST be deterministic when inputs, registry and policy are unchanged, except where an explicitly declared adaptive mode is used.

### 3.5 PEF — Per-Task Effort Fabric
Selects reasoning effort independently for each subtask, subject to host capability proof.

Recommended semantic levels:
- NONE/LOW: mechanical, enumeration, formatting, simple isolated edits, routine checks;
- MEDIUM: ordinary implementation with bounded ambiguity;
- HIGH: architecture-sensitive implementation, difficult debugging, security-sensitive work;
- XHIGH: exceptional ambiguity/high-risk reasoning;
- MAX: last resort only, never default.

Rules:
- task effort is distinct from parent/orchestrator effort;
- child may not exceed declared ceiling without explicit evidence-driven escalation;
- retries do not automatically increase effort;
- escalation consumes bounded ESE capacity;
- if the host cannot enforce the chosen effort, UADS reports HOST_FIXED/MISMATCH/UNKNOWN instead of pretending enforcement.

Codex policy target:
- GPT-5.6 Luna preferred when proven admissible and sufficient;
- stronger/more expensive profiles only when quality floor cannot be met otherwise.

Cursor policy target:
- Composer family for cheap routine work where proven adequate;
- latest proven Grok family for harder work;
- no lexical "latest" routing without runtime capability/cost proof.

### 3.6 PWG — Parallelism Worthiness Gate
Before spawning parallel workers, estimates whether concurrency is justified.

Inputs:
- DAG width and critical path;
- shared files/symbols/state;
- expected task duration;
- orchestration/integration overhead;
- token/cost amplification;
- probability of merge conflict/rework;
- side-effect risk;
- available model/host concurrency;
- global/project/WO ESE capacity.

Output:
- SEQUENTIAL
- PARALLEL_BOUNDED
- HYBRID
- BLOCKED_UNKNOWN_DEPENDENCY

Core invariant: `parallelize only when expected wall-clock benefit exceeds coordination + integration + economic + conflict cost at the required quality floor`.

### 3.7 ECF — Execution Concurrency Fence
Defines which tasks may run simultaneously.

Hard constraints include:
- write-set conflicts;
- same migration/schema ownership;
- same irreversible external effect;
- same retry owner;
- shared lock/lease;
- security policy dependency;
- unproven state dependency.

The scheduler may serialize a subset even when the wider DAG is parallel.

### 3.8 SCW — Specialist Context Window
Each agent receives the minimum sufficient context for its task:
- relevant task contract;
- required files/symbols;
- dependency outputs;
- governing invariants;
- tool/capability permissions;
- economic envelope;
- evidence obligations.

Agents SHOULD NOT inherit the entire orchestrator context by default. This reduces context cost, leakage, anchoring and accidental authority transfer.

Hive V2 remains owner of deep context/RAG/memory architecture. UADS owns only execution-time context packaging contracts and interface requirements.

### 3.9 MIR — Merge & Integration Referee
Dedicated integration stage that does not assume parallel outputs compose correctly.

Responsibilities:
- validate branch/node outputs against contracts;
- detect overlapping edits;
- reconcile interface/schema mismatches;
- run deterministic integration checks;
- require replan when outputs conflict semantically;
- preserve provenance of each merged contribution;
- route unresolved conflicts to the appropriate specialist/fresh critic.

### 3.10 CPS — Critical Path Scheduler
Schedules the DAG to minimize wall-clock time while respecting fences, budgets and host limits.

Priority signals:
- critical-path length;
- blocker count;
- risk;
- resource availability;
- expected duration;
- dependent fan-out;
- verification latency.

Fast low-risk tasks may be scheduled early if they unlock many downstream nodes.

### 3.11 AER — Adaptive Escalation & Replan
A failed/underpowered worker does not trigger blind retry.

Possible actions:
- retry same specialist only when failure is transient and retry-safe;
- increase effort within task ceiling;
- select stronger model if quality floor requires it;
- select different specialist;
- split/merge task;
- add missing dependency;
- serialize an unsafe branch;
- mark BLOCKED when evidence is insufficient.

All replans are bounded by ESE, max rounds and AEG/HEDS governance.

## 4. Execution topology

Canonical flow:

`Prompt -> governance/preflight -> PPG -> STD -> SAR/SARM -> PWG -> CPS/ECF -> parallel specialist workers -> node evidence -> MIR -> integration tests -> AEG critics -> HEDS -> PR/merge`

Hybrid example:
- T1 architecture contract (sequential)
- after T1: T2 backend + T3 frontend + T4 tests scaffold + T5 observability hooks (parallel where write sets are disjoint)
- T6 integration (waits for T2-T5)
- T7 security/performance validation (parallel)
- T8 final synthesis/HEDS.

## 5. Economic safety

Parallel execution MUST be subordinate to M07 Economic Safety Envelope.

Required invariants:
1. A child agent receives a finite reservation from the parent's remaining capacity.
2. Parallelism creates zero new economic capacity.
3. `sum(child reservations) <= parent remaining reservation`.
4. max concurrent model-bearing agents is finite.
5. max total descendants is finite.
6. no silent multi-model broadcast.
7. speculative/shadow workers require explicit budget.
8. HARD_STOP prevents all new model-bearing dispatch.
9. integration/review reservations are protected so workers cannot consume the entire WO budget.
10. wall-clock optimization may never bypass hard spend/token limits.

## 6. Quality and specialization safety

A specialist may be selected only if:
- competency claim is current;
- required tools are allowed;
- task risk does not exceed specialist assurance level;
- model/profile satisfies quality floor;
- host proves capability;
- sandbox/policy requirements are satisfied.

No worker self-certifies final correctness. Independent verification remains mandatory where risk requires it.

## 7. Conflict prevention

Before parallel dispatch, UADS SHOULD generate an approximate read/write set:
- files;
- symbols/types;
- schemas/migrations;
- APIs/contracts;
- CI/release config;
- external systems/effects.

Conflict classes:
- NONE: safe candidate for concurrency;
- SOFT: parallel allowed with integration guard;
- HARD: serialize;
- UNKNOWN: conservative serialize or discovery subtask first.

## 8. M30 Living Operations Cockpit

The Digital Operations Office should show in real time:
- original prompt/WO identity;
- decomposition DAG;
- critical path;
- queued/running/blocked/completed nodes;
- specialist assigned to each node;
- requested/applied model and effort;
- routing rationale;
- context/evidence refs;
- tokens/cost/reservation/burn rate;
- retry/replan/escalation count;
- task progress/freshness;
- read/write conflict state;
- integration state;
- AEG/HEDS status;
- predicted vs actual wall-clock savings;
- predicted vs actual token/cost amplification.

No phantom agents or fake percentages. UNKNOWN/STALE/UNAVAILABLE remains explicit.

## 9. Interaction with existing UADS technologies

- M03: host/model/tool capability proof.
- M05: model/profile routing authority.
- M06: effort selection/enforcement.
- M07: ESE and economic circuit breakers.
- M08: review integration.
- M21: retry ownership.
- M22: evidence-driven escalation.
- M24: cost/token ledger.
- M29: policy/sandbox/tool security.
- M30: live projection/control plane.
- M31: release gates.
- AEG/HEDS: adversarial/final assurance.
- PPG integrates with EGC/HGE graph/harness program.
- SIR/DEF protect side effects and replay.
- AWIF/PNAG constrain specialist identities/delegation.

## 10. Enterprise pillars
- M27 Scale/Load: bounded worker pools, queue saturation, DAG scaling, scheduler overhead.
- M28 Resilience/Recovery: node checkpointing, worker loss, reassignment, integration recovery.
- M29 Security: specialist least privilege, sandbox, delegation non-amplification, secrets handles.
- M30 Observability: per-node truth, routing/effort/economics, critical-path visibility.
- M31 Release: integrated exact-head checks, provenance and HEDS.

## 11. Non-goals / rejected defaults
- one agent per sentence or micro-action;
- unlimited agent spawning;
- all tasks parallel by default;
- all workers use the parent model/effort blindly;
- all workers inherit the full context by default;
- multiple agents editing the same critical state without a fence;
- worker self-review as final assurance;
- automatic stronger-model retry without evidence;
- parallelism that increases cost materially without measured time/quality benefit;
- host capability claims that UADS cannot prove.

## 12. Proposed product modes

User-facing orchestration policy could expose:
- FAST: maximize safe wall-clock reduction within a finite budget ceiling;
- BALANCED: optimize quality/time/cost jointly;
- QUALITY_FIRST: permit more review/escalation but still bounded;
- COST_CAPPED: strict economic ceiling, parallelize only when cheap enough;
- MANUAL_LOCKED: explicit user model/effort/parallelism pins.

BALANCED should be default until benchmarks prove another policy better.

## 13. Promotion decision

Promote as architectural targets:
- PPG
- STD
- SAR
- SARM
- PEF
- PWG
- ECF
- SCW
- MIR
- CPS
- AER

Runtime implementation requires proof matrix, benchmarks and host capability tests. No claim is made that Codex/Cursor currently exposes every required per-worker control. Unsupported controls must remain truthfully HOST_FIXED/MISMATCH/UNKNOWN.
