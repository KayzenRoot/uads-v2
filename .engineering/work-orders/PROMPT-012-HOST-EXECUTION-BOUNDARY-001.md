# Work Order — `ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001`

Status: `READY_FOR_REVIEW`
Promotion status: `APPROVED_FOR_MERGE`
Implementation status: `NOT_STARTED; NOT_AUTHORIZED`
Repository: `KayzenRoot/uads`
Branch: `docs/eng-prompt-012-host-execution-boundary-001`
Baseline Git SHA: `96f2965d0ec26e00968052999b20876c13578a51`
Head Git SHA: `pending; authoritative PR head must be read from GitHub`
Scope class: `architectural`
Risk: `HIGH`

## OBJECTIVE

Define and later implement exactly one next capability: a bounded,
provider-neutral host execution and receipt boundary that accepts only a
current, identity-bound Host Dispatch Bundle and records a bounded,
sidecar-only execution outcome. The capability must deepen the existing
Cursor, Codex, and Generic Agent Skills handoff without turning the UADS
kernel into a provider gateway, credential store, arbitrary-command executor,
or approval authority.

This Work Order freezes scope before implementation. This planning delta does
not implement the capability.

## CONTEXT

- Prompt 011 / v0.11.1 is externally `APPROVED — PROMPT 011 CLOSED` under
  GitHub PR #16 comment `5554582899`.
- The authoritative Prompt 011 baseline is main SHA
  `96f2965d0ec26e00968052999b20876c13578a51`, tree
  `4fb7004d1ff923cd03f3df9f085ca248c2e49b67`.
- Current adapters detect/install/uninstall resources and prepare a
  sidecar-only Host Dispatch Bundle, but do not execute the handoff or
  provide a bounded execution receipt.
- The roadmap explicitly lists “Cursor adapter depth + generic/Codex
  execution” as the third next increment.
- Pre-freeze reconciliation confirms that Prompt 009's bounded catalog is
  delivered while broader catalog expansion remains future, and that Prompt
  008's provider-neutral capability/profile mapping plus host-managed mode are
  already sufficient for the current contract. Live provider adapters are not
  a predecessor because provider invocation remains host-owned and out of
  scope.
- F24 and the current DoD prove preparation and identity binding, not host
  execution completion.
- UGAS is a reserved stub and is not a prerequisite for this stage.

## SCOPE

The later implementation Work Order governed by this scope may include only:

- A strict, versioned, provider-neutral host execution receipt contract.
- A single explicit handoff path from a current Host Dispatch Bundle to the
  owning host adapter.
- Revalidation of Work Order, routing, specialist, model, runtime,
  context/impact, execution, adapter, and target-root identities before the
  handoff.
- Bounded receipt states for accepted/start/completed/failed/blocked outcomes,
  with stable reason codes and no free-form authority.
- Sidecar-only atomic receipt persistence with bounded history and current
  status, preserving zero project footprint.
- Cursor, Codex, and Generic Agent Skills adapter contract coverage, including
  conservative fallback when host capability is unproven.
- Verification that a receipt cannot itself substitute for gate evidence,
  independent assurance, or finalize requirements.
- Focused schemas, tests, documentation, and evidence required by this
  contract, without changing unrelated product behavior.

## OUT OF SCOPE

- Any implementation in this planning delta.
- Provider API clients, model-invocation gateways, live provider catalogs,
  vendor pricing, credentials, tokens, endpoint management, or provider calls
  from the kernel.
- Arbitrary shell/host command authority, autonomous approval, production
  deployment, wallet custody, on-chain execution, or financial transfers.
- Dashboard, cloud control plane, marketplace, production Skill registry,
  enterprise policy server, remote graph service, or telemetry UI.
- Deep UGAS/game-assets integration, a new specialist marketplace, or broad
  catalog expansion.
- Project-local operational state, migration of historical records, dependency
  changes, release publication, tag creation, version changes, or package
  metadata changes.
- Branch-protection changes, historical Prompt 011 evidence rewrites, or
  recursive Prompt 011 closeout commits.

