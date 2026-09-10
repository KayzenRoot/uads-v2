# M30 S03 — Failure, Security and Recovery Analysis

Status: CANDIDATE
Risk: HIGH
Work Order: UADS2-WO-018
Issue: #59

## 1. Security posture
M30 uses two complementary default postures:
- **fail-closed for control**: if authorization, owner identity, preconditions, freshness or outcome safety are uncertain, dangerous commands do not proceed;
- **fail-visible for observability**: telemetry/source failures do not collapse the dashboard into silence; affected state is rendered STALE/DEGRADED/UNAVAILABLE with explicit reason and evidence gaps.

The dashboard is not a trust root. Domain-owning modules remain authoritative.

## 2. Trust boundaries
- TB1 Operator/UI -> LOCP request boundary.
- TB2 LOCP -> authorization/policy boundary.
- TB3 LOCP -> owning module command boundary.
- TB4 Domain source -> Source Adapter ingestion boundary.
- TB5 Event spine/storage integrity boundary.
- TB6 Local M30 -> optional exporter/plugin boundary.
- TB7 Projection/inference -> operator presentation boundary.

No boundary implicitly inherits trust from another.

## 3. Command risk classes
- **R0 READ_ONLY**: bounded query/diagnostic with no state mutation.
- **R1 LOW**: reversible local operational adjustments with narrow scope.
- **R2 MEDIUM**: actions affecting running work or observability profile; require explicit authorization, fresh preconditions and audit receipt.
- **R3 HIGH**: pause/cancel/drain/isolate/recovery/release-affecting actions; require fresh owner evidence, bounded blast radius, idempotency/reconciliation semantics and policy safeguards.
- **R4 CRITICAL**: destructive or broad-scope actions capable of irreversible loss or multi-module disruption; disabled by default unless the authoritative owner contract and policy explicitly expose them with strong confirmation/recovery constraints.

M30 cannot upgrade a command's authority or lower its owner-declared risk class.

## 4. LOCP and governed-command threat matrix

### F-001 Command spoofing / owner confusion — HIGH
Attack/failure: forged ownerModule, command version or capability identity routes a command to the wrong authority.
Prevention: closed command registry, owner binding, versioned schemas, authorization bound to owner+capability+scope.
Detection: rejected-owner audit events; mismatch reason codes.
Containment: no fallback routing; command REJECTED.
Recovery: refresh capability advertisement from authoritative owner.
Residual risk: compromised owning module remains outside M30's authority and is surfaced as security incident/degraded source.

### F-002 Confused deputy / privilege escalation — CRITICAL
Attack/failure: LOCP uses its own broad privilege to perform an action the actor is not authorized to request.
Prevention: actor authorization context survives end-to-end; owner re-authorizes command at execution boundary; least privilege.
Detection: actor/owner/policy correlation in immutable receipt.
Containment: fail closed.
Recovery: security incident and privilege review.
Residual risk: policy-engine compromise requires M29 controls and independent audit evidence.

### F-003 Replay / duplicate command — HIGH
Attack/failure: same state-changing command delivered multiple times.
Prevention: idempotency key bound to commandId/version/owner/scope; replay window; owner-side duplicate detection.
Detection: duplicate/replay receipt.
Containment: duplicate becomes same prior result or REJECTED, never re-executes blindly.
Recovery: reconcile from owner evidence.

### F-004 TOCTOU / stale precondition race — HIGH
Attack/failure: state changes after UI render but before command execution.
Prevention: precondition version/etag/evidence digest checked by owner at execution time; freshness requirement.
Detection: PRECONDITION_FAILED receipt.
Containment: no implicit retry for dangerous mutations.
Recovery: refresh state and require a new governed decision.

### F-005 UNKNOWN_OUTCOME — HIGH
Failure: connection is lost after possible acceptance/execution, before authoritative result is received.
Prevention: durable command identity/idempotency and immutable owner receipts.
Detection: timeout or broken receipt continuity.
Containment: state becomes UNKNOWN_OUTCOME; dependent dangerous actions are blocked where uncertainty matters.
Recovery state machine: UNKNOWN_OUTCOME -> RECONCILING -> SUCCEEDED | FAILED | REJECTED | CANCELLED | TIMED_OUT; conflicting authoritative evidence -> DEGRADED_CONFLICT and incident, not arbitrary selection.
No telemetry silence may resolve UNKNOWN_OUTCOME.

