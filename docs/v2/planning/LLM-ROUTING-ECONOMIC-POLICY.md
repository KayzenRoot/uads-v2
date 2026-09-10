# UADS V2 — LLM Routing & Economic Policy Requirement

Status: REQUIREMENT CANDIDATE FOR M04/M05/M06/M07/M15/M16/M22/M30 DISCOVERY
Date: 2026-09-10

This document captures an explicit operating requirement. It does not freeze model capability claims or bypass future deep-discovery gates. Runtime support remains proof-gated through M03/M04 and host adapters.

## 1. Objective
Minimize token/quota/cost consumption while preserving the task's required quality and proof floor. Model choice and reasoning effort are separate controls. The operator may lock the model family/profile from the cockpit while UADS automatically chooses the minimum sufficient effort per task.

## 2. Authority split
- M04 owns proven model/profile capability, availability, cost-class and host-control facts.
- M05 owns model selection and routing rationale.
- M06 owns effort selection and escalation/de-escalation rationale.
- M07 owns token/quota/cost reservations and hard ceilings.
- M15/M16 translate proven Cursor/Codex host controls without inventing override support.
- M22 may escalate model/effort/context only from explicit evidence and inside M07 budget.
- M24 records attribution; M30 exposes the cockpit, routing state and economic telemetry.

## 3. Cockpit routing modes
The dashboard MUST expose a persistent, auditable routing mode selector.

### MODE A — MODEL_LOCK
Operator selects one proven available model/profile, for example a Luna-, Composer-, Grok- or other supported profile. While lock is active:
1. M05 may route only to that selected model/profile or compatible alias explicitly covered by the lock.
2. M06 independently chooses the minimum sufficient supported effort for each prompt/task.
3. Model fallback outside the lock is forbidden unless the operator policy explicitly enables a bounded emergency fallback.
4. If the locked model becomes unavailable, UADS reports MODEL_LOCK_UNAVAILABLE and fails/degrades visibly rather than silently choosing a different expensive model.
5. Changing the lock is a governed cockpit action and is audited.

### MODE B — CHEAPEST_QUALIFIED
UADS selects the least-cost proven available model/profile satisfying capability, tool, context, risk and proof requirements. Price/cost-class evidence must be current enough for the active policy; UNKNOWN cost cannot be advertised as cheapest.

### MODE C — QUALITY_FLOOR_AUTOROUTE
Optional mode for tasks where the operator specifies a minimum assurance/quality floor but allows M05 to choose among all admissible profiles. Economic admission still applies and unnecessary effort escalation remains prohibited.

MODEL_LOCK is the preferred interactive mode when the operator intentionally wants to work with one model for the session/day. CHEAPEST_QUALIFIED is the preferred fully automatic economy mode.

## 4. Effort Autopilot
Model selection NEVER implies maximum reasoning effort. M06 classifies each task and chooses the lowest supported effort expected to satisfy the required proof/quality floor.

Indicative ladder, translated to host-equivalent controls only when proven:
- NONE/LOW: merge preparation, mechanical edits, formatting, bounded metadata, deterministic repository operations, straightforward documentation and simple checks.
- MEDIUM: normal implementation, routine bug fixes/tests, ordinary refactors and standard repository analysis.
- HIGH: complex debugging, architecture, difficult multi-file changes, security-sensitive work and consequential reviews.
- XHIGH: exceptional high-complexity/high-assurance work where HIGH is insufficient and evidence justifies escalation.
- MAX or host-equivalent maximum: last-resort only, never default, requiring explicit evidence/risk justification and M07 budget admission.

M06 should support early exit/de-escalation when sufficient evidence is obtained. Retry does not automatically increase effort.

## 5. Host selector independence and truthful enforcement
Cockpit policy is authoritative for UADS intent, but UADS MUST NOT claim control the host does not expose.

For each dispatch, M15/M16 must establish one of:
- ENFORCED: UADS can programmatically request/select the cockpit model/effort and receives adequate evidence it was applied;
- VERIFIED_MATCH: host selection is external but observed/proven to match cockpit policy;
- HOST_FIXED: host fixes model and/or effort; UADS records the constraint;
- MISMATCH: observed host selection conflicts with cockpit policy;
- UNKNOWN: insufficient evidence.