## FILES/SOURCES TO READ

- `ROADMAP.md`
- `docs/01-PROJECT-OVERVIEW.md`
- `docs/02-REQUIREMENTS.md`
- `docs/03-SCOPE.md`
- `docs/04-ARCHITECTURE.md`
- `docs/05-STATE-AND-CHECKPOINT.md`
- `docs/07-QUALITY-GATES.md`
- `docs/08-SECURITY.md`
- `docs/11-ADAPTERS.md`
- `docs/13-DEFINITION-OF-DONE.md`
- `docs/14-BACKLOG.md`
- `.engineering/PROTOCOL.md`
- `.engineering/DECISIONS.md`
- `.engineering/decisions/ADR-PROMPT-012-HOST-EXECUTION-BOUNDARY-001.md`
- `.engineering/checkpoints/CHECKPOINT-DELTA-PROMPT-011-ASSURANCE-STABILIZATION-001.md`
- `.engineering/reports/EVIDENCE-BUNDLE-PROMPT-011-ASSURANCE-STABILIZATION-001.md`
- `integrations/ugas/README.md`
- `src/adapters/host-dispatch.ts`
- `src/adapters/host-adapter.ts`
- `src/adapters/host-adapter-types.ts`
- `schemas/host-dispatch-bundle.schema.json`
- relevant model/specialist/execution schemas and tests
- exact GitHub PR #16 closure comment and release/tag evidence

## REQUIREMENTS

1. The implementation must accept exactly one current Work Order and one
   current Host Dispatch Bundle identity; no caller-supplied boolean can
   authorize execution.
2. Bundle digest, project, routing, specialist, model, runtime, context/impact,
   execution, adapter, and target-root identities must be revalidated at the
   handoff seam.
3. Receipt states and reason codes must be schema-closed, bounded, deterministic
   and privacy-safe; raw prompts, credentials, arbitrary commands, absolute
   host paths, and uncontrolled output are forbidden.
4. Operational receipts and history must remain global/sidecar-only and use
   atomic writes with corruption and replay detection.
5. A host capability that is unknown or insufficient must narrow behavior or
   fail closed; it must never broaden selected specialists, gates, evidence,
   scope, parallelism, or model quality.
6. A receipt must not impersonate command PASS evidence, independent review,
   assurance, or finalize authorization.
7. All three supported adapters must share the same contract and preserve
   ownership-safe target-root binding; unsupported capability remains
   conservative.
8. Existing release/security proof semantics, global-first/ZPF defaults, and
   provider-neutral model routing must remain unchanged.

## ARCHITECTURE RULES

- Architecture Freeze v0.2 remains in force; no bump is required for the
  bounded plan.
- The kernel owns validation, scope, identity, evidence semantics, and
  fail-closed authorization. The host owns the actual host/provider handoff.
- No provider invocation contract or credentials may enter the kernel or
  durable UADS records.
- Project-local operational state is forbidden. Receipts belong only in the
  global sidecar and must not expose host paths.
- If implementation needs changed trust boundaries, external service
  ownership, arbitrary command authority, credentials, or a public contract
  broader than this Work Order, stop and propose a freeze bump/ADR amendment.

## CONSTRAINTS

- No version bump, tag, release, dependency, migration, or deployment change.
- No merge before independent audit approval; no self-approval.
- Do not rewrite Prompt 011 history or use a new closeout to persist its final
  SHA/run IDs.
- Preserve exact v0.11.0 and v0.11.1 release/tag/assets and absence of v0.11.2
  and v0.12.0.
- Keep changes limited to the future implementation contract, its tests,
  schemas, bounded docs, and evidence files expressly authorized by a later
  implementation review.

## ACCEPTANCE CRITERIA

- [ ] A strict receipt schema and stable reason-code contract are reviewed.
- [ ] Handoff rejects missing, stale, tampered, replayed, cross-project,
      cross-root, ambiguous, unsupported, and mismatched identities.
