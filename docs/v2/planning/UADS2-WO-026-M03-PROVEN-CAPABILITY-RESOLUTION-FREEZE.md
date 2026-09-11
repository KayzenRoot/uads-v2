# UADS2-WO-026 — M03 Proven Capability Resolution + Dispatch Adapter Binding Freeze

Status: CANDIDATE (planning freeze; no runtime implementation claim)
Work Order: UADS2-WO-026
Issue: #78
Owner: M03 Host Capability Detector (proven capability resolution); dispatch adapter-identity binding frozen jointly with the M05 dispatch seam
Prerequisites: HEDS review `5178444951` on PR #77 (`NEEDS_ARCHITECTURE`), M03 S05.1–S05.4 proof substrate, M03 S06.2 consumer boundary, UADS2-WO-025 M05 routing freeze
Base main SHA: `a0a778e5fa4a28750540246fa5894c91a92d0b2b`
Risk: HIGH
Readiness: moves M03 proven capability resolution + dispatch adapter binding from `ARCH_NEEDED` to `PACKAGE_READY`; the runtime implementation remains a separate, later governed increment.

## 1. Objective

Resolve the HEDS blocker H1 from PR #77 without weakening capability truth: freeze the architecture that lets `readHostCapabilityProjection()` (IF-001) resolve current, basis-bound stored/active PCCR evidence — including the conditions under which projection provenance may become `proven` — while preserving passive fallback bounds, fail-closed UNKNOWN discipline, an explicit dispatch adapter identity, and the unchanged runtime snapshot contract `0.8.0`. The later runtime increment must restore proven capability enablement so PR #77's X7/FI regressions can be removed without restoring legacy snapshot enablement or relaxing `requireProvenRuntime`.

## 2. Non-goals

- Runtime implementation of any kind (this Work Order is planning/freeze only; no `src/`, `schemas/` or `tests/` changes).
- Any edit, merge, close, rewrite or discarding of PR #77 or its branch.
- M05 routing/lock semantic changes; Model Execution Plan schema work (`0.9.0` belongs to the resumed IW1-01 increment).
- Runtime capability snapshot version bump (contract stays `0.8.0`).
- M06 effort autopilot, M07 Economic Safety Envelope, M24 accounting.
- New dependencies, paid model/provider calls, vendor API credentials, unbounded probes.
- M03 V1 mutation; changes to M03 capability vocabulary or probe policy content.

## 3. Prerequisite truth

### 3.1 HEDS blocker state (PR #77)
- PR #77 head `5889e0251ce8aa515902a05e1753f5882374bc3c`; HEDS review `5178444951` = `NEEDS_ARCHITECTURE — NOT APPROVED / DO NOT MERGE`.
- Exact-head gate state at HEDS time: CI `34596394926` FAILURE (execution eval X7 `8/9` vs `9/9` at base); CodeQL `34596394842` SUCCESS; Dependency Review `34596394917` SUCCESS; Cross-Platform `34596394840` SUCCESS.
- H1: `ensureCurrentModelPlan()` resolves capability truth with adapter identity `null` → conservative all-UNKNOWN → `requireProvenRuntime` rejects every candidate → `NO_ELIGIBLE_MODEL`. Base dispatch was green only via legacy persisted snapshot enablement, which the frozen architecture forbids. Threading an adapter id alone is insufficient because the passive provider cannot produce positive proven capability evidence.

