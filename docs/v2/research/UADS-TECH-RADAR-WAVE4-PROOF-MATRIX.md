# UADS V2 Technology Acquisition Radar — Wave 4 Proof Matrix

Status: CANDIDATE proof design

## Stable proof IDs

### Formal state machines / invariants
- FML-001 — every HIGH/CRITICAL governed lifecycle declares finite states and terminal states.
- FML-002 — forbidden states are explicitly represented and unreachable under valid transitions.
- FML-003 — invalid transition is rejected deterministically.
- FML-004 — state transition includes owner, cause, timestamp and evidence correlation.
- FML-005 — machine-checkable invariant generated from canonical rule matches source intent.
- FML-006 — stale/incompatible state-machine schema blocks unsafe resume.
- FML-007 — assurance tier is derived from risk/blast radius, not manually lowered without evidence.
- FML-008 — critical invariant change invalidates stale proof.

### Determinism / replay
- DET-001 — same deterministic history/input/runtime fingerprint reproduces same decision sequence.
- DET-002 — non-deterministic external interaction is outside deterministic replay boundary.
- DET-003 — replay requires zero new LLM calls for deterministic reconstruction.
- DET-004 — changed model/tool/runtime fingerprint is detected before replay where material.
- DET-005 — replay divergence becomes explicit failure/degraded state.
- DET-006 — randomness/time-dependent decision uses recorded/controlled source when deterministic replay requires it.

### Concurrency
- CON-001 — duplicate delivery cannot double-apply authoritative mutation.
- CON-002 — stale worker cannot commit after fencing token/lease replacement.
- CON-003 — concurrent retry owners cannot both dispatch the same effect.
- CON-004 — concurrent budget reservations preserve conservation invariant.
- CON-005 — parent/child reservation race cannot create economic capacity.
- CON-006 — cancellation race has explicit terminal/reconciliation outcome.
- CON-007 — concurrent command acknowledgements cannot fabricate SUCCEEDED.
- CON-008 — lost-update/stale-write detection prevents silent overwrite where authoritative versioning applies.
- CON-009 — queue/work ownership takeover is bounded and auditable.
- CON-010 — backpressure prevents unbounded work accumulation.

### Governed sagas / transactions
- SAG-001 — multi-step effectful operation declares owner for every step.
- SAG-002 — partial success is representable and never mislabeled full success.
- SAG-003 — compensation is invoked only when declared supported.
- SAG-004 — irreversible step cannot be falsely reported rolled back.
- SAG-005 — UNKNOWN_OUTCOME reconciles before continuation where duplicate effect is possible.
- SAG-006 — saga retry respects M21 single retry ownership and M07 economic limits.
- SAG-007 — compensation failure is explicit and operator-visible.
- SAG-008 — saga crash/restart preserves step/effect evidence.

### Coordination / ownership
- CRD-001 — only current fenced owner may perform protected commit.
- CRD-002 — expired owner cannot regain authority without new lease.
- CRD-003 — duplicate owner detection produces degraded/blocked state.
- CRD-004 — reassignment does not duplicate non-idempotent work.
- CRD-005 — partition behavior is defined for protected operations.
- CRD-006 — missing heartbeat is not equivalent to confirmed failure without lease semantics.
- CRD-007 — takeover decision is reproducible from authoritative evidence.
- CRD-008 — coordination metadata remains bounded under churn.

### Adversarial history verification
- AHV-001 — history checker detects duplicate irreversible effect.
- AHV-002 — history checker detects double economic spend/reservation.
- AHV-003 — history checker detects privileged operation after revocation.
- AHV-004 — history checker detects child privilege amplification.
- AHV-005 — history checker detects release promotion after mandatory gate failure.
- AHV-006 — history checker distinguishes UNKNOWN from SUCCEEDED.
- AHV-007 — history analysis remains deterministic for the same normalized history/model.
- AHV-008 — corrupt/incomplete history yields explicit UNKNOWN/DEGRADED, not false PASS.

### Chaos / fault engineering
- CHA-001 — process crash during deterministic step resumes safely.
- CHA-002 — process crash after external effect before acknowledgement does not duplicate effect.
- CHA-003 — host restart preserves execution/economic/retry state.
- CHA-004 — provider timeout cannot create unbounded retries.
- CHA-005 — MCP disconnect/catalog drift is fail-closed for privileged dispatch.
- CHA-006 — storage full/read-only has explicit degradation and no fabricated persistence success.
- CHA-007 — duplicate/out-of-order event injection does not fabricate current healthy state.
- CHA-008 — quota exhaustion causes bounded degradation/hard-stop.
- CHA-009 — economic HARD_STOP requires zero LLM calls to enforce.
- CHA-010 — unavailable required sandbox cannot silently downgrade.
- CHA-011 — policy/capability/credential expiration during execution blocks new privileged actions.
- CHA-012 — telemetry loss remains visible and cannot be interpreted as health.
- CHA-013 — cancellation during irreversible effect yields reconciliation path.
- CHA-014 — chaos experiment cannot exceed declared blast radius/time/cost.
- CHA-015 — cleanup proof exists after each destructive/disruptive experiment.

### Policy verification
- POL-001 — missing authorization input does not widen authority.
- POL-002 — unknown/stale policy cannot silently allow HIGH/CRITICAL action.
- POL-003 — default deny is proven for unrecognized principal/action/resource.
- POL-004 — delegated child permission is subset of parent authority and lease.
- POL-005 — conflicting policy resolution is deterministic.
- POL-006 — policy bundle/version/digest is recorded with decision.
- POL-007 — HIGH/CRITICAL policy paths meet declared coverage floor.
- POL-008 — policy mutation invalidates stale authorization proof.
- POL-009 — test harness fails when policy test discovery unexpectedly runs zero tests.
- POL-010 — policy evaluation error is distinct from DENY and ALLOW and handled fail-closed where required.

## Assurance-tier mapping
- A0 requires ordinary unit/integration proof.
- A1 adds property/generated invariant proof.
- A2 adds state-machine exploration/model checking.
- A3 adds concurrent history verification plus injected faults.
- A4 adds selective mechanically checked proof where the risk warrants the cost.

No risk owner may lower required assurance solely to make a gate pass. Any exception must be explicit, bounded, evidence-backed and forbidden for CRITICAL economic/release invariants where the governing contract disallows exception.

## Exit criterion for Wave 4 discovery
Wave 4 may be frozen when the architecture, stable proof IDs, ownership boundaries, assurance tiers and enterprise-pillar mapping are reviewed and exact-head repository gates plus HEDS approve. Runtime adoption remains deferred to owning-module implementation slices.