# 08 — Security

UADS by NexLabs treats review packaging and installers as security-sensitive even at foundation stage.

## Non-negotiable

- Do not write secrets into the sidecar, Work Orders, routing decisions, checkpoints, execution runs, evidence, reviews, or review ZIP
- Intake-derived free text is redacted with the shared high-confidence sanitizer before durable writes; errors must not echo raw secrets
- Exclude `.env*`, private keys, tokens, credential filenames, and `memory-bank/`
- Exclude `.git/` (history can contain secrets)
- Sanitize Git remotes (strip userinfo) before they enter a shareable manifest
- Redact high-confidence secret signatures **and** absolute host paths in source, diffs, evidence, and generated review text
- Do not exclude ordinary source/docs/tests just because the filename contains `secret` / `token` / `password` / `credential`
- Do not serialize absolute host paths into the shareable review manifest or ZIP text
- Installers must not overwrite user files without `--force` / `-Force`
- Execution state uses relative project paths only; `../`, drive paths, and UNC paths are rejected
- Index/graph/impact/Context Pack artifacts reject traversal, symlink escape, `.env`/credential content, and absolute host paths
- Corrupt index/graph JSON is not treated as current; `uads index` rebuilds, impact/pack/diagnosis fail closed until a valid complete index exists
- Failure text is sanitized before persist; signatures and Failure Memory must not store raw secrets or host paths
- `--input` for `uads failure record` must be an ordinary file inside the repository or current project sidecar; symlink targets that resolve outside those roots are rejected before read, and the input is not copied into review ZIPs
- Dirty worktrees block dispatch; the engine never reset/stash/cleans user files
- Implementer cannot self-approve; the implementer session is bound at dispatch and cannot be invented during review
- Change digest hashes actual changed file bytes (including untracked binaries); Git paths are parsed with NUL-delimited porcelain
- Cache files are untrusted persisted data: schema-validate before trust, reject id/path traversal, never execute stored command text, never cache raw secret-bearing output
- Cross-project cache records cannot be persisted into or satisfy another project's gates
- Review ZIP cache/cost summaries contain counts and reason codes only; no raw command output or sidecar filesystem paths
- Assurance packets are bounded machine-readable metadata: they carry identities, sanitized relative scope, gate/evidence references, obligations, blockers, and independence invariants, never prompts, commands, secrets, or absolute paths
- Contradictory approvals are fail-closed: APPROVED with HIGH/CRITICAL findings, stale or foreign evidence, duplicate reviewer sessions, invalid roles, and cross-role substitutions cannot satisfy a gate
- Fault-injection cases exercise scope violations, stale digests, forged/corrupt artifacts, contradictory gate state, invalid specialist selection, and correction-loop exhaustion; these are blockers, not warnings
- Normative FI1–FI16 cases cross real planner, dispatch, verification, evidence, assurance, model-runtime, host-adapter, and failure-localization boundaries. FI13–FI15 cover tampered Specialist Selection Plans, stale Model Execution Plans, and replayed Host Dispatch Bundles; FI16 deterministically stops repeated failure loops. Former synthetic cases remain as FI17–FI32 regression coverage.
- Assurance required evidence is canonical typed plan data (`requiredObligations`/`coveredObligations` and exact gate/evidence/specialist identities); prose markers and caller booleans are not authority.
- `--findings-file` is bounded to an ordinary JSON array under the managed repository or current project sidecar, rejects traversal, symlink escape, foreign roots, non-regular files, oversize/invalid input, and sanitizes errors without exposing raw paths.

Content scanning is **defense-in-depth**, not a claim of complete secret detection.

## Threat notes (foundation)

| Surface | Risk | Mitigation |
| --- | --- | --- |
| Review ZIP | Secret leakage via path, diff, source, or evidence | Path exclusion + URL sanitization + high-confidence redaction + tests |
| Review ZIP | Host path disclosure | Privacy-minimized manifest + path redaction |
| Installer | Overwrite of `~/.uads` | skip-existing default |
| Installer | Unusable CLI | npm prefix install + verification of `uads --help` / `doctor` |
| Fingerprint | Path vs remote mismatch | Prefer sanitized origin URL |

## Reporting

See `SECURITY.md`.
# Release security-proof binding

Corrected-release authorization is fail-closed. Scorecard evidence must be an exact final-main SHA run from the `push` event with `head_branch=main`; schedule, branch-protection, and pull-request runs are not interchangeable. A same-tree Dependency Review proof must independently identify exactly one merged PR into the repository's `main`, validate the source-commit PR association and source/final tree equality, and require any available run PR metadata to name that same PR. Distinct authoritative run IDs and ambiguous PR associations are rejected; a rerun is considered the same logical run only when the GitHub run ID is identical and only `run_attempt` changes.

The Dependency Review workflow runs for every `pull_request` targeting `main`, including documentation-only changes, so every candidate main commit can produce the required proof. This coverage rule does not make the proof optional: absent, pending, failed, ambiguous, mismatched, cross-PR, or tampered Dependency Review evidence remains non-authorizing.

Canonical post-main Direct Review generation performs bounded readiness polling for pending security proofs. The timeout is explicit and remains non-authorizing: failure, ambiguity, mismatch, cancellation, skipping, tampering, or timeout cannot become `PASS`.

## Host execution boundary

Host Execution receipts are global-sidecar-only, schema-closed, atomic,
bounded, and bound to the current dispatch bundle, adapter ownership/root
digest, project, Work Order, routing, specialist, model/runtime, execution-run,
and change identities. Handoff never accepts command text, provider endpoints,
credentials, model output, raw prompts, arbitrary capabilities, caller
authorization booleans, or absolute host paths. The host owns the actual
IDE/agent/provider invocation; UADS records only bounded outcome state.

`ACCEPTED`, `STARTED`, `COMPLETED`, `FAILED`, and `BLOCKED` are the only receipt
states. Replays and impossible transitions are rejected; terminal receipts are
immutable. A receipt is never command PASS evidence, gate evidence,
independent review, assurance, or finalize authorization.

## Current identity and approval correction

Receipt mutation is authorized only after reconstructing and revalidating the
current Host Dispatch artifacts, not merely by comparing the receipt with the
previously persisted bundle. Execution-run, Work Order/routing, specialist,
model/runtime, current-change, adapter ownership, target-root, and bundle drift
fail closed and leave the earlier receipt intact. The existing Work Order
autonomy boundary is authoritative, but its `requiresApproval` list is a
global policy catalog rather than current-action evidence. UADS derives the
schema-closed `activeApprovalGatedActions` projection from canonical planning
inputs: objective, included scope, requested artifacts, constraints,
acceptance criteria, and domain/risk/destructive signals. When that active list is non-empty and the repository/runtime has no
verifiable durable authorization record for the exact current identity,
handoff is blocked with `APPROVAL_AUTHORIZATION_MISSING`. Receipt state, CLI
flags, booleans, and caller-supplied prose in `approvedBoundaries` cannot serve
as approval evidence. Host Dispatch recomputes the projection from current
Work Order action signals and fails closed for legacy Work Orders missing a
persisted canonical signal such as `constraints`; promotion to production is
classified as production deployment.
Sensitive requests that do not prove a fixed class set
`activeApprovalIntentAmbiguous` and fail closed for that task rather than
globally blocking unrelated work.