For MODEL_LOCK, MISMATCH or UNKNOWN on a model-bearing action is fail-closed by default when silent substitution could materially alter cost/quality. A policy may permit an explicit bounded fallback, but the UI must show it before/while it happens.

Therefore UADS remains safe even if a Codex/Cursor selector is manually set to another model. If override is supported, UADS enforces the cockpit choice. If override is not supported, UADS detects/records the mismatch and never pretends the locked model was used.

## 6. Dynamic model discovery
No permanent hard-coded catalog is authoritative. M04 maintains proof-backed available profiles discovered through supported host/provider mechanisms.

Cockpit selectors show only proven/allowed profiles plus explicit UNKNOWN/UNAVAILABLE states. A newer model family version can supersede an older preference only after availability, capabilities, effort controls, policy compatibility and economic metadata are established. Name/version ordering alone is insufficient.

This allows future models to appear without redesigning the router while preventing accidental adoption of an unknown or unexpectedly expensive profile.

## 7. Economic routing invariants
1. Capability and proof floor before price.
2. Within the admissible set, minimize expected token/quota/cost consumption.
3. Model and effort are optimized separately.
4. Default effort is the minimum sufficient, not HIGH/XHIGH/MAX.
5. No silent multi-model broadcast. Ensembles require explicit policy and separate bounded budget.
6. No silent expensive fallback.
7. Cached/reusable valid evidence is preferred to a new model call.
8. Retry does not automatically upgrade model or effort.
9. Deterministic/policy/context/budget failures are not blindly retried.
10. Identical proven inputs + policy version produce deterministic routing unless bounded learner/canary mode is explicitly active.
11. M07 economic admission precedes every model-bearing dispatch.
12. Remaining budget or cost truth that is UNKNOWN cannot create new spending capacity.

## 8. Economic admission
Before every model-bearing dispatch M07 reserves an Economic Safety Envelope covering estimated input/output/reasoning/retry/child-delegation exposure.

Dispatch is denied, throttled or explicitly degraded if budget cannot be reserved, selected model/effort exceeds ceilings, retry/fallback duplicates an outstanding reservation, cost truth is too uncertain for safe policy, or the economic circuit breaker is THROTTLED/HARD_STOP.

## 9. Cockpit visibility
The Living Operations Organism MUST show, per active execution and aggregate scope:
- routing mode;
- locked model/profile where applicable;
- proven available model catalog and capability status;
- selected model and resolved version;
- effort requested, supported and proven/applied;
- host enforcement state: ENFORCED / VERIFIED_MATCH / HOST_FIXED / MISMATCH / UNKNOWN;
- routing reason codes and alternatives rejected;
- estimated/reserved/actual tokens and objective cost/quota where available;
- token velocity and model-call velocity;
- retries, fallbacks, agent ancestry and context growth;
- Economic Safety Envelope and circuit-breaker state;
- one-click governed kill switch at permitted scopes.

Missing accounting is UNKNOWN/STALE, never assumed zero/current.

## 10. Mandatory proof obligations
Future M04/M05/M06/M07/M15/M16/M22/M30 work must prove:
- MODEL_LOCK never silently routes outside the selected model;
- host mismatch/unknown enforcement is detected and truthfully surfaced;
- CHEAPEST_QUALIFIED never calls an unqualified model merely because it is cheap;
- UNKNOWN/stale price evidence cannot justify a cheapest claim;
- simple tasks avoid HIGH/XHIGH/MAX without justified floor;
- merge/mechanical tasks use LOW or the host's minimum sufficient effort when safe;
- hard tasks escalate only with reason receipts and can de-escalate;
- dynamic model discovery cannot select a newer profile from name ordering alone;
- unsupported effort/model availability is never fabricated;
- fallback/broadcast/retry cannot amplify spend silently;
- routing cannot bypass M07 hard budgets/circuit breakers;
- manual host selector divergence from cockpit policy has deterministic behavior;
- cost-quality regression compares adaptive routing against fixed-model/fixed-max baselines.

## 11. Release blockers
Release is blocked if the router can silently violate MODEL_LOCK, claim a host selection it cannot prove, select unsupported model/effort, routinely over-provision effort, bypass economic admission, reset budget on retry/restart, broadcast expensive calls without explicit authorization, select maximum effort by default, or label an UNKNOWN-cost profile as cheapest.