### 3.2 Current boundary and substrate (verified facts)
- `readHostCapabilityProjection()` (`src/adapters/host-capability-consumer.ts`) wraps `buildPassiveHostCapabilityBridge({ persist: false })` and returns `{ runtime, subjectDigest, adapterContractDigest, detection }`. `HostCapabilityConsumerInput` carries the reserved optional `paths?: UadsPaths` (`Reserved for future stored-proof resolution; never written by this read API`) — the frozen evolution seam.
- Proof substrate (`src/kernel/host-capability-proof.ts`): read/persist/evaluate/path primitives; `MISSING | REJECTED | VALID` read outcomes; effective state STALE on any basis mismatch, `CLOCK_REGRESSION`, `LEASE_EXPIRED` or `PROOF_RECORDED_STALE`; `projectHostCapabilityProofsToLegacySnapshot` (currently hardcodes `confidence: "unknown"`) and `projectStoredHostCapabilityProofsToLegacySnapshot` (already reads stored proofs by subject + current basis and projects conservatively).
- Active evidence (`src/kernel/host-capability-active-evidence.ts`): registry contains only TEST_ONLY contracts; the production path returns `CONTRACT_BLOCKED / NO_PRODUCTION_ACTIVE_CONTRACT_IN_WO009`; TEST_ONLY is usable only under the test environment; `compileActiveEvidenceToPccr` compiles E3 LEASED evidence with exact receipt binding via `buildActiveEvidenceCurrentBasis`.
- Probe fence (`src/kernel/host-capability-probe.ts`): registered-only probes; single production probe `uads.node.version.v1` with `capabilityId: null` (receipts non-enabling); READ_ONLY_LOCAL; network DENY; environment allowlist.
- Passive bridge (`src/adapters/host-capability-passive.ts`): can only yield E1 UNKNOWN or E2 fixed-false `UNSUPPORTED` (`adapter-contract-impossible`); declared TRUE → UNKNOWN (`ADAPTER_DECLARATION_TRUE_NOT_PROOF`, policy digest `no-passive-supported`); proofs are `IDENTITY_BOUND` with `validUntil: null`; detection version is `null` in this flow (`VERSION_UNPROVEN`).
- Eval fixtures (`src/eval/execution.ts`, `src/eval/fault-injection-normative.ts`) currently seed a persisted runtime snapshot with `provenance: { source: "test-fixture", confidence: "proven" }` — the legacy enablement pattern the frozen architecture rejects.

## 4. Frozen architecture decisions

### 4.1 IF-001 evolution seam

- `readHostCapabilityProjection()` remains the only authorized M05 enabling-truth boundary. M05 and every other consumer read capability truth exclusively through it; no consumer may read legacy runtime snapshots, adapter declarations or raw PCCR files as enabling truth.
- The implementation evolves behind the facade using the existing optional `paths` input: the boundary resolves current stored/active PCCR evidence itself (via the existing proof read/evaluate/project primitives inside the M03 boundary module(s)).
- The consumer-facing surface — `HostCapabilityConsumerProjection` `{ runtime, subjectDigest, adapterContractDigest, detection }` — is unchanged in identity and shape. Consumers remain coupled only to the facade.

### 4.2 Current-basis computation and proof usability

On every read, before any stored proof participates, the boundary computes the current evaluation inputs for the requesting adapter/subject:
- current host subject digest (existing subject computation);
- current adapter-contract digest (existing basis builder);
- current runtime version identified from the projection inputs;
- current probe-definition digest, policy digest and configuration digest as defined by the existing basis builders;
- current time for lease/currentness evaluation.

A stored or compiled proof is usable only when `evaluateHostCapabilityProof` returns it as current for that basis: subject binding, adapter binding, runtime version, `validityBasis.adapterContractDigest`, `validityBasis.probeDefinitionDigest`, `validityBasis.policyDigest`, `validityBasis.configurationDigest` and lease/validity all match. Any mismatch, `CLOCK_REGRESSION`, `LEASE_EXPIRED` or recorded STALE yields effective state STALE → UNKNOWN in the projection and remains non-enabling. Missing (`MISSING`) and rejected/corrupt (`REJECTED`) reads are UNKNOWN; they never throw through consumers and never enable.

### 4.3 Truth semantics and provenance

Mapping into the compatibility snapshot:
- SUPPORTED (current valid; CEL floor satisfied — global enabling floor E2, stricter per-capability rungs where defined) → capability true;
- UNSUPPORTED (current valid; NPC-compliant negative proof) → capability false;
- anything else — missing, rejected, stale, mismatched, expired, clock-regressed or unknown — → capability unknown.

