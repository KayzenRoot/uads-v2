# UADS V2 Technology Acquisition Radar — Wave 2 Proof Matrix

Status: CANDIDATE proof design

## Stable proof IDs

### DEF / replay / recovery
- DEF-001 — persisted checkpoint resumes exact execution identity.
- DEF-002 — crash before side effect permits safe retry where allowed.
- DEF-003 — crash after side effect before acknowledgement does not duplicate mutation.
- DEF-004 — UNKNOWN_OUTCOME reconciles before retry.
- DEF-005 — restart preserves ESE reservation/consumption counters.
- DEF-006 — restart preserves retry/fanout/delegation counters.
- DEF-007 — incompatible checkpoint/runtime produces INCOMPATIBLE, not forced resume.
- DEF-008 — deterministic reconstruction requires zero LLM calls.
- DEF-009 — replay divergence is detected and surfaced.
- DEF-010 — checkpoint corruption produces explicit DEGRADED/UNAVAILABLE state.

### SIR
- SIR-001 — every effectful tool/action resolves an effect class before dispatch.
- SIR-002 — PURE action can replay only when input/runtime fingerprint matches.
- SIR-003 — IDEMPOTENT_EFFECT proves stable idempotency key.
- SIR-004 — NON_IDEMPOTENT_EFFECT cannot blind-retry.
- SIR-005 — IRREVERSIBLE_EFFECT requires elevated policy and blast-radius declaration.
- SIR-006 — compensation/rollback support is truthful and evidence-backed.
- SIR-007 — duplicate delivery cannot create duplicate authoritative mutation.
- SIR-008 — effect classification drift invalidates stale replay proof.

### SFRF / shadow / canary / rollback
- ROL-001 — SHADOW produces zero authoritative side effects.
- ROL-002 — CANARY cohort selection is deterministic and bounded.
- ROL-003 — rollout cannot exceed declared economic budget.
- ROL-004 — kill switch causes zero new dispatch after enforcement point.
- ROL-005 — rollback preserves audit and does not resurrect invalid state.
- ROL-006 — promotion requires objective health/evidence floor.
- ROL-007 — stale/missing rollout telemetry blocks automatic promotion.
- ROL-008 — feature/provider flag outage has defined fail-safe behavior.

### Supply chain
- SUP-001 — release artifact digest matches trusted attestation.
- SUP-002 — attestation binds expected repository and source SHA.
- SUP-003 — attestation binds approved workflow/build identity.
- SUP-004 — wrong repository/SHA/workflow/artifact is rejected.
- SUP-005 — SBOM is generated and linked to released artifact where supported.
- SUP-006 — mutable/unpinned critical workflow dependency is release-visible/blocking per policy.
- SUP-007 — HEDS/M31 can consume a compact Trusted Build Receipt.

### Sandbox
- SBX-001 — forbidden filesystem target is inaccessible from selected sandbox profile.
- SBX-002 — forbidden network destination is inaccessible.
- SBX-003 — forbidden tool/capability surface is inaccessible.
- SBX-004 — credential exposure remains within declared envelope.
- SBX-005 — CPU overhead measured p50/p95/p99.
- SBX-006 — filesystem I/O overhead measured p50/p95/p99.
- SBX-007 — network overhead measured p50/p95/p99.
- SBX-008 — selected sandbox profile matches M03 capability proof.
- SBX-009 — sandbox failure is explicit, never silently downgraded to unsafe native execution.

### AgentOps / observability
- OPS-001 — model/provider/profile/effort correlate to execution identity.
- OPS-002 — input/output token usage correlates to M24 ledger without creating a second cost truth.
- OPS-003 — tool/agent trajectory correlates to AFR/HEP.
- OPS-004 — raw prompts/completions are absent by default from telemetry.
- OPS-005 — missing telemetry cannot render CURRENT/HEALTHY.
- OPS-006 — telemetry cardinality budget prevents uncontrolled dimensions.
- OPS-007 — observability overload sheds optional detail before truth-critical events.
- OPS-008 — external OTel-compatible export can be disabled without breaking local operation.
- OPS-009 — semantic convention version drift is detectable.
- OPS-010 — exported telemetry remains a projection, not domain authority.

## Release floor candidates
Production-capable implementations MUST fail closed for unsafe action paths and fail visible for observation paths. At minimum, DEF-003, DEF-004, DEF-005, SIR-004, SIR-005, ROL-001, ROL-003, ROL-004, SUP-001, SUP-002, SBX-009, OPS-004 and OPS-005 are candidate release-blocking floors.

## Evidence classes
- LOCAL_MEASURED
- CROSS_PLATFORM_MEASURED
- SIMULATED
- PROVIDER_REPORTED
- DERIVED
- UNKNOWN

UNKNOWN never proves a production safety floor.