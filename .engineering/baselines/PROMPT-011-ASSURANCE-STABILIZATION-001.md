# Baseline Report — `PROMPT-011-ASSURANCE-STABILIZATION-001`

Status: `COMPLETE`
Captured before Prompt 011 edits at Git SHA: `2cd8fde252737f31a24cd5b13ed766675fd40d3f`
Repository: `KayzenRoot/uads`
Branch: `feat/prompt-011-assurance-stabilization-001`

## Baseline identity

The approved Prompt 010 release baseline is `0936f818ba8dc938b1b2ad41ffab0450c8fb30eb` and its immutable annotated tag is `v0.10.4`. The working baseline for this task is the approved governed-delivery adoption head `2cd8fde252737f31a24cd5b13ed766675fd40d3f`; the worktree was clean before Prompt 011 changes.

## Baseline contract

| Area | Observed fact | Evidence |
| --- | --- | --- |
| Runtime | Node `>=20`; CI uses Node 20 | `package.json`, `package-lock.json`, `.github/workflows/ci.yml` |
| Product surface | CLI, kernel execution, adapters, routing, sidecar persistence, release/review tooling | `src/`, `scripts/`, `docs/` |
| Provider boundary | No provider gateway or provider invocation contract in scope | `docs/03-SCOPE.md`, `docs/04-ARCHITECTURE.md` |
| Persistence boundary | Sidecar-first local state; no project-local runtime state requested | `docs/05-STATE-AND-CHECKPOINT.md`, `.cursorrules` |
| Migration surface | No database migration directory or migration runner | repository path scan |
| Tests | 46 files / 322 tests before this task | baseline `npm test` |
| Legacy evaluations | Orchestrator 9/9; Execution 9/9; Context 19/19; Fault 18/18; Cost 27/27; Model Routing 22/22; Specialist Routing 26/26; Adapters 40/40 | baseline evaluation runs |
| Release baseline | `v0.10.4` is historically bound to `0936f818...` | `src/release/semver.ts`, tag inspection |

## Baseline gates

| Gate | Result | Notes |
| --- | --- | --- |
| `npm ci` | PASS | clean dependency installation |
| `npm run lint` | PASS | exit 0 |
| `npm run typecheck` | PASS | exit 0 |
| `npm run build` | PASS | exit 0 |
| `npm test` | PASS | 46 files / 322 tests |
| Legacy evals | PASS | all baseline counts listed above |
| `npm audit --audit-level=high` | PASS | 0 vulnerabilities |
| `npm run validate:skills` | PASS | no blocking findings |
| `npm run validate:actions` | PASS | 6 workflows at baseline |
| `npm run validate:direct-review` | PASS | built-in fixture |
| `npm run validate:ci-receipt` | PASS | built-in fixture |

## Known baseline limitations

- Cross-platform Linux/Windows Node 20 evidence was not yet represented by a dedicated Prompt 011 compatibility workflow.
- Assurance and adversarial fault-injection evaluations did not yet exist.
- Direct Review and release contracts did not yet require assurance/fault-injection gates or Linux/Windows compatibility status for v0.11.0.
- Independent review, exact-SHA GitHub security evidence, and maintainer promotion are external gates and cannot be inferred from local execution.