Provenance (frozen definition):
- `confidence = proven` iff the returned snapshot is PCCR-backed by current validated proof evidence evaluated against the basis computed for this read.
- PCCR-backed means: the snapshot's capability values were computed by evaluating PCCR proof records (stored and/or compiled from bounded active evidence) against the current basis; every true/false claim carries current valid proof (true per CEL floor; false per NPC); capabilities without usable proof are unknown and make no claim.
- Otherwise `confidence = unknown` (passive-only fallback, no evidence, or any non-proof source).
- `source` remains one of the bounded enum values and stays truthful to evidence origin; `adapter` for adapter-derived proof evidence in production, `test-fixture` retained for fixture origin in test environments.
- Individual capabilities remain independently true/false/unknown. Provenance `proven` does not weaken `requireProvenRuntime` plus `effectiveCapability`: any required capability without positive proof continues to fail closed.

### 4.4 Passive fallback bounds

- The passive bridge remains the fallback provider and the current subject/detection basis source.
- Passive outcomes remain: E1 UNKNOWN; E2 fixed-false `UNSUPPORTED` only for declared-false (`adapter-contract-impossible`); declared TRUE → UNKNOWN (`ADAPTER_DECLARATION_TRUE_NOT_PROOF`).
- The passive bridge must never manufacture positive SUPPORTED, and a passive-only projection can never set provenance `proven`.
- Resolution order per read: stored/active PCCR evidence first; passive contribution supplies current basis/detection and fills capabilities without usable proof. If no PCCR evidence exists, the projection remains the conservative passive projection consumers see today (provenance `unknown`).

### 4.5 Bounded positive-proof acquisition seam (M03-owned)

Frozen semantics; mechanics are executor details:
- **Local-first and deterministic where possible.** No network by default, no paid provider calls, no vendor API credentials, no hidden retries, no arbitrary shell execution, no project-local state (global sidecar only), no secrets or absolute host paths in proof/projection artifacts (existing privacy assertions remain in force).
- **Registered, versioned probes only.** Acquisition happens only through registered, versioned probe definitions and bounded evidence contracts under M03 probe policy. The current production envelope (single probe `uads.node.version.v1`; READ_ONLY_LOCAL; network DENY; environment allowlist; receipts non-enabling) is not expanded by this freeze.
- **Production active evidence only behind bounded contracts.** Production acquisition beyond current probes may be added only as versioned probe definitions plus bounded active-evidence contracts compiled through the existing E3 LEASED compiler (`compileActiveEvidenceToPccr`) with exact receipt binding. Absent such a contract, production acquisition returns `CONTRACT_BLOCKED` → UNKNOWN — never a fabricated positive.
- **Deterministic test/eval fixtures.** Test and eval flows may compile and persist real PCCR proofs through the public M03 APIs under the test environment (TEST_ONLY contracts; e.g., the proof compile/persist APIs or the active-evidence compile path), with a basis computed from the same public basis inputs the boundary evaluates. Fixtures must not reintroduce legacy relaxed-enablement shortcuts.
- **No safe proof → UNKNOWN.** If a host cannot obtain positive proof safely, the capability remains UNKNOWN and dispatch remains visibly blocked. Support is never invented to preserve compatibility.

### 4.6 Dispatch adapter identity binding

- Dispatch entry paths (`runDispatch` and the `dispatch` CLI command, plus host-integration callers) carry explicit host adapter identity as a governed input: one of `HOST_ADAPTER_IDS` (`cursor | codex | generic-agent-skills`).
- The identity is supplied explicitly by bootstrap/CLI/host integration and recorded in dispatch/plan evidence as governed input.
- The supplied identity is validated against actual detection/subject identity for the current host (consistent with `detectHostAdapter` output and the subject computation used by the projection).
- Mismatch produces a visible, fail-closed block; dispatch does not proceed under a wrong adapter identity.
- Absent identity resolves conservative all-UNKNOWN truth (`CAPABILITY_TRUTH_ADAPTER_UNSPECIFIED` semantics per the WO-025 freeze) and dispatch remains fail-closed.
- Identity is never inferred from legacy capability state, persisted snapshots or ambient defaults.

