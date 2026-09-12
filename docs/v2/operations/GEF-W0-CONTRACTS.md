# GEF V1 W0 - Contracts and Skeleton

**Work Order:** `UADS-GEF-V1-NATIVE-IMPLEMENTATION`
**Wave:** W0 - Contracts & Skeleton
**Status:** implementation candidate

## Scope

W0 establishes the global GEF foundation without implementing W1-W8 compiler, evidence, proof, hosted-gate, cache, shadow-assurance, or optimization behavior. It owns the GEF namespace, project registry/profile/current contracts, source-truth snapshot contract, deterministic command-receipt contract, metadata-first telemetry contract, and read-only status/doctor projections.

PR #77 remains a separate functional lane. PR #81 remains the planning/documentation lane. This implementation is based directly on the current `main` branch.

## Ownership

- `src/gef/` owns provider-neutral GEF contracts and global persistence orchestration.
- `src/lib/fingerprint.ts` remains the canonical UADS project identity primitive; GEF consumes it instead of duplicating fingerprint logic.
- `src/lib/workspace.ts` remains the canonical UADS sidecar path primitive; GEF adds only the global `~/.uads/gef` paths.
- Existing UADS model routing, host dispatch, M03/M05 semantics, and fail-closed behavior are unchanged.
- GitHub adapters and hosted gate collection are deferred to later waves.

## Global storage

GEF persists only under the UADS global sidecar:

```text
~/.uads/gef/
  registry/projects.json
  projects/<project-id>/profile.json
  projects/<project-id>/current.json
  command-receipts/<receipt-id>.json
  telemetry/<event-id>.json
```

`uads gef status` and `uads gef doctor` do not create this layout. `uads gef adopt` is the explicit mutation/reconciliation boundary. Project-local `.uads` state is never created by GEF adoption.

## Fail-closed and privacy rules

- An unknown project is `NOT_ADOPTED`; it is never implicitly registered by a read-only command.
- Missing profile/current/baseline files are distinguished from malformed, unreadable, schema-invalid, or tampered files. Existing-invalid state raises `CORRUPT`/`UNAVAILABLE`, never `NOT_ADOPTED`.
- Profile, current, baseline, and registry records are cross-bound by deterministic digests and project identity.
- Adoption persists a source baseline (fingerprint, branch, head SHA, and policy digest). Read-only status/doctor compare against it; `adopt` is the explicit reconciliation mutation.
- Source mismatch is represented as `SOURCE_CONFLICT`.
- Adoption is `SHADOW` by default. W0 exposes no active-authority adoption path; shadow mode grants no test/proof-skipping authority.
- Telemetry contains bounded metadata and no prompt bodies, source snippets, credentials, tokens, or raw environment values.
- Receipts are schema-validated and written atomically.

## CLI surfaces delivered in W0

```text
uads gef status [--json]
uads gef adopt [--project <path>] [--shadow] [--json]
uads gef profile show [--json]
uads gef doctor [--json]
```

The remaining `uads gef` surfaces are intentionally staged for their owning waves and are not represented as false-ready commands in W0.
