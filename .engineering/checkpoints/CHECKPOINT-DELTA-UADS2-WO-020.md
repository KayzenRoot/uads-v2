# UADS2-WO-020 — Checkpoint Delta

Status: CANDIDATE FOR FINAL HEDS
Date: 2026-09-10
Issue: #65
PR: #74
Module: M30 Production Observability & Real-Time Operations
Session: S05.1 Truth Kernel & Living Cockpit Vertical Slice
Risk: HIGH

## Program state
- M30 S00-S04: FROZEN / MERGED.
- UADS2-WO-024 implementation sequencing and ownership freeze: MERGED.
- UADS2-WO-020 runtime implementation: COMPLETE_CANDIDATE after the Review-01 continuity correction, the Review-02 storage-pressure Correction Delta and the Review-03 evidence-exactness Correction Delta (truthful seam-vs-production wording plus benchmark Run D; no runtime source change).
- Review-01 P1 continuity-truth defect at `0131b7123f71d6f0a111c984535ca9becbf1759a`: RESOLVED.
- Review-03 evidence-exactness defect at `350bd6e1ec3742bc626e350b960895a600e15cef` (zero-overhead wording not exact; benchmark not tied to the Review-02 implementation content): RESOLVED (evidence-only; no runtime/source change).

## Implemented slice
- OTCL deterministic truth/freshness evaluation.
- TCL explicit continuity states including CONTIGUOUS, GAP_KNOWN, GAP_UNKNOWN, REPLAYING and UNAVAILABLE.
- TPSC read-only derived Living Cockpit projection over source-owned evidence.
- AOBC/CBF bounded observability and cardinality pressure handling.
- PSCF privacy-safe bounded correlation.
- Loopback-only HTTP/SSE Living Cockpit surface with bounded clients, backpressure and cursor resume/gap truth.
- Explicit UNKNOWN/UNAVAILABLE economic and capability projection when authoritative owner evidence is absent.
- No LLM call required for dashboard render or refresh.

## Review-01 correction
The bounded reader now exposes `rejectedEventCount` and `scanSaturated` separately while retaining legacy `invalidEventCount` as a compatibility aggregate. The real reader -> dashboard -> cockpit path propagates saturation to TCL as GAP_UNKNOWN / CONTINUITY_RANGE_UNBOUNDED; rejected/corrupt records remain GAP_KNOWN / REJECTED_RECORDS_OBSERVED.

End-to-end proof forces 1,200 event files and verifies:
- scanSaturated = true;
- rejectedEventCount = 0 for saturation-only case;
- bounded read remains bounded;
- cockpit continuity = GAP_UNKNOWN;
- mixed saturation + corruption preserves GAP_UNKNOWN while knownGapCount records the rejected record;
- global health never upgrades the uncertain window to CURRENT.

## Review-02 correction (storage pressure)
T7/PF-004 is now proven with a minimal test-only storage-failure seam inside the existing operational-events persistence boundary: `armOperationalStorageFaultForTests()` refuses to arm unless `NODE_ENV=test`, restricts targets to an `observability/events` sidecar directory, validates class/code/point consistency, is bounded by `MAX_ARMED_OPERATIONAL_STORAGE_FAULTS` and is unreachable from environment variables, CLI flags or production code. The test-only fault-injection seam performs no injected fault work when unarmed. Review-02 nevertheless introduces bounded production pressure bookkeeping: successful persistence checks/clears the storage-pressure marker, and classified storage failures attempt to persist bounded WRITE_UNAVAILABLE evidence.

Faults are injected at the real call sites (`mkdir`, `open`, `fsync`) and proven end-to-end:
- `EACCES`/`EROFS` write denial and `ENOSPC` capacity exhaustion each throw the original errno; a failed write is never fabricated as stored;
- bounded `observability/storage-pressure.json` evidence records `WRITE_UNAVAILABLE` plus `STORAGE_WRITE_DENIED` or `STORAGE_CAPACITY_EXHAUSTED`; the reader can only preserve or raise degradation, never clear it;
- no partial/temporary record is left behind and adjacent state stays byte-identical;
- `/api/snapshot` health and cockpit `globalHealth` degrade to DEGRADED with bounded reason codes;
- after fault removal a subsequent write succeeds, health returns to CURRENT and the marker is removed;
- corruption, retention, continuity, privacy, boundedness, SSE and no-model-refresh guarantees remain green.

