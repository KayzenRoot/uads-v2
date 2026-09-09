# Context Lock — `ENG-PROTOCOL-ADOPTION-001`

State: `RELOCKED`
Repository: `KayzenRoot/uads`
Branch at initial lock: `main`
Branch at relock: `chore/eng-protocol-adoption-001`
Baseline Git SHA: `0936f818ba8dc938b1b2ad41ffab0450c8fb30eb`
Initial lock time: `not separately timestamped; recorded before the first Work Order edit`
Relock time: `2026-09-04T16:57:24Z` (post-edit source fingerprint collection)

This record retains the pre-adoption lock and its stale event, then records a completed relock after the expected additive edits to governance, CI, PR/issue templates, and validator integration. The final state is `RELOCKED`; no changed source was reused silently.

## Required fingerprints at baseline

Fingerprints are SHA-256 over exact repository file bytes. A missing source is recorded as `UNKNOWN`, not invented.

| Source | Relative path or deterministic sentinel | SHA-256 |
| --- | --- | --- |
| Checkpoint | `UNKNOWN:no-active-checkpoint-in-global-sidecar` | `null` |
| Decisions | `UNKNOWN:no-repository-decisions-ledger-at-baseline` | `null` |
| Scope | `docs/03-SCOPE.md` | `c40f82bc59f6d588a729927a4aa8134e1410824ad87291fdad8d66a1d42dbdb7` |
| Definition of Done | `docs/13-DEFINITION-OF-DONE.md` | `2bc0161f6525e85b7e0bb785f5ea13fd3158c51c05d4c37c98ed24a27ca5917f` |
| Architecture | `docs/04-ARCHITECTURE.md` | `575e46f741a47a2227bf13e6dab21d882cde2a494a4aa7a4ec4385eb8dc61ca0` |
| Project overview | `docs/01-PROJECT-OVERVIEW.md` | `4ccd56665245bf91a9832f38212dab730d1790d654e947d0798b7e76fc049337` |
| Quality gates | `docs/07-QUALITY-GATES.md` | `a826275476073249b4e04fff079f4f88e1dfb9824b66dad49148f5eb9a3020f1` |
| Executor rules | `.cursorrules` | `f0ebcc50fba044a0ed7b2c8984f532bf6a32ab9923cae8bcabfef8e78e626585` |
| Governance | `GOVERNANCE.md` | `50b2c08ec73358d6d30e9de601299078d3f43654eaca870993d1882fe8fc7a60` |
| CI | `.github/workflows/ci.yml` | `3fa6da46463c8ea4045c6aa0c8fead0d2d22c30b7d6479915eb19adaefcada53` |

## Repository-sidecar context

- UADS project fingerprint: `58233072c1c707fffdd6a4556e565bb39a754903262c52094efd1327b3871238`.
- UADS project ID: `58233072c1c707ff`.
- Baseline `uads status`: clean worktree, zero project footprint, no active Work Order or execution run.
- Baseline `uads index`: complete, not truncated, 453 nodes, 1208 edges, 415 unresolved references; index identity was sidecar-only.
- Existing `AGENTS.md` and `CLAUDE.md`: not found. Existing `.cursorrules` was preserved and extended.

## Stale event

- Sources: `.cursorrules`, `GOVERNANCE.md`, `CONTRIBUTING.md`, `docs/07-QUALITY-GATES.md`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/implementation.yml`, `.github/workflows/ci.yml`, `package.json`, `scripts/validate/validate-foundation.mjs`.
- Reason: additive adoption of the protocol and its artifact validator, explicitly included in the Work Order.
- Required action: re-inspect the changed sources, recompute fingerprints, rerun the gate matrix, and retain this event in the final lock record.

## Final relock fingerprints

The following critical sources were re-read after the additive edits. Unchanged canonical product sources retain the baseline fingerprint above.

| Source | Relative path | SHA-256 after relock |
| --- | --- | --- |
| Executor rules | `.cursorrules` | `7c70f6d93d061f986ea1a0079faa6bf88c0d88504123807694526d7b2a87a711` |
| Governance | `GOVERNANCE.md` | `c3f7d89d74cb7ab71daf85169919acd18d3f41cfd7c8705f528ade3d579ce325` |
| Contributions | `CONTRIBUTING.md` | `f6d68cd5260bb1442c90c91a55db5f80ca0dc19d4907281f238b48d1c8121a3a` |
| Package scripts | `package.json` | `43b74d0d955c20171cde66219fc38e52e3d025e6d97d88e26402336dc5ff52d3` |
| Foundation validator | `scripts/validate/validate-foundation.mjs` | `e45932e0386befbac2e98390a1300bd1e9cebe8805137d0e2329b75535306f79` |
| Protocol validator | `scripts/validate/validate-engineering-protocol.mjs` | `fd214dfaf2387e7e0d86062105c13b99403c5a842440a89791fdbad828fe9ce2` |
| CI workflow | `.github/workflows/ci.yml` | `0542b6eb5b3a1f3506f44f0c445da2bae6f717f7dd2b43ab5964ea8ecdfb1605` |
| Quality gates | `docs/07-QUALITY-GATES.md` | `7cbf67dc3b25c770f44fe7d74905739ec83a3824d1ba2bd1fad7ed153eae5e33` |
| PR template | `.github/pull_request_template.md` | `433fa8295cb19a07537afdbbfbd4436565141bc1435c52eaa1f390525d71b97d` |
| Defect template | `.github/ISSUE_TEMPLATE/bug.yml` | `32360768fea01dc8255e66349fa83044cc51ecc426781113df2dd9ab332380e8` |
| Implementation template | `.github/ISSUE_TEMPLATE/implementation.yml` | `f46e778a8783d546b6c0cf226e8754ab1cc5eefd306ea6739675a8b378f11e37` |
| Decisions ledger | `.engineering/DECISIONS.md` | `1e7c9ebb41043d6811959334cb3134f646b510336679c6e057fb3f2fc96c1ecc` |

## Relock evidence

- Status: `RELOCKED; LOCAL_GATE_SNAPSHOT_84bfb02`.
- Command: `Get-FileHash -Algorithm SHA256 -LiteralPath <critical-source>` plus `git diff --check` and `npm run validate:engineering`.
- Result: no unexpected critical source changed; artifact validation and full local gate passed against the validated working-tree snapshot committed as `84bfb02aba6953c704cec575e6d0e9d9f7ba0fb8`; remote CI/review remains separate evidence.
