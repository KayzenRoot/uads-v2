# Universal Existing-Project Engineering Delivery Protocol

Status: `NORMATIVE`
Version: `1.0`
Adoption identity: `ENG-PROTOCOL-ADOPTION-001`

## Purpose and non-goals

This protocol adds a repeatable, evidence-backed delivery loop to an existing project. The first adoption increment establishes a verifiable baseline, a minimum governance layer, and a cleanup inventory. It is not a rewrite, a dependency upgrade, a product migration, or permission to delete code that merely looks unused.

The protocol preserves the project's existing architecture, contracts, CI, security rules, and global-first/zero-project-footprint defaults. Repository-level `.engineering/` records are governance artifacts; UADS runtime state still belongs in the global sidecar.

## Delivery lifecycle

### 1. Inspect

Before editing, identify the repository, default branch, current commit, languages, frameworks, package/build system, tests, static checks, typecheck, build, CI, deployment, database/migrations, canonical documents, executor instructions, checkpoint, scope, architecture, Definition of Done, and decision records. Use repository evidence. Mark missing facts `UNKNOWN` or `NEEDS OWNER CONFIRMATION`.

### 2. Freeze the baseline

Record the exact pre-change Git SHA and clean/dirty status. Run the project's applicable validation commands. For each command capture the command, exit code, result, duration when available, and a bounded output reference. Distinguish pre-existing failures from regressions. If a gate is not configured, record `NOT CONFIGURED`; do not invent a pass.

### 3. Create the Work Order

Every change is governed by one Work Order. It states the objective, included scope, explicit out-of-scope work, risk, dependencies, acceptance criteria, required evidence, stop conditions, autonomy limits, and selected reviewers/gates. The executor may implement only that scope.

The repository's runtime Work Order contract remains `schemas/work-order.schema.json` and remains sidecar-oriented. The `.engineering/schemas/engineering-work-order.schema.json` contract is for this static delivery protocol and must not be confused with UADS runtime state.

### 4. Acquire a Context Lock

The Context Lock records the repository identity, baseline SHA, checkpoint fingerprint, decisions fingerprint, scope fingerprint, Definition of Done fingerprint, architecture fingerprint, and other critical source fingerprints. Fingerprints are SHA-256 over exact file bytes or a documented deterministic sentinel when a source is absent.

If a critical source changes after the lock, set the lock state to `STALE`, record the changed source and reason, re-inspect the affected decisions and scope, and create a fresh lock before continuing. Expected edits to governance files must still be recorded as a stale event; they are never silently ignored.

### 5. Implement on a short branch

Use a branch named from the Work Order identity. Keep the diff focused. Preserve existing instructions and add the protocol instead of replacing project-specific rules. Do not alter product behavior, public contracts, migrations, feature flags, dependencies, or deployment configuration unless the Work Order explicitly includes them.

### 6. Verify

Run the same baseline validation after the change, plus any new protocol-artifact validation introduced by the Work Order. A passing command is not evidence unless its command and exit status are recorded. Correct issues introduced by the increment; do not absorb unrelated product bugs.

### 7. Review and deliver

Commit the focused change, push the branch, and open or update the PR using the Work Order identity. The implementer is not the sole final reviewer. The Evidence Bundle must link claims to commands, output, files, CI, or review records. The Checkpoint Delta remains proposed until the maintainer process accepts it; an executor must not promote canonical truth alone.

## Governance contracts

- Work Order: what may change and how completion is judged.
- Context Lock: which source state the Work Order was based on.
- Evidence Bundle: how each claim is proven and bound to the Work Order.
- Correction Delta: how a regression or correction is isolated, explained, and verified.
- Checkpoint Delta: what lifecycle state is proposed without silently changing canonical state.
- Report: a bounded inventory or review record with scope, evidence, status, risks, and next action.

Use the matching schema and template. Unknown fields remain unknown; a template placeholder is not evidence.

## Scope and stop rules

Stop and mark `BLOCKED` when any of the following is true:

- the baseline cannot be determined;
- canonical sources contradict each other without a resolvable hierarchy;
- unrelated work cannot be isolated;
- the baseline is too broken to distinguish regressions;
- required GitHub access is unavailable;
- the requested adoption would require an architectural rewrite;
- cleanup safety cannot be proved;
- a destructive operation is required or its radius is unknown;
- an unresolved `HIGH` or `CRITICAL` issue prevents safe continuation;
- the Context Lock is stale and has not been refreshed.

Do not start the first cleanup increment automatically after adoption. Wait for independent audit and a new Work Order.

## Cleanup inventory rules

The first adoption only records candidates. Each candidate receives exactly one current classification:

- `VERIFIED_DEAD` — proof shows it is unreachable/unreferenced across static and dynamic usage relevant to the project; eligible for a later removal Work Order.
- `PROBABLY_DEAD` — evidence suggests no use, but reflection, DI, plugins, dynamic imports, configuration, events, serialization, CLI, jobs, migrations, flags, or callbacks are not fully excluded.
- `DUPLICATE_OR_OBSOLETE` — duplicated or stale-looking material with an identified replacement, but removal still needs a bounded change.
- `GENERATED_OR_VENDORED` — generated, cached, vendored, fixture, or tool-owned content; do not hand-clean it.
- `UNKNOWN` — evidence is insufficient or the source is intentionally retained by a documented contract.

Only a later, independently reviewed Work Order may remove `VERIFIED_DEAD` material. The adoption increment never deletes a candidate.

## Security and privacy

Never copy credentials, raw tokens, private keys, customer data, or absolute host paths into protocol records or review artifacts. Use repository-relative paths and redacted bounded output. Synthetic secrets in tests remain test fixtures and are not evidence of production credentials. Never weaken branch protection, required checks, action pinning, secret exclusion, or zero-project-footprint behavior.

## Definition of Done for an adoption increment

- baseline SHA and validation results are recorded;
- Work Order, Context Lock, Evidence Bundle, Correction Delta template, Checkpoint Delta, and report template exist;
- the adoption Work Order is bounded and uses one identity;
- existing canonical docs and executor rules are preserved and integrated;
- PR/issue governance is compatible with the repository;
- cleanup inventory is evidence-backed and contains no mass deletion;
- post-adoption validation is no worse than baseline;
- the diff is committed, pushed, and submitted for independent review;
- the final review is explicit about limitations, risks, and proposed next increments.
