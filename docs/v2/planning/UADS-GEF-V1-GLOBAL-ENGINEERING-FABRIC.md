# UADS GEF V1 — Global Engineering Fabric

**Status:** PROPOSED / CANONICAL PLANNING DRAFT  
**Scope:** Global, cross-project, cross-executor engineering optimization layer  
**Applies to:** UADS, Hive, UGAS, Neryn, Isoryn and all future software repositories governed by UADS  
**Primary objective:** Minimize token consumption, executor reasoning time, duplicated validation and review latency without reducing assurance quality  
**Design principle:** Think once, compile once, execute narrowly, prove incrementally, review only what changed.

---

## 1. Executive decision

The optimization work discussed for prompts, Codex execution and HEDS review will not remain a collection of local prompt conventions. It will become a **global UADS capability** called **GEF — Global Engineering Fabric**.

GEF is the shared engineering control plane used by every project. Projects provide their own architecture, decisions, Work Orders, source code and policies. GEF provides the execution fabric around them:

- semantic context compilation;
- prompt compilation;
- executor routing;
- token/time/search/patch budgets;
- deterministic work offload;
- test-impact selection;
- evidence capture;
- proof carry-forward;
- HEDS delta review;
- CI gate orchestration;
- failure memory;
- telemetry and continuous optimization.

The target is not merely "better prompts". The target is a system in which an LLM is used only for the semantic work that truly requires an LLM. Everything deterministic is moved to deterministic software.

---

## 2. Global target architecture

```text
                         UADS GLOBAL ENGINE
                                |
              +-----------------+-----------------+
              |                 |                 |
       Global Project       GEF Control       Global Memory
          Registry            Plane              Plane
              |                 |                 |
              +-----------+-----+------+----------+
                          |            |
                  Context Compiler   Evidence Graph
                          |            |
                    UPIR / Task IR     |
                          |            |
              +-----------+------------+-----------+
              |                        |           |
       Prompt Compiler          Execution       HEDS Delta
       per executor             Governor         Engine
              |                        |           |
    Codex / Cursor / Grok /      Deterministic    |
    Composer / future agents     Work Plane       |
              |                        |           |
              +------------ Git / CI / Receipts--+
```

GEF MUST be global-first. A project must never need to reimplement GEF internals locally merely to participate in the system.

---

## 3. Global state model

Conceptual global layout:

```text
~/.uads/
  gef/
    registry/
    projects/
    context-cas/
    symbol-index/
    dependency-graph/
    proof-ledger/
    evidence/
    prompt-ir/
    prompt-cache/
    patch-recipes/
    failure-fingerprints/
    architecture-facts/
    negative-capabilities/
    playbooks/
    executor-profiles/
    receipts/
    telemetry/
    experiments/
```

On Windows the physical path may be under the user profile, but the API and persisted contracts remain cross-platform.

Each repository receives a stable **Project Fingerprint** based on governed repository identity, canonical project ID and repository generation. GEF must not depend on an arbitrary local folder name as project identity.

---

## 4. Non-negotiable principles

1. **Global-first:** optimization is shared across projects.
2. **Source-truth first:** repository state outranks stale prompt assumptions.
3. **UNKNOWN never means ALLOW:** optimization must never weaken fail-closed policy.
4. **No hidden architecture invention by weak executors:** architecture exploration is explicit and budgeted.
5. **No full-project context by default:** context expands only when a dependency proves it is needed.
6. **No duplicate proof without cause:** unchanged proof inputs permit safe carry-forward.
7. **No duplicate full validation locally and in CI by default:** local execution proves the affected slice; CI remains authoritative for the full repository gate.
8. **One final publication when possible:** avoid commit/push/CI loops.
9. **Exact-head evidence:** any code change invalidates gate receipts tied to the previous SHA.
10. **Machine evidence first:** humans read generated summaries; agents exchange structured evidence.
11. **Deterministic before generative:** if software can compute it, do not spend LLM tokens on it.
12. **Budget expansion is explicit:** models may not silently expand search, context, patch or retry scope.
13. **Review is incremental:** previously approved unchanged evidence remains approved unless its dependency graph is invalidated.
14. **Observability is mandatory:** time and token gains must be measured rather than guessed indefinitely.