### F-006 Blast-radius mismatch — CRITICAL
Attack/failure: command advertised as narrow actually affects wider resources/modules.
Prevention: owner-declared scope/blastRadius mandatory; policy caps; target enumeration or bounded selector semantics.
Detection: outcome evidence compared with declared affected scope when objectively possible.
Containment: R3/R4 actions rejected if blast radius is missing/unknown.
Recovery: owner-defined rollback/recovery command only.

## 5. Truth, telemetry and continuity threats

### F-007 Event forgery/corruption — HIGH
Use schema validation, canonical integrity verification and source identity. Invalid evidence is rejected/quarantined and source health degrades; it is never normalized into valid truth.

### F-008 Clock skew — MEDIUM-HIGH
Freshness evaluation must distinguish source observedAt from local evaluatedAt. Excessive/invalid clock skew yields DEGRADED/UNKNOWN freshness semantics rather than CURRENT by timestamp alone.

### F-009 Gap or false healthy silence — HIGH
TCL continuity evidence is independent from event content. Missing sequence/reconnect evidence yields GAP_KNOWN/GAP_UNKNOWN/UNAVAILABLE. Silence cannot imply HEALTHY.

### F-010 Replay ambiguity/out-of-order delivery — HIGH
TCL preserves sequence/equivalent ordering markers, dedup identity and replay ranges. Unresolvable ordering becomes explicit degraded continuity; derived rates must not claim complete denominators.

## 6. Resource exhaustion threats

### F-011 Cardinality explosion — HIGH
AOBC/CBF enforces per-domain/attribute budgets, deterministic overflow aggregation/drop and dropped-series evidence. Unbounded user/provider payload fields cannot become metric labels.

### F-012 Telemetry amplification / recursive observability — HIGH
Observability of observability must be bounded. M30 must prevent event loops where diagnostics recursively generate equivalent diagnostics without caps/hysteresis.

### F-013 AOBC manipulation/failure — HIGH
Budget configuration is governed state, not free-form UI mutation. Mandatory audit/truth/health/continuity evidence has protected priority. AOBC degradation state is itself visible and cannot claim healthy overhead without measurements.

### F-014 SSE reconnect storm / slow-client fan-out — HIGH
Per-client buffers are bounded; cursor resume is explicit; slow clients may be disconnected/degraded rather than forcing unbounded memory. Reconnect jitter/backoff and fan-out caps are required before production-scale promotion.

### F-015 Disk full/read-only/corrupt store — HIGH
Writes fail visibly; workload/domain operation remains independent. Retention cleanup cannot escape M30-owned paths. Corrupt records are skipped/quarantined with degraded health and counts; no broad destructive repair.

## 7. Privacy and supply-chain threats

### F-016 Correlation leakage — HIGH
PSCF uses opaque bounded IDs. Raw prompts, secrets, tokens, private payloads and arbitrary absolute paths are not correlation keys/default labels.

### F-017 Diagnostic/log leakage — HIGH
Data minimization and sanitization precede persistence/export. HIGH-cardinality or sensitive payloads require explicit schema allowance and redaction policy.

### F-018 Optional exporter/plugin compromise — HIGH
Local-first canonical operation must not depend on exporter success. Exporters are adapters outside the local truth authority; failures compromise export visibility, not canonical domain truth. Credentials and network permissions are scoped by M29.

### F-019 Supply-chain dependency compromise — HIGH
No mandatory heavy observability stack. Optional adapters require version pinning, provenance/dependency review, least privilege and disable-by-default posture until adopted.

## 8. Dashboard compromise and operator error

### F-020 Dashboard compromise — CRITICAL
The UI has no direct business-state mutation API. Every state-changing action must traverse LOCP and owner authorization. Loopback/local-first binding remains default. Security headers, session/auth controls and M29 policy apply before any non-loopback deployment.

