# UADS V2 Parallel Specialist Execution — Cockpit Control Contract

Status: CANDIDATE DESIGN
Scope: UADS V2 only

## Purpose
Give the operator explicit control over whether UADS uses specialist multi-agent parallel execution for a workload, how aggressively it may parallelize, and how much cost/risk it may consume.

## Operator modes
- OFF — force conventional single-agent/sequential execution unless a safety mechanism requires another actor such as an independent reviewer.
- AUTO — UADS may parallelize only when the Parallelism Worthiness Gate proves expected benefit within cost/risk limits.
- ECO — allow bounded parallelism optimized for minimum spend; cheapest qualified specialists and lowest safe effort are preferred.
- BALANCED — optimize wall-clock and cost together.
- TURBO — allow higher bounded concurrency and higher spend within explicit ESE limits; quality/safety floors remain unchanged.
- CUSTOM — operator explicitly sets concurrency, cost, effort and specialist constraints.

No mode may bypass ESE, authorization, capability proof, sandbox requirements, AEG/HEDS, SIR/replay safety, or M31 release gates.

## Cockpit controls
The M30 Living Operations Cockpit SHOULD expose a governed Parallel Execution Control surface with:
- master enable/disable switch
- mode selector: OFF / AUTO / ECO / BALANCED / TURBO / CUSTOM
- max concurrent specialist agents
- max total agents per execution
- max delegation depth
- per-WO token budget
- per-WO monetary budget where pricing is known
- max wall-clock target or deadline preference
- preferred model policy: Model Lock / Cheapest Qualified / Quality-Floor Autoroute
- effort policy: fixed effort or Effort Autopilot
- optional per-specialty allow/deny list
- optional host/provider quota ceiling
- kill switch for new agent dispatch
- drain mode for active agents

## Pre-apply forecast
Before applying a material change, the cockpit SHOULD present a bounded estimate when evidence exists:
- expected agent count
- expected parallel width
- expected wall-clock delta
- expected token/cost delta
- expected conflict/integration risk
- confidence/evidence class

Unknown estimates MUST render UNKNOWN, never fabricated precision.

## Governed command model
Dashboard controls never mutate executor state directly. M30 issues a Governed Command Envelope to the authoritative orchestration/economic modules.

Every command declares:
- command identity/version
- owner module
- actor/auth context
- requested mode/limits
- current effective limits
- risk class
- preconditions
- idempotency key
- timeout/cancellation semantics
- blast radius
- audit correlation
- terminal outcome

## Runtime behavior
1. Prompt enters planning/decomposition.
2. PPG builds task DAG.
3. SAR selects candidate specialists.
4. PWG evaluates whether parallelism is worthwhile.
5. Operator policy constrains the allowed decision space.
6. ESE reserves bounded capacity across parent/children.
7. ECF prevents unsafe concurrent edits/side effects.
8. Agents execute within per-task model/effort decisions.
9. MIR integrates results.
10. AEG/HEDS verify final evidence.

## Effective-policy rule
The effective parallelism policy is the strictest combination of:
- operator cockpit limits
- project/WO policy
- ESE remaining capacity
- provider/host quota
- capability proof
- security/sandbox constraints
- dependency/conflict graph
- PWG decision

Operator TURBO is permission to use more parallelism, not an order to create unnecessary agents.

## Truthful cockpit projection
For every active execution the cockpit SHOULD show:
- requested mode
- effective mode
- reason for downgrade/block
- active specialist count
- queued specialist count
- completed/failed/cancelled count
- task DAG progress
- specialist identities/roles
- model/profile per task
- requested/applied effort per task
- task token/cost burn
- WO aggregate burn
- remaining ESE budget
- predicted vs actual wall-clock
- merge/integration conflicts
- PWG rationale
- throttling/breaker state

## Economic safety
Increasing concurrency MUST NOT create new budget. Child reservations are carved from the parent ESE. HARD_STOP causes zero new model-bearing dispatch. Kill/drain controls must not require an LLM call to become effective.

## Persistence and scope
The cockpit SHOULD support policy scopes:
- THIS_EXECUTION
- THIS_WORK_ORDER
- THIS_PROJECT
- GLOBAL_DEFAULT

Higher-risk/global changes require stronger authorization and audit evidence. Temporary overrides SHOULD have expiry/lease semantics so a TURBO setting does not accidentally remain forever.

## Candidate proprietary mechanisms
- PEC — Parallel Execution Control
- PPL — Parallelism Policy Lease
- PEF — Per-Task Effort Fabric
- PWG — Parallelism Worthiness Gate
- SAR — Specialist Agent Router
- ECF — Execution Concurrency Fence
- MIR — Merge & Integration Referee
- PFC — Parallelism Forecast Contract

## Mandatory proof requirements
- OFF produces no optional specialist fan-out.
- AUTO never exceeds PWG/ESE/operator ceilings.
- TURBO cannot bypass economic/security/release floors.
- CUSTOM invalid limits fail closed.
- global/project overrides are auditable and revertible.
- expired Parallelism Policy Lease returns to configured safe default.
- changing mode mid-run never duplicates side effects.
- lowering concurrency drains/cancels safely according to task effect class.
- kill switch causes zero new model-bearing dispatch after enforcement point.
- dashboard reflects requested vs effective mode truthfully.
- missing host/provider control is HOST_FIXED/MISMATCH/UNKNOWN, never simulated compliance.

## Dashboard UX principle
Make the common decision simple: one visible master switch and mode selector. Advanced controls stay behind progressive disclosure. The operator should be able to choose 'normal today' or 'use more of my paid plan today' without needing to understand the orchestration internals, while expert controls remain available when desired.