- [ ] Atomic sidecar-only persistence, bounded history, corruption handling,
      and privacy checks are proven.
- [ ] Receipt outcomes cannot satisfy verification, assurance, selected gates,
      or finalize without their existing evidence contracts.
- [ ] Cursor, Codex, and Generic Agent Skills behavior is covered, including
      conservative host fallback and ownership binding.
- [ ] Global-first/ZPF, provider neutrality, approval ownership, and historical
      release immutability remain proven.
- [ ] Existing tests/evals and all newly selected contract tests pass on the
      exact implementation SHA.
- [ ] Independent technical audit approves the exact PR head before merge;
      the PR remains unmerged until that approval.

## TESTS

- `npm run validate:engineering`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run validate`
- focused host-adapter, execution-scope, specialist/model identity,
  schema/privacy, replay/staleness, and zero-project-footprint tests
- Linux/Windows Node 20 compatibility proof for the exact implementation SHA
- exact-SHA Foundation, CodeQL, Scorecard, Dependency Review, Direct Review,
  and release checks when a later implementation is promoted

This Prompt 012 planning delta runs only the currently applicable local
validation. No implementation-specific test is claimed complete here.

## DELIVERABLES

- `.engineering/work-orders/PROMPT-012-HOST-EXECUTION-BOUNDARY-001.md`
- `.engineering/context-locks/PROMPT-012-HOST-EXECUTION-BOUNDARY-001.md`
- `.engineering/baselines/PROMPT-012-HOST-EXECUTION-BOUNDARY-001.md`
- `.engineering/checkpoints/CHECKPOINT-DELTA-PROMPT-012-HOST-EXECUTION-BOUNDARY-001.md`
- `.engineering/reports/EVIDENCE-BUNDLE-PROMPT-012-HOST-EXECUTION-BOUNDARY-001.md`
- `.engineering/decisions/ADR-PROMPT-012-HOST-EXECUTION-BOUNDARY-001.md`
- bounded canonical roadmap/scope/requirements/architecture/DoD/backlog and
  decision-ledger updates recording the selection only

## REVIEW FORMAT

Independent review must report: selected candidate and matrix, exact baseline
and PR head/tree, architecture/freeze decision, changed-file classification,
all local and hosted gates, privacy/ZPF result, release immutability result,
unresolved risks, and an explicit `APPROVED`, `CORRECTION_NEEDED`, or `BLOCKED`
verdict. The implementer may not supply the final approval.

## STOP CONDITION

Stop and mark BLOCKED if the exact scope cannot be justified, more than one
capability enters implementation scope, the architecture/ADR or freeze status
is unresolved, runtime/source implementation is added during planning, a
version/release/tag changes, Prompt 011 evidence is rewritten, any identity
or privacy proof is unavailable, or any unresolved HIGH/CRITICAL planning
inconsistency remains.

## CORRECTION 01 — Necessity and identity reconciliation

Audit finding addressed by this correction: the decision matrix must evaluate
the two roadmap items preceding host execution, and the Work Order identity
must be repeated by the branch and pull request. The corrected matrix records
the bounded Prompt 009 catalog as delivered with broader expansion FUTURE; it
records Prompt 008's bounded provider-neutral mapping as delivered with live
provider adapters FUTURE; and it retains exactly one NECESSARY candidate,
host execution depth. The necessity proof uses only pre-freeze sources and
does not use the new Prompt 012 DoD text as evidence.

Correction identity: `Prompt 012 Scope Freeze — Correction 01 / Necessity &
Identity Reconciliation`.

PR title: `docs: ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001 scope freeze`.

## POST-APPROVAL PROMOTION

Independent audit comment `5556090827` approved the exact Prompt 012
scope-freeze head/tree for protected merge. This Work Order's planning state
is therefore `APPROVED_FOR_MERGE`; the Host Execution Boundary implementation
remains `NOT_STARTED` and `NOT_AUTHORIZED` in this task. A separate future
implementation Work Order is required after post-merge verification.