---

# PART I — CORE GEF TECHNOLOGIES

## 5. UPIR — UADS Prompt Intermediate Representation

Every engineering request is compiled first into a canonical structured representation instead of directly into prose.

Example:

```json
{
  "taskClass": "PATCH",
  "projectId": "uads-v2",
  "workOrder": "UADS2-WO-025",
  "pr": 77,
  "baseSha": "...",
  "reviewedHead": "...",
  "openFindings": ["CR-03"],
  "acceptedFindings": ["CR-01", "CR-02"],
  "contextRadius": "C1",
  "searchBudget": 2,
  "patchBudget": {"sourceFiles": 2, "testFiles": 3, "loc": 120},
  "requiredProofs": ["T1"],
  "carriedProofs": ["T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10"]
}
```

UPIR becomes the stable machine contract. Prose prompts are generated from it.

### Benefit

- avoids repeated prompt design;
- allows validation before sending a task;
- makes prompts model-specific without changing the underlying task;
- allows caching, diffing and replay;
- enables telemetry at the task representation level.

---

## 6. Model-Specific Prompt Compiler

One universal task representation, multiple optimized compilers:

```text
UPIR -> Codex Prompt
UPIR -> Cursor Prompt
UPIR -> Grok Prompt
UPIR -> Composer Prompt
UPIR -> future executor
```

Each compiler may vary:

- ordering of constraints;
- verbosity;
- examples;
- output schema;
- search allowances;
- patch instructions;
- context packing;
- retry strategy.

The goal is to stop paying the cost of generic prompts when the executor is known.

---

## 7. Decision Freeze Capsule

The stronger planner/HEDS resolves architecture and root cause first. The executor receives the **result of reasoning**, not a request to rediscover it.

A capsule contains:

- exact defect;
- root cause;
- selected solution;
- rejected alternatives when relevant;
- invariants that cannot change;
- ownership boundaries;
- expected behavior;
- required negative tests;
- stop conditions.

The capsule contains engineering conclusions and concise rationale, not private chain-of-thought.

---

## 8. Semantic Context Compiler

GEF MUST compile context at symbol granularity when possible.

Instead of sending a 2,000-line file, the executor can receive:

```text
symbol: routeModel()
source hash: sha256:...
related symbols:
  - deriveModelRequirements()
  - effectiveCapability()
  - modelRoutingLockInput()
proofs:
  - T1
  - T4
  - T5
```

Context is expanded only if the dependency graph requires it.

---

## 9. Adaptive Context Radius

Standard context classes:

| Radius | Default content |
|---|---|
| C0 | target function + direct test |
| C1 | target symbols + direct dependencies + tests |
| C2 | module + interfaces |
| C3 | related architecture + cross-module contracts |
| C4 | project-wide architecture |

A task starts at the smallest safe radius. Expansion from C0/C1 to C3/C4 requires a concrete source conflict, not curiosity.

---

## 10. Context Addressed Storage / Content CAS

Context fragments, symbols, schemas and proof inputs are addressed by digest.

If a symbol hash is unchanged, GEF can reuse its compiled representation rather than regenerate it.

This enables:

- context caching;
- safe deduplication;
- proof carry-forward;
- reproducible prompt packs;
- faster cross-session warm starts.

---

## 11. Semantic Dependency Graph

GEF maintains a graph such as:

```text
routeModel()
  -> model-requirements
  -> model-runtime
  -> model-lock
  -> model-persist
  -> execution

routeModel() change
  -> model-routing.test
  -> execution integration tests
  -> eval:model-routing
  -> eval:execution
  -> eval:fault-injection
```

The graph drives context, tests and review invalidation.

---

## 12. Patch Recipe DSL