Storage-failure proofs use the AC-C2-01-permitted platform-independent injected-errno path at the real persistence call sites (no chmod-only mechanism and no production-only fault switches; the bounded production pressure bookkeeping introduced by Review-02 is described above).

## Review-03 correction (evidence exactness + Run D)
- Wording corrected in this checkpoint and in the Evidence Bundle: the seam injects nothing when unarmed, and the Review-02 bounded production pressure bookkeeping (successful persistence checks/clears `observability/storage-pressure.json`; classified storage failures attempt a bounded `WRITE_UNAVAILABLE` marker) is now stated explicitly instead of any zero-overhead claim.
- No runtime/source change: `src/` and `tests/` are byte-identical to the Review-02 implementation head `39787af` (`src/kernel/operational-events.ts` blob `d93dee6c4b293ffb3e9f89b7be9a649943628a05`), so the Review-02 focused/full/build evidence stays valid for implementation content and Run D is tied to that exact content.
- Benchmark Run D (existing M30 benchmark, `2026-09-10 22:17:06 -03:00`, Node `v24.18.0` `win32` `x64`, isolated temp home, no project-local state): write throughput 19.84 ev/s; write p50/p95 47.164/68.052 ms; bounded read p50/p95 43.951/71.48 ms; dashboard snapshot p50/p95 2247.391/3147.507 ms; cockpit projection p50/p95 846.006/1091.547 ms; retention probe HEALTHY within cap (withinCap/oldestRemoved/newestRetained true). Raw artifact updated. OBSERVATION only — never SLO or capacity.
- Regression rule (Review-03 §5.C): Run D write throughput sits inside the documented series spread (14.76–26.71 ev/s) and its snapshot p50 is ~1.7% above the previous series maximum; cockpit/snapshot readings are the highest of the series and a single noisy-host sample cannot establish a deterministic regression, so no runtime code was changed and Issue #39 stays open.
- Exact-head gates for this evidence revision: PENDING at commit time; the executor verifies the new runs and reports their IDs to the independent reviewer.

## Evidence state
- Focused post-correction suites (Review-02 exact implementation head): operational-events 11/11 PASS; M30 cockpit 14/14 PASS; 4-file focused M30 set 42/42 PASS.
- Build: PASS on the implementation head.
- Full local suite: 575/576; sole failure is the pre-existing unrelated RG14 v0.11.0 tag proof, reproduced at the base and not modified in this WO.
- Developer-host benchmark: Run D recorded on the Review-02 implementation content; observations only, no production SLO claim.
- Issue #39 M30 telemetry/performance debt remains open.
- GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT preserved.

## Enterprise pillars
- M27 scale/load: bounded scan, retention, client and cardinality limits plus pressure evidence.
- M28 resilience/recovery: corruption, reconnect, replay/gap and degraded-state behavior explicit.
- M29 operational security: loopback-only, sanitization, closed/additive contracts, no raw secret/prompt/path projection.
- M30 production observability: owned by this runtime slice.
- M31 release engineering: exact-head CI, CodeQL, Dependency Review, Cross-Platform and independent HEDS required before merge.

## Known limitations / accepted non-blocking debt
- Issue #39 remains open; current developer-host latency is not a production SLO.
- Run D cockpit/snapshot readings are the highest of the benchmark series (single noisy-host sample, observation-only); they neither close Issue #39 nor establish a deterministic regression.
- Concrete M07/M24 budget counters are not implemented here; absence renders UNKNOWN/UNAVAILABLE rather than fabricated zero/current.
- The unrelated historical RG14 tag test failure remains separate release-governance debt and is not silently fixed in M30 scope.

## STOP CONDITION
Do not merge until the final exact PR head after this checkpoint passes CI, CodeQL, Dependency Review and Cross-Platform Compatibility and independent HEDS approves that exact head. If any new code or evidence changes after HEDS, invalidate approval and repeat exact-head gates/review.
