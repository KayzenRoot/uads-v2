# UADS GEF V1 W2 - PR #88 Correction Evidence Bundle

Status: `COMPLETE_CANDIDATE` after CR-W2-01 through CR-W2-16; exact-head hosted gates (CI, CodeQL, Dependency Review, Cross-Platform) and independent HEDS remain pending on the newly published head. No merge.

Work Order: `GEF-W2`
Wave: `W2 - Deterministic Evidence / Work Plane`
Correction Pack: `CR-W2-15 through CR-W2-16`
PR: `#88`
Base SHA: `e24dd3ab03440dc222a8e3995259a68ed13d4484`
Rejected head: `52c925a0553c929132bba69bb330983aef2716a0`
Candidate head: exact final head is recorded in PR #88 after the final push; this report is committed before hosted receipts and does not receive an evidence-only follow-up commit.

## Candidate-head binding strategy

One correction commit on the existing PR #88 branch `feat/gef-v1-w2-work-plane`, created from the exact W1 merge baseline. No rebase, no squash, no merge commit. The branch advances `52c925a` -> new head with only the two bounded corrections below (CR-W2-01..14 remain frozen as previously accepted). PR #77 and PR #81 are untouched. No W3-W8 scope.

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
- `CR-W2-10 PASS` — the committed base must be an ancestor of HEAD (`git merge-base --is-ancestor`, shell-free); an existing but divergent base fails closed with `DIFF_BASE_NOT_ANCESTOR` instead of producing an arbitrary divergent-tree diff. `base==HEAD` stays valid; invalid/missing base still reports `DIFF_BASE_UNAVAILABLE`.
- `CR-W2-11 PASS` — cache validity binds a canonical `sourceDigest` over `{headSha, dirty, worktreeDigest}`, so identical dirty overlays on different heads never share validity (HEAD-A dirty X -> MISS, HEAD-B dirty X -> MISS with a different fingerprint, repeat -> HIT). Clean-head deterministic HIT behavior is preserved.
- `CR-W2-12 PASS` — Node contracts execute with `process.execPath`, matching the toolchain basis (process.version + execPath digest); PATH shadowing cannot change the executed binary or the validity basis. npm/git toolchain proofs are unchanged.
- `CR-W2-13 PASS` — numstat is parsed from `git diff --numstat -z` NUL records (rename/copy empty-path + source/destination form), so nested `src/{old => new}/file.ts` maps counts/binary metadata to the destination exactly; nested rename/copy path, previousPath, insertions/deletions/binary and cardinality are covered. The file cap (`DIFF_FACTS_MAX_FILES`, default 2000, injectable test seam) fails closed with `DIFF_FILE_LIMIT_EXCEEDED` instead of silently truncating authoritative facts.
- `CR-W2-14 PASS` — commands run under a synchronous supervisor that enforces the contract timeout and terminates the whole process tree (POSIX process group, Windows native taskkill, argv-only, no shell text). A test-only timeout-tree contract proves no surviving grandchild marker. TIMEOUT/ERROR receipts return as evidence but are never stored as positive cache entries (`isPositiveCacheOutcome`: only PASS/FAIL cache); FAIL caching stays explicit.
- `CR-W2-15 PASS` — every authoritative Git fact command fails closed on a non-zero exit status: the runner checks status itself and throws a bounded `GIT_FACTS_COMMAND_FAILED:<subcommand>` whose only payload is a validated subcommand token, so no raw stderr, host path, credential or arbitrary command text can reach evidence. `git status`, committed `--name-status -z` / `--numstat -z` and the dirty `--numstat -z` can no longer yield facts after a failed run. `merge-base --is-ancestor` keeps exit status 1 as the explicit `DIFF_BASE_NOT_ANCESTOR` semantic while operational failures stay distinguishable (`GIT_FACTS_COMMAND_FAILED:merge-base` for status > 1, `GIT_FACTS_UNAVAILABLE:<bounded label>` for spawn errors) and `DIFF_BASE_UNAVAILABLE` for invalid/missing bases is unchanged. A corrupt-index fixture provokes a real non-zero `status`/`diff` without shell tricks and proves the failed basis yields no `DiffFacts` and reaches no Machine Evidence terminal state; an injectable `gitRunner` test seam (same shape as the file-cap seam) proves the committed and dirty diff paths are status-checked.
- `CR-W2-16 PASS` — the dirty overlay digest binds rename/copy source identity: `canonicalDigest` over path-sorted `{path, status, previousPath ?? null, digest}`. A same-HEAD collision fixture (HEAD holds two byte-identical sources `a.ts` and `c.ts`; overlay 1 renames `a.ts`->`b.ts`, overlay 2 renames `c.ts`->`b.ts`) produces identical destination path, status and content digest but different `worktreeDigest`, so state 2 `MISS`es on the same cache home with a different `validityFingerprint` and HITs on rerun. `headSha`, `dirty` and `worktreeDigest` all remain bound in the cache source digest (CR-W2-11), and ordinary rename/copy parsing, previousPath evidence and cross-task rebinding are unaffected.

