# UADS V2 — I-WAVE-0 Codex Execution Package

Status: CANDIDATE / PRE-DISPATCH
Work Order family: UADS2-WO-020 / M30 S05.1
Prepared under: UADS2-WO-024
Runtime execution: NOT STARTED
Source baseline: `docs/v2/planning/UADS2-IW0-SOURCE-BASELINE.md`
Planning base main: `b21cce7150c991dba347e28bb8e3752be9e2e941`

## Executor mission
Implement and prove the first M30 S05.1 vertical slice: authoritative operational truth -> OTCL freshness/truth evaluation -> TCL continuity -> TPSC projection -> bounded AOBC/CBF handling -> PSCF-safe correlation -> read-only Living Cockpit projection over the existing local-first HTTP/SSE foundation.

The executor implements. It does not redesign ownership or architecture.

## Base prerequisites
- M03 frozen proof-aware host capability boundary.
- M30 S00/S01/S01.5/S02/S03/S04 frozen.
- WO-023 Technology Acquisition Radar frozen.
- Interface Freeze IF-001, IF-006, IF-007 applicable.
- Existing M30 event spine/dashboard foundation is reusable but not treated as full S05.1 completion.
- Source baseline is reconciled against current main at dispatch time.

## Frozen critical source identities at planning base
- `src/kernel/operational-events.ts` -> `c68b5a960c7774b877867ae2aa32505bd3bbff48`
- `src/kernel/operational-event-types.ts` -> `77ba2574d8c6b1a0d08ffce9459a09571beec972`
- `src/commands/dashboard.ts` -> `172b21d89bbc3421e449935ad24f5df9a32f6600`
- focused tests and schemas are bound by the planning base commit and must be re-read/reconciled before implementation.

If any critical identity has moved on main, do not blindly use this package. Produce a source-baseline delta and revalidate affected contracts first.

## Primary allowed source boundary
Expected existing files:
- `src/kernel/operational-event-types.ts`
- `src/kernel/operational-events.ts`
- `src/commands/dashboard.ts`
- `src/cli.ts` only if command wiring is required
- `schemas/operational-event.schema.json` where schema evolution is required
- `tests/operational-events.test.ts`
- `tests/dashboard-m30.test.ts`

Expected benchmark/evidence seams:
- `scripts/benchmark/m30-event-dashboard.mjs`
- existing M30 evidence/report directories

Additional files may be created under a narrowly scoped M30 kernel/projection namespace when required by the frozen architecture, but broad unrelated refactors are forbidden.

## Protected boundaries
Do not redesign or bypass:
- `readHostCapabilityProjection()` consumer boundary for M03 truth;
- M24 economic truth ownership;
- M07 economic enforcement ownership;
- M21 retry ownership;
- M29 privileged security ownership;
- M31 release authority;
- AEG/HEDS independence;
- GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT requirements.

Do not absorb Hive V2 deep RAG/memory/context ownership.
Do not add mandatory Grafana, Kafka, Mimir, Tempo, OTel Collector, external SaaS or WebSocket stack.

## Required runtime contracts
### Truth
Every projected datum is one of:
- CURRENT with freshness evidence;
- STALE with observed/evaluated timing;
- DEGRADED with reason;
- UNAVAILABLE;
- UNKNOWN where the owning source cannot establish truth.

No fabricated current values and no silent zero fallback for missing economic/routing data.

### Freshness / OTCL
At minimum preserve:
- source identity;
- source owner module;
- observed timestamp;
- evaluation timestamp;
- freshness lease/budget;
- truth class SOURCE/DERIVED/INFERRED;
- truth state.

### Continuity / TCL
Expose continuity state:
- CONTIGUOUS
- GAP_KNOWN
- GAP_UNKNOWN
- REPLAYING
- UNAVAILABLE
Silence is not proof of health.

### TPSC
Source truth, derived projection and inference remain distinguishable. Dashboard must never become authoritative domain storage.

