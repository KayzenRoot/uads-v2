# UADS2-WO-023 — P0 Proof Matrix

Status: CANDIDATE
Date: 2026-09-10

## Stable proof IDs

### MCP / TCF / RCE / MPG
- P0-MCP-001: unsupported/deprecated feature is rejected or explicitly degraded.
- P0-MCP-002: stale tool catalog cannot widen executable capability.
- P0-MCP-003: tool catalog substitution changes digest and invalidates grant.
- P0-MCP-004: header routing metadata cannot bypass policy decision.
- P0-MCP-005: missing runtime compatibility proof yields UNKNOWN/BLOCKED, never ALLOW.
- P0-MCP-006: catalog caching preserves deterministic order and integrity identity.
- P0-MCP-007: issuer/authorization mismatch fails closed where OAuth authorization applies.
- P0-MCP-008: MCP adapter remains optional and UADS core operates without it.

### Policy Decision Fabric
- P0-PDF-001: privileged action with no matching allow is denied.
- P0-PDF-002: explicit hard forbid outranks allow.
- P0-PDF-003: identical input + policy digest produces identical decision.
- P0-PDF-004: decision records determining policy IDs and reason code.
- P0-PDF-005: REQUIRE_STEP_UP / REQUIRE_SANDBOX / REQUIRE_EVIDENCE obligations block execution until satisfied.
- P0-PDF-006: emergency stop can be evaluated without external network or LLM call.
- P0-PDF-007: policy shadow simulation has zero production side effect.
- P0-PDF-008: policy update changes digest and invalidates stale cached grants.

### Agent Flight Recorder
- P0-AFR-001: execution ancestry is reconstructable from bounded structured records.
- P0-AFR-002: no raw secret or credential value is retained.
- P0-AFR-003: no hidden chain-of-thought capture is required for assurance.
- P0-AFR-004: tool/model/cost/retry/delegation chronology is ordered and correlated.
- P0-AFR-005: crash/restart preserves previously committed episode records.
- P0-AFR-006: retention cap and degradation state are observable.
- P0-AFR-007: integrity tamper changes verification result.
- P0-AFR-008: M30 renders missing/stale recorder data truthfully.

### AEG/HEDS trajectory assurance
- P0-TRAJ-001: trajectory critic sees evidence independent of builder self-assessment.
- P0-TRAJ-002: unsupported tool attempts are detectable even if final output passes.
- P0-TRAJ-003: duplicate/redundant retries are detectable.
- P0-TRAJ-004: unauthorized expensive model escalation is detectable.
- P0-TRAJ-005: LOW-risk trivial change does not spawn unnecessary trajectory critics.
- P0-TRAJ-006: critic escalation remains within M07 ESE and AEG round limits.
- P0-TRAJ-007: unresolved HIGH/CRITICAL trajectory finding blocks HEDS final approval.
- P0-TRAJ-008: trajectory review cost/quality delta is measured against baseline.

### Replay / side-effect safety
- P0-RSC-001: pure/replay-safe steps can replay deterministically.
- P0-RSC-002: side-effecting step cannot be blindly re-executed.
- P0-RSC-003: UNKNOWN_OUTCOME requires reconciliation before retry.
- P0-RSC-004: idempotency identity prevents duplicate external mutation where owner supports it.
- P0-RSC-005: simulation replay is visibly distinct from LIVE execution.

## Promotion floor
No P0 runtime capability is production-enabled merely by documentation. Each owning-module implementation slice must map its release gates to the relevant stable proof IDs above.

For HIGH/CRITICAL production mutation paths, any applicable policy/capability/side-effect proof marked FAIL or BLOCKED is release-blocking. Generic JUSTIFIED_EXCEPTION is not sufficient for bypassing economic, authorization, replay, or capability-safety floors.