## Scope and changed files

Correction-only. Changed on this head (CR-W2-01..14 scope above remains frozen; only correction truth is extended):

- `.engineering/reports/EVIDENCE-UADS-GEF-V1-W2-PR88.md` - this canonical Evidence Bundle (CR-W2-15..16 truth).
- `src/gef/git-facts.ts` - status-checking `runGit`/`gitText` with bounded `GIT_FACTS_COMMAND_FAILED:<subcommand>` identity, operational-failure vs NOT_ANCESTOR separation for `merge-base`, injectable `gitRunner` seam, and `previousPath` bound into the dirty overlay digest.
- `tests/gef-w2-commands.test.ts` - same-HEAD rename-identity collision proof (overlay digest divergence, `MISS` with a different fingerprint, stable rerun `HIT`).
- `tests/gef-w2-evidence.test.ts` - corrupt-index non-zero `status`/`diff` fail-closed proof, injected-runner committed/dirty diff proofs, operational-vs-NOT_ANCESTOR distinguishability proof.

No new dependencies. Semantic LOC added: 164 (src 41, tests 123).

## Validation

- Focused W2: `npx vitest run --maxWorkers=1 tests/gef-w2-commands.test.ts tests/gef-w2-evidence.test.ts` — 51/51 green.
- W1 regression: `tests/gef-w1-upir.test.ts tests/gef-w1-context.test.ts tests/gef-w1-compile.test.ts` — 41/41 green.
- W0 regression: `tests/gef-w0.test.ts` — 7/7 green.
- Discriminating power: with the CR-W2-15/16 source change reverted, the new non-zero-status proof and the rename-identity proof both fail (no failure raised / identical overlay digest), so neither proof is vacuous.
- `npm run lint` / `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run validate:engineering`: PASS.
- `npm run validate:skills`: PASS.
- `npm run validate:actions`: PASS.
- Full suite: not repeated; only GEF-focused suites plus regressions were run, one truthful run per stage. The pre-existing RG14 `v0.11.0` tag-proof failure is unchanged release-governance debt (no remote tag reachable); no correction file touches that test or release proof.

## Security, privacy and fail-closed checks

- Unknown command IDs fail closed; test-only contracts require an explicit flag the CLI never sets.
- Git fact failures surface only bounded reason codes (`GIT_FACTS_COMMAND_FAILED:<subcommand>`, `DIFF_BASE_NOT_ANCESTOR`, `DIFF_BASE_UNAVAILABLE`, `GIT_FACTS_UNAVAILABLE:<bounded label>`); raw stderr, host paths and command text never persist.
- Tampered receipts and tampered machine evidence never retain authority (digest mismatch verified).
- Secret fixtures and secret-like env values never persist in summaries, receipts or cache basis.
- Traversal-safe cache/receipt/task/evidence identifiers; repo-relative POSIX paths only; no absolute host paths in evidence.
- No arbitrary shell (argv only), no paid/model calls, no project-local mutable GEF state (zero-footprint proofs green).

## Cache proof

- Same contract + same source/config/toolchain/env-value basis => deterministic `CACHE_HIT` with stable validity fingerprint, reissued for the current task (`taskId` rebound, `source=CACHE_HIT`, recomputed `receiptDigest`).
- Validity binds the exact `headSha` plus the dirty overlay identity: identical dirty overlays on different heads never share fingerprints.
- The dirty overlay identity includes rename/copy source (`previousPath`): identical destination bytes/status from different sources never share validity.
- A failed authoritative Git command never yields facts at all, so no cache basis can be derived from a partial or stale fact set.
- TIMEOUT/ERROR receipts are transient evidence only and are never replayed as positive HITs; PASS/FAIL cache on the exact-compatible basis.
- Changed source bytes, lock/config drift, toolchain drift, platform basis drift and allowlisted env value drift => `MISS` / `FRESH_REQUIRED`.
- Corrupt/tampered cache entries and cross-project replay => `MISS`, never `PASS`/`HIT`.
- Secret-like env values => `COMMAND_ENV_SECRET_REJECTED` before spawn and before cache access; no unsafe reuse.

## Known debt

- Historical RG14 `v0.11.0` tag proof remains separate release-governance debt (pre-existing/environmental).
- Hosted gates (CI, CodeQL, Dependency Review, Cross-Platform) are PENDING on the new exact head; run IDs stay external per W4 ownership and are not pasted into source.
- A cached `PASS` accelerates local A0-A2 only and carries no hosted A3/merge authority.

## Terminal state

`COMPLETE_CANDIDATE` for independent HEDS. Do not merge.