For bounded tasks, GEF should compile a patch recipe rather than an open-ended prompt.

Conceptual form:

```text
TARGET
src/kernel/model-router.ts::routeModel

PRECONDITION
host-managed compatibility currently ignores proven-runtime requirement

TRANSFORM
1. compute provenRuntimeSatisfied
2. require it before host-managed SELECTED
3. otherwise BLOCKED / NO_PROVEN_CAPABILITY

PRESERVE
Model Lock
quality floor
WO-026 PCCR
requireProvenRuntime

PROVE
empty registry + no adapter => BLOCKED
```

The executor verifies source compatibility, then applies the recipe.

---

## 13. Patch Budget

Every bounded execution receives expected limits:

```text
sourceFiles <= 2
testFiles <= 3
LOC <= 120
newDependencies = 0
```

If the task materially exceeds the budget:

```text
STOP = SCOPE_EXPANSION_REQUIRED
```

This prevents a small correction from turning into repository exploration or broad refactoring.

---

## 14. Search Budget

Every execution receives a repository exploration budget.

Example:

```text
repository searches: 3
extra source files: 2
architecture documents: 0
external web: forbidden
```

If listed symbols no longer match the source:

```text
STOP = SOURCE_CONFLICT
```

The executor does not wander through the repository looking for a new architecture unless explicitly authorized.

---

## 15. Token / Time / Retry Governor

Budgets become machine policy:

```text
input token ceiling
target output ceiling
search ceiling
patch ceiling
retry ceiling
active-time target
```

Budget classes may be adjusted by risk and task class.

Exceeded budgets surface explicit states such as:

- TOKEN_BUDGET_EXPANSION_REQUIRED
- SEARCH_BUDGET_EXPANSION_REQUIRED
- PATCH_BUDGET_EXPANSION_REQUIRED
- RETRY_BUDGET_EXHAUSTED

---

## 16. Thinking / Execution Classes

| Class | Purpose | Executor behavior |
|---|---|---|
| T0 | mechanical | no architecture exploration |
| T1 | bounded patch | follow recipe, minimal search |
| T2 | semantic correction | bounded reasoning inside frozen architecture |
| T3 | architecture | broad analysis explicitly allowed |

Most correction prompts should be T0-T2. T3 is exceptional.

---

# PART II — DETERMINISTIC WORK PLANE

## 17. DWP — Deterministic Work Plane

This is one of the strongest additional optimizations.

GEF should remove from LLMs every task that deterministic software can perform reliably.

### Deterministic responsibilities

- compute Git diffs;
- inspect changed filenames;
- compute symbol hashes;
- build dependency graph deltas;
- select impacted test families;
- run commands;
- collect exit codes;
- parse test output;
- generate Evidence JSON;
- generate Markdown reports from Evidence JSON;
- capture workflow IDs;
- compute exact-head gate receipts;
- compare blobs to last reviewed head;
- calculate carried/invalidated proofs;
- enforce patch/search budgets;
- format terminal result.

LLM tokens are reserved for:

- semantic source changes;
- architecture;
- ambiguous fault diagnosis;
- tests requiring semantic design;
- independent assurance judgment.

This is effectively a **No-LLM Fast Lane** for mechanical engineering operations.

---

## 18. Machine Evidence Manifest

The canonical machine artifact becomes structured JSON, for example:

```json
{
  "workOrder": "UADS2-WO-025",
  "baseSha": "...",
  "headSha": "...",
  "changedFiles": [],
  "proofs": {"T1": "PASS", "T2": "CARRY_FORWARD"},
  "tests": [],
  "evals": {},
  "gates": {},
  "openFindings": [],
  "resolvedFindings": ["CR-01", "CR-02", "CR-03"]
}
```

Human-readable Markdown is generated from this manifest, not manually written by the executor.

---

## 19. Command Receipt Cache

A deterministic command result can be content-addressed by:

```text
command
+ relevant source hashes
+ test hashes
+ config hashes
+ toolchain fingerprint
+ environment class
```

