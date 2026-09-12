# UADS GEF V1 W0 - PR #84 Correction Evidence Bundle

Status: `COMPLETE_CANDIDATE` after CR-W0-01 through CR-W0-05; exact-head hosted gates and independent HEDS remain pending on the newly published head. No merge.

Work Order: `UADS-GEF-V1-NATIVE-IMPLEMENTATION`
Wave: `W0`
Correction Pack: `UADS-GEF-V1-W0-PR84-CORRECTION-PACK`
PR: `#84`
Base SHA: `5b55eb8d06fde7d616ac72d31a3b1e31a1b4381a`
Rejected head: `3016057f50dd94ad77c68034f143ce7b9bd0a191`
Candidate head: exact final head is recorded in PR #84 after the final push; this report is committed before hosted receipts and does not receive an evidence-only follow-up commit.

## Correction findings

- `CR-W0-01 PASS` — missing, malformed, unreadable, and schema-invalid profile/current/baseline records have distinct bounded states. Existing-invalid state is `CORRUPT`/`UNAVAILABLE`, never `NOT_ADOPTED`.
- `CR-W0-02 PASS` — one canonical profile digest helper is used for adoption and read-time verification. Profile/current/baseline identity and digest bindings are checked, including the registry entry.
- `CR-W0-03 PASS` — adoption persists a closed baseline containing project fingerprint, branch, head SHA, and policy digest. Read-only status/doctor compare against it and return `UNKNOWN` without a baseline or `SOURCE_CONFLICT` after drift. `adopt` is the explicit reconciliation mutation.
- `CR-W0-04 PASS` — W0 adoption defaults to `SHADOW`; the active-authority path is unavailable. Shadow adoption grants no proof/test-skipping authority.
- `CR-W0-05 PASS` — this canonical Evidence Bundle records exact base/rejected identity, cumulative scope, validations, truth about RG14, security/privacy/fail-closed checks, hosted-gate state, and known debt.

## Scope and changed files

The correction remains W0-only. PR #77 is untouched. PR #81 remains planning/documentation-only. W1-W8 are not implemented.

Cumulative PR files:

- `.engineering/reports/EVIDENCE-UADS-GEF-V1-W0-PR84.md` - correction Evidence Bundle.
- `docs/v2/operations/GEF-W0-CONTRACTS.md` - W0 ownership, storage, baseline, privacy and safe-adoption contract.
- `schemas/gef-command-receipt.schema.json` - closed command receipt contract.
- `schemas/gef-current.schema.json` - current state plus baseline digest binding.
- `schemas/gef-project-profile.schema.json` - closed global project profile contract.
- `schemas/gef-registry.schema.json` - closed global project registry contract.
- `schemas/gef-source-snapshot.schema.json` - closed source baseline contract.
- `schemas/gef-telemetry-event.schema.json` - metadata-first telemetry contract.
- `src/cli.ts` - `uads gef` namespace and W0 commands.
- `src/commands/gef.ts` - status/profile/doctor projections and safe adoption command.
- `src/gef/receipts.ts` - deterministic receipt constructor/persistence.
- `src/gef/registry.ts` - global adoption, integrity checks and registry cross-binding.
- `src/gef/source-drift.ts` - source snapshot and baseline comparison.
- `src/gef/storage.ts` - atomic schema-validated GEF persistence and missing/corrupt distinction.
- `src/gef/telemetry.ts` - metadata-first telemetry persistence.
- `src/gef/types.ts` - W0 contracts and canonical digests.
- `src/lib/workspace.ts` - global GEF path primitives only.
- `tests/gef-w0.test.ts` - adoption, corruption, tamper, baseline drift, zero-footprint and schema proofs.

## Validation

Focused command: `npx vitest run --maxWorkers=1 tests/gef-w0.test.ts tests/workspace.test.ts tests/fingerprint.test.ts` — required W0 tests are green on the final correction content; the GEF correction suite covers 6 tests and the workspace/fingerprint regressions cover 7 tests.

- `npm run lint` / `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run validate:engineering`: PASS.
- `npm run validate:skills`: PASS.
- `npm run validate:actions`: PASS.
- Full suite: not repeated after the correction because the same pre-existing RG14 failure was reproduced on the rejected head: the clone lacks remote tag `refs/tags/v0.11.0` and the test receives an empty SHA instead of its immutable expected SHA. No correction file touches that test or release proof.

## Security, privacy and fail-closed checks

- Global GEF state remains outside the project; tests assert no project-local `.uads` directory is created.
- Profile/current/baseline/registry tampering never retains `ADOPTED` authority.
- Missing baseline returns `UNKNOWN` source state; branch, head, or policy drift returns bounded `SOURCE_CONFLICT` reasons.
- Telemetry remains metadata-first; no prompt/source bodies, credentials, tokens, raw environment values, or absolute repository paths are persisted by GEF adoption.
- No model/provider call, new dependency, arbitrary shell execution, or production fail-closed semantic change was introduced.

## Gates and terminal state

- Hosted CI, CodeQL, Dependency Review and Cross-Platform: `PENDING` until fresh exact-head receipts complete.
- Independent HEDS delta review: `PENDING`.
- Terminal state: `COMPLETE_CANDIDATE` for W0 correction, with `mergeAllowed=false`.
