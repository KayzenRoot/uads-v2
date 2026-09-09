# Context Lock — UADS2-WO-009 / M03 S05.4

Status: LOCKED
Base main SHA: `fbdd1927af7ea250fadac7db0725144dd4873b91`
Branch: `work/uads2-wo-009-m03-active-evidence-compiler`
Issue: #34

## Frozen source fingerprints

| Path | Blob SHA |
| --- | --- |
| `schemas/host-capability-proof.schema.json` | `efcb7237cfb0ecc7f3bc7d28c0ceda7a1a384b27` |
| `src/kernel/host-capability-proof.ts` | `5043aad00d5f2de0628810f45ad4c073dd05c581` |
| `src/kernel/host-capability-probe.ts` | `eef453f0db1758723f59946db947f7c50407c843` |
| `schemas/host-capability-probe-receipt.schema.json` | `d3c94a7d2f3ef1e4bff40646011c08015bbb382e` |
| `src/kernel/host-capability-subject.ts` | `563f2de0b53f83940b29220504dbd1573b16813c` |
| `src/adapters/host-capability-passive.ts` | `edd37b91bee623730f43bbdc6422084e6e63f7f9` |
| `tests/host-capability-proof.test.ts` | `1114cfd55f80a4b952a304196b6ebc485a563248` |
| `tests/host-capability-probe.test.ts` | `14b4aefcc4849d1329ac433dd9786767a2fcc104` |

## Canonical design

- ADR-UADS2-012 accepted.
- M03 S01-S04 frozen.
- WO-006: PCCR core, T001-T010/T018-T030/T045-T060.
- WO-007: subject/passive bridge.
- WO-008: PBF + generic executor, T031-T044.
- Remaining generic semantic closure before vendor experiments: T011-T017 and active receipt-to-proof mapping.

## No local-machine claim

All active semantic tests in WO-009 use TEST_ONLY fixed fixtures.
No statement about the user's actual Cursor/Codex capability is allowed.