If inputs are identical, local command results may be reused where policy permits.

Full CI remains authoritative for final merge assurance.

---

## 20. Evidence Validity Fingerprint

Carry-forward must account for more than source files. A proof may depend on:

- source hashes;
- schemas;
- policy files;
- toolchain version;
- OS class;
- runtime flags;
- external immutable reference.

GEF computes an **Evidence Validity Fingerprint**. A proof is carried only when its validity inputs remain compatible.

This prevents unsafe cache reuse.

---

# PART III — INCREMENTAL HEDS

## 21. Proof Dependency Graph

Each proof records its exact inputs.

Example:

```text
T3
  depends on:
    model-lock.ts
    execution.ts
    model-routing-state.schema.json
```

If those inputs are unchanged:

```text
T3 = CARRY_FORWARD
```

If any relevant input changes:

```text
T3 = INVALIDATED
manual or automated re-proof required
```

---

## 22. Review Merkle Ledger

GEF builds a content-addressed review tree:

```text
HEDS ROOT
  Architecture
  Source Boundary
  Security Invariants
  T1
  T2
  T3
  ...
```

A small source change invalidates only dependent nodes.

This applies incremental-build ideas to software assurance.

---

## 23. HEDS Delta Engine

The reviewer receives:

```text
last reviewed head
new head
semantic delta
accepted findings preserved
proofs carried forward
proofs invalidated
new risks
exact-head gate state
```

The reviewer does not manually reread unchanged portions of a large PR.

---

## 24. Failure Fingerprint Cache

Known failures become reusable engineering knowledge.

Example:

```text
fingerprint: STALE_PLAN_REUSE
symptoms:
  - governance state corrupt
  - cached plan remains current
prior fix:
  - invalidate currency on UNAVAILABLE
```

Fingerprints are global. A pattern discovered in UADS may help diagnose Hive or UGAS.

---

## 25. Negative Capability Cache

GEF also stores confirmed absence:

```text
NO production active evidence contract
NO M06 effort truth
NO M07 ESE
```

An executor can be told "known absent, do not search", eliminating repeated dead-end repository exploration.

---

## 26. Architecture Question Cache

Resolved questions become reusable facts:

```text
Can legacy runtime snapshots enable routing?
NO
source: frozen architecture + HEDS decision
```

The executor does not reopen a settled architecture question unless source drift invalidates the fact.

---

## 27. Global Engineering Playbooks

Reusable governed patterns:

- fail-closed state machine;
- immutable audit ledger;
- atomic persistence;
- schema migration;
- cache invalidation;
- retry/circuit-breaker;
- proof receipt;
- model lock;
- capability negotiation;
- concurrency guard;
- idempotent mutation;
- privacy-safe evidence.

A task references a versioned playbook instead of re-explaining its full design.

---

# PART IV — FURTHER OPTIMIZATIONS ADDED IN THIS REVISION

## 28. SPC — Structural Patch Compiler

Instead of line-number-based instructions, GEF can generate AST/symbol anchored transformations.

Example concept:

```text
symbol: routeModel
anchor: noConcreteProfileCompatibility
operation: strengthen predicate
required semantic postcondition: UNKNOWN cannot SELECT
```

Benefits:

- fewer failures from line drift;
- less source text in prompt;
- safer automated patch skeletons;
- better portability across formatting changes.

---

## 29. Context Handle Compression

Long repeated policies receive immutable versioned handles:

```text
POLICYSET UADS-HIGH-ASSURANCE-v3
PLAYBOOK FAIL-CLOSED-STATE-v2
INTERFACE IF-001-v1
```

The global runtime expands these locally for the executor/compiler. Prompts no longer repeat hundreds or thousands of identical policy tokens.

This must use versioned hashes so a short handle never ambiguously refers to changing policy.

---

## 30. Warm-Start Execution Capsule

For repeated work on the same PR, GEF maintains a compact machine capsule:

