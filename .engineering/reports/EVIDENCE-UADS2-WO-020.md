# EVIDENCE — UADS2-WO-020

Status: COMPLETE_CANDIDATE — Review-01 correction applied (P1 continuity truth: scan saturation kept distinct from rejected records); exact-head gates and HEDS remain PENDING on the final head
Module: M30 Production Observability & Real-Time Operations
Session: S05.1 Truth Kernel & Living Cockpit Vertical Slice
Issue: #65
PR: #74
Risk: HIGH

## Exact identities
- Base main SHA: `e5ed58ed541c415c06fe42498f622a1aeada0f4a` (verified as merge-base with `origin/main`)
- Implementation head SHA: `f43aa04f705c018e2c969e7a9ce26bdd6a0f2646` (Review-01 correction)
  - `29bb00e` feat(UADS2-WO-020): implement M30 S05.1 truth kernel and living cockpit
  - `cc8998d` test(UADS2-WO-020): add truth kernel and cockpit runtime proofs
  - `4a101cc` chore(UADS2-WO-020): observe cockpit projection latency in M30 benchmark
  - `0131b71` docs(UADS2-WO-020): record runtime evidence bundle
  - `f43aa04` fix(UADS2-WO-020): separate scan saturation from rejected records in continuity truth
- Node version: `v24.18.0` (npm `11.16.0`)
- OS/platform: Windows `10.0.26200` x64, PowerShell, host `D:\Projekt Codexx\uads-v2`
- Executor/host model routing state: `HOST_FIXED` — the host exposes no per-subtask model/effort control to the executor and `uads status` reports `modelRoutingStatus: (none)` / `selectedProfileId: (none)`. GPT-5.6 Luna availability was not proven on this host and is not claimed.
- Requested effort / applied effort: requested per-subtask LOW/MEDIUM/HIGH; applied effort `UNKNOWN` (not observable or controllable on this host).

This bundle document is committed after the implementation head above. The resulting final head is a new revision and MUST receive fresh exact-head CI, CodeQL, Dependency Review, Cross-Platform and HEDS before merge.

## Source baseline verification
Method: `git rev-parse e5ed58ed:<path>` versus `git hash-object <path>` (working tree clean; committed head content byte-identical to tested content).

| Path | Base blob (`e5ed58ed`) | Current blob (`4a101cc`) | Status |
| --- | --- | --- | --- |
| `src/kernel/operational-events.ts` | `c68b5a960c7774b877867ae2aa32505bd3bbff48` | `657d12682256cb8b0377a165a510578b226584c6` | INTENTIONAL DELTA (Review-01: explicit rejection vs saturation metadata; allowed kernel evolution) |
| `src/kernel/operational-event-types.ts` | `77ba2574d8c6b1a0d08ffce9459a09571beec972` | `e9eb0ce9939b2f005ed1cf3dc2796ace68481be9` | INTENTIONAL DELTA (additive fields `rejectedEventCount` / `scanSaturated`; legacy `invalidEventCount` documented aggregate) |
| `src/commands/dashboard.ts` | `172b21d89bbc3421e449935ad24f5df9a32f6600` | `432283c6b8984d116804dcdc87a247f982913431` | INTENTIONAL DELTA (forwards explicit reader fields into TCL evidence) |
| `tests/operational-events.test.ts` | `9f24f8d2d838cffe8c2143c1f9c4dd294ad05d40` | `fd94ba6095655438d7000564798ba39099f02f1f` | INTENTIONAL DELTA (assertions extended for the new fields) |
| `tests/dashboard-m30.test.ts` | `048d58bc28cc214a3afcc54a6f43f5dc13bf90ab` | `8f2cbf04f9984447f5a3c6dd70be97ac514ae98b` | INTENTIONAL DELTA (allowed primary source boundary) |

No unexpected source movement outside the allowed Work Order file list. Review-01 required the bounded reader itself to expose scan saturation separately from rejected/corrupt records, so the event kernel and its type contract now carry additive, documented fields (`rejectedEventCount`, `scanSaturated`; legacy `invalidEventCount` retained only as a documented aggregate). Every delta is one of: the reader, its type contract, the cockpit projection consumer, the dashboard continuity derivation, or their tests.

New-file blobs at `4a101cc`:

| Path | Blob |
| --- | --- |
| `src/kernel/operational-truth.ts` | `416b8f71cc3e0b5fe6e6ce856f2ca6f2bbff1a72` |
| `src/kernel/operational-cockpit.ts` | `02e662dfca8a17eb074e16a23b7b055a781d2d9d` |
| `src/kernel/operational-continuity.ts` | `2ffe3295d68521378180ff5400a8c772ca248a1b` |
| `src/kernel/operational-correlation.ts` | `85cb19381408a5b9e0d8a26cda6423558478f244` |
| `src/kernel/operational-budget.ts` | `0fb2d0f9fe1bbc3bd41b3ae0af388ccb56d6421c` |
| `tests/m30-cockpit.test.ts` | `70f8dcc0376d3b64bfaa52d406968aec81987b17` |
| `tests/m30-truth-kernel.test.ts` | `0052731350760a5d2988f85178474181ba79e708` |
| `scripts/benchmark/m30-event-dashboard.mjs` | `35163f1f5ff36fd50a3d8db5d2097369a8a903d2` |

## Changed files
- `src/kernel/operational-truth.ts` (new) — OTCL: `OperationalStateEnvelope` (source identity/owner, observedAt/evaluatedAt, freshness lease, truth class, truth state, continuity, reason codes, lineage/evidence refs) and deterministic `evaluateOperationalTruth` with fixed precedence: integrity defect > absence > invalid timestamp/lease > clock skew > lease expiry > CURRENT.
- `src/kernel/operational-continuity.ts` (new) — TCL: `CONTIGUOUS`, `GAP_KNOWN`, `GAP_UNKNOWN`, `REPLAYING`, `UNAVAILABLE`; rejected records outrank absence (corrupt store is GAP_KNOWN, not UNAVAILABLE); silence without baseline is UNAVAILABLE; replay never erases unresolved gaps.
- `src/kernel/operational-correlation.ts` (new) — PSCF: deterministic opaque hashed correlation ids bounded to 48 chars, safe-token validation, secret/path sanitization and bounded operator labels; raw values never persisted in ids.
- `src/kernel/operational-budget.ts` (new) — AOBC/CBF: `DEFAULT_OBSERVABILITY_LIMITS`, deterministic degradation ladder (optional P3/P2 shed before protected P1/P0 truth/health/audit with visible shed evidence), adversarial cardinality firewall with visible dropped-series count, and per-client SSE backpressure firewall.
- `src/kernel/operational-cockpit.ts` (new) — read-only Living Cockpit projection (`uads.living-cockpit`): `truthClass: DERIVED` with authority notice, global health, freshness envelope, continuity, pressure/boundedness, stream state, capability truth (M03 consumer boundary only), economic projection only from owner evidence (otherwise UNKNOWN / `NO_AUTHORITATIVE_ECONOMIC_SOURCE`, owners `M07`+`M24`, value `null`), bounded lineage/evidence refs and opaque correlation id.
- `src/commands/dashboard.ts` (modified) — adds `buildCockpitSnapshot`, `/api/cockpit`, cockpit section in the operator shell, SSE stream-state truth (active clients, max, buffer limit, slow-client drops, resume state), cursor resume via `Last-Event-ID` with explicit out-of-window gap events, and slow-client backpressure drops. Loopback-only bind unchanged. Review-01: `deriveContinuityEvidence()` forwards the explicit reader fields (`rejectedEventCount`, `scanSaturated`) into TCL evaluation instead of inferring them.
- `src/kernel/operational-event-types.ts` (modified, Review-01) — closed additive contract evolution: explicit `rejectedEventCount` and `scanSaturated` on `OperationalHealth`; `invalidEventCount` documented as the legacy aggregate retained for compatibility.
- `src/kernel/operational-events.ts` (modified, Review-01) — the bounded reader now reports rejected/corrupt count and scan-window saturation as separate evidence; `invalidEventCount` keeps its legacy `rejected + sentinel` value. No unbounded read introduced (`MAX_OPERATIONAL_EVENT_SCAN` / `MAX_OPERATIONAL_EVENT_LIMIT` unchanged).
- `tests/m30-truth-kernel.test.ts` (new) — kernel-level proofs for OTCL/TCL/AOBC/CBF/PSCF/T6/T8.
- `tests/m30-cockpit.test.ts` (new) — end-to-end cockpit/HTTP/SSE/projection/privacy proofs. Review-01 adds the end-to-end saturation proof through the real bounded reader + dashboard/cockpit path (`GAP_UNKNOWN` on saturation, `GAP_KNOWN` on corruption, no fabricated rejects).
- `tests/dashboard-m30.test.ts` (modified) — extends existing dashboard assertions with cockpit schema/truth-class/continuity/stream assertions and the cockpit HTML section.
- `tests/operational-events.test.ts` (modified, Review-01) — corruption test now also asserts `rejectedEventCount === 3` and `scanSaturated === false`.
- `scripts/benchmark/m30-event-dashboard.mjs` (modified) — adds `cockpitProjectionLatency` labeled `OBSERVATION` and explicit limitations incl. Issue #39 remaining open.
- `.engineering/reports/UADS2-WO-020-BENCHMARK.json` (new) — raw machine-readable benchmark output (Run B; refreshed in Review-01 = Run C).

