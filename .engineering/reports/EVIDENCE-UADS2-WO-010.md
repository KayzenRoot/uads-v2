# Evidence Bundle — UADS2-WO-010 / M03 S05.5

Status: IMPLEMENTATION VERIFIED / FINAL EXACT-HEAD HEDS PENDING
Issue: #37
PR: #38
Base main: `5752d1ff7716027071464308eaec6e0a0aef3892`
Planning freeze: `d105d87b677598e878909e22fcb606e8f625e464`
Implementation head: `5136f4c940b68ec07538b7654e68edf2a6b7af9e`

## Changed runtime/verification surface

- `src/kernel/host-capability-probe.ts`
- `tests/host-capability-cross-platform.test.ts`
- `.github/workflows/compatibility.yml`

Runtime change is limited to an immutable inspectable execution-policy constant reused by `execFile`:
- executableRule=node-current;
- shell=false;
- windowsHide=true;
- pathLookup=false.

No package/dependency change.
No vendor-specific probe.
No real-host capability claim.
No M30 event enum expansion.

## Runtime fingerprints

- probe runtime: `3ec3da0181e0eeb896124b3bfebb292412283f81`
- focused tests: `2f31072b46b8543b61adf4a3ed7258ff40c52cb4`
- compatibility workflow: `c0a95d12e6abd1a80cc5e8b88a4e6204130acfa5`

## M03-T061..T066

Cross-platform run `34423921328`.

Linux / Node20, job `102705000983`:
- focused file: 1/1 PASS;
- focused tests: 9/9 PASS;
- T061: node-current SUCCEEDED, pre/post identity stable;
- T066: shell=false, pathLookup=false.

Windows / Node20, job `102705000811`:
- focused file: 1/1 PASS;
- focused tests: 9/9 PASS;
- T062: node-current SUCCEEDED, pre/post identity stable;
- T065: shell=false, windowsHide=true, pathLookup=false.

Shared:
- T063 case-distinct lexical roots remain distinct;
- T064 lexically equivalent same root converges through V2 binding;
- adapterId remains digest domain-separated.

V2 intentionally remains case-preserving instead of adding Windows case-folding. This is conservative against root replay/collision.

## Full hosted verification

CI run `34423921430`, Foundation job `102705001365`:
- lint PASS;
- typecheck PASS;
- build PASS;
- 56/56 test files PASS;
- 539/539 tests PASS;
- standard evals PASS;
- validate foundation PASS;
- validate engineering PASS;
- dependency audit PASS;
- packaging PASS.

Other gates:
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Cross-Platform SUCCESS.

## B6 telemetry overhead

Frozen S04 target:
`<5% median CPU-time overhead OR explicit justified exception`.

Primary:
- telemetry disabled median CPU: 289.75 us/op;
- telemetry enabled median CPU: 1891.625 us/op;
- overhead: 552.847282%;
- wall median: 0.290993 ms/op -> 2.087984 ms/op.

Validation rerun:
- telemetry disabled median CPU: 370.5 us/op;
- telemetry enabled median CPU: 1934 us/op;
- overhead: 421.997301%;
- wall median: 0.351314 ms/op -> 2.029555 ms/op.

Verdict: **JUSTIFIED_EXCEPTION**, not PASS.

Reason:
the existing M30 `evidence.lifecycle` path performs synchronous durable event write, hashing, retention scan/cleanup and health projection. The measured cost is preserved explicitly rather than hidden.

This is a real optimization opportunity for M30/S06 architecture. It is not allowed to weaken event durability or capability truth merely to improve the benchmark.

## Truth independence

A forced telemetry attribution failure returns telemetry FAILED while the PCCR record remains VALID with the exact proof digest.

Therefore telemetry availability/performance remains non-authoritative for M03 truth.

## Enterprise classification

- M27 COVERED: fixed execution and benchmark bounds measured.
- M28 COVERED: telemetry failure cannot corrupt truth.
- M29 COVERED: no shell/PATH weakening; root identity remains conservative.
- M30 COVERED WITH PERFORMANCE EXCEPTION: functional contract passes; B6 target missed and is explicitly recorded.
- M31 COVERED: additive inspectable policy + targeted CI verification; no migration risk.

## Known limitation / follow-up

B6 is a performance debt, not a correctness defect.
Do not claim <5% overhead.
A future bounded optimization should examine amortized/batched operational projection without making event delivery authoritative for capability truth.

## Final gate

This evidence commit changes PR HEAD. Fresh exact-head CI, CodeQL, Dependency Review and Cross-Platform SUCCESS plus zero unresolved threads are required before HEDS approval.
