# UADS V2 — LLM Routing & Economic Policy Requirement

Status: REQUIREMENT CANDIDATE FOR M04/M05/M06/M07/M15/M16/M22 DISCOVERY
Date: 2026-09-10

This document captures an explicit operating requirement. It does not freeze model capability claims or bypass future deep-discovery gates. Runtime support remains proof-gated through M03/M04 and host adapters.

## 1. Objective
Select the least costly proven model + effort combination that can satisfy task risk, complexity, tools, context and proof obligations, while preventing silent over-provisioning and token runaway.

## 2. Authority split
- M04 owns proven model/profile capability and availability facts.
- M05 owns model selection and routing rationale.
- M06 owns effort selection and effort escalation/de-escalation rationale.
- M07 owns token/quota/cost budget reservations and hard ceilings.
- M15/M16 translate proven Cursor/Codex host controls without inventing support.
- M22 may escalate model/effort/context only from explicit evidence and within M07 budget.
- M24 records attribution; M30 presents truthful live routing/cost state.

## 3. Codex preference policy
Operator preference: GPT-5.6 Luna is the preferred Codex family/profile when it is runtime-proven available and satisfies the task.

Effort ladder for GPT-5.6 Luna or host-equivalent controls:
- NONE/LOW: deterministic or trivial repository operations, merge preparation, formatting, bounded metadata edits, simple file movement, straightforward docs, mechanical checks where reasoning adds little value.
- MEDIUM: normal implementation, routine bug fixes, ordinary tests, bounded refactors, standard repository analysis.
- HIGH: complex debugging, multi-file architectural changes, ambiguous failures, security-sensitive implementation, difficult reviews.
- XHIGH: exceptional high-complexity/high-assurance work where HIGH is insufficient and evidence justifies escalation.
- MAX: exceptional last-resort profile only. It MUST NOT be a default, MUST NOT be selected merely because the model supports it, and requires explicit evidence/risk justification plus budget admission.

A simple task must never be routed directly to MAX/XHIGH without an auditable policy reason.

## 4. Cursor preference policy
Operator preference hierarchy:
1. Composer 2.5 or current Composer successor for everyday coding when it satisfies quality/tool requirements and is cheaper/faster under the active plan.
2. Latest proven available Grok family preferred for harder/long-horizon work. "Latest" is a policy selector resolved from M04 evidence, not a hard-coded version string.
3. Current known preference is Grok 4.6, but future Grok versions may supersede it only after capability/availability/cost evidence and policy compatibility are proven.

For Grok effort-capable profiles:
- LOW: trivial/mechanical tasks when host exposes LOW.
- MEDIUM: normal coding and routine debugging.
- HIGH: difficult/long-horizon coding, architecture and consequential analysis.
- XHIGH: exceptional escalation only with evidence and available budget.

If a host plan fixes effort (for example a fixed MEDIUM profile), UADS records the host constraint and does not pretend a different effort was applied.

## 5. Routing algorithm invariants
1. Capability before preference: a preferred model cannot be selected unless M04/M03/adapters prove required capability and availability.
2. Quality floor before price: choose the cheapest admissible profile, not simply the cheapest model.
3. Effort is independently sized by M06 after/beside model selection. Model selection must not imply MAX effort.
4. Default is low/medium, then evidence-driven escalation. No habitual HIGH/XHIGH/MAX.
5. De-escalation is allowed after uncertainty/risk falls; effort hysteresis prevents oscillation.
6. No silent broadcast to multiple models. Ensembles require explicit policy, separate bounded budget and evidence-backed reason.
7. No silent expensive fallback. If selected model becomes unavailable, fallback must remain inside capability, quality and economic ceilings, otherwise fail/defer visibly.
8. Cached/reusable evidence should be preferred to a new expensive model call when validity remains proven.
9. Retry does not automatically upgrade model or effort.
10. Routing decisions are deterministic for identical proven inputs/policy versions unless an explicitly bounded learning/canary mode is active.

## 6. Economic admission
Before every model-bearing dispatch M07 must reserve an Economic Safety Envelope covering estimated input, output, reasoning, retry and child-delegation exposure.

Routing MUST be denied or degraded if:
- budget reservation cannot be made;
- remaining quota/cost truth is UNKNOWN/STALE and policy cannot establish a conservative bound;
- selected model/effort exceeds the active ceiling;
- retry or fallback would duplicate an outstanding reservation;
- an economic circuit breaker is THROTTLED/HARD_STOP.

## 7. Task classification inputs
M05/M06 should consider at minimum:
- task class and reversibility;
- affected files/modules and dependency radius;
- security/release/data-loss risk;
- ambiguity/uncertainty;
- proof obligations and HIGH_ASSURANCE floor;
- required tools/context window;
- previous attempt result and novelty;
- token/context size estimate;
- model/effort cost and quota pressure;
- latency sensitivity;
- host capability truth.

## 8. Required telemetry/dashboard visibility
For every routed model-bearing action, expose when available:
- selected model/profile and resolved version;
- selected effort and whether requested vs proven/applied;
- routing rationale/reason codes;
- cheaper candidates rejected and why;
- escalation/de-escalation history;
- estimated/reserved/actual input + output tokens;
- cost/quota attribution where objective;
- retries, fallback and agent-spawn ancestry;
- Economic Safety Envelope state and circuit-breaker state.

Missing accounting must be UNKNOWN/STALE, never zero/current by assumption.

## 9. Mandatory proof obligations
Future M04/M05/M06/M07/M15/M16/M22 deep discovery must prove:
- trivial tasks do not select HIGH/XHIGH/MAX without justified floor;
- merge/mechanical tasks route to LOW or host-minimum effort when safe;
- normal coding typically remains MEDIUM unless evidence raises/lowers it;
- hard tasks can escalate and then de-escalate with reason receipts;
- GPT-5.6 Luna preference is honored in Codex when proven available/admissible;
- Cursor routes everyday work to Composer-class profiles when admissible and difficult work to the latest proven Grok preference when justified;
- latest-Grok resolution cannot adopt an unproven/newer version merely from name ordering;
- fixed-effort host plans are truthfully represented;
- unavailable profiles and unsupported efforts are never fabricated;
- MAX is never default and has a measurable exceptional-use rate target;
- routing cannot bypass M07 hard budget/circuit breaker;
- no broadcast/fallback/retry amplification;
- cost-quality regression benchmarks compare routing against fixed-model/fixed-max baselines.

## 10. Release blocker
A release is blocked if routing can silently select an unsupported model/effort, routinely over-provision effort, bypass economic admission, reset budget on retry/restart, broadcast expensive calls without explicit authorization, or select MAX by default.
