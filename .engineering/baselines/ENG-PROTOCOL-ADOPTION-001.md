# Baseline Report — `ENG-PROTOCOL-ADOPTION-001`

Status: `COMPLETE`
Captured before edits at Git SHA: `0936f818ba8dc938b1b2ad41ffab0450c8fb30eb`
Baseline branch: `main`
Repository: `KayzenRoot/uads`
Remote: `https://github.com/KayzenRoot/uads.git`
Default branch: `main`
Worktree: `clean`

## Repository identity and shape

| Area | Observed fact | Evidence |
| --- | --- | --- |
| Product | UADS, open-source NexLabs project | `package.json`, `README.md`, `GOVERNANCE.md` |
| Languages | TypeScript and JavaScript | UADS repository index, source tree |
| Runtime | Node `>=20`, TypeScript ESM/Node16 module resolution | `package.json`, `tsconfig.json` |
| Package/build | npm; `tsc -p tsconfig.json` | `package.json` scripts |
| Frameworks | No application framework declared | `package.json`, repository index |
| Production dependencies | `adm-zip`, `ajv`, `ajv-formats`, `commander`; all directly referenced | `npm ls --depth=0`, import scan |
| Tests | Vitest `4.1.11`, serial runner, 46 files / 322 tests | `vitest.config.ts`, `npm test` |
| Lint/typecheck | Both are TypeScript `tsc --noEmit` checks | `package.json`, `docs/07-QUALITY-GATES.md` |
| CI | Foundation, CodeQL, Dependency Review, Direct Review, Release, Scorecard | `.github/workflows/`, GitHub audit |
| Deployment/release | No product deployment manifest found; GitHub release workflow builds/publishes immutable prerelease artifacts; npm publishing is prohibited | `RELEASING.md`, `.github/workflows/release.yml` |
| Database/migrations | No migration directory found in this repository | `rg --files` path scan |
| Runtime state | Global sidecar exists; baseline CLI status showed no active Work Order/execution and zero project footprint | `uads status`, `docs/05-STATE-AND-CHECKPOINT.md` |
| Executor instructions | `AGENTS.md` and `CLAUDE.md` absent; `.cursorrules` is the existing instruction file | recursive filename scan |
| Decisions | No repository decisions ledger at baseline; sidecar contained no active decision for this Work Order | repository/sidecar inspection |

Tracked tree counts at baseline: 412 files; `src` 125, `tests` 49, `evals` 59, `scripts` 33, `docs` 15, `schemas` 43, `agents` 26, `skills` 10, `adapters` 4, `integrations` 2, `examples` 1.

## Canonical sources

- Overview: `docs/01-PROJECT-OVERVIEW.md`
- Requirements: `docs/02-REQUIREMENTS.md`
- Scope: `docs/03-SCOPE.md`
- Architecture Freeze v0.2: `docs/04-ARCHITECTURE.md`
- State/checkpoint: `docs/05-STATE-AND-CHECKPOINT.md`
- Context/cost: `docs/06-CONTEXT-AND-COST-INTELLIGENCE.md`
- Quality gates: `docs/07-QUALITY-GATES.md`
- Security/performance/installation/adapters/review/DoD: `docs/08` through `docs/15`
- Ownership and repository governance: `GOVERNANCE.md`, `SECURITY.md`, `.github/CODEOWNERS`
- Contribution rules: `CONTRIBUTING.md`, `.cursorrules`
- Runtime schemas: `schemas/`

The existing `memory-bank/` is ignored local context and was not treated as canonical truth because it describes an earlier Prompt 004 checkpoint. Generated `dist/`, `tmp/`, and UADS sidecar material were not treated as tracked source.

## Validation matrix before adoption

| Gate | Result | Evidence / notes |
| --- | --- | --- |
| `npm ci` | PASS | 56 packages added; 0 vulnerabilities |
| `npm run lint` | PASS | exit 0 |
| `npm run typecheck` | PASS | exit 0 |
| `npm run build` | PASS | exit 0 |
| `npm test -- --reporter=dot` | PASS | 46 files, 322 tests; 1499.76s |
| `npm run eval:orchestrator` | PASS | 9/9 |
| `npm run eval:execution` | PASS | X1–X9, 9/9 |
| `npm run eval:context` | PASS | CCI1–CCI19, 19/19 |
| `npm run eval:fault` | PASS | FL1–FL18, 18/18 |
| `npm run eval:cost` | PASS | CC1–CC27, 27/27 |
| `npm run eval:model-routing` | PASS | MR1–MR22, 22/22 |
| `npm run eval:specialist-routing` | PASS | SR1–SR26, 26/26 |
| `npm run eval:adapters` | PASS | AD1–AD40, 40/40 |
| `npm run validate:skills` | PASS | `{ ok: true, errors: [], warnings: [] }` |
| `npm run validate:actions` | PASS | 6 workflows, no issues |
| `npm run validate:direct-review` | PASS | built-in fixture, verdict PASS |
| `npm run validate:ci-receipt` | PASS | schema `0.8.0`, finalVerdict PASS |
| `npm audit --audit-level=high` | PASS | 0 vulnerabilities |
| Separate integration/E2E command | NOT_CONFIGURED | no package script or dedicated workflow command found |
| `npm run validate` wrapper | NOT_RUN_SEPARATELY | every gate it invokes was run individually; rerunning it would duplicate the 25-minute serial suite |
| `npm pack --dry-run` | NOT_RUN_IN_BASELINE | package/release smoke is covered by prior exact-SHA release evidence; rerun post-adoption |

No pre-existing failures were observed in the executed baseline gates. This baseline is therefore suitable for detecting regressions in this documentation/validation adoption. Existing tests cover current behavior, but there are no dedicated characterization tests proving that every future cleanup candidate is safe to remove; characterization tests are required before product-code cleanup.

## GitHub baseline

Read-only audit of `KayzenRoot/uads` at the baseline reported:

- default branch `main`, baseline/default SHA `0936f818ba8dc938b1b2ad41ffab0450c8fb30eb`;
- required status context `Foundation checks`, strict checks enabled;
- one approving review, stale-review dismissal, code-owner review, conversation resolution, linear history, no force pushes, and no branch deletion;
- active CI, CodeQL, Dependency Review, Direct Review, Release, Scorecard, and Dependabot workflows;
- exact successful baseline CI run `33883929350`, Direct Review `33884266278`, CodeQL `33883929378`, Scorecard `33883929332`;
- Dependency Review security run unavailable in the API audit; this is an external limitation, not a PASS or FAIL assertion;
- GitHub security/analysis fields unavailable in the authenticated API response; no security setting was inferred.

## Baseline limitations and follow-up

- Local runtime was Node `v26.4.0` / npm `11.17.0`, while the repository CI pins Node 20; CI remains the authoritative cross-platform validation.
- T58/T59 filesystem-object replay portions were skipped because this Windows filesystem is case-insensitive; the tests themselves passed.
- Test execution emitted LF-to-CRLF warnings only for temporary fixture repositories.
- No dedicated integration/E2E command, semantic unused-import/export lint, or cycle detector is configured; these gaps are in the cleanup inventory.
