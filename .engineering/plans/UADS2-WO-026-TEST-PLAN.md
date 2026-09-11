# UADS2-WO-026 — M03 Proven Capability Resolution + Dispatch Adapter Binding Test / Proof Plan

Status: LOCKED / CODEX_READY
Risk: HIGH
Base main SHA: `a0a778e5fa4a28750540246fa5894c91a92d0b2b`

## Purpose
Prove that the frozen WO-026 architecture — current, basis-bound stored/active PCCR resolution behind IF-001 `readHostCapabilityProjection()` plus explicit dispatch adapter-identity binding — is implementable without weakening capability truth: TRUE only from current valid SUPPORTED proof, FALSE only from current valid NPC-compliant UNSUPPORTED proof, everything else UNKNOWN and non-enabling, provenance `proven` only when PCCR-backed, and adapter identity explicit, validated and fail-closed.

## Mandatory proofs
### P1 Current valid SUPPORTED PCCR projects TRUE; passive declaration TRUE stays UNKNOWN
- a current, basis-matching stored/active SUPPORTED PCCR for the subject/adapter projects capability TRUE through `readHostCapabilityProjection()`;
- a passive/adapter declaration of TRUE with no PCCR evidence stays UNKNOWN (E1, `ADAPTER_DECLARATION_TRUE_NOT_PROOF` discipline);
- provenance becomes `proven` in the PCCR-backed scenario, and `requireProvenRuntime` can then be satisfied only for capabilities carrying positive proof.
Maps: PDF §2 (positive TRUE); HEDS goal (provenance may become `proven` from validated evidence only).

### P2 Missing/stale/expired/corrupt/subject-mismatch/basis-mismatch stays UNKNOWN and never enables
- missing proof → UNKNOWN (`MISSING` read outcome);
- stale proof beyond currentness → UNKNOWN (effective state STALE; `PROOF_RECORDED_STALE` semantics);
- expired lease → UNKNOWN (`LEASE_EXPIRED`);
- corrupt/invalid proof file or digest → rejected → UNKNOWN (`REJECTED`), never a crash through consumers;
- subject mismatch (proof bound to a different subject digest) → UNKNOWN;
- basis mismatch (different runtime version, adapter-contract digest, probe-definition/policy/configuration digest or clock regression) → UNKNOWN;
- in every negative case the projection never enables the capability and provenance never becomes `proven`.
Maps: P2; HEDS negative proofs (stale proof, subject/basis mismatch, corrupt proof).

### P3 Valid NPC UNSUPPORTED projects FALSE; invalid negative proof cannot
- a current valid UNSUPPORTED proof satisfying NPC rules projects FALSE through the boundary;
- FALSE never enables the capability (it is not positive proof);
- negative proof that is stale, basis-mismatched or non-NPC-compliant does not project FALSE (remains UNKNOWN).
Maps: P3.

### P4 Provenance `proven` only from validated PCCR-backed evidence
- provenance `proven` appears only when the returned compatibility snapshot is PCCR-backed by current validated proof evidence evaluated against the current basis for this read;
- adapter declaration alone, legacy snapshot alone or any non-proof source never yields `proven`;
- a passive-only projection keeps provenance `unknown`;
- per-capability truth remains independently true/false/unknown inside a `proven` snapshot, and `requireProvenRuntime` + `effectiveCapability` still fail closed for any required capability without positive proof.
Maps: P4; HEDS goal (define exactly when provenance may become `proven`).

### P5 Explicit dispatch adapter identity is bound to actual detection/subject; mismatch blocks visibly
- dispatch accepts adapter identity as a governed input from bootstrap/CLI/host integration;
- the supplied identity is validated against actual detection/subject identity for the current host;
- a mismatch produces a visible, fail-closed block (dispatch does not proceed silently under a wrong adapter identity);
- identity is never inferred from legacy capability state or persisted snapshots.
Maps: P5; HEDS goal (thread explicit adapter identity; never inferred from legacy state).

### P6 No adapter identity → conservative UNKNOWN and dispatch fail-closed
- dispatch with no adapter identity resolves conservative all-UNKNOWN truth (`CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` semantics);
- routing/dispatch remains visibly blocked with an explicit reason; nothing is enabled.
Maps: P6; HEDS goal (fail-closed when adapter/proof is absent).

