# EVIDENCE — UADS2-WO-020

Status: COMPLETE_CANDIDATE — implementation, tests and evidence ready for independent review; exact-head gates and HEDS remain PENDING
Module: M30 Production Observability & Real-Time Operations
Session: S05.1 Truth Kernel & Living Cockpit Vertical Slice
Issue: #65
PR: #74
Risk: HIGH

## Exact identities
- Base main SHA: `e5ed58ed541c415c06fe42498f622a1aeada0f4a` (verified as merge-base with `origin/main`)
- Implementation head SHA: `4a101ccce6fc0d11cced4cd55dffdecbf6fe3d80`
  - `29bb00e` feat(UADS2-WO-020): implement M30 S05.1 truth kernel and living cockpit
  - `cc8998d` test(UADS2-WO-020): add truth kernel and cockpit runtime proofs
  - `4a101cc` chore(UADS2-WO-020): observe cockpit projection latency in M30 benchmark
- Node version: `v24.18.0` (npm `11.16.0`)
- OS/platform: Windows `10.0.26200` x64, PowerShell, host `D:\Projekt Codexx\uads-v2`
- Executor/host model routing state: `HOST_FIXED` — the host exposes no per-subtask model/effort control to the executor and `uads status` reports `modelRoutingStatus: (none)` / `selectedProfileId: (none)`. GPT-5.6 Luna availability was not proven on this host and is not claimed.
- Requested effort / applied effort: requested per-subtask LOW/MEDIUM/HIGH; applied effort `UNKNOWN` (not observable or controllable on this host).

This bundle document is committed after the implementation head above. The resulting final head is a new revision and MUST receive fresh exact-head CI, CodeQL, Dependency Review, Cross-Platform and HEDS before merge.

## Source baseline verification
Method: `git rev-parse e5ed58ed:<path>` versus `git hash-object <path>` (working tree clean; committed head content byte-identical to tested content).

| Path | Base blob (`e5ed58ed`) | Current blob (`4a101cc`) | Status |
| --- | --- | --- | --- |
| `src/kernel/operational-events.ts` | `c68b5a960c7774b877867ae2aa32505bd3bbff48` | `c68b5a960c7774b877867ae2aa32505bd3bbff48` | MATCH |
| `src/kernel/operational-event-types.ts` | `77ba2574d8c6b1a0d08ffce9459a09571beec972` | `77ba2574d8c6b1a0d08ffce9459a09571beec972` | MATCH |
| `src/commands/dashboard.ts` | `172b21d89bbc3421e449935ad24f5df9a32f6600` | `c98776c9b92be0dfe56ddf660c9a1aca1d98f132` | INTENTIONAL DELTA (allowed primary source boundary) |
| `tests/operational-events.test.ts` | `9f24f8d2d838cffe8c2143c1f9c4dd294ad05d40` | `9f24f8d2d838cffe8c2143c1f9c4dd294ad05d40` | MATCH |
| `tests/dashboard-m30.test.ts` | `048d58bc28cc214a3afcc54a6f43f5dc13bf90ab` | `8f2cbf04f9984447f5a3c6dd70be97ac514ae98b` | INTENTIONAL DELTA (allowed primary source boundary) |

No unexpected source movement: the frozen event kernel and event contract are untouched. The two deltas are the declared implementation seam (dashboard projection) and its extended test.

New-file blobs at `4a101cc`:

| Path | Blob |
| --- | --- |
| `src/kernel/operational-truth.ts` | `416b8f71cc3e0b5fe6e6ce856f2ca6f2bbff1a72` |
| `src/kernel/operational-cockpit.ts` | `7a1d0f1cf608daeab3ef542355559a5b8adf500c` |
| `src/kernel/operational-continuity.ts` | `2ffe3295d68521378180ff5400a8c772ca248a1b` |
| `src/kernel/operational-correlation.ts` | `85cb19381408a5b9e0d8a26cda6423558478f244` |
| `src/kernel/operational-budget.ts` | `0fb2d0f9fe1bbc3bd41b3ae0af388ccb56d6421c` |
| `tests/m30-cockpit.test.ts` | `11a30526c8e0a5e2ab2b0ec1bfc0c862df1a69ad` |
| `tests/m30-truth-kernel.test.ts` | `0052731350760a5d2988f85178474181ba79e708` |
| `scripts/benchmark/m30-event-dashboard.mjs` | `35163f1f5ff36fd50a3d8db5d2097369a8a903d2` |