### AOBC/CBF
Observability remains bounded. Under pressure, optional/high-detail telemetry degrades before protected truth/integrity/audit state. Cardinality is bounded by schema/producer rules.

### PSCF
Correlation is privacy-safe. Do not emit raw prompts, completions, secrets or arbitrary sensitive filesystem paths by default.

### Realtime delivery
Reuse loopback-only HTTP/SSE unless proof requires an additive compatible change. Reconnect/gap behavior must remain truthful and bounded.

## Required cockpit minimum
Read-only first slice must truthfully surface:
- global operational health;
- event/freshness state;
- continuity/gap state;
- degradation/unavailable reasons;
- telemetry pressure/boundedness state where available;
- capability proof status when sourced through M03 compatibility projection;
- economic/routing information only when authoritative source exists, otherwise UNKNOWN/UNAVAILABLE;
- evidence/lineage references suitable for progressive disclosure.

No LLM call is required merely to render or refresh the dashboard.

## Mandatory proof focus
From M30 S04:
- OP-001
- OP-002
- OP-003
- OP-008
- OP-009
- PF-001
- PF-002
- PF-003
- PF-004
- ES-020

Also prove:
1. stale data cannot render CURRENT;
2. corrupt persisted event cannot silently render healthy;
3. missing source cannot become zero/current;
4. bounded reads/retention remain bounded;
5. SSE delivery remains loopback-only and bounded;
6. reconnect/gap truth is explicit;
7. no raw secret/prompt leakage in default projection;
8. dashboard failure cannot corrupt source/domain state;
9. Windows and Linux CI remain green;
10. telemetry overhead is measured and Issue #39 debt is not hidden.

## Tests/evidence expected
- focused unit tests for new truth/freshness/continuity/projection logic;
- corruption/stale/missing-source negative tests;
- dashboard snapshot tests;
- SSE/reconnect/bounded client tests;
- schema closure/validation tests;
- representative local benchmark using existing M30 benchmark seam, with environment disclosed;
- full repository test suite;
- exact-head CI, CodeQL, Dependency Review, Cross-Platform;
- Evidence Bundle binding exact implementation head;
- final independent HEDS before merge.

Developer-host benchmarks are evidence, not production SLOs.

## Executor model/effort policy
Preferred host model: GPT-5.6 Luna only if runtime proves available/admissible.
Effort:
- LOW for mechanical/schema/wiring edits;
- MEDIUM for normal implementation and tests;
- HIGH for difficult freshness/concurrency/security integration;
- XHIGH only after concrete unresolved evidence;
- MAX prohibited as routine/default.
If host cannot honor requested model/effort, record HOST_FIXED/MISMATCH/UNKNOWN. Never claim control that was not applied.

## Economic guard for executor
This implementation must not require model-bearing work from the runtime being implemented. Codex executor spend itself should remain bounded by the host/session controls. Do not spawn parallel agents by default until the future parallel-specialist implementation is proven.

## Failure protocol
Return `NEEDS_ARCHITECTURE` and stop if implementation requires:
- ownership change;
- weakening a frozen invariant;
- new mandatory heavyweight infrastructure;
- bypass of M03/M07/M21/M24/M29/M31 authority;
- fabricated operational truth;
- unresolved security/economic/replay architectural decision.

Return `BLOCKED_EVIDENCE` if runtime/environment proof cannot be obtained truthfully.

## STOP CONDITION
Do not declare complete until:
1. required code/tests are implemented inside the narrow source boundary;
2. all mandatory proof focus items are PASS or explicitly BLOCKED with no false production claim;
3. full tests and four repository gates are green on exact final head;
4. Evidence Bundle contains local/runtime evidence and environment identity;
5. independent HEDS approves exact final head;
6. M30 S05.1 checkpoint is updated;
7. no unrelated architecture redesign or dependency expansion occurred.

## Dispatch rule
This file is a PRE-DISPATCH package. Before sending to Codex, create a dedicated implementation WO/context lock/test plan and bind exact current main/source identities. Until then, continue GitHub-only preparation.