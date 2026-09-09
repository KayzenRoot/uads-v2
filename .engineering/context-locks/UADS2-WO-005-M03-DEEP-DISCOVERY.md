# Context Lock — UADS2-WO-005 / M03 S00-S04

Status: LOCKED
Date: 2026-09-09
Base main SHA: `122426d0c7079722ed7ca118f13385b7b67183ee`
Branch: `work/uads2-wo-005-m03-deep-discovery`
Issue: #26

## Canonical sources

1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/03-SCOPE.md`
4. `docs/v2/09-DEFINITION-OF-DONE.md`
5. `docs/v2/04-ARCHITECTURE.md`
6. `docs/v2/02-REQUIREMENTS.md`
7. `docs/v2/adrs/ADR-UADS2-011-GLOBAL-ARCHITECTURE-DEEP-DISCOVERY-VERTICAL-SLICES.md`
8. `docs/v2/planning/GLOBAL-MODULE-DEPENDENCIES.json`
9. `docs/v2/modules/M03-HOST-CAPABILITY-DETECTOR.md`

## Frozen source fingerprints

| Path | Git blob SHA |
| --- | --- |
| `docs/v2/modules/M03-HOST-CAPABILITY-DETECTOR.md` | `ca78a6c35fa8f8083337a08f4e632bc9edef9579` |
| `schemas/runtime-capability-snapshot.schema.json` | `1bc304136e52e7a872c93aef132d76b4027b8475` |
| `src/kernel/model-runtime.ts` | `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62` |
| `src/adapters/host-adapter-detect.ts` | `43fd8de7c7f8d2bd2457ab484ecdc58977f72802` |
| `src/adapters/host-adapter-registry.ts` | `8b18d0215de467f3a70bd1ec46d75787d731c9af` |
| `src/adapters/host-adapter-types.ts` | `3117fe83edc5bc385829bdfa70426793a60363af` |

## External technology references, discovery only

Fresh research consulted on 2026-09-09:
- Model Context Protocol 2026 capability discovery/version/identity pattern;
- Cursor current subagent/background-agent capability documentation;
- Node.js `child_process.execFile` timeout + AbortSignal contract.

These sources inform S01 patterns only. They do not assert current local host support.

## Non-negotiable prior decisions

- ADR-UADS2-002: max one active specialist by default.
- ADR-UADS2-004: capability-aware model/effort routing.
- ADR-UADS2-008: standalone-first; Hive optional.
- ADR-UADS2-009: objective event-backed real-time operations.
- ADR-UADS2-010: M27-M31 enterprise production-readiness gates.
- ADR-UADS2-011: Global Architecture → Deep Module Discovery → Vertical Implementation → Integration Freeze.

## Consumer boundaries

M03 owns host capability fact/proof.
M04 owns model/profile capability truth.
M06 owns reasoning-effort selection.
M23 owns peer capability negotiation.
M15/M16 own host-specific adapter integration.
M30 owns operational event transport/presentation.