## Changed files
- `src/kernel/operational-truth.ts` (new) — OTCL: `OperationalStateEnvelope` (source identity/owner, observedAt/evaluatedAt, freshness lease, truth class, truth state, continuity, reason codes, lineage/evidence refs) and deterministic `evaluateOperationalTruth` with fixed precedence: integrity defect > absence > invalid timestamp/lease > clock skew > lease expiry > CURRENT.
- `src/kernel/operational-continuity.ts` (new) — TCL: `CONTIGUOUS`, `GAP_KNOWN`, `GAP_UNKNOWN`, `REPLAYING`, `UNAVAILABLE`; rejected records outrank absence (corrupt store is GAP_KNOWN, not UNAVAILABLE); silence without baseline is UNAVAILABLE; replay never erases unresolved gaps.
- `src/kernel/operational-correlation.ts` (new) — PSCF: deterministic opaque hashed correlation ids bounded to 48 chars, safe-token validation, secret/path sanitization and bounded operator labels; raw values never persisted in ids.
- `src/kernel/operational-budget.ts` (new) — AOBC/CBF: `DEFAULT_OBSERVABILITY_LIMITS`, deterministic degradation ladder (optional P3/P2 shed before protected P1/P0 truth/health/audit with visible shed evidence), adversarial cardinality firewall with visible dropped-series count, and per-client SSE backpressure firewall.
- `src/kernel/operational-cockpit.ts` (new) — read-only Living Cockpit projection (`uads.living-cockpit`): `truthClass: DERIVED` with authority notice, global health, freshness envelope, continuity, pressure/boundedness, stream state, capability truth (M03 consumer boundary only), economic projection only from owner evidence (otherwise UNKNOWN / `NO_AUTHORITATIVE_ECONOMIC_SOURCE`, owners `M07`+`M24`, value `null`), bounded lineage/evidence refs and opaque correlation id.
- `src/commands/dashboard.ts` (modified) — adds `buildCockpitSnapshot`, `/api/cockpit`, cockpit section in the operator shell, SSE stream-state truth (active clients, max, buffer limit, slow-client drops, resume state), cursor resume via `Last-Event-ID` with explicit out-of-window gap events, and slow-client backpressure drops. Loopback-only bind unchanged.
- `tests/m30-truth-kernel.test.ts` (new) — kernel-level proofs for OTCL/TCL/AOBC/CBF/PSCF/T6/T8.
- `tests/m30-cockpit.test.ts` (new) — end-to-end cockpit/HTTP/SSE/projection/privacy proofs.
- `tests/dashboard-m30.test.ts` (modified) — extends existing dashboard assertions with cockpit schema/truth-class/continuity/stream assertions and the cockpit HTML section.
- `scripts/benchmark/m30-event-dashboard.mjs` (modified) — adds `cockpitProjectionLatency` labeled `OBSERVATION` and explicit limitations incl. Issue #39 remaining open.
- `.engineering/reports/UADS2-WO-020-BENCHMARK.json` (new) — raw machine-readable benchmark output (Run B).

## Proof results
Labels: PASS / FAIL / BLOCKED / NOT_APPLICABLE. References are test names in `tests/m30-truth-kernel.test.ts` (`TK`), `tests/m30-cockpit.test.ts` (`CK`), `tests/dashboard-m30.test.ts` (`DM`), `tests/operational-events.test.ts` (`OE`).