```text
PR 77
last HEDS head
authorized branch
open finding CR-03
accepted CR-01/CR-02
known changed symbols
known test graph
known forbidden boundaries
```

The next executor session starts from this capsule rather than reconstructing the PR history.

---

## 31. Source Drift Sentinel

Before spending reasoning tokens, deterministic preflight checks:

- target branch exists;
- expected base is ancestor/current;
- target symbols still exist;
- symbol hashes match expected capsule;
- architecture files have not changed unexpectedly;
- open PR/head identity is correct.

If drift exists, stop immediately before expensive reasoning.

---

## 32. Two-Phase Execution

### Phase A — SOURCE MATCH

Very small request:

```text
Verify only these symbols and invariants.
Return SOURCE_MATCH or SOURCE_CONFLICT.
```

### Phase B — EXECUTE

Only after SOURCE_MATCH is proven does the executor receive/activate the patch recipe.

This avoids spending a full execution cycle on stale assumptions.

---

## 33. One-Shot Publication Strategy

Preferred correction cycle:

```text
edit
focused test
edit if needed
focused test
final impacted validation
ONE COMMIT
ONE PUSH
```

Avoid:

```text
push -> CI -> fix -> push -> CI -> evidence commit -> CI again
```

Machine gate receipts must not require a new source commit after CI.

---

## 34. Gate Receipt Separation

Separate:

1. **Candidate Manifest**, committed before CI;
2. **Gate Receipt**, bound to exact SHA but stored as GitHub artifact/check/structured PR record.

This prevents the act of recording CI evidence from changing the SHA whose CI evidence was recorded.

---

## 35. Zero-Wait Gate Orchestrator

Do not wait serially.

After the final candidate push:

- CI begins;
- HEDS semantic delta review begins immediately;
- CodeQL/Dependency/Cross-Platform run in parallel;
- deterministic receipt collection runs as gates complete.

If HEDS finds a blocker before CI completes, the candidate is rejected immediately. The remaining CI run may be cancelled where policy and cost make cancellation beneficial.

---

## 36. CI Sharding and Critical-Path Scheduling

Where safe, CI is split into independent jobs:

- lint/typecheck/build;
- core tests;
- impacted critical evals;
- remaining evals;
- security scans;
- platform matrix;
- packaging.

The goal is lower wall-clock latency, not lower assurance.

---

## 37. Progressive Assurance Levels

| Level | Executor/owner |
|---|---|
| A0 | syntax/static mechanical checks |
| A1 | focused tests |
| A2 | impacted tests + critical evals |
| A3 | full hosted repository gates |
| A4 | independent HEDS |

A bounded Codex patch normally executes A0-A2 locally. GitHub owns A3. HEDS owns A4.

---

## 38. Executor Pareto Router

GEF chooses executor using a Pareto view of:

- expected quality;
- expected tokens;
- expected wall time;
- task class;
- required tool capabilities;
- current availability;
- observed historical success.

A mechanical T0 task should not automatically consume the strongest expensive model. A T3 architecture task should not automatically be delegated to a weak executor merely because it is available.

---

## 39. Prompt Auto-Tuner

Prompt variants are measured rather than debated indefinitely.

Tracked metrics:

- input tokens;
- output tokens;
- repository searches;
- files opened;
- retries;
- patch size;
- focused test time;
- rework rounds;
- HEDS rejection rate;
- escaped regression rate.

Prompt compiler versions can be A/B or canary evaluated on safe workloads.

---

## 40. Review Convergence Predictor

GEF learns which change signatures historically fail review.

Before publication it can warn:

```text
predicted review-failure risk: elevated
likely missing evidence: negative cache-invalidity test
```

This is advisory at first. It may later become a pre-HEDS quality gate after enough data exists.

---

## 41. Shadow Assurance Mode

GEF should be introduced safely.

During early rollout:

- legacy validation remains authoritative;
- GEF computes carried proofs, selected tests and expected verdict in shadow mode;
- compare GEF recommendation to full legacy outcome;
- measure false-safe and false-expensive decisions;
- promote optimizations to authority only after sufficient agreement.

