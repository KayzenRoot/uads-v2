# Work Order — UADS2-WO-010

Status: COMPLETED — HEDS APPROVED / MERGED
Module: M03 — Host Capability Detector
Slice: S05.5 — Cross-Platform & Telemetry Hardening
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-010-m03-cross-platform-telemetry-hardening`
Base SHA: `5752d1ff7716027071464308eaec6e0a0aef3892`
Issue: #37
PR: #38
Risk: ELEVATED
ADR: ADR-UADS2-012 — ACCEPTED

## Objective

Close the remaining generic cross-platform S04 obligations M03-T061..T066 and B6 before any vendor-specific active-probe experiment.

## Technology decisions surfaced before freeze

Reuse:
- Node `path`, `fs`, `process.execPath`, `process.cpuUsage`;
- existing V2 target-root binding;
- existing PBF executor;
- existing M30 `evidence.lifecycle`;
- Vitest;
- GitHub Actions Linux/Windows Node 20 matrix.

No new dependency.

Proprietary consolidation:
**CLDS Portable Proof Envelope** means proof identity is platform-explicit and conservative:
- case-distinct lexical roots do not collide;
- lexically equivalent same roots converge;
- adapter ID remains a digest domain separator;
- executable identity remains privacy-safe and platform/arch bound;
- no case-folding shortcut is added on Windows.

## Runtime scope

Allowed minimal runtime change:
- expose one immutable inspectable PBF execution-policy constant and use it for `execFile`.

Expected test/workflow additions:
- `tests/host-capability-cross-platform.test.ts`;
- targeted cross-platform test step in `.github/workflows/compatibility.yml`.

Evidence/governance files may change.

## M03-T061..T066

- T061 Linux: production `node-current` probe succeeds with stable pre/post executable identity digest.
- T062 Windows: same contract on Windows.
- T063 case-distinct canonical target roots remain digest-distinct.
- T064 lexically equivalent same-root paths converge; V2 remains case-preserving rather than case-folding.
- T065 Windows execution policy proves `shell=false`, `windowsHide=true`, direct `process.execPath`, no PATH lookup.
- T066 POSIX execution policy proves `shell=false` and direct `process.execPath`.

The compatibility matrix MUST execute the focused test file on both Linux and Windows.

## B6 telemetry overhead

Compare CPU time for bounded PCCR persistence:
- same proof persistence baseline with telemetry disabled;
- same proof persistence with existing M30 `evidence.lifecycle` enabled;
- isolated temporary workspaces;
- warm-up excluded;
- multiple batches;
- report median CPU microseconds/op and overhead percentage.

Target:
- <5% median CPU-time overhead; OR
- explicit justified exception with measured result and no claim of passing target.

Regardless of result:
- telemetry failure/overhead cannot mutate proof truth;
- no synthetic production SLO;
- no benchmark number may be fabricated.

## Observability scope

Reuse existing `evidence.lifecycle`.
Do NOT expand M30 event enum in this slice.
Do NOT make event transport authoritative for capability truth.

## Out of scope

- Cursor/Codex active probes;
- real local-host capability claim;
- future capability IDs;
- host-dispatch migration;
- broad event-family expansion;
- new dependency;
- M03 S07 freeze.

## Stop condition

STOP if:
- cross-platform focused tests do not run on both matrix OSes;
- a case-folding change weakens root replay protection;
- shell/PATH selection becomes possible;
- telemetry changes proof truth;
- B6 is reported as PASS when >5%;
- HIGH/CRITICAL defect remains.


## Implementation evidence snapshot

Implementation head: `5136f4c940b68ec07538b7654e68edf2a6b7af9e`
CI run: `34423921430`
CI job: `102705001365`
Cross-platform run: `34423921328`

Hosted implementation-head result:
- 56/56 test files PASS;
- 539/539 tests PASS;
- CI SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Linux/Node20 SUCCESS;
- Windows/Node20 SUCCESS;
- focused M03 hardening test ran on both OSes.

B6:
- primary CPU overhead = 552.847282%;
- validation CPU overhead = 421.997301%;
- target <5% is NOT met;
- verdict = JUSTIFIED_EXCEPTION, exactly as permitted by frozen S04;
- reason: current M30 evidence.lifecycle performs synchronous durable event persistence, hashing, retention and health projection.

Capability truth remained unchanged when telemetry failed.
Final exact-head HEDS still required after this evidence-only commit.


## Final HEDS completion record

- Exact reviewed head: `51884e5716a362ab983bced0d3d8dfef4efb0868`
- HEDS review: `5161673161`
- HEDS verdict: `APPROVED WITH DOCUMENTED PERFORMANCE EXCEPTION`
- Merge SHA: `886bfaee6fcf3fb42ce5e0bcc2782fd8484cf721`
- CI / CodeQL / Dependency Review / Cross-Platform: SUCCESS
- 56/56 test files PASS
- 539/539 tests PASS
- Linux focused T061/T066: PASS
- Windows focused T062/T065: PASS
- T063/T064 root-binding portability rules: PASS
- Exact-head B6 direct overhead: 401.567944%
- Exact-head B6 validation overhead: 372.111293%
- B6 verdict: JUSTIFIED_EXCEPTION, NOT PASS