## Proof results
Labels: PASS / FAIL / BLOCKED / NOT_APPLICABLE. References are test names in `tests/m30-truth-kernel.test.ts` (`TK`), `tests/m30-cockpit.test.ts` (`CK`), `tests/dashboard-m30.test.ts` (`DM`), `tests/operational-events.test.ts` (`OE`).

- OP-001: PASS — CURRENT only for fresh intact evidence; lease expiry deterministically STALE (`FRESHNESS_LEASE_EXPIRED`); corrupt/missing/invalid never CURRENT (TK "renders CURRENT only for fresh, intact source evidence", "expires deterministically to STALE...", "never renders CURRENT for missing, invalid or corrupt evidence").
- OP-002: PASS — known/unknown/replayed gaps explicit; silence without baseline is UNAVAILABLE, never contiguous; a saturated bounded scan projects GAP_UNKNOWN / CONTINUITY_RANGE_UNBOUNDED while corrupt/rejected records stay GAP_KNOWN / REJECTED_RECORDS_OBSERVED (TK "treats silence without an established baseline as UNAVAILABLE...", "keeps known, unknown and replayed gaps visible"; CK "projects GAP_UNKNOWN when the real bounded scan saturates and never fabricates rejected records", cursor-outside-window gap).
- OP-003: PASS — corrupt persisted record degrades visibly and is never healthy; corrupt file left byte-identical; writer/reader continue to operate (CK "marks a corrupt persisted event as degraded and never healthy", "degrades visibly on real corrupt storage without corrupting the domain workload"; OE "skips corrupt, unsupported and hash-mismatched records with degraded health").
- OP-008: PASS — absence renders UNKNOWN/UNAVAILABLE per dependent surface; capability UNAVAILABLE; economic UNKNOWN with `NO_AUTHORITATIVE_ECONOMIC_SOURCE`; zero only with authoritative M24 evidence (CK "renders absence as UNKNOWN/UNAVAILABLE instead of zero or success", "displays zero only with authoritative owner evidence").
- OP-009: PASS — no raw secrets, prompts or host paths in `/`, `/api/snapshot`, `/api/cockpit`, `/api/events`; correlation ids opaque and bounded; unsafe labels replaced (CK "leaks no raw secrets, prompts or host paths through any default surface"; TK "builds opaque bounded correlation identifiers", "rejects secrets, sensitive paths and free text from correlation labels", "redacts display labels while keeping them bounded").
- PF-001: PASS — optional P3 then P2 detail sheds before P1/P0 truth/health/audit and shedding emits visible evidence (TK "degrades optional detail before protected truth/health/audit classes").
- PF-002: PASS — adversarial attribute cardinality bounded with visible dropped-series evidence (TK "bounds adversarial cardinality with visible dropped-series evidence").
- PF-003: PASS — per-client backpressure firewall (1 MiB buffer bound, slow-client drops), client ceiling enforced with 503 `sse-client-limit`, cleanup back to 0, resume/gap truth (TK "exposes a bounded per-client backpressure firewall"; CK "keeps client work bounded and exposes truthful stream state", "replays the bounded window and resumes explicitly from a cursor", "reports an explicit gap instead of silently skipping when the cursor left the window").
- PF-004: PASS (slice scope) — bounded retention enforced with visible health, over-cap cleanup exact (`withinCap`, `oldestRemoved`, `newestRetained` all true) and corrupt storage degrades without corrupting domain workload; a real ENOSPC/read-only-volume injection was not performed in this slice (see limitations).
- ES-020: PASS (slice scope) — cockpit renders fresh/stale/gapped/absent accounting truthfully and never displays UNKNOWN as CURRENT/zero; economic truth is projected only from owning-module evidence with lineage, otherwise UNKNOWN/UNAVAILABLE with `value: null` (CK "renders absence as UNKNOWN/UNAVAILABLE instead of zero or success", "displays zero only with authoritative owner evidence"). Concrete remaining/reserved/consumed budget fields depend on M07/M24 owner payloads not wired in this read-only slice.
- T1 OTCL freshness: PASS — TK tests above; plus CK "never renders stale evidence as CURRENT" (stale event cannot render CURRENT even while raw `health.status` is HEALTHY).
- T2 TCL continuity (Review-01 corrected): PASS — TK continuity suite; CK cursor-resume/gap suite plus the end-to-end saturation proof through the real bounded reader + dashboard/cockpit path ("projects GAP_UNKNOWN when the real bounded scan saturates and never fabricates rejected records").
- T3 TPSC authority separation: PASS — projection is `DERIVED` with explicit authority notice; no write-back path; source absence yields UNKNOWN/UNAVAILABLE (CK "projects DERIVED state over SOURCE-owned evidence and never writes domain truth").
- T4 AOBC/CBF boundedness: PASS — PF-001/PF-002 plus bounded evidence refs/correlation ids in the projection.
- T5 PSCF privacy: PASS — OP-009 suite plus same-origin-only shell proof (see Security/privacy).
- T6 SSE realtime/reconnect: PASS — loopback-only enforced, bounded clients, explicit cursor resume/gap, no fabricated continuity (CK suite).
- T7 storage pressure: PASS (slice scope) — retention bound + corrupt-store degradation without workload corruption; real ENOSPC injection not performed (see limitations).
- T8 economic truth/no model refresh: PASS — dashboard render/refresh path performs zero model-bearing calls (CK "keeps the dashboard render path free of model-bearing calls"; DM cockpit assertions).
- T9 foundation compatibility: PASS — OE suite green (7/7, B-001 semantics unchanged); DM suite green; full suite 569/570 with the single failure proven pre-existing and unrelated (see Tests).
- T10 source-baseline integrity: PASS — baseline table above; no unexpected drift; all deltas are declared Work Order files (Review-01 expanded the intentional set to the bounded reader, its type contract and their tests); no ownership relocation.

