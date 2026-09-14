# UADS GEF V1 W2 - PR #88 Correction Evidence Bundle

Status: `COMPLETE_CANDIDATE` after CR-W2-01 through CR-W2-09; exact-head hosted gates (CI, CodeQL, Dependency Review, Cross-Platform) and independent HEDS remain pending on the newly published head. No merge.

Work Order: `GEF-W2`
Wave: `W2 - Deterministic Evidence / Work Plane`
Correction Pack: `CR-W2-01 through CR-W2-09`
PR: `#88`
Base SHA: `e24dd3ab03440dc222a8e3995259a68ed13d4484`
Rejected head: `de1a2eeba61da8e5275beb6c8e4304ce716bfd26`
Candidate head: exact final head is recorded in PR #88 after the final push; this report is committed before hosted receipts and does not receive an evidence-only follow-up commit.

## Candidate-head binding strategy

One correction commit on the existing PR #88 branch `feat/gef-v1-w2-work-plane`, created from the exact W1 merge baseline. No rebase, no squash, no merge commit. The branch advances `de1a2ee` -> new head with only the two bounded corrections below (CR-W2-01..07 remain frozen as previously accepted). PR #77 and PR #81 are untouched. No W3-W8 scope.

## Correction findings

- `CR-W2-01 PASS` — porcelain v1 `-z` parsing follows Git semantics: rename/copy records consume the second NUL field as `previousPath` (no arrow token, no phantom source-path records). `copied` is a distinct status. File digests are SHA-256 over raw working-tree bytes, documented as such; deleted/unreadable files bind null.
- `CR-W2-02 PASS` — `verifyMachineEvidence(data, expectedProjectFingerprint?, expectedTaskId?)` validates schema first, recomputes `evidenceDigest` over the canonical creation basis with `evidenceGeneratedMs` normalized to zero, and binds task/project identity. `readEvidence()` and `runGefEvidenceReport()` fail closed on schema/digest/task/project mismatch.
- `CR-W2-03 PASS` — the contract allowlist is the only environment key source; injected non-allowlisted keys never reach the child. Cache `envClass` digests effective allowlisted non-secret values, so value drift invalidates and stable values hit. Secret-like allowlisted values throw `COMMAND_ENV_SECRET_REJECTED` before spawn and before any cache lookup; OS launch variables stay launch-only outside semantic classification.
- `CR-W2-04 PASS` — this canonical Evidence Bundle records exact base/rejected identity, binding strategy, scope, validations, security/privacy/fail-closed checks, cache behavior, hosted-gate state and known debt.
- `CR-W2-05 PASS` — committed base-to-HEAD deltas are collected via range diff plumbing; clean candidates report committed files with `dirty=false`, dirty overlays merge deterministically with separate `worktreeDigest`, and invalid bases fail closed with `DIFF_BASE_UNAVAILABLE`.
- `CR-W2-06 PASS` — every nested `commandReceipt` is verified as a real `WorkReceipt` with project/task binding; the machine-evidence schema embeds the closed receipt shape and tampered-plus-recomputed evidence is still rejected.
- `CR-W2-07 PASS` — cache validity binds the effective executable/toolchain basis (node runtime + execPath digest, npm invocation + version, git version + launch-resolution digest); PATH drift causes real `MISS`, stable basis `HIT`, probe failure refuses optimistic reuse.
- `CR-W2-08 PASS` — committed rename/copy parsing follows actual Git `--name-status -z` order (status, source, destination): `path` is the destination and `previousPath` is the source. Committed rename A->B yields one record with `dirty=false`; committed copy orientation and cardinality are covered; destination digests stay raw-byte SHA-256 of the working-tree file.
- `CR-W2-09 PASS` — cache HITs are reissued for the current task (`reissueCacheHit(stored, taskId)`, `source=CACHE_HIT`, recomputed `receiptDigest`, unchanged `validityFingerprint`). Cross-task reuse (task-A MISS then task-B HIT bound to task-B) and task-B `runWorkPlane`/Machine Evidence verification are covered; cross-project replay stays rejected.

## Scope and changed files

Correction-only. Changed on this head (CR-W2-01..07 scope above remains frozen; only correction truth is extended):

- `.engineering/reports/EVIDENCE-UADS-GEF-V1-W2-PR88.md` - this canonical Evidence Bundle (CR-W2-08/09 truth).
- `src/gef/command-cache.ts` - `commandCacheLookup` takes the current taskId for HIT reissue.
- `src/gef/command-receipt.ts` - `reissueCacheHit(stored, taskId)` rebinds HIT receipts to the current task.
- `src/gef/git-facts.ts` - committed rename/copy source/destination order (`path`=destination, `previousPath`=source).
- `src/gef/work-plane.ts` - `runWorkCommand` passes the current taskId to the cache lookup.
- `tests/gef-w2-commands.test.ts` - cross-task HIT rebinding proof (existing direct-lookup calls carry the current taskId).
- `tests/gef-w2-evidence.test.ts` - committed rename/copy proofs and task-B work-plane/evidence proof.

No new dependencies.

## Validation

- Focused W2: `npx vitest run --maxWorkers=1 tests/gef-w2-commands.test.ts tests/gef-w2-evidence.test.ts` — 38/38 green.
- W1 regression: `tests/gef-w1-upir.test.ts tests/gef-w1-context.test.ts tests/gef-w1-compile.test.ts` — 41/41 green.
- W0 regression: `tests/gef-w0.test.ts` — 7/7 green.
- `npm run lint` / `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run validate:engineering`: PASS.
- `npm run validate:skills`: PASS.
- `npm run validate:actions`: PASS.
- Full suite: not repeated; only GEF-focused suites plus regressions were run, one truthful run per stage. The pre-existing RG14 `v0.11.0` tag-proof failure is unchanged release-governance debt (no remote tag reachable); no correction file touches that test or release proof.

## Security, privacy and fail-closed checks

- Unknown command IDs fail closed; test-only contracts require an explicit flag the CLI never sets.
- Tampered receipts and tampered machine evidence never retain authority (digest mismatch verified).
- Secret fixtures and secret-like env values never persist in summaries, receipts or cache basis.
- Traversal-safe cache/receipt/task/evidence identifiers; repo-relative POSIX paths only; no absolute host paths in evidence.
- No arbitrary shell (argv only), no paid/model calls, no project-local mutable GEF state (zero-footprint proofs green).

## Cache proof

- Same contract + same source/config/toolchain/env-value basis => deterministic `CACHE_HIT` with stable validity fingerprint, reissued for the current task (`taskId` rebound, `source=CACHE_HIT`, recomputed `receiptDigest`).
- Changed source bytes, lock/config drift, toolchain drift, platform basis drift and allowlisted env value drift => `MISS` / `FRESH_REQUIRED`.
- Corrupt/tampered cache entries and cross-project replay => `MISS`, never `PASS`/`HIT`.
- Secret-like env values => `COMMAND_ENV_SECRET_REJECTED` before spawn and before cache access; no unsafe reuse.

## Known debt

- Historical RG14 `v0.11.0` tag proof remains separate release-governance debt (pre-existing/environmental).
- Hosted gates (CI, CodeQL, Dependency Review, Cross-Platform) are PENDING on the new exact head; run IDs stay external per W4 ownership and are not pasted into source.
- A cached `PASS` accelerates local A0-A2 only and carries no hosted A3/merge authority.

## Terminal state

`COMPLETE_CANDIDATE` for independent HEDS. Do not merge.
