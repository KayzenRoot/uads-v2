# Evidence Bundle — UADS2-WO-009 / M03 S05.4

Status: IMPLEMENTATION VERIFIED / FINAL EXACT-HEAD HEDS PENDING
Issue: #34
PR: #35
Base main: `fbdd1927af7ea250fadac7db0725144dd4873b91`
Contract freeze: `9c4bacdacb9a1ebbe5c55170faf0944f3221d232`
Implementation head: `c94bf0ba8c32f9f893ec1d1817c6739e8d3b3c55`

## Runtime fingerprints
- PCCR schema: `aa22c6b3aed3b94bb227234810e2df926c4695a7`
- PCCR runtime: `0a42094103eeca2358d06a6fb940acd33cd71898`
- probe runtime: `531ef1cfeb5fa186533711f245561253cd856912`
- active contract schema: `31a2c2e18605c600ccbf4e2d2700ad4847c55beb`
- active compiler: `90a8f57eed927bbc7b6b0289d97909d59365e6c7`
- active tests: `8612a8b26eedc7ac06b6fa703648427fc63bd0b1`

## Accepted implementation behavior
- historical PCCR 1.0 remains readable/evaluable;
- legacy `compileHostCapabilityProof()` continues emitting 1.0;
- active compiler emits 1.1 only;
- PCCR 1.1 adds `active-probe-recognized-unsupported` and `complete-enumeration-exclusion`;
- PCCR 1.0 carrying a new 1.1 negative kind is rejected;
- production active evidence contract registry is empty;
- only fixed TEST_ONLY contracts are used in this slice;
- receipt subject/adapter/capability/probe/descriptor/parser/status semantics are exact-bound;
- missing, blocked, timeout, failed, output-limit, identity-drift and unrecognized outcomes never create UNSUPPORTED;
- recognized exact TEST_ONLY support creates E3 finite-leased SUPPORTED;
- recognized exact TEST_ONLY unsupported creates E3 NPC UNSUPPORTED;
- recognized complete-enumeration exclusion creates E3 NPC UNSUPPORTED;
- lease/descriptor/policy/config/runtime drift becomes STALE;
- no Cursor/Codex-specific probe or real-host claim exists.

## Hosted verification
Implementation head CI run `34416641918`, job `102682884195`:
- lint/typecheck/build PASS;
- 55/55 test files PASS;
- 526/526 tests PASS;
- standard evals/engineering validation PASS;
- CI SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Cross-Platform Linux/Windows SUCCESS.

## Benchmark
Primary:
- WO009-B1 1000 compiles: p50 0.247572 ms, p95 0.377957 ms <= 10 ms;
- WO009-B4 falsePositiveFromAbsence=0, absenceUnsupported=0, unrecognizedUnsupported=0, forgedAccepted=0.

Validation rerun:
- B1 p95 0.381644 ms;
- B4 all counters zero.

## Enterprise readiness
- M27 COVERED: bounded registry/results/lease and sub-ms compiler evidence.
- M28 COVERED: failures degrade to UNKNOWN/BLOCKED and drift/lease fail closed.
- M29 COVERED: exact receipt/contract binding; forged coherent-digest receipt rejected.
- M30 NOT_APPLICABLE to truth: compiler does not depend on telemetry.
- M31 COVERED: backward-compatible 1.0 reader plus additive 1.1 emitter.

## Known limitations
- no production active evidence contracts;
- no vendor-specific probes;
- no real host capability truth promoted;
- no host-dispatch migration;
- no future capability IDs;
- M03 not S07-frozen.

Fresh exact-head gates are mandatory after this evidence-only commit.