- OP-001: PASS — CURRENT only for fresh intact evidence; lease expiry deterministically STALE (`FRESHNESS_LEASE_EXPIRED`); corrupt/missing/invalid never CURRENT (TK "renders CURRENT only for fresh, intact source evidence", "expires deterministically to STALE...", "never renders CURRENT for missing, invalid or corrupt evidence").
- OP-002: PASS — known/unknown/replayed gaps explicit; silence without baseline is UNAVAILABLE, never contiguous (TK "treats silence without an established baseline as UNAVAILABLE...", "keeps known, unknown and replayed gaps visible"; CK cursor-outside-window gap).
- OP-003: PASS — corrupt persisted record degrades visibly and is never healthy; corrupt file left byte-identical; writer/reader continue to operate (CK "marks a corrupt persisted event as degraded and never healthy", "degrades visibly on real corrupt storage without corrupting the domain workload"; OE "skips corrupt, unsupported and hash-mismatched records with degraded health").
- OP-008: PASS — absence renders UNKNOWN/UNAVAILABLE per dependent surface; capability UNAVAILABLE; economic UNKNOWN with `NO_AUTHORITATIVE_ECONOMIC_SOURCE`; zero only with authoritative M24 evidence (CK "renders absence as UNKNOWN/UNAVAILABLE instead of zero or success", "displays zero only with authoritative owner evidence").
- OP-009: PASS — no raw secrets, prompts or host paths in `/`, `/api/snapshot`, `/api/cockpit`, `/api/events`; correlation ids opaque and bounded; unsafe labels replaced (CK "leaks no raw secrets, prompts or host paths through any default surface"; TK "builds opaque bounded correlation identifiers", "rejects secrets, sensitive paths and free text from correlation labels", "redacts display labels while keeping them bounded").
- PF-001: PASS — optional P3 then P2 detail sheds before P1/P0 truth/health/audit and shedding emits visible evidence (TK "degrades optional detail before protected truth/health/audit classes").
- PF-002: PASS — adversarial attribute cardinality bounded with visible dropped-series evidence (TK "bounds adversarial cardinality with visible dropped-series evidence").
- PF-003: PASS — per-client backpressure firewall (1 MiB buffer bound, slow-client drops), client ceiling enforced with 503 `sse-client-limit`, cleanup back to 0, resume/gap truth (TK "exposes a bounded per-client backpressure firewall"; CK "keeps client work bounded and exposes truthful stream state", "replays the bounded window and resumes explicitly from a cursor", "reports an explicit gap instead of silently skipping when the cursor left the window").
- PF-004: PASS (slice scope) — bounded retention enforced with visible health, over-cap cleanup exact (`withinCap`, `oldestRemoved`, `newestRetained` all true) and corrupt storage degrades without corrupting domain workload; a real ENOSPC/read-only-volume injection was not performed in this slice (see limitations).
- ES-020: PASS (slice scope) — cockpit renders fresh/stale/gapped/absent accounting truthfully and never displays UNKNOWN as CURRENT/zero; economic truth is projected only from owning-module evidence with lineage, otherwise UNKNOWN/UNAVAILABLE with `value: null` (CK "renders absence as UNKNOWN/UNAVAILABLE instead of zero or success", "displays zero only with authoritative owner evidence"). Concrete remaining/reserved/consumed budget fields depend on M07/M24 owner payloads not wired in this read-only slice.
- T1 OTCL freshness: PASS — TK tests above; plus CK "never renders stale evidence as CURRENT" (stale event cannot render CURRENT even while raw `health.status` is HEALTHY).
- T2 TCL continuity: PASS — TK continuity suite; CK cursor-resume/gap suite.
- T3 TPSC authority separation: PASS — projection is `DERIVED` with explicit authority notice; no write-back path; source absence yields UNKNOWN/UNAVAILABLE (CK "projects DERIVED state over SOURCE-owned evidence and never writes domain truth").
- T4 AOBC/CBF boundedness: PASS — PF-001/PF-002 plus bounded evidence refs/correlation ids in the projection.
- T5 PSCF privacy: PASS — OP-009 suite plus same-origin-only shell proof (see Security/privacy).
- T6 SSE realtime/reconnect: PASS — loopback-only enforced, bounded clients, explicit cursor resume/gap, no fabricated continuity (CK suite).
- T7 storage pressure: PASS (slice scope) — retention bound + corrupt-store degradation without workload corruption; real ENOSPC injection not performed (see limitations).
- T8 economic truth/no model refresh: PASS — dashboard render/refresh path performs zero model-bearing calls (CK "keeps the dashboard render path free of model-bearing calls"; DM cockpit assertions).
- T9 foundation compatibility: PASS — OE suite green (7/7, B-001 semantics unchanged); DM suite green; full suite 569/570 with the single failure proven pre-existing and unrelated (see Tests).
- T10 source-baseline integrity: PASS — baseline table above; no unexpected drift; two intentional allowed deltas; no ownership relocation.

## Tests
### Focused
Command: `npx vitest run --maxWorkers=1 tests/m30-cockpit.test.ts tests/m30-truth-kernel.test.ts`
Result: 2 files, 26/26 tests passed.

Command: `npx vitest run --maxWorkers=1 tests/dashboard-m30.test.ts tests/operational-events.test.ts tests/m30-cockpit.test.ts tests/m30-truth-kernel.test.ts`
Result: 4 files, 36/36 tests passed.

Post-commit re-run on exact implementation head `4a101cc` (clean tree verified):
Command: `npx vitest run --maxWorkers=1 tests/m30-cockpit.test.ts tests/m30-truth-kernel.test.ts tests/dashboard-m30.test.ts tests/operational-events.test.ts`
Result: 4 files, 36/36 tests passed (47.17s).

Build: `npm run build` (`tsc -p tsconfig.json`) — exit 0, run both before and at the committed head.