## Tests
### Focused
Command: `npx vitest run --maxWorkers=1 tests/m30-cockpit.test.ts tests/m30-truth-kernel.test.ts`
Result: 2 files, 26/26 tests passed.

Command: `npx vitest run --maxWorkers=1 tests/dashboard-m30.test.ts tests/operational-events.test.ts tests/m30-cockpit.test.ts tests/m30-truth-kernel.test.ts`
Result: 4 files, 36/36 tests passed.

Post-commit re-run on exact implementation head `4a101cc` (clean tree verified):
Command: `npx vitest run --maxWorkers=1 tests/m30-cockpit.test.ts tests/m30-truth-kernel.test.ts tests/dashboard-m30.test.ts tests/operational-events.test.ts`
Result: 4 files, 36/36 tests passed (47.17s).

Review-01 correction (`f43aa04f705c018e2c969e7a9ce26bdd6a0f2646`), post-commit re-run on the exact fixed content (clean tree verified):
Command: `npx vitest run --maxWorkers=1 tests/m30-cockpit.test.ts tests/m30-truth-kernel.test.ts tests/dashboard-m30.test.ts tests/operational-events.test.ts`
Result: 4 files, 37/37 tests passed (53.36s).

Build: `npm run build` (`tsc -p tsconfig.json`) — exit 0, run before and at the committed head, and re-run after the Review-01 correction (exit 0).