### 4.7 Preservation constraints

- Runtime capability snapshot contract stays `0.8.0`; no bump (preference: none; a versioned migration would require proven necessity).
- Model Lock hard constraint, no-broadcast/single-target semantics and zero model-bearing routing calls are preserved.
- M06/M07/M24 ownership boundaries are preserved; no effort, ESE/reservation/breaker or accounting logic enters this slice.
- GLOBAL-FIRST / ZERO-PROJECT-FOOTPRINT: proofs and state live in the global sidecar; no project-local UADS state.
- No change to `requireProvenRuntime`; no UNKNOWN→ALLOW; no passive TRUE→SUPPORTED; no unconditional or adapter-presence-derived `proven`.

## 5. Interfaces

- Consumes: existing M03 substrate behind the facade (proof store, probe registry, subject/basis computation, passive bridge, active-evidence compiler); dispatch adapter identity as governed input.
- Produces (unchanged consumer surface): `HostCapabilityConsumerProjection` — `runtime` (runtime capability snapshot `0.8.0`), `subjectDigest`, `adapterContractDigest`, `detection` (`adapterId | status | version | reasonCodes`). Provenance semantics become proof-aware as frozen in §4.3.
- Dispatch governed input: explicit adapter identity on the dispatch entry path, validated, fail-closed absent. The exact parameter shape/name is an executor detail; the requirement (explicitness, validation, fail-closed absence, recording) is frozen.
- Internal and non-public: stored/active proof resolution, basis computation and acquisition logic stay inside the M03 boundary module(s) and must not leak into consumer imports (P7).

## 6. Source boundary

Allowed primary sources for the later runtime increment:

- `src/adapters/host-capability-consumer.ts` (facade evolution behind IF-001)
- `src/adapters/host-capability-passive.ts` (only if required for fallback/basis wiring; no positive fabrication)
- `src/kernel/host-capability-proof.ts` (resolution/projection additions; proof schema versions unchanged)
- `src/kernel/host-capability-subject.ts`
- `src/kernel/host-capability-probe.ts`
- `src/kernel/host-capability-active-evidence.ts`
- narrowly scoped new files under `src/kernel/` or `src/adapters/` for the resolver/acquisition seam
- `src/kernel/execution.ts` (only the dispatch adapter-identity plumbing and plan capability-acquisition inputs)
- `src/commands/dispatch.ts` (only adapter identity)
- `src/cli.ts` (only dispatch adapter-identity wiring)
- `src/eval/execution.ts`, `src/eval/fault-injection-normative.ts` (fixture proof seeding through public M03 APIs only)
- `tests/host-capability-*.test.ts` and narrowly scoped new resolver/dispatch-binding tests
- schemas only if strictly required and versioned; preference is to reuse the existing host-capability-proof schema family (`1.0.0` / `1.1.0`) without change

Forbidden:
- M05 routing/lock semantic changes; Model Execution Plan schema edits; PR #77 branch edits.
- Legacy snapshot enablement; passive TRUE as SUPPORTED; UNKNOWN→ALLOW; unconditional `proven`; disabling or relaxing `requireProvenRuntime`.
- Paid model/provider calls, hidden retries, vendor credentials, unbounded shell probes, network by default.
- Project-local UADS state; secrets or host paths in artifacts; open schemas.
- M06/M07/M24 responsibilities; M03 V1 mutation; runtime snapshot version bump; new dependencies; broad refactors outside the allowed list.

## 7. Risk, blast radius, economic envelope

- Risk: HIGH — this boundary gates every model-bearing action; incorrect enablement semantics or an over-claimed `proven` could authorize spend on unproven hosts.
- Blast radius: capability truth for all IF-001 consumers; dispatch currency and adapter binding; eval fixture strategy. No effect on other modules' ownership or truth.
- Economic envelope: proof resolution and acquisition add zero paid capacity; no provider calls by default; fan-out stays 1; no paid benchmarks in tests or evidence; M07 admission is not preempted.

