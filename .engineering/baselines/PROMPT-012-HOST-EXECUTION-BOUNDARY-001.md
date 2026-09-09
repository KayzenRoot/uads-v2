# Baseline — `ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001`

Status: `COMPLETE`
Repository: `KayzenRoot/uads`
Baseline Git SHA: `96f2965d0ec26e00968052999b20876c13578a51`
Baseline tree: `4fb7004d1ff923cd03f3df9f085ca248c2e49b67`
Branch: `docs/eng-prompt-012-host-execution-boundary-001`

## Baseline identity

- `origin/main` resolves to the exact baseline SHA/tree above.
- The current governing replacement branch for this planning record is
  `docs/eng-prompt-012-host-execution-boundary-001` (PR #18).
- The original scope-freeze branch `docs/prompt-012-scope-freeze` is historical
  only: it carried PR #17, which was closed without merge and superseded by
  PR #18 after independent audit comment `5555196483`.
- The worktree was clean before this planning delta.
- `VERSION`, `package.json`, and the package-lock root version are `0.11.1`.
- GitHub contains immutable `v0.11.0` and `v0.11.1`; no `v0.11.2` or
  `v0.12.0` tag/release exists.
- Prompt 011 final external audit comment `5554582899` records
  `APPROVED — PROMPT 011 CLOSED` for the exact main identity above.

## Canonical baseline facts

| Area | Observed fact | Evidence |
| --- | --- | --- |
| Kernel | Deterministic planning, execution, evidence, assurance, model routing, specialist routing, and sidecar state are complete through v0.11.1 | `src/`, `docs/`, Prompt 011 audit |
| Host boundary | Adapters detect/install/uninstall and prepare identity-bound sidecar Host Dispatch Bundles; no execution/receipt boundary exists | `docs/11-ADAPTERS.md`, `src/adapters/host-dispatch.ts`, `schemas/host-dispatch-bundle.schema.json` |
| Roadmap | Cursor adapter depth plus Generic/Codex execution is an explicit next increment | `ROADMAP.md` |
| UGAS | Only a reserved stub exists; deep integration is not required for adapter depth | `integrations/ugas/README.md`, `docs/03-SCOPE.md` |
| Requirements | F24 covers adapter preparation; provider calls, deep UGAS, dashboard, marketplace, and deployment are future/out of scope | `docs/02-REQUIREMENTS.md`, `docs/14-BACKLOG.md` |
| Architecture | Freeze v0.2 is global-first, zero-footprint, provider-neutral, and already documents a host-adapter boundary | `docs/04-ARCHITECTURE.md`, `docs/11-ADAPTERS.md` |
| Release | v0.11.1 is prerelease, non-draft, and bound to the historical exact release/tag proof; current planning must not mutate it | GitHub release/tag audit, Prompt 011 evidence |

## Baseline validation

| Gate | Result | Evidence |
| --- | --- | --- |
| `npm run validate:engineering` | PASS | `ok=true`, existing protocol identity and records valid |
| `npm run lint` | PASS | exit 0 |
| `npm run typecheck` | PASS | exit 0 |
| `npm test` | INTERRUPTED | Two concurrent local invocations were accidentally started; both were stopped after partial progress. This is an execution interruption, not a project test failure; a single clean run is required after the planning edits. |

## Selection conclusion

The only objectively necessary candidate is bounded host execution/receipt
depth because the roadmap names it and the current adapter contract stops at
preparation. UGAS, provider gateway, dashboard, marketplace, deployment, and
other candidates are not prerequisites for the staged next capability and are
excluded from Prompt 012.

No source/runtime implementation file is authorized by this baseline record.