### Full suite
Command: `npm test` (Review-01 correction)
Result: 570/571 tests passed. Sole failure: `tests/release-security-proof.test.ts` — "RG14 keeps v0.11.0 outside corrected-release proof semantics and immutable" (same pre-existing failure; unchanged by this correction).
Pre-existing proof: the same single test file was run in a detached worktree at base `e5ed58ed` → `1 failed | 24 passed`, identical failure. Root cause: `git ls-remote origin refs/tags/v0.11.0` is empty because remote `KayzenRoot/uads-v2` has 0 tags; the historical tag exists only in the predecessor repo (`KayzenRoot/uads` `refs/tags/v0.11.0` → `d5cb361274cb19f70c8bd02dd023b596b8babf13`, verified by `git ls-remote`). Not caused by this Work Order; not fixed here.
The full suite ran on working-tree content that is byte-identical to committed head `f43aa04f705c018e2c969e7a9ce26bdd6a0f2646` for `src/` and `tests/` (verified via `git hash-object` against the committed blobs above).

## Runtime scenarios
- Stale lease: event recorded 2020 → freshness `STALE` / `FRESHNESS_LEASE_EXPIRED`; `globalHealth` STALE while raw `health.status` remains HEALTHY — stale data cannot render CURRENT and raw health is not laundered.
- Corrupt record: corrupt JSON record → freshness `DEGRADED` / `INTEGRITY_DEFECT`, continuity `GAP_KNOWN` / `REJECTED_RECORDS`, `globalHealth` DEGRADED; corrupt file left byte-identical; new events still persist and read.
- Missing source: no evidence → `UNAVAILABLE` / `NO_SOURCE_EVIDENCE`; economic `UNKNOWN` / `NO_AUTHORITATIVE_ECONOMIC_SOURCE` with `value: null`, owners `["M07","M24"]`; capability UNAVAILABLE; zero only with authoritative M24 evidence.
- Reconnect/gap: cursor resume → `RESUMED_FROM_CURSOR`; unknown/out-of-window cursor → explicit `stream.gap` `CURSOR_OUTSIDE_BOUNDED_WINDOW`; `Last-Event-ID` honored.
- Bounded clients/cardinality: 2 active clients with `MAX_SSE_CLIENTS` reported; `slowClientDrops` 0 under normal load; `bufferLimitBytes` 1 MiB; 9th client → HTTP 503 `sse-client-limit`; cleanup back to 0.
- Source/domain protection: dashboard reads are read-only projections; corrupt/failed reads degrade projection only; event writer/reader contract (B-001) unchanged.
- Saturated bounded scan (Review-01): 1,200 real event files (`MAX_OPERATIONAL_EVENT_SCAN` + 100) → reader `scanSaturated: true`, `rejectedEventCount: 0` (legacy `invalidEventCount: 1` sentinel only), reads bounded to `MAX_OPERATIONAL_EVENT_LIMIT`; cockpit continuity `GAP_UNKNOWN` / `CONTINUITY_RANGE_UNBOUNDED` with `knownGapCount` 0 and `globalHealth` degraded; adding one real corrupt record keeps `GAP_UNKNOWN` while `knownGapCount` becomes 1 and freshness degrades with `INTEGRITY_DEFECT`.

## Performance observation
Environment: Node `v24.18.0`, `win32` `x64`, single Windows developer host, isolated temp UADS home (`isolatedUadsHome: true`), synchronous local sidecar filesystem path. Raw artifact: `.engineering/reports/UADS2-WO-020-BENCHMARK.json`.

| Metric | Baseline (pre-change, prior session) | Run A (this session, pre-commit) | Run B (post-commit, raw artifact) | Run C (Review-01 post-correction, raw artifact) |
| --- | --- | --- | --- | --- |
| Write throughput | 26.71 ev/s | 14.76 ev/s | 22.31 ev/s | 25.54 ev/s |
| Write latency p50 / p95 | — / — | 45.178 / 252.095 ms | 41.193 / 56.801 ms | 37.12 / 55.88 ms |
| Bounded read p50 / p95 | 33.05 / — ms | 32.971 / 41.412 ms | 38.203 / 59.144 ms | 38.791 / 70.886 ms |
| Dashboard snapshot p50 / p95 | 1658.572 / 2133.109 ms | 1725.178 / 2117.369 ms | 2210.889 / 2878.288 ms | 1863.440 / 2228.559 ms |
| Cockpit projection p50 / p95 | (not measured) | 550.016 / 722.818 ms | 651.696 / 868.134 ms | 597.518 / 843.147 ms |
| Retention probe | — | HEALTHY, withinCap true, oldestRemoved true, newestRetained true | HEALTHY, withinCap true, oldestRemoved true, newestRetained true | HEALTHY, withinCap true, oldestRemoved true, newestRetained true |