This prevents an optimization bug from silently weakening assurance.

---

## 42. No-LLM Report Generation

Long executor narratives are prohibited by default.

Executor result target:

```json
{
  "status": "COMPLETE_CANDIDATE",
  "head": "...",
  "changed": ["..."],
  "focused": "PASS",
  "evals": {"execution": "9/9"},
  "published": true
}
```

Human reports are deterministically generated from structured receipts.

---

# PART V — EXECUTION PIPELINE

## 43. Target end-to-end flow

```text
REQUEST
  |
  v
Project Fingerprint
  |
  v
Source Drift Sentinel
  |
  v
Task Classification T0-T3
  |
  v
UPIR
  |
  +--> Decision Freeze Capsule
  +--> Context Slice Compiler
  +--> Dependency / Proof Graph
  +--> Budgets
  |
  v
Model-Specific Prompt Compiler
  |
  v
SOURCE MATCH
  |
  v
Executor patch
  |
  v
A0 / A1 / A2 local validation
  |
  v
ONE final push
  |
  +------------------------------+
  |                              |
  v                              v
A3 hosted gates              HEDS Delta Review
  |                              |
  +---------------+--------------+
                  v
             Exact-head verdict
                  |
             APPROVE / REJECT
```

---

## 44. Standard Correction Pack

A correction prompt should contain only:

1. machine header / UPIR summary;
2. accepted/frozen findings;
3. one open defect;
4. root cause;
5. prescribed algorithm;
6. exact target symbols;
7. forbidden boundaries;
8. required tests;
9. budgets;
10. minimal local commands;
11. publication rule;
12. machine output schema;
13. STOP CONDITION.

Historical prose is omitted unless it materially changes execution.

---

## 45. Standard Feature Execution Pack

For features, the pack adds:

- architecture capsule;
- interface contracts;
- source ownership;
- schema changes;
- migration plan;
- failure semantics;
- observability obligations;
- performance budget;
- security/privacy obligations;
- test impact matrix.

Still, the executor receives compiled conclusions, not an instruction to rediscover architecture.

---

# PART VI — ESTIMATED IMPROVEMENT TABLE

## 46. Baseline comparison

These are **planning estimates**, not guaranteed production measurements. The baseline below treats the current workflow as index 100. Targets must be validated by GEF telemetry during dogfooding.

| Metric | Current workflow | GEF V1 target | Approx. improvement |
|---|---:|---:|---:|
| Executor input tokens | 100 | 20-40 | **60-80% less** |
| Executor reasoning/exploration tokens | 100 | 15-35 | **65-85% less** |
| Executor output tokens | 100 | 10-30 | **70-90% less** |
| Repository searches per bounded correction | 100 | 10-30 | **70-90% less** |
| Files read by executor | 100 | 15-35 | **65-85% less** |
| Active Codex wall time | 100 | 25-50 | **50-75% less** |
| Local validation wall time | 100 | 20-45 | **55-80% less** |
| Duplicate full-suite execution | 100 | 10-30 | **70-90% less** |
| Repeated architecture reading | 100 | 5-20 | **80-95% less** |
| HEDS manual rereview volume | 100 | 20-45 | **55-80% less** |
| Evidence/report writing by LLM | 100 | 5-15 | **85-95% less** |
| Extra CI cycles caused by evidence commits | 100 | 0-20 | **80-100% less** |
| Correction/rework rounds | 100 | 45-70 | **30-55% less** |
| Time from candidate work start to HEDS-ready | 100 | 30-55 | **45-70% less** |
| Time from HEDS-ready to final exact-head verdict | 100 | 35-60 | **40-65% less** |
| Total model-token cost per accepted bounded change | 100 | 20-45 | **55-80% less** |
| Mechanical work performed by LLM | 100 | 10-25 | **75-90% less** |
| Proofs manually reconsidered after tiny delta | 100 | 15-40 | **60-85% less** |

