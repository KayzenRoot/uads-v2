# CORRECTION DELTA — UADS2-WO-009-C01

Status: CLOSED / HEDS APPROVED / MERGED
Work Order: UADS2-WO-009
Issue: #34
PR: #35
Branch: `work/uads2-wo-009-m03-active-evidence-compiler`
Rejected HEDS head: `5932f942a84d19ca20c07ed71a92ae344b93a151`
Corrective implementation head: `023b867ee2f817dcc2331cb2ddd3c512c99b1bd9`
Review record: PR #35 review `5161214081`

## Rejected findings

### H-01 HIGH — caller-controlled TEST_ONLY boundary
`compileActiveEvidenceToPccr()` accepted caller-provided `nodeEnv`, allowing a caller to request test semantics.

### H-02 HIGH — executable identity absent from active reuse invalidation
Probe receipts carried executable identity, but an otherwise-identical later executable identity change was not independently represented in the active current basis.

### E-01 BLOCKING — stale evidence identity
Evidence artifacts still pointed at the pre-hardening implementation head after runtime/test changes.

### M-01 hardening — incomplete status/reason semantic coherence
Non-success receipt families required stronger contradiction rejection.

## Corrective delta

- removed `nodeEnv` from the authority-bearing compiler input;
- TEST_ONLY gating now uses the runtime test boundary instead of a caller override;
- added `executableIdentityDigest` to the active current context;
- active PCCR validity now uses a deterministic composite configuration binding over configuration identity + executable identity;
- receipt executable identity must match current executable identity when present;
- exported a deterministic active-current-basis builder for later re-evaluation;
- tightened status/reason coherence for SUCCEEDED, FAILED, TIMED_OUT, OUTPUT_LIMIT, BLOCKED and IDENTITY_DRIFT;
- added adversarial regression for caller spoofing, contradictory receipts and executable-only drift;
- PCCR 1.0 compatibility and the production-empty active registry remain intact.

## Scope proof

Rejected head -> corrective implementation head changes only:
- `src/kernel/host-capability-active-evidence.ts`;
- `tests/host-capability-active-evidence.test.ts`.

No vendor-specific probe, new dependency, host-dispatch migration, capability vocabulary expansion, network/mutating/cost-bearing probe or real-host capability claim entered.

## Verification

CI run: `34420764578`
Foundation job: `102695468622`

- install/lint/typecheck/build PASS;
- 55/55 test files PASS and 530/530 tests PASS on the direct test pass;
- 55/55 test files PASS and 530/530 tests PASS again inside foundation validation;
- all orchestrator/execution/context/fault/cost/model/specialist/adapter/assurance/fault-injection evals PASS;
- skills/foundation/engineering validation PASS;
- npm audit and packaging smoke PASS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Linux Node 20 SUCCESS;
- Windows Node 20 SUCCESS.

WO009-B1 primary: p50 0.138872 ms / p95 0.190151 ms <= 10 ms.
WO009-B1 validation: p50 0.160890 ms / p95 0.250155 ms <= 10 ms.
WO009-B4: falsePositiveFromAbsence=0, absenceUnsupported=0, unrecognizedUnsupported=0, forgedAccepted=0.

## Closure

Exact reviewed head: `148a3a7699549422a479b1188ce1a9e516bb4b34`
HEDS review: `5161388526`
Merge SHA: `25185cda96f6c9dcf9a3fd32d0e907f82fd28ac4`
Final CI run: `34421387340`
Final Foundation job: `102697366734`

- Foundation / CodeQL / Dependency Review / Linux / Windows SUCCESS;
- 55/55 test files PASS and 530/530 tests PASS twice;
- exact-head B1 p95 0.326722 ms direct / 0.328023 ms validation <= 10 ms;
- B4 all safety counters zero;
- zero unresolved review threads;
- H-01, H-02, E-01 and M-01 CLOSED.

Correction C01 is objectively closed and promoted through UADS2-WO-009.