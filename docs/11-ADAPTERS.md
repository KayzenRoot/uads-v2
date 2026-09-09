# 11 — Adapters

UADS is adapter-shaped: the kernel remains provider-neutral and hosts bind
through one common contract at `src/adapters/`. Prompt 010 supports exactly:

- `cursor`
- `codex`
- `generic-agent-skills`

Adapters prepare and validate host state. They do not invoke model providers,
execute arbitrary commands, or become an autonomous gateway.

## Global targets

| Adapter | Global target | Resource |
| --- | --- | --- |
| Cursor | `~/.cursor/agents/` | UADS `uads-*.md` specialist descriptors |
| Codex | `~/.codex/agents/` | UADS `uads-*.md` specialist descriptors |
| Generic Agent Skills | `~/.agents/skills/uads-orchestrator/` | canonical UADS Skill tree |

`UADS_HOME` controls UADS state. `UADS_CURSOR_HOME`, `UADS_CODEX_HOME`, and
`UADS_AGENT_SKILLS_HOME` are explicit synthetic user-home overrides for tests or
controlled environments. The implementation always appends the fixed adapter
root segment (`.cursor`, `.codex`, or `.agents`) beneath that home. Passing an
already-suffixed adapter path as a synthetic home is rejected with
`DOUBLE_ADAPTER_ROOT_REJECTED`. Use `adapterRoot` when the caller already has
the fully resolved adapter root.

Native environment semantics are fixed and deterministic:

| Variable | Semantics |
| --- | --- |
| `UADS_CURSOR_HOME` | synthetic user home |
| `CURSOR_USER_HOME` | synthetic user home |
| `UADS_CODEX_HOME` | synthetic user home |
| `CODEX_HOME` | adapter root (no suffix appended) |
| `UADS_AGENT_SKILLS_HOME` | synthetic user home |
| `AGENT_SKILLS_HOME` | not consumed automatically |
under `~/.uads/adapters/<adapter>/` stores adapter-relative resource names and
hashes, never raw host paths, credentials, prompts, or environment dumps.

## Detection and capabilities

`uads adapters detect` is read-only and never creates a host directory. A
target is `SUPPORTED` only when its fixed host structure is present or an
explicit controlled home is supplied; otherwise it is `UNAVAILABLE`,
`UNPROVEN`, or `BLOCKED`. Version probing is intentionally not implemented,
so adapter version remains `null` rather than being fabricated.

Adapter capability data reuses the existing Runtime Capability Snapshot shape
and carries `provenance.source=adapter`. Unknown is not true. Generic Agent
Skills explicitly starts with `subagents=false` and `parallelAgents=false`;
Cursor and Codex do not claim those capabilities without proof. Model
capabilities still require the existing model/runtime intersection.

## Ownership-safe installation

`uads adapters install <adapter>` writes only fixed global targets. The common
installer:

- records source and installed SHA-256 hashes atomically;
- preserves unrelated files;
- refuses unmanaged `uads-*` collisions;
- refuses user-modified managed bytes;
- rejects traversal and symlink/junction escapes;
- rolls back host, sidecar state, and canonical `~/.uads/agents` writes when a later write fails;
- migrates exact legacy v0.10.0 Codex/Generic default-target state transactionally when ownership is provably clean;
- persists a privacy-safe `rootBinding.targetRootDigest` for every newly installed state;
- adopts legacy v0.10.0–v0.10.2 unbound states only through explicit install/update when bytes and manifest match exactly;
- is idempotent when canonical resources are unchanged.

Persisted adapter state under `~/.uads/adapters/<adapter>/` stores adapter-relative resource names, hashes, and `rootBinding` metadata (digest, `rootKind`, `sourceClass`, `bindingVersion`). Raw host paths never appear in state, status JSON, Host Dispatch Bundles, or release artifacts. Current ownership uses `SHA256("uads-host-target-root-v2" + adapterId + canonical-target-root)` with case-preserving lexical canonicalization: absolute resolution collapses `.` / `..`, separators are normalized, trailing separators are removed, and path component case is never folded. The digest is independent of diagnostic `sourceLabel`.

Binding version 1 from v0.10.3 is readable for migration but is always reported as stale/upgrade-required and cannot authorize destructive uninstall or trusted preparation. An explicit install/update may adopt v1 to v2 only after exact managed-resource and manifest ownership checks at the currently configured target; the adoption is transactional, preserves unrelated bytes, and never searches alternate roots.

Cross-root replay is forbidden: identical managed bytes at a different canonical root do not satisfy ownership, block destructive uninstall, and invalidate prepared bundles through `hostTargetRootDigest`.