### Quality target

Quality is not reduced to obtain these savings. The target is:

- same or stronger exact-head assurance;
- fewer hidden stale-state/carry-forward errors;
- fewer architecture deviations;
- fewer silent scope expansions;
- earlier failure detection;
- reproducible evidence.

Potential defect-escape reduction should be measured rather than promised. An initial planning hypothesis is **15-40% fewer review-detected regressions per accepted change** after the system has enough failure-memory and convergence data, but this remains an experimental KPI until measured.

---

## 47. Expected savings by task class

| Task class | Likely strongest gain |
|---|---|
| T0 mechanical | 70-90% token/time reduction |
| T1 bounded patch | 55-80% token reduction, 50-75% active-time reduction |
| T2 semantic correction | 40-70% token reduction, 35-65% active-time reduction |
| T3 architecture | smaller execution savings; major reuse in context/decision memory |

Architecture still deserves thinking. GEF is designed to remove waste around that thinking, not eliminate necessary engineering judgment.

---

# PART VII — TELEMETRY AND KPIs

## 48. Mandatory telemetry per execution

Capture:

```text
projectId
workOrder
taskClass
executor/model
promptCompilerVersion
inputTokens
outputTokens
estimated/observed reasoning cost where available
searchCount
filesOpened
filesChanged
patchLOC
retries
focusedTestSeconds
impactedEvalSeconds
ciSeconds
hedsSeconds
correctionRounds
finalVerdict
cacheHits
carriedProofs
invalidatedProofs
```

No optimization claim becomes permanent policy without measured evidence.

---

## 49. Guardrail KPIs

Optimization is rejected if any of the following materially worsens:

- escaped defect rate;
- security finding rate;
- HEDS false-approval rate;
- flaky test acceptance;
- missing negative-test rate;
- exact-head mismatch rate;
- architecture drift rate;
- unsafe proof carry-forward rate.

Speed is subordinate to correctness.

---

# PART VIII — GLOBAL ADOPTION PLAN

## 50. Phase 0 — Specification freeze

Deliver:

- GEF architecture;
- glossary;
- contracts;
- UPIR schema;
- evidence schema;
- proof dependency model;
- budget policy;
- task classes;
- threat model;
- DoD;
- telemetry schema.

No broad runtime implementation before the V1 contracts are frozen.

---

## 51. Phase 1 — Global foundation

Implement:

- Project Registry;
- Project Fingerprint;
- global storage layout;
- Source Drift Sentinel;
- machine receipts;
- telemetry skeleton.

---

## 52. Phase 2 — Prompt / Context compiler

Implement:

- UPIR;
- Codex compiler first;
- Context Radius;
- symbol extraction/index;
- Decision Capsule;
- Search/Patch/Token Governor;
- machine output contract.

---

## 53. Phase 3 — Evidence / Incremental Review

Implement:

- Machine Evidence Manifest;
- proof dependency graph;
- Review Merkle Ledger;
- Evidence Validity Fingerprints;
- HEDS Delta package;
- carry-forward engine.

---

## 54. Phase 4 — Deterministic Work Plane

Move off the LLM:

- diffing;
- test selection;
- command receipts;
- report generation;
- gate receipt collection;
- proof invalidation;
- summary formatting.

---

## 55. Phase 5 — CI acceleration

Implement:

- one-shot candidate manifest;
- gate receipt separation;
- parallel/sharded CI where safe;
- zero-wait HEDS + gates;
- optional early cancellation of obsolete CI runs.

---

## 56. Phase 6 — Dogfood on UADS

GEF must build and review parts of GEF itself.

Measure old workflow vs GEF on comparable tasks.

Promotion requirement: no quality regression and measurable token/time gain.

---

## 57. Phase 7 — Cross-project pilots

Recommended sequence:

1. UADS
2. Hive
3. UGAS
4. Neryn / Isoryn
5. all future projects by default

Use shadow mode before GEF becomes authoritative for proof carry-forward and test skipping.

