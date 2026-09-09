# ADR — `ADR-PROMPT-012-HOST-EXECUTION-BOUNDARY-001`

Status: `ACCEPTED; PRE-IMPLEMENTATION`
Work Order: `ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001`
Branch: `docs/eng-prompt-012-host-execution-boundary-001`
PR title: `docs: ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001 scope freeze`
Baseline: `96f2965d0ec26e00968052999b20876c13578a51`
Architecture Freeze: `v0.2` — no bump proposed
Promotion evidence: GitHub PR #18 independent audit comment `5556090827`

## Context

UADS v0.11.1 has a deterministic kernel, provider-neutral model and
specialist routing, assurance gates, and three ownership-safe host adapters.
The adapters currently detect/install/uninstall resources and prepare a
sidecar-only Host Dispatch Bundle. They do not yet provide a bounded host
execution/receipt contract. The staged roadmap explicitly names Cursor
adapter depth plus Generic/Codex execution as the next adapter capability.

Prompt 011 is externally closed at final main
`96f2965d0ec26e00968052999b20876c13578a51`, tree
`4fb7004d1ff923cd03f3df9f085ca248c2e49b67`; its closure is historical input,
not a reason to rewrite the Prompt 011 records.

The two preceding roadmap candidates were reconciled against the pre-freeze
state before selecting this increment. Prompt 009's bounded registry is
delivered; only its broader 30+ expansion remains future. Prompt 008's
provider-neutral capability/profile mapping, evidence-bearing Model Execution
Plan, and explicit host-managed compatibility are delivered without provider
calls. Live provider adapters are therefore a future expansion, not a
predecessor for the selected host boundary; provider invocation remains owned
by the host.

## Decision

Freeze Prompt 012 to one capability: a bounded, provider-neutral host
execution and receipt boundary after successful validation of an existing Host
Dispatch Bundle. The future contract may accept an explicit handoff, execute
through the owning host adapter, and persist a bounded receipt with exact
bundle/execution identity. It must not add a provider gateway, move provider
ownership into the kernel, store credentials, invoke arbitrary commands from
the kernel, create project-local operational state, or authorize approval-gated
actions.

The host owns provider invocation and host-side action execution. UADS owns
validation, scope, identity, evidence, and fail-closed authorization of the
handoff. Completion remains unproven until the existing verification,
evidence, assurance, and finalize contracts accept the current digest.

## Consequences and proof obligations

- A strict, bounded receipt contract is required before implementation can be
  accepted.
- Bundle digest, Work Order/routing/specialist/model/runtime identities,
  execution identity, adapter identity, and target-root binding must remain
  current and mutually consistent.
- Stale, replayed, tampered, cross-project, unsupported, ambiguous, or
  approval-gated handoffs must fail closed without destructive side effects.
- Receipts remain sidecar-only, privacy-safe, bounded, and free of credentials,
  raw prompts, arbitrary commands, and absolute host paths.
- Linux and Windows Node 20 coverage must prove the same contract for all
  supported adapters, while unsupported host capability remains conservative.
- The implementation must preserve the current provider-neutral Model
  Execution Plan and must not claim provider calls or autonomous gateway
  behavior.

## Alternatives considered

1. Deep UGAS integration — rejected as not required to advance the adapter
   execution stage; it remains future work behind the reserved stub.
2. Provider runtime gateway — rejected because it crosses the current
   provider-neutral and credential-free boundary.
3. Dashboard/control plane, marketplace, or deployment — rejected because no
   current DoD requires them and they introduce unrelated ownership and
   external-service risk.
4. No selected capability — rejected because the staged roadmap and current
   adapter contract show a specific prepared-handoff-to-execution gap.

## Correction 01 reconciliation

The independent audit's necessity finding is resolved by expanding the matrix
to include roadmap items 1 and 2 and by binding the branch and PR title to the
Work Order identity. The selection proof is based only on pre-freeze roadmap,
requirements, scope, DoD, adapter, model-routing, schema, and implementation
records; the new Prompt 012 acceptance text is not used to prove necessity.

## Freeze and rollback rule

No Architecture Freeze v0.2 bump is required for this bounded plan. If
implementation needs project-local state, provider/API calls from the kernel,
new credentials, arbitrary-command authority, changed approval ownership,
external service ownership, or a public contract broader than this Work Order,
stop and propose an explicit freeze bump with compatibility, migration,
rollback, and rejection evidence before any implementation edit.

This ADR is accepted for protected merge as part of the approved planning
scope freeze. It does not authorize implementation, release, tag creation, or
version changes. Host Execution implementation remains not started and not
authorized until a separate future implementation Work Order is independently
approved after post-merge audit.