`uads adapters uninstall <adapter>` removes only unchanged resources listed in
the ownership state. Modified or ambiguous resources survive and produce a
deterministic conflict. It never recursively removes a host directory.

## Host Dispatch Bundle

`uads adapters prepare <adapter>` reconstructs the current Work Order,
Routing Decision, Specialist Selection Plan, Model Execution Plan, Context /
Impact identity, runtime snapshot, and execution identity before writing a
sidecar-only `Host Dispatch Bundle`. The bundle contains role-scoped
assignments, dependency groups, gates, evidence obligations, risk, forbidden
scope, context references, token limits, and identity digests.

Host capability can narrow UADS execution: an unproven host serializes
parallel-eligible groups and uses role cycling instead of subagents. It may
never add specialists, assurance roles, gates, evidence, scope, parallelism,
or model quality. Stale, blocked, cross-project, tampered, or mismatched
artifacts fail closed.

## CLI

```text
uads adapters list
uads adapters detect [adapter]
uads adapters status [adapter]
uads adapters explain <adapter>
uads adapters install <adapter>
uads adapters uninstall <adapter>
uads adapters prepare <adapter>
uads adapters handoff <adapter>
uads adapters receipt <adapter> --state <state> [--reason-code <code>]
```

JSON output is schema-shaped and omits raw host paths. `status` and `detect`
are non-installing operations. All three adapters use the same Skill + CLI
contract; a host that requires project-local files is outside this freeze.

## Host Execution Receipt

`uads adapters handoff <adapter>` is the single bounded seam after
`prepare`. It reads the current global `Host Dispatch Bundle`, reconstructs
current Work Order/routing/specialist/model/runtime/context/impact/execution
state, verifies adapter ownership and target-root identity, and persists one
`ACCEPTED` receipt only when every identity matches. It does not invoke a
provider, run a shell command, accept command text, or choose a model.

The strict `schemas/host-execution-receipt.schema.json` contract binds at
least the receipt/handoff ID, bundle ID/digest, adapter contract, project,
Work Order/digest, routing/digest, specialist plan/digest, model plan/digest,
model/runtime identity digests, non-null execution run, target-root digest,
current change digest, state, UTC timestamps, stable reason codes, and receipt
digest. No provider ID, prompt, output, token, credential, or absolute path is
durable.

The current receipt is global-only at
`~/.uads/workspaces/<project-id>/host-execution/current.json`; immutable
transition entries are retained at
`~/.uads/workspaces/<project-id>/host-execution/history/`. Retention is capped
at 32 valid entries. Corruption, digest mismatch, stale/cross-project or
cross-root identity, unsupported ownership, missing execution run, and replay
fail closed. `uads adapters receipt <adapter> --state <state>` only records
the closed outcome transition and never changes gate evidence, assurance,
review, or finalize state.

Every mutating receipt transition reconstructs the current dispatch artifacts
and rechecks the accepted bundle, execution run, Work Order/routing,
specialist selection, model/runtime, current-change, adapter ownership,
target-root, and active approval-classification identities. A stale transition
is rejected without rewriting the accepted receipt. The Work Order
`requiresApproval` list is a global policy catalog and may be non-empty for a
safe plan; it does not by itself block handoff. UADS derives the fixed-
vocabulary `activeApprovalGatedActions` projection from canonical objective,
scope, requested artifacts, constraints, acceptance criteria, and
domain/risk/destructive signals. Host Dispatch recomputes the projection from
the current Work Order and does not trust persisted active fields. A non-empty active projection
blocks with `APPROVAL_AUTHORIZATION_MISSING` because this architecture has no
durable authorization-proof primitive. No receipt, CLI field, caller boolean,
or caller-supplied prose boundary can authorize the action. Promotion to
production is treated as production deployment. Newly planned Work Orders
persist `constraints`; legacy Work Orders missing that canonical field fail
closed for explicit migration instead of being treated as safe.
Sensitive signals that imply an action but do not prove a fixed class set
`activeApprovalIntentAmbiguous`, which is bound into the same identities and
blocks that task with the same reason code.
# Specialist delegation contract

Adapters may invoke the lean `agents/uads-*.md` descriptors selected by the sidecar Specialist Selection Plan. The kernel emits role-specific assignments with objective, relevant affected areas/files/gates, evidence obligations, risk, forbidden scope, dependency group, and parallel eligibility. Adapters must not invent profiles, call providers from the kernel, execute approval-gated actions, or treat a stale/blocked plan as dispatch authorization.