### P7 No consumer reads PCCR storage/probe internals directly; M05 only uses the facade
- M05 and other consumers import only `readHostCapabilityProjection()` for capability truth;
- proof storage layout, probe registry and proof-evaluation internals are not imported outside the M03 boundary module(s) and their focused tests;
- the structural claim is recorded as evidence (import-graph/static assertion or equivalent deterministic check).
Maps: P7; IF-001; HEDS goal (no consumer coupling to proof storage/probe internals).

### P8 No paid provider/model call by default; probes bounded, auditable, privacy-safe
- no provider/network access is required for proof resolution or acquisition by default (probe policy: READ_ONLY_LOCAL, network DENY, environment allowlist);
- any probe execution is registered, versioned and bounded; receipts are non-enabling;
- no secrets or absolute host paths leak into proof or projection artifacts (existing privacy assertions remain in force).
Maps: P8.

### P9 Windows/Linux deterministic identity and proof evaluation
- subject digests, basis digests and projection outputs are byte-stable across Windows and Linux;
- full suite plus the Cross-Platform Compatibility workflow are green on both runners;
- no host-path-dependent assertions in proof/projection tests.
Maps: P9.

### P10 Post-runtime PR #77 X7/FI regressions removable without legacy enablement or weakened requirement
- with the WO-026 runtime merged, the eval fixtures that currently seed a legacy persisted runtime snapshot are replaced by deterministic fixture proofs compiled/persisted through the public M03 APIs under the test environment;
- execution eval X7 and the fault-injection suite return to green without restoring `readRuntimeCapabilitySnapshot()` enablement and without touching `requireProvenRuntime`;
- this proof obligation lands with the later runtime increment; this freeze documents the frozen strategy so the runtime executor cannot choose a weaker shortcut.
Maps: P10; HEDS goal (remove X7/FI regressions after WO-026 merges).

## Out-of-scope proof IDs (NOT_APPLICABLE for the WO-026 runtime increment)
- M05 routing/lock proof family (RT-001/002/003/009/010/011, ES-013/014): owned by the resumed IW1-01 increment after the WO-026 runtime prerequisite merges; not re-proven here.
- M06 effort family (RT-004..008): owner IW1-02.
- M07/M24 economic-safety and accounting families (RT-012, ES-015..019): owner IW1-03/IW1-04.
- M03 V1 proofs: owned by the frozen V1 module; untouched.
The executor records these as NOT_APPLICABLE with owner reference; absence of proof is not failure for this slice but may never be claimed as proven.

## Performance evidence
This planning increment performs no runtime measurement. The later runtime increment records stored-proof resolution and probe-path latency as OBSERVATION only; no paid benchmarks; no production SLO/capacity claims from developer/CI hosts. Proof resolution must not introduce model-bearing calls.

## Required execution evidence
- focused Vitest suites for the consumer boundary, proof resolution/projection, passive fallback and dispatch adapter binding;
- full repository test suite;
- negative scenarios: missing/stale/expired/corrupt proof, subject mismatch, basis mismatch (runtime version, adapter-contract, probe/policy/configuration), clock regression, non-NPC negative proof, passive TRUE declaration, adapter-identity absence, adapter-identity mismatch;
- Windows/Linux CI evidence;
- exact-head CI, CodeQL, Dependency Review and Cross-Platform success;
- Evidence Bundle tied to the implementation SHA;
- final independent HEDS before merge.

## Enterprise pillars
M27: bounded probe/proof workload profile; no paid capacity added; proof resolution performs zero model-bearing calls.
M28: failure semantics for corrupt/stale/mismatched proofs; crash-safe atomic persistence; consumers never crash through.
M29: closed schemas; no secrets/host paths in proof or projection artifacts; sanitized bounded reason codes.
M05: consumer discipline preserved (IF-001 only).
M30: truthful projection of capability provenance; absence renders UNKNOWN, never fabricated `proven`.
M31: exact-head CI, CodeQL, Dependency Review, Cross-Platform + HEDS.

## Release gate
Any failure that can enable from non-PCCR evidence, mark passive-declared TRUE as SUPPORTED, make UNKNOWN enabling, set provenance `proven` without validated current PCCR evidence, infer dispatch adapter identity, bump the runtime snapshot contract `0.8.0`, weaken `requireProvenRuntime`, require paid calls, or leak secrets/host paths is release-blocking for this slice.
