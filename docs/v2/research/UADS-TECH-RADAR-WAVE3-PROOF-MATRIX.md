# UADS V2 Technology Acquisition Radar — Wave 3 Proof Matrix

Status: CANDIDATE proof design
Scope: AI security, workload identity, MCP trust, secret handling, delegation, sandbox boundaries, tool/agent supply chain.

## Stable proof IDs

### Agent/workload identity
- IDN-001 — privileged agent execution resolves an attested identity record before privileged dispatch.
- IDN-002 — prompt/configured display name alone cannot satisfy identity proof.
- IDN-003 — expired identity lease blocks privileged dispatch.
- IDN-004 — runtime selector drift invalidates stale identity proof.
- IDN-005 — identity renewal changes no authority beyond explicitly granted policy.
- IDN-006 — delegated impersonation requires explicit scoped authorization and audit evidence.
- IDN-007 — identity material is not leaked to model prompts/logs/telemetry.
- IDN-008 — trust-domain/issuer mismatch is rejected.

### MCP trust and authorization
- MCPSEC-001 — issuer mismatch/mix-up is rejected before credential redemption/use.
- MCPSEC-002 — credentials bound to server/issuer cannot be reused against another issuer.
- MCPSEC-003 — unapproved tool schema/version drift enters QUARANTINED/BLOCKED.
- MCPSEC-004 — tool catalog replacement invalidates stale TCIR/approval.
- MCPSEC-005 — silent fallback to alternate MCP server/tool is impossible.
- MCPSEC-006 — per-tool risk/effect/budget/timeout policy is enforced independently of model text.
- MCPSEC-007 — unsupported/deprecated protocol capability is explicit, not silently emulated.
- MCPSEC-008 — auth/routing logs contain no bearer tokens, client secrets or equivalent credentials.
- MCPSEC-009 — server capability lease expiration forces re-proof before privileged use.
- MCPSEC-010 — quarantined server cannot receive privileged tool dispatch.

### Instruction poisoning / authority separation
- INJ-001 — retrieved/tool-provided instruction cannot override higher authority policy.
- INJ-002 — tool descriptions/resources remain untrusted data unless separately approved as policy.
- INJ-003 — malicious content requesting new permission cannot grant itself permission.
- INJ-004 — data origin/taint survives context assembly and handoff.
- INJ-005 — suspicious instruction/tool-schema drift produces explicit finding/quarantine state.
- INJ-006 — privileged operation is blocked when required independent capability/policy proof is absent.
- INJ-007 — cross-domain content cannot silently change model/tool/security policy.
- INJ-008 — sanitization does not erase provenance needed for incident reconstruction.

### Secrets
- SEC-001 — no raw secret appears in prompt, AFR, M30 telemetry or graph projection by default.
- SEC-002 — secret handle grants only declared action/resource/time scope.
- SEC-003 — expired/revoked secret lease blocks subsequent use.
- SEC-004 — model cannot retrieve secret value merely because an invoked tool holds it.
- SEC-005 — debug/export/crash paths redact secret values.
- SEC-006 — credential scope cannot expand during retry/delegation.
- SEC-007 — secret access event is auditable without exposing secret material.
- SEC-008 — secret exposure budget breach triggers block/incident state.

### Delegation and privilege non-amplification
- DEL-001 — child capabilities are a subset of parent-authorized delegated capabilities.
- DEL-002 — child creation cannot increase parent/WO/project economic capacity.
- DEL-003 — child lifetime/capabilities expire with execution scope.
- DEL-004 — forbidden parent capability cannot be acquired by child via tool description or prompt.
- DEL-005 — delegation depth/fanout remains bounded by M07.
- DEL-006 — revocation cascades to applicable descendants before new privileged dispatch.
- DEL-007 — ancestry graph can reconstruct privilege lineage.
- DEL-008 — failed identity proof prevents delegated privileged action.

### Sandbox / runtime boundary
- BND-001 — forbidden filesystem access fails in selected isolation profile.
- BND-002 — forbidden network access fails in selected isolation profile.
- BND-003 — non-allowlisted executable/tool identity cannot launch on protected path.
- BND-004 — unsupported HIGH_ASSURANCE profile cannot silently downgrade.
- BND-005 — approved downgrade requires policy decision, reason and audit evidence.
- BND-006 — sandbox/profile identity is included in runtime compatibility evidence.
- BND-007 — secret-bearing environment surface is minimized and verified.
- BND-008 — post-execution boundary anomaly is visible in M30 and AFR.

### Tool/agent supply chain
- ASC-001 — runtime tool/package digest matches approved artifact/provenance.
- ASC-002 — wrong source SHA/repository/build identity is rejected when provenance is required.
- ASC-003 — mutable/unpinned critical dependency is visible/blocking per M29/M31 policy.
- ASC-004 — production-capable MCP adapter/tool package has verifiable origin/inventory.
- ASC-005 — provenance drift enters QUARANTINED/BLOCKED.
- ASC-006 — SBOM/dependency inventory links to released artifact where supported.
- ASC-007 — Trusted Tool Receipt can be consumed by HEDS/M31 without recomputing whole provenance graph.
- ASC-008 — runtime provenance mismatch cannot be overridden by untrusted model/tool text.

## Critical release-floor candidates
The following should become release-blocking for applicable production paths once implemented:
- RF-SEC-001 — no privileged dispatch without valid identity/capability/policy proof.
- RF-SEC-002 — zero silent MCP server/tool fallback.
- RF-SEC-003 — zero privilege amplification through delegation.
- RF-SEC-004 — zero raw secret exposure in default telemetry/prompts.
- RF-SEC-005 — no blind downgrade from required HIGH_ASSURANCE isolation.
- RF-SEC-006 — no production use of quarantined tool/MCP runtime.
- RF-SEC-007 — required provenance mismatch blocks trusted release/runtime path.
- RF-SEC-008 — retrieved/tool content cannot become authorization authority.

## Evidence classes
- OFFICIAL_PRIMARY_SOURCE
- PROJECT_CANON
- LOCAL_MEASURED
- SIMULATED_ADVERSARIAL
- CRASH_RECOVERY_PROOF
- SUPPLY_CHAIN_ATTESTATION
- UNKNOWN

## Exit rule
Wave 3 discovery may freeze these contracts/proofs, but no runtime security claim is earned until owning modules implement and satisfy applicable proof IDs on exact reviewed commits.
