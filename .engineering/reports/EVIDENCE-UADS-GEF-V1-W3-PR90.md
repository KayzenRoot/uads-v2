# UADS GEF V1 W3 - Incremental Assurance Evidence Bundle

Status: `COMPLETE_CANDIDATE` for independent HEDS; exact-head hosted gates (CI, CodeQL, Dependency Review, Cross-Platform) are owned by W4 and stay external. No merge.

Work Order: `GEF-W3`
Wave: `W3 - Incremental Assurance`
Issue: `#89`
PR: `#90`
Base SHA: `7d0931c799a707cffa90ae3ab51bfc39de847a10` (W2 merge baseline, `origin/main`)
Candidate head: the exact final head is recorded in PR #90 after the final push; this report is committed before hosted receipts and does not receive an evidence-only follow-up commit.
Task class: `T2/T3` during source reconciliation, `T1/T2` during implementation.
Context radius: `C2`.

## Candidate-head binding strategy

One W3 implementation commit on a dedicated branch `feat/gef-v1-w3-incremental-assurance`, created from the W2 merge baseline. No rebase, no squash, no merge commit. PR #77 and PR #81 are untouched. No W4-W8 scope. Zero new dependencies.

## Component findings

- `W3-01 PASS` - the impact graph is built from repository bytes only: file nodes for source/test/eval/config/lockfile/schema files with raw-byte digests, `IMPORTS` edges resolved from the real import specifiers (including TypeScript's emitted `.js` form resolving back to `.ts`), `VALIDATED_BY` edges from schema references in source, `IMPLEMENTS` edges for exported symbols that actually cross a module boundary, and `COMMAND_CONTRACT`/`PROOF` nodes derived from the frozen W2 registry. `CONFIGURES`/`INVALIDATES_WITH`/`REQUIRES`/`GENERATED_FROM` carry the config, retention-order and producer relations. Node ids and edge lists are sorted, the graph digest is canonical, and two builds of identical bytes produce identical digests (proven). Unknown relations are explicit: unresolved relative imports and unmodelled schema references are recorded with bounded names, and a truncated snapshot is flagged rather than presented as complete.
- `W3-02 PASS` - the impact engine maps W2 change facts plus a graph snapshot to proof selections with reasons (`DIRECT_SOURCE_CHANGE`, `DIRECT_TEST_CHANGE`, `INTERFACE_DEPENDENCY`, `SCHEMA_DEPENDENCY`, `CONFIG_DEPENDENCY`, `LOCKFILE_CHANGE`, `PREVIOUS_PATH_DEPENDENCY`, `GRAPH_EXPANSION`). A direct source change selects its direct test and not an unrelated one; a shared module change fans out to every dependent test; a schema change reaches the tests that depend on its consumers; a config/lock change widens to every governed contract; renames keep the `previousPath` dependents. Graph states other than `CURRENT` broaden to every registered proof and set `IMPACT_EXPANSION_REQUIRED`. Planning never executes anything: the engine returns selections only.
- `W3-03 PASS` - the proof validity fingerprint binds project, proof type/version, producer id and contract digest, exact source and config digests, toolchain basis, platform class, semantic env class, graph version and dependency proof digests. Every component is proven sensitive: varying any one of the twelve changes the fingerprint. Time never participates.
- `W3-04 PASS` - proof records are closed-schema, digest-verified and content-addressed; `proofId` is reproducible from its own binding, so a recomputed digest around a forged identity is still refused. The dependency graph is explicit, and a cycle is detected by Tarjan SCC and collapsed into a conservative invalidation set rather than resolved optimistically.
- `W3-05 PASS` - the global proof store writes content-addressed records and a bounded index under `~/.uads/gef/proofs` and `~/.uads/gef/proof-index`. Reads schema-validate and digest-verify before any authority: relative imports, cross-project claims and tampered records surface as explicit MISS reasons. Pruning refuses to remove a proof an authoritative index still references and reports it as `retainedReferenced`.
- `W3-06 PASS` - invalidation is transitive and bounded: a directly invalidated proof propagates `UPSTREAM_PROOF_INVALID` to its dependents, a missing dependency fails closed as `DEPENDENCY_MISSING`, and the reason for a drifted basis is selected from bounded class digests (`SOURCE_DIGEST_CHANGED`, `CONFIG_CHANGED`, `TOOLCHAIN_CHANGED`, `PLATFORM_CHANGED`, `ENV_CLASS_CHANGED`, `GRAPH_STALE`) with `BASIS_MISMATCH` as the honest fallback.
- `W3-07 PASS` - the planner emits deterministic `REUSE`/`EXECUTE` decisions with an explicit reason for each, records what was invalidated and why, and never narrows: uncertainty or any invalidation raises `minimumAssurance` to `A2`, and `A3`/`A4` are named as external in `limitations`. The plan digest excludes planning duration, so identical candidate + graph + proof store state reproduce an identical digest.
- `W3-08 PASS` - the proof delta reports `NEW`/`REUSED`/`INVALIDATED`/`NOT_APPLICABLE` per proof with bounded reason codes, a summary count set and observed metrics (impacted nodes, selected/reused/invalidated/executed proofs, planning and execution durations). Durations are excluded from the delta digest, so identical results verify regardless of runtime.
- `W3-09 PASS` - execution runs only through registered W2 command contract IDs; a selection naming an unregistered contract is dropped with `PLANNED_PROOF_WITHOUT_REGISTERED_CONTRACT` instead of being executed or silently ignored. Proofs are built from verified W2 `WorkReceipt`s with project/task/producer binding, and a command-cache hit is recorded as `REUSED` with reason `COMMAND_CACHE_HIT` rather than claimed as a fresh execution.
- `W3-10 PASS` - `gef impact build|explain`, `gef proof list|show|verify|prune` and `gef assurance plan|run|delta` expose structured JSON with `--json`, keep every artifact in the global sidecar, and fail closed on missing, corrupt or foreign-bearing artifacts instead of inventing state.

## Scope and changed files

- `schemas/gef-impact-graph.schema.json`, `schemas/gef-impact-result.schema.json`, `schemas/gef-proof-record.schema.json`, `schemas/gef-proof-delta.schema.json`, `schemas/gef-assurance-plan.schema.json` - five new closed schemas; no existing schema was modified and no duplicate receipt/proof authority was created.
- `src/gef/impact-graph.ts`, `src/gef/test-impact.ts`, `src/gef/proof-record.ts`, `src/gef/proof-store.ts`, `src/gef/proof-dependency.ts`, `src/gef/assurance-planner.ts`, `src/gef/proof-delta.ts` - the W3 components.
- `src/commands/gef-assurance.ts` - the operator surface.
- `src/cli.ts` - command wiring only.
- `src/gef/command-contract.ts` - `proofTypeForContract` classification plus four focused test contracts (`gef.work.test.w3.impact|proof|assurance|surface`). Source check: the frozen registry exposed exactly one test contract pinned to a single file, so no registered equivalent existed for focused per-file selection and reuse. No existing contract was modified; the registry still exposes eight non-test contracts with unique ids.
- `tests/gef-w3-impact.test.ts`, `tests/gef-w3-proof.test.ts`, `tests/gef-w3-assurance.test.ts`, `tests/gef-w3-surface.test.ts` - the W3 test matrix.
- `.engineering/reports/EVIDENCE-UADS-GEF-V1-W3-PR90.md` - this bundle.

No new dependencies. Added semantic LOC: 3207 (well inside the wave budget, which is a scope budget rather than a hard gate for a wave of this size).

## Validation

- Focused W3: `npx vitest run --maxWorkers=1 tests/gef-w3-impact.test.ts tests/gef-w3-proof.test.ts tests/gef-w3-assurance.test.ts tests/gef-w3-surface.test.ts` - 40/40 green (13 impact, 12 proof, 9 assurance, 6 surface).
- W2 regression: `tests/gef-w2-commands.test.ts tests/gef-w2-evidence.test.ts` - 51/51 green.
- W1 regression: `tests/gef-w1-upir.test.ts tests/gef-w1-context.test.ts tests/gef-w1-compile.test.ts` - 41/41 green.
- W0 regression: `tests/gef-w0.test.ts` - 7/7 green.
- Combined regression run: 6 files, 99/99 green.
- `npm run lint` / `npm run typecheck`: PASS. `npm run build`: PASS.
- `npm run validate:engineering` / `validate:skills` / `validate:actions`: PASS.
- Real-repository smoke (exact local head, temp `UADS_HOME`): `gef impact build` on the W3 candidate reported `graphState CURRENT` against the refreshed snapshot, selected typecheck/build for the direct source change, the W2 suite as an interface dependency and the W3 suites as schema dependents, skipped the untouched git-facts contract, and raised `IMPACTED_TEST_WITHOUT_REGISTERED_CONTRACT` - which is the honest expansion signal described under known debt. `gef assurance plan` produced seven `EXECUTE` decisions at `minimumAssurance A2` with an empty invalidated set and the explicit reuse policy. `gef proof list` reported an empty store. No project file was touched.
- Full suite: the exact-head CI Foundation check runs `npm test`; W3 does not claim a separate full-suite run of its own.

## Security, privacy and fail-closed checks

- No source bodies, test output, absolute host paths or raw environment values enter graph nodes, proof records or deltas: identities are repo-relative POSIX paths and digests, and the env contribution is the W2 semantic env class.
- No arbitrary shell: proof execution goes through the frozen W2 supervisor with `shell: false` and argv-only contracts.
- No paid/model calls anywhere in W3 tests or proof selection.
- Graph and proof state live only in the global sidecar; the zero-footprint proofs assert the repository stays byte-clean across impact build, plan and run.
- Tampered records, corrupt indexes, foreign-project claims and unavailable dependencies all fail closed to an explicit reason; none of them can produce `REUSE`, `PASS` or a positive delta.

## Proof reuse, invalidation and cache behaviour

- Reuse requires an exact-compatible basis: a prior `PASS` proof is reused only when the recomputed validity fingerprint matches, and the plan carries that exact proof digest and fingerprint as the justification.
- Reuse is attribution, never mutation: the stored record keeps its `source: EXECUTED` and digest, while the reused view is a new `REUSED` attribution record.
- `FAIL` reuse is disabled by policy in this wave; `TIMEOUT`/`ERROR` are transient and can never become positive assurance; a command-cache hit is reported as `REUSED`, not as a fresh execution.
- Transitive invalidation and cycle collapse are proven, as is the negative case: an unrelated source change leaves an independent proof reusable with the same digest.
- Cold store (empty proof store) still produces the complete required plan with `EXECUTE` decisions.

## Known debt

- Registered-contract coverage is partial: the repository's existing test files are mostly not registered as contracts, so an impacted test outside the registered set raises `IMPACTED_TEST_WITHOUT_REGISTERED_CONTRACT` and expands assurance. This is fail-closed and deliberate, but it is also why the real-repository smoke ends at `A2` with expansion rather than a tight focused set. Closing it means registering more focused contracts (a W2-side change) rather than loosening the impact rule.
- `SYMBOL_OR_MODULE` nodes record exported symbols that actually cross a module boundary, used for explanation. Change detection itself remains file-digest based: W3 does not perform symbol-level diffing, so symbols enrich `impact explain` but do not narrow selection.
- Proof execution is proven end-to-end in tests with the registered git contract; npm-backed contracts share the same verified W2 `runWorkCommand` path and are not re-executed inside the W3 suite to keep it bounded. The exact-head CI run executes the npm-backed suites.
- A3 hosted gates and A4 independent HEDS remain external authority: a reused local proof accelerates A0-A2 only and carries no hosted or merge authority.
- Historical RG14 `v0.11.0` tag proof remains separate release-governance debt (pre-existing/environmental).

## Terminal state

`COMPLETE_CANDIDATE` for independent HEDS. Do not merge.