---

## 58. Phase 8 — Global default

After validation, every new project automatically receives GEF through the global UADS runtime.

Project-local opt-out requires an explicit compatibility reason.

---

# PART IX — DEFINITION OF DONE FOR GEF V1

GEF V1 is complete when:

1. a project is discovered and fingerprinted globally;
2. a Work Order compiles to UPIR;
3. a Codex-specific execution pack is generated automatically;
4. context is symbol/dependency scoped;
5. budgets are enforced;
6. deterministic tasks run outside the LLM;
7. impacted tests are selected automatically;
8. local proof stops at A2 by default;
9. exact-head A3 runs in GitHub;
10. Machine Evidence Manifest is generated without LLM prose;
11. HEDS receives a delta package with carried/invalidated proofs;
12. gate receipts do not require a new source commit;
13. token/time telemetry exists for every execution;
14. shadow-mode comparison shows no assurance regression;
15. at least UADS + one independent project complete successful GEF-driven cycles;
16. GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT requirements are satisfied.

---

# PART X — IMMEDIATE RULES BEFORE GEF RUNTIME EXISTS

The following rules take effect immediately for manually generated Codex prompts:

1. Use **Context Slice + Decision Capsule + Patch Recipe**.
2. Include **Search Budget, Patch Budget and Task Class**.
3. Include only the minimum architecture necessary for execution.
4. Mark already accepted findings as **FROZEN / DO NOT MODIFY**.
5. Use focused local tests + impacted evals by default.
6. Full suite remains authoritative in hosted CI unless a task explicitly requires local full-suite reproduction.
7. Codex does not wait idly for CI after final push.
8. HEDS review may start while gates run.
9. Correction prompts use delta context, not full project history.
10. Executor output is compact and machine-structured.
11. No evidence-only commit after successful gates.
12. One final push per correction is the target.
13. If source assumptions mismatch, stop with SOURCE_CONFLICT instead of exploring broadly.
14. All optimization must preserve fail-closed, exact-head and independent-review requirements.

---

# PART XI — FROZEN STRATEGIC DECISIONS

The following strategic decisions are accepted for planning:

- GEF is **global**, not project-specific.
- GEF will be used by all projects after staged validation.
- Prompt quality will be improved by compiling decisions, not by blindly increasing prose length.
- Stronger planning/review models do the high-value semantic thinking; weaker executors receive constrained recipes.
- Deterministic software replaces LLM work wherever possible.
- Reviews become incremental and proof-dependency-aware.
- Evidence becomes machine-first and content-addressed.
- Exact-head CI remains mandatory for governed merges.
- Full assurance is retained while duplicated local work is removed.
- Metrics determine future optimization policy.
- The system will be dogfooded on UADS before broad rollout.

---

# PART XII — NEXT GOVERNED ACTIONS

Recommended immediate sequence:

1. finish the active PR #77 correction/review without mixing GEF runtime implementation into it;
2. create a dedicated GEF planning Work Order;
3. freeze GEF V1 architecture, contracts and DoD;
4. implement Phase 1 global foundation;
5. implement Codex Prompt Compiler + Context Compiler first because they provide the earliest direct token savings;
6. implement Machine Evidence + HEDS Delta second because they reduce review cost;
7. implement deterministic test/evidence automation;
8. dogfood GEF on subsequent UADS increments;
9. compare measured baseline versus GEF metrics;
10. enable Hive pilot only after UADS shadow-mode results are acceptable.

---

## Final objective

GEF should make the normal bounded engineering task look like this:

```text
Repository size: large
Change: one or two semantic symbols
Executor context: only those symbols + required contracts/tests
Architecture rediscovery: zero
Repository wandering: near zero
LLM-written evidence: near zero
Local full-suite duplication: near zero
Final CI assurance: full
HEDS review: only invalidated evidence
```

The long-term goal is not simply faster Codex execution. It is a reusable global engineering fabric in which **every project becomes cheaper and faster automatically whenever GEF improves**.
