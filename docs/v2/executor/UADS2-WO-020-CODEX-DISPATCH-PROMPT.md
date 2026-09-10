# UADS2-WO-020 — FINAL CODEX DISPATCH PROMPT

Status: EXECUTOR READY
Target PR: #74
Issue: #65
Target branch: `feat/uads2-wo-020-m30-s05-1-runtime`
Base main at package reconciliation: `e5ed58ed541c415c06fe42498f622a1aeada0f4a`

You are the implementation executor for UADS2-WO-020 / M30 S05.1 Truth Kernel & Living Cockpit Vertical Slice.

## 0. EXECUTION MODE

Use the globally installed UADS path first. Run UADS bootstrap, context/preflight validation, routing and dispatch checks when those capabilities are available and proven. Remain GLOBAL-FIRST and ZERO-PROJECT-FOOTPRINT. Do not create a project-local UADS installation or silently bypass stale-context/digest checks.

Preferred model is GPT-5.6 Luna only if the host proves that model/profile is available and admissible. Choose effort PER SUBTASK: LOW for mechanical/schema/wiring work, MEDIUM for normal implementation/tests, HIGH only for difficult truth/freshness/security/concurrency integration, XHIGH only for a concrete unresolved hard defect. MAX is prohibited as a routine/default setting. If the host does not expose or honor model/effort control, record HOST_FIXED, MISMATCH or UNKNOWN truthfully.

For this first runtime slice, optional multi-agent fan-out is OFF by default. Do not create broad parallel model-bearing work. Host-native bounded assistance is permitted only when it cannot multiply budget/retries, cannot create conflicting edits, and remains auditable.

## 1. READ BEFORE MODIFYING ANY SOURCE

Read completely and obey in this order:
1. `.engineering/context-locks/UADS2-WO-020.md`
2. `.engineering/plans/UADS2-WO-020-TEST-PLAN.md`
3. `docs/v2/planning/UADS2-WO-020-DISPATCH-BINDING.md`
4. `docs/v2/planning/UADS2-IW0-CODEX-EXECUTION-PACKAGE.md`
5. `docs/v2/planning/UADS2-IW0-SOURCE-BASELINE.md`
6. `docs/v2/modules/m30/M30-S02-ARCHITECTURE.md`
7. `docs/v2/modules/m30/M30-S02-STATE-COMMAND-CONTRACTS.md`
8. `docs/v2/modules/m30/M30-S03-FAILURE-SECURITY-RECOVERY.md`
9. `docs/v2/modules/m30/M30-S03-TOKEN-SPEND-SAFETY.md`
10. `docs/v2/modules/m30/M30-S04-PROOF-BENCHMARK-MATRIX.md`
11. `docs/v2/modules/m30/M30-S04-ECONOMIC-CHAOS-RELEASE-FLOORS.md`
12. `.engineering/reports/EVIDENCE-UADS2-WO-020-TEMPLATE.md`

Before source edits, verify branch, current HEAD, working tree, package baseline, and critical source identities. If source reality conflicts materially with the frozen architecture or package, STOP and return `NEEDS_ARCHITECTURE` with evidence. Do not redesign ownership yourself.

## 2. MISSION

Implement and prove one thin end-to-end M30 S05.1 runtime path:

`authoritative operational evidence -> OTCL truth/freshness -> TCL continuity -> TPSC separation -> AOBC/CBF bounded observability -> PSCF-safe correlation -> read-only Living Cockpit projection -> loopback HTTP/SSE realtime delivery`

The cockpit must truthfully expose operational state. It must never become a second domain truth source.

## 3. NON-NEGOTIABLE INVARIANTS

- No datum may be CURRENT/LIVE without freshness evidence.
- Missing/ambiguous source truth becomes STALE, DEGRADED, UNAVAILABLE or UNKNOWN as applicable.
- Missing cost/routing/accounting must never become false zero/current.
- Silence is not proof of continuity or health.
- SOURCE, DERIVED and INFERRED truth classes stay distinguishable.
- Dashboard render/refresh performs zero model-bearing calls.
- M03 remains host capability truth authority through its frozen consumer boundary.
- M07 owns economic enforcement; M24 owns economic ledger truth.
- M21 owns retry semantics.
- M29 owns privileged policy/tool security.
- M31 owns release authority.
- GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT remain true.
- No raw secrets, prompts, completions or arbitrary sensitive host paths in default telemetry/projection.
- No mandatory Grafana/Kafka/Mimir/Tempo/OTel Collector/SaaS/WebSocket expansion.
- No broad unrelated refactor.

## 4. PRIMARY SOURCE BOUNDARY