### Full suite
Command: `npm test`
Result: 569/570 tests passed. Sole failure: `tests/release-security-proof.test.ts` — "RG14 keeps v0.11.0 outside corrected-release proof semantics and immutable".
Pre-existing proof: the same single test file was run in a detached worktree at base `e5ed58ed` → `1 failed | 24 passed`, identical failure. Root cause: `git ls-remote origin refs/tags/v0.11.0` is empty because remote `KayzenRoot/uads-v2` has 0 tags; the historical tag exists only in the predecessor repo (`KayzenRoot/uads` `refs/tags/v0.11.0` → `d5cb361274cb19f70c8bd02dd023b596b8babf13`, verified by `git ls-remote`). Not caused by this Work Order; not fixed here.
The full suite ran on working-tree content that is byte-identical to committed head `4a101cc` (verified: `git status --porcelain` clean and blob hashes above).

## Runtime scenarios
- Stale lease: event recorded 2020 → freshness `STALE` / `FRESHNESS_LEASE_EXPIRED`; `globalHealth` STALE while raw `health.status` remains HEALTHY — stale data cannot render CURRENT and raw health is not laundered.
- Corrupt record: corrupt JSON record → freshness `DEGRADED` / `INTEGRITY_DEFECT`, continuity `GAP_KNOWN` / `REJECTED_RECORDS`, `globalHealth` DEGRADED; corrupt file left byte-identical; new events still persist and read.
- Missing source: no evidence → `UNAVAILABLE` / `NO_SOURCE_EVIDENCE`; economic `UNKNOWN` / `NO_AUTHORITATIVE_ECONOMIC_SOURCE` with `value: null`, owners `["M07","M24"]`; capability UNAVAILABLE; zero only with authoritative M24 evidence.
- Reconnect/gap: cursor resume → `RESUMED_FROM_CURSOR`; unknown/out-of-window cursor → explicit `stream.gap` `CURSOR_OUTSIDE_BOUNDED_WINDOW`; `Last-Event-ID` honored.
- Bounded clients/cardinality: 2 active clients with `MAX_SSE_CLIENTS` reported; `slowClientDrops` 0 under normal load; `bufferLimitBytes` 1 MiB; 9th client → HTTP 503 `sse-client-limit`; cleanup back to 0.
- Source/domain protection: dashboard reads are read-only projections; corrupt/failed reads degrade projection only; event writer/reader contract (B-001) unchanged.

## Performance observation
Environment: Node `v24.18.0`, `win32` `x64`, single Windows developer host, isolated temp UADS home (`isolatedUadsHome: true`), synchronous local sidecar filesystem path. Raw artifact: `.engineering/reports/UADS2-WO-020-BENCHMARK.json`.

| Metric | Baseline (pre-change, prior session) | Run A (this session, pre-commit) | Run B (post-commit, raw artifact) |
| --- | --- | --- | --- |
| Write throughput | 26.71 ev/s | 14.76 ev/s | 22.31 ev/s |
| Write latency p50 / p95 | — / — | 45.178 / 252.095 ms | 41.193 / 56.801 ms |
| Bounded read p50 / p95 | 33.05 / — ms | 32.971 / 41.412 ms | 38.203 / 59.144 ms |
| Dashboard snapshot p50 / p95 | 1658.572 / 2133.109 ms | 1725.178 / 2117.369 ms | 2210.889 / 2878.288 ms |
| Cockpit projection p50 / p95 | (not measured) | 550.016 / 722.818 ms | 651.696 / 868.134 ms |
| Retention probe | — | HEALTHY, withinCap true, oldestRemoved true, newestRetained true | HEALTHY, withinCap true, oldestRemoved true, newestRetained true |

Notes: snapshot latency now includes the cockpit projection. Run-to-run spread on this single host is large (for example write throughput 14.76 vs 22.31 ev/s and snapshot p50 1725 vs 2211 ms across runs), so no SLO, regression or capacity claim is made from these numbers; they are developer-host OBSERVATIONs only. Issue #39 M30 telemetry overhead debt remains OPEN and is not closed or hidden by this benchmark (also recorded in the benchmark limitations).

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
Terminal state: `COMPLETE_CANDIDATE`.

This is not APPROVED: independent ChatGPT review, exact-head repository gates and HEDS remain to be executed on the final head. No CORRECTION_REQUIRED condition was found: no scenario fabricates live state, hides continuity gaps, bypasses source authority, grows telemetry/SSE unboundedly, exposes sensitive raw data, introduces model-bearing dashboard refresh, or weakens M03/M07/M21/M24/M29/M31 authority.