### F-021 Dangerous operator mistake — HIGH
R3/R4 commands require policy-defined safeguards, clear scope/risk/effect, fresh state and audit. Confirmation is risk-based, not indiscriminate. Repeated high-risk recovery actions can be rate/loop guarded.

### F-022 Recovery/rollback loop — HIGH
Recovery commands carry correlation with prior attempt and recovery generation. Repeated cycles beyond policy thresholds become DEGRADED/incident and require new authorization rather than infinite automation.

## 9. Experimental inference/attention safety

### F-023 COG false causality — HIGH
COG output is TPSC INFERRED unless deterministic evidence proves causality. UI must show supporting and contradicting evidence plus uncertainty. No inferred cause automatically triggers a dangerous command.

### F-024 AAE hides important evidence — HIGH
AAE may rank/summarize but cannot remove unresolved HIGH/CRITICAL, UNKNOWN_OUTCOME, continuity uncertainty or security incidents from operator-accessible views. Raw bounded evidence remains drillable.

## 10. Fail-open / fail-closed decisions

Fail closed:
- state-changing command authorization;
- owner identity/version mismatch;
- R3/R4 command with stale/missing preconditions;
- unknown blast radius for dangerous operations;
- unsafe replay/idempotency ambiguity;
- attempts to treat inferred/derived data as authoritative mutation input.

Fail visible / partial-service:
- missing telemetry source;
- exporter outage;
- corrupt individual telemetry record;
- SSE client loss;
- optional projection failure;
- partial query source failure.

The partial-service path must retain explicit degradation/freshness/continuity metadata.

## 11. Recovery state machines

### Command outcome
REQUESTED -> AUTHORIZING -> ACCEPTED -> RUNNING -> terminal
Terminal: SUCCEEDED | FAILED | REJECTED | CANCELLED | TIMED_OUT.
Any loss of authoritative terminal evidence after possible execution -> UNKNOWN_OUTCOME -> RECONCILING -> terminal or DEGRADED_CONFLICT.

### Telemetry source
CURRENT -> STALE -> DEGRADED -> UNAVAILABLE, with recovery only after fresh valid evidence and continuity checks. A newly received event does not automatically erase an unresolved TCL gap.

### Storage pressure
HEALTHY -> PRESSURED -> SHEDDING_OPTIONAL -> DEGRADED -> WRITE_UNAVAILABLE. Mandatory evidence preservation is prioritized where capacity permits; domain workload must not be intentionally stopped merely to preserve optional telemetry.

## 12. Cross-pillar obligations
- M27: define fan-out/cardinality/throughput/storage ceilings and load-triggered scale thresholds.
- M28: replay durability, recovery ordering, partial-failure and degraded-mode proofs.
- M29: authentication/authorization, secrets, plugin/exporter isolation, policy and supply-chain controls.
- M30: continuity/freshness/truth projection, AOBC and operator-visible degradation.
- M31: release/rollback actions use governed owner commands; visibility failure must block unsafe release claims rather than fabricate green health.

## 13. S04 mandatory proof obligations
S04 must prove at minimum:
- spoof/confused-deputy rejection;
- owner-side authorization and stale-precondition rejection;
- replay/idempotency safety;
- UNKNOWN_OUTCOME reconciliation including conflicting evidence;
- blast-radius enforcement;
- integrity, clock-skew, gap and replay correctness;
- cardinality/amplification/SSE pressure bounds;
- AOBC deterministic degradation and Issue #39/B6 overhead benchmark;
- disk-full/read-only/corrupt-store behavior;
- privacy/sanitization and exporter isolation;
- dashboard compromise cannot bypass owner contracts;
- recovery-loop safeguards;
- COG/AAE safety invariants.

## 14. S03 disposition
No unresolved architecture-level CRITICAL gap remains without a prevention/containment/recovery contract in this analysis. Several HIGH-risk controls require S04 proof before implementation promotion. Therefore S04 may proceed only after exact-head gates and HEDS approve this candidate.