## 8. Proof IDs

- P1 current SUPPORTED projects TRUE; passive declared TRUE stays UNKNOWN.
- P2 missing/stale/expired/corrupt/subject-mismatch/basis-mismatch stays UNKNOWN and never enables.
- P3 valid NPC UNSUPPORTED projects FALSE; invalid negative proof cannot.
- P4 provenance `proven` only from validated PCCR-backed evidence.
- P5 explicit dispatch adapter identity bound to actual detection/subject; mismatch blocks visibly.
- P6 no adapter identity → conservative UNKNOWN and fail-closed dispatch.
- P7 no consumer reads PCCR storage/probe internals directly; M05 uses only the facade.
- P8 no paid provider/model call by default; probes bounded, auditable, privacy-safe.
- P9 Windows/Linux deterministic identity and proof evaluation.
- P10 after the later runtime implementation, PR #77 X7/FI regressions are removable without restoring legacy enablement or relaxing `requireProvenRuntime`.

Full obligations and negative scenarios live in `.engineering/plans/UADS2-WO-026-TEST-PLAN.md`.

## 9. Windows/Linux matrix

- Full suite on the executor Windows host and on Linux CI; the Cross-Platform Compatibility workflow covers linux and windows runners.
- Subject/basis digests and projection outputs must be byte-stable across platforms; proof files use existing atomic-write helpers and sidecar conventions; no host-path-dependent assertions.

## 10. M30 projection obligations

- Capability-truth provenance and adapter discipline remain renderable truthfully through existing surfaces; absence renders UNKNOWN/UNAVAILABLE, never fabricated `proven` and never zero/default success.
- Projection is read-only over owner evidence and adds zero model-bearing calls on refresh.
- No new dashboard architecture; existing status/cockpit fields remain the rendering surface.

## 11. Rollback and recovery

- Proof files are additive and self-validating; corrupt/rejected proofs are ignored as UNKNOWN, so no operator action is required for safety.
- Removing or refreshing stale proofs restores resolution; recovery follows existing sidecar conventions and is itself a recorded action where operator-initiated.
- If the later runtime increment regresses: revert its commits; the facade returns to the passive-only projection (provenance `unknown`) — truthful and safe, with no state migration or version change required.
- No destructive migration, no version bump, no state reset; dispatch remains fail-closed throughout.

## 12. Evidence Bundle

The later runtime executor produces `.engineering/reports/EVIDENCE-UADS2-WO-026.md` from `.engineering/reports/EVIDENCE-UADS2-WO-026-TEMPLATE.md`, bound to the implementation head SHA, with per-proof PASS/FAIL/BLOCKED/NOT_APPLICABLE results and exact-head gate results.

## 13. Executor routing and stop condition

- Executor recommendation: model per host-proven availability; effort LOW for mechanical wiring, MEDIUM for resolver/basis implementation and tests, HIGH for boundary semantics and dispatch adapter binding; MAX is never a default.
- ESE ceiling: no paid fan-out, no provider-credential-dependent tests, bounded deterministic execution only.
- Slice ordering is frozen: (1) this freeze merges with exact-head gates and independent HEDS; (2) the WO-026 runtime increment runs; (3) only then is PR #77 rebased/reconciled in its own governed increment to remove the X7/FI regressions and return to HEDS.
- STOP CONDITION: the runtime executor stops at `COMPLETE_CANDIDATE` with implementation plus focused/full tests and Evidence Bundle, or at a truthful terminal state (`NEEDS_ARCHITECTURE`, `BLOCKED_EVIDENCE`, `CORRECTION_REQUIRED`). Merge is forbidden until exact-head gates and independent HEDS approve the final head. PR #77 is never edited by this Work Order.
- Escalation: any conflict between this frozen architecture and source reality returns `NEEDS_ARCHITECTURE`; the executor never redesigns ownership, interfaces or proof-source strategy.
