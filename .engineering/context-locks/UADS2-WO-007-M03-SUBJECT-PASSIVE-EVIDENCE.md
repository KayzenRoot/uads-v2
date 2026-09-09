# Context Lock — UADS2-WO-007 / M03 S05.2

Status: LOCKED
Date: 2026-09-09
Base main SHA: `384e24ba947382d68a8215f494041cee7cf15670`
Branch: `work/uads2-wo-007-m03-subject-passive-evidence`
Issue: #30

## Canonical sources

1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/adrs/ADR-UADS2-011-GLOBAL-ARCHITECTURE-DEEP-DISCOVERY-VERTICAL-SLICES.md`
4. `docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md`
5. `docs/v2/modules/M03-HOST-CAPABILITY-DETECTOR.md`
6. `docs/v2/modules/m03/M03-S02-ARCHITECTURE.md`
7. `docs/v2/modules/m03/M03-S03-FAILURE-SECURITY-RESILIENCE.md`
8. `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md`
9. `.engineering/reports/EVIDENCE-UADS2-WO-006.md`

## Frozen implementation fingerprints

| Path | Git blob SHA |
| --- | --- |
| `src/kernel/host-capability-proof.ts` | `5043aad00d5f2de0628810f45ad4c073dd05c581` |
| `schemas/host-capability-proof.schema.json` | `efcb7237cfb0ecc7f3bc7d28c0ceda7a1a384b27` |
| `src/adapters/host-adapter-types.ts` | `3117fe83edc5bc385829bdfa70426793a60363af` |
| `src/adapters/host-adapter-detect.ts` | `43fd8de7c7f8d2bd2457ab484ecdc58977f72802` |
| `src/adapters/host-adapter-root.ts` | `a6ef6dfa38eada6df51f6d6208b47bdce080d478` |
| `src/adapters/host-adapter-registry.ts` | `8b18d0215de467f3a70bd1ec46d75787d731c9af` |
| `src/adapters/host-dispatch.ts` | `726dec144781dd8dc6ab70874f9054f2435985f1` |
| `src/kernel/model-runtime.ts` | `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62` |
| `src/lib/hash.ts` | `a2f14f12ca779de684c975c6530bf831e6b4e7e0` |
| `tests/host-adapters.test.ts` | `873b6b53916a2b4ea19acc51b54c5b74845c91c0` |
| `tests/host-capability-proof.test.ts` | `1114cfd55f80a4b952a304196b6ebc485a563248` |

## Existing facts to reuse

- `resolveHostTarget()` already provides privacy-sensitive transient path data plus privacy-safe:
  - rootIdentityDigest;
  - targetRootDigest;
  - rootKind;
  - sourceClass.
- root binding domain/version is already explicit.
- builtin adapter registry is fixed and normalized.
- generic-agent-skills fixed contract declares `subagents=false` and `parallelAgents=false`; all Cursor/Codex capabilities are currently `unknown`.
- `detectHostAdapter().status=SUPPORTED` currently means target/root present, with `VERSION_UNPROVEN`; it is not feature support.
- WO-006 PCCR already enforces proof digest, E2 floor, NPC, drift, lease, path/capability binding and conservative projection.

## Critical warning

Do not treat the legacy field name `provenCapabilities` as proof authority.

For WO-007 it is only a legacy declaration carrier inherited from the adapter definition.

The passive bridge must read the exact normalized adapter definition and build fresh PCCR evidence under ADR-UADS2-012.

## Review lock

Unexpected mutation of a frozen fingerprint before runtime implementation => STALE_CONTEXT.

Any existing runtime file edit outside the expected new files requires explicit Evidence Bundle justification.
