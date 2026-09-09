# Context Lock — UADS2-WO-008 / M03 S05.3

Status: LOCKED
Date: 2026-09-09
Base main SHA: `f320243d28d95037f9e270e2d500606e791855c3`
Branch: `work/uads2-wo-008-m03-probe-budget-fence`
Issue: #32

## Canonical sources
1. `docs/v2/11-CHECKPOINT.md`
2. `docs/v2/10-DECISIONS-LEDGER.md`
3. `docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md`
4. `docs/v2/modules/m03/M03-S03-FAILURE-SECURITY-RESILIENCE.md`
5. `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md`
6. `.engineering/reports/EVIDENCE-UADS2-WO-007.md`

## Frozen source fingerprints
| Path | Blob SHA |
| --- | --- |
| `package.json` | `8a2a0ccbebaae302aa999d5f8d40bf614898b869` |
| `src/kernel/host-capability-proof.ts` | `5043aad00d5f2de0628810f45ad4c073dd05c581` |
| `src/kernel/host-capability-subject.ts` | `563f2de0b53f83940b29220504dbd1573b16813c` |
| `src/adapters/host-capability-passive.ts` | `edd37b91bee623730f43bbdc6422084e6e63f7f9` |
| `src/lib/atomic-write.ts` | `f91e1b439cdb95abbbce251b6834978c4c816f92` |
| `src/lib/workspace.ts` | `bf047bd38eae16065d5dc2f19d3c98f05f6edb48` |
| `src/lib/hash.ts` | `a2f14f12ca779de684c975c6530bf831e6b4e7e0` |
| `src/lib/secrets.ts` | `0cf041201d7b006009337406b0b51f91cf7f85b2` |
| `src/lib/json-schema.ts` | `e439980e02bb7bbaddcc93eb413693f866bc2e02` |
| `docs/v2/modules/m03/M03-S03-FAILURE-SECURITY-RESILIENCE.md` | `92dc2358abb6a01415a485da018e6655c0191ef1` |
| `docs/v2/modules/m03/M03-S04-TEST-BENCHMARK-DESIGN.md` | `ef246c48a587072116a89ca87fa26fc2b8d7fd68` |
| `docs/v2/adrs/ADR-UADS2-012-PROOF-CARRYING-HOST-CAPABILITIES.md` | `e40e071aac212ddd93be772cd943e1bf5e76b93a` |

## Existing truth
- PCCR and passive bridge are already approved/merged.
- This executor produces probe receipts only, never PCCR truth.
- E2 proof floor remains unchanged.
- Vendor-specific probes remain unauthorized.
- No future capability IDs enter runtime here.

## Runtime safety lock
- Node built-ins only.
- No package change.
- No user/config/CLI descriptor injection.
- No PATH lookup executable rule.
- No network.
- No shell.
- Production registry self-test only.
