# Evidence Bundle — UADS2-WO-009 / M03 S05.4

Status: HEDS APPROVED / MERGED
Issue: #34
PR: #35
Base main: `fbdd1927af7ea250fadac7db0725144dd4873b91`
Contract freeze: `9c4bacdacb9a1ebbe5c55170faf0944f3221d232`
Rejected HEDS head: `5932f942a84d19ca20c07ed71a92ae344b93a151`
Corrective implementation head: `023b867ee2f817dcc2331cb2ddd3c512c99b1bd9`

## Runtime fingerprints at corrective implementation head
- PCCR schema: `aa22c6b3aed3b94bb227234810e2df926c4695a7`
- PCCR runtime: `ff79a8f6280e8be0ae4563e9b6e62b9e216df76b`
- probe runtime: `531ef1cfeb5fa186533711f245561253cd856912`
- active contract schema: `31a2c2e18605c600ccbf4e2d2700ad4847c55beb`
- active compiler: `99d8efe5b01498cef5720eb330176da8504c2d8c`
- active tests: `d57d2060f80dd0c9ff2dea7d53b2ee9357177e9c`

## Accepted implementation behavior candidate
- historical PCCR 1.0 remains readable/evaluable;
- legacy `compileHostCapabilityProof()` continues emitting 1.0;
- active compiler emits 1.1 only;
- PCCR 1.1 adds `active-probe-recognized-unsupported` and `complete-enumeration-exclusion`;
- PCCR 1.0 carrying a new 1.1 negative kind is rejected;
- production active evidence contract registry remains empty;
- TEST_ONLY semantics cannot be selected by a caller-provided environment override;
- active validity binds configuration identity plus current executable identity in one deterministic digest;
- executable-only identity drift makes the prior active proof STALE;
- receipt subject/adapter/capability/probe/descriptor/parser/executable/status semantics are exact-bound;
- contradictory non-success status/reason receipts fail closed;
- missing, blocked, timeout, failed, output-limit, identity-drift and unrecognized outcomes never create UNSUPPORTED;
- recognized exact TEST_ONLY support creates E3 finite-leased SUPPORTED only inside the trusted test runtime;
- recognized exact TEST_ONLY unsupported creates E3 NPC UNSUPPORTED only inside the trusted test runtime;
- recognized complete-enumeration exclusion creates E3 NPC UNSUPPORTED only inside the trusted test runtime;
- lease/descriptor/policy/config/runtime/executable drift becomes STALE;
- no Cursor/Codex-specific probe or real-host claim exists.

## Corrective hosted verification
CI run `34420764578`, Foundation job `102695468622`:
- lint/typecheck/build PASS;
- 55/55 test files PASS;
- 530/530 tests PASS;
- full suite PASS twice, including foundation validation rerun;
- all standard evals/engineering validation PASS;
- npm audit/packaging PASS;
- CI SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Cross-Platform Linux/Windows SUCCESS.

## Benchmark
Primary direct suite:
- WO009-B1 1000 compiles: p50 0.138872 ms, p95 0.190151 ms <= 10 ms;
- WO009-B4 falsePositiveFromAbsence=0, absenceUnsupported=0, unrecognizedUnsupported=0, forgedAccepted=0.

Foundation validation rerun:
- B1 p50 0.160890 ms, p95 0.250155 ms <= 10 ms;
- B4 all counters zero.

## Correction-specific proof
- caller-supplied `nodeEnv:"test"` is ignored as an unknown field while production runtime state remains CONTRACT_BLOCKED;
- supported, unsupported and complete-enumeration TEST_ONLY fixtures cannot manufacture truth outside the trusted test runtime;
- current executable identity participates in the active validity fingerprint;
- changing only executable identity invalidates the prior active proof to STALE;
- forged coherent-digest receipts with contradictory terminal status/reason pairs are rejected.

## Enterprise readiness
- M27 COVERED: bounded registry/results/lease and sub-ms compiler evidence.
- M28 COVERED: failures degrade to UNKNOWN/BLOCKED; lease and all covered drift dimensions fail closed.
- M29 COVERED: TEST_ONLY boundary hardened, exact receipt/contract/executable binding, forged receipt rejection, no raw executable path persistence.
- M30 NOT_APPLICABLE to truth in this slice: compiler truth does not depend on telemetry.
- M31 COVERED: PCCR 1.0 reader remains compatible and PCCR 1.1 evolution is additive.

## Known limitations
- no production active evidence contracts;
- no vendor-specific probes;
- no real host capability truth promoted;
- no host-dispatch migration;
- no future capability IDs;
- M03 not S07-frozen.

## Final exact-head HEDS evidence

Exact reviewed head: `148a3a7699549422a479b1188ce1a9e516bb4b34`
HEDS review: `5161388526`
Merge SHA: `25185cda96f6c9dcf9a3fd32d0e907f82fd28ac4`
Exact-head CI run: `34421387340`
Exact-head Foundation job: `102697366734`

Final:
- 55/55 test files PASS;
- 530/530 tests PASS;
- full test suite PASS again inside foundation validation;
- Foundation SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Linux / Node 20 SUCCESS;
- Windows / Node 20 SUCCESS;
- all standard evals / foundation / engineering validation SUCCESS;
- npm audit / packaging smoke SUCCESS;
- unresolved review threads = 0;
- PR mergeable_state = clean at audit.

Exact-head benchmark:
- direct B1 p50 0.230617 ms / p95 0.326722 ms <= 10 ms;
- validation B1 p50 0.222866 ms / p95 0.328023 ms <= 10 ms;
- B4 all safety counters zero.

The evidence-only head changed no runtime file from corrective implementation head `023b867ee2f817dcc2331cb2ddd3c512c99b1bd9`.

HEDS verdict: APPROVED. PR #35 merged successfully.