Expected allowed files/areas:
- `src/kernel/operational-event-types.ts`
- `src/kernel/operational-events.ts`
- narrowly scoped new M30 kernel/projection files
- `src/commands/dashboard.ts`
- `src/cli.ts` only when necessary for wiring
- `schemas/operational-event.schema.json` only if compatible schema evolution is required
- `tests/operational-events.test.ts`
- `tests/dashboard-m30.test.ts`
- narrowly scoped new M30 tests
- existing M30 benchmark/evidence seams

Do not move ownership into CLI/dashboard merely for convenience.

## 5. IMPLEMENTATION REQUIREMENTS

### OTCL
Represent/evaluate at minimum source identity, source owner module, observedAt, evaluatedAt, freshness lease/budget, truth class and truth state. Lease expiry must deterministically produce STALE.

### TCL
Expose continuity states `CONTIGUOUS`, `GAP_KNOWN`, `GAP_UNKNOWN`, `REPLAYING`, `UNAVAILABLE`. Missing evidence must not silently imply CONTIGUOUS.

### TPSC
Keep source evidence separate from derived projection and inferred state. Projection cannot write back authoritative domain truth.

### AOBC/CBF
Keep observability bounded. Optional/high-detail telemetry is shed before protected truth/integrity/audit state. Cardinality/key growth remains bounded and degradation/shedding is visible.

### PSCF
Use privacy-safe opaque bounded correlation. Sanitize secrets and sensitive host paths. Do not require raw prompts/content for correlation.

### Cockpit
At minimum expose truthful global health, freshness, continuity/gap state, degradation/unavailable reasons, boundedness/pressure where available, capability proof state only through M03 truth, economic/routing state only when authoritative source exists, and evidence/lineage references suitable for progressive disclosure.

### Realtime
Preserve loopback-only HTTP/SSE default. Client count/work must remain bounded. Reconnect/gap state must be truthful. Dashboard failure must not corrupt domain/source state.

## 6. REQUIRED PROOFS

Exercise the applicable M30 S04 proof IDs:
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

Additionally prove:
1. stale data cannot render CURRENT;
2. corrupt persisted event cannot silently render healthy;
3. missing source cannot become zero/current;
4. reads, retention, payload/cardinality and SSE clients remain bounded;
5. reconnect/gap truth is explicit;
6. default projection contains no raw secret/prompt leakage;
7. dashboard failure cannot corrupt source/domain state;
8. existing B-001 semantics do not regress;
9. Windows and Linux repository gates remain green;
10. telemetry overhead is measured and Issue #39 performance debt is not hidden.

## 7. TEST / EVIDENCE EXECUTION

Run focused tests first, then the full repository suite. Add deterministic negative tests for stale, corrupt, missing source, continuity gaps, schema closure, privacy, bounded SSE and storage/degradation behavior as required by the Test Plan.

Run the existing M30 benchmark seam and any narrowly scoped additional measurement needed. Record environment identity and label measurements as developer/CI observations, not production SLOs.

Populate/replace the template with `.engineering/reports/EVIDENCE-UADS2-WO-020.md` containing:
- implementation HEAD SHA;
- environment/runtime versions;
- changed files;
- focused/full test commands and exact results;
- proof-ID result table;
- negative scenarios;
- benchmark observations;
- privacy/security evidence;
- GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT evidence;
- remaining debt/known limitations;
- terminal state.

Do not fabricate evidence. UNKNOWN/BLOCKED stays UNKNOWN/BLOCKED.

## 8. GIT / PR RULES

Work only on `feat/uads2-wo-020-m30-s05-1-runtime` / PR #74 unless an unavoidable repository fact proves otherwise.

Do not force push. Do not merge. Do not weaken checks. Do not change unrelated governance. Keep commits scoped and professional.

After implementation/evidence is committed, leave PR #74 open for independent ChatGPT review/HEDS.

## 9. TERMINAL STATES

Return exactly one of:
- `COMPLETE_CANDIDATE` - implementation, tests and evidence are ready for independent review;
- `NEEDS_ARCHITECTURE` - frozen architecture/source reality conflict requires architect decision;
- `BLOCKED_EVIDENCE` - required runtime/host proof cannot be obtained truthfully;
- `CORRECTION_REQUIRED` - a release-blocking invariant fails.

For any non-complete terminal state, include precise evidence and the smallest necessary next action. Do not improvise around a blocker.

## 10. STOP CONDITION

Do not stop at partial coding. Stop only when:
1. the complete thin vertical slice is implemented inside the frozen source boundary;
2. mandatory focused and full tests have been run;
3. all required negative scenarios are exercised;
4. benchmark/environment observations are recorded;
5. `.engineering/reports/EVIDENCE-UADS2-WO-020.md` is complete;
6. the branch/PR contains all implementation commits;
7. no unrelated architecture redesign or dependency expansion occurred;
8. you return one terminal state above.

Do NOT merge PR #74. Independent ChatGPT review, exact-head gates and HEDS happen after you finish.