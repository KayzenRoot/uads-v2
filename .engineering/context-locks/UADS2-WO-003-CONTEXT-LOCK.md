# Context Lock — UADS2-WO-003

Status: LOCKED FOR PREFLIGHT
Date: 2026-09-09
Repository: `KayzenRoot/uads-v2`
Base main SHA: `5a6e0d31ec99d2f89136fbd764257a588d625263`

## Canonical source order

1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/03-SCOPE.md`
4. `docs/v2/09-DEFINITION-OF-DONE.md`
5. `docs/v2/04-ARCHITECTURE.md`
6. `docs/v2/02-REQUIREMENTS.md`
7. `docs/v2/13-REVIEW-PROTOCOL.md`
8. `docs/v2/adrs/ADR-UADS2-009-DASHBOARD-FIRST-REALTIME-OPERATIONS.md`
9. `docs/v2/adrs/ADR-UADS2-010-ENTERPRISE-PRODUCTION-READINESS-CONTRACT.md`
10. `docs/v2/modules/M30-PRODUCTION-OBSERVABILITY-REALTIME-OPERATIONS.md`
11. `docs/v2/planning/ENTERPRISE-PRODUCTION-READINESS-MATRIX.md`

## Runtime anchors inspected

| Path | Locked blob SHA | Reason |
| --- | --- | --- |
| `package.json` | `b81a559f53d364a752b4af03251187a24e73ddf5` | Node 20, current deps/scripts |
| `src/lib/workspace.ts` | `8bf5cec0d12e2ba6d0e65c507948fe11835f29e0` | global-first sidecar layout |
| `src/lib/atomic-write.ts` | `f91e1b439cdb95abbbce251b6834978c4c816f92` | safe atomic persistence primitives |
| `src/lib/safe-persist.ts` | `fc7107b745c61cabf2b20d211047139ef7f1b522` | secret-safe persistence |
| `src/kernel/cost-persist.ts` | `a7d0f7579fa4102e95aaec44105a761e9c0f69ea` | existing sidecar ledger pattern |
| `src/kernel/cost-types.ts` | `dfa8110266fd1da4169e69cf7d10445add1b9328` | typed schema versioning pattern |
| `src/commands/status.ts` | `ede23487ceb414c7e7caee8d37c26b0970d82f2d` | objective status aggregator |
| `src/cli.ts` | `acee617a7f5ac1aeea24a7e675ce5b3df8779e98` | CLI registration pattern |
| `schemas/README.md` | `89c7d508ef2b2ce0acfd241c45c28324e512ae3c` | schema evolution rules |
| `schemas/cost-ledger.schema.json` | `224a4f3563c4795894a5dde3aabd259373b2cf58` | closed schema pattern |
| `tests/workspace.test.ts` | `2323c0f8648c8892aca7d53cfc50303a8681dddd` | sidecar containment testing |

## Invariants

- no project-local runtime state;
- M30 extends the existing project workspace under `~/.uads/workspaces/<projectId>/`;
- no new runtime dependencies in the planned slice;
- schema readers fail conservatively;
- secrets/private host data are sanitized before persistence/output;
- SOLO must not require Hive;
- no accepted ADR is overwritten;
- M24 remains Work Order/cost ledger owner;
- M30 owns production event transport/operator surface;
- B-001 rule remains unchanged.

Any material change to these locked anchors requires context reconciliation before implementation.