Notes: snapshot latency now includes the cockpit projection. Run-to-run spread on this single host is large (for example write throughput 14.76 vs 22.31 ev/s and snapshot p50 1725 vs 2211 ms across runs), so no SLO, regression or capacity claim is made from these numbers; they are developer-host OBSERVATIONs only; Run C is the post-correction re-execution required after the reader contract evolved. Issue #39 M30 telemetry overhead debt remains OPEN and is not closed or hidden by this benchmark (also recorded in the benchmark limitations).

## Security/privacy
- Raw secret leakage: no `ghp_...` token or host username appears in `/`, `/api/snapshot`, `/api/cockpit` or `/api/events` responses (CK privacy test).
- Raw prompt/completion default leakage: correlation and labels reject/replace free text; default projection carries only bounded sanitized values (TK label suite; CK privacy test).
- Arbitrary host path redaction: sensitive paths are redacted from labels; unsafe values are replaced by deterministic opaque labels (TK).
- Loopback-only bind: `createDashboardServer({ host: "0.0.0.0" })` throws; default is `127.0.0.1` (CK).
- Same-origin shell: served HTML contains no `://` and every `fetch(...)` target matches `^/api/`; no external fetch calls (CK).
- No model-bearing calls on the render/refresh path: static server-side check plus runtime assertions (CK; DM).
- Dashboard failure cannot corrupt source/domain state: corrupt-store scenario leaves storage byte-identical and the writer/reader operational (CK).

## GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT
- `uads doctor` (v0.12.1, host win32 10.0.26200, projectId `eed734731d58f172`) — exit 0, `All foundation checks passed.` (`node`, `git`, `git-repository`, `uads-home`, `global-layout`, `sidecar-workspace`, `host-adapters cursor/codex/generic-agent-skills = SUPPORTED/INSTALLED/CLEAN`).
- `uads status` — `zeroProjectFootprint: true`, `workspaceExists: false`, `modelRegistryStatus: valid` (2 profiles), `specialistRegistryStatus: valid` (25 profiles), `loopDetected: false`, adapters CLEAN. Sidecar state lives in `C:\Users\csn19\.uads`, not in this repository.
- No project-local UADS installation was created; no governance check was bypassed.

## Repository gates on exact final head
- CI: PENDING (must run on the final pushed head)
- CodeQL: PENDING
- Dependency Review: PENDING
- Cross-Platform: PENDING

## Remaining debt / known limitations
- Issue #39 M30 telemetry overhead debt remains open; no production SLO/capacity claim is made from developer-host observations.
- PF-004/T7: real ENOSPC / read-only volume injection was not performed; corruption, retention and degradation paths were exercised.
- ES-020: slice-level truth rules are proven; concrete remaining/reserved/consumed budget fields depend on M07/M24 owner payloads not wired in this read-only slice.
- Full suite contains one pre-existing unrelated failure (RC/G14 tag proof against a repository with 0 tags); not caused by this Work Order.
- Exact-head CI/CodeQL/Dependency Review/Cross-Platform and independent HEDS must run on the final head before merge.

## HEDS
Review ID: PENDING (assigned after independent final audit)
Verdict: PENDING

## Final verdict
Terminal state: `COMPLETE_CANDIDATE` (Review-01 correction applied: scan saturation and rejected/corrupt records are distinct bounded-reader evidence, proven end-to-end through the real reader and dashboard/cockpit path).

This is not APPROVED: independent ChatGPT review, exact-head repository gates and HEDS remain to be executed on the final head. No CORRECTION_REQUIRED condition was found: no scenario fabricates live state, hides continuity gaps, bypasses source authority, grows telemetry/SSE unboundedly, exposes sensitive raw data, introduces model-bearing dashboard refresh, or weakens M03/M07/M21/M24/M29/M31 authority.