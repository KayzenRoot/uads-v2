# Context Lock — UADS2-WO-011 / M03 S06.1

Status: LOCKED
Base SHA: `e9e5a456e4629ded387c7f8a3ff2716a2a5e8bdb`
Issue: #40

## Frozen source fingerprints

| Path | Blob SHA |
| --- | --- |
| `src/adapters/host-dispatch.ts` | `726dec144781dd8dc6ab70874f9054f2435985f1` |
| `src/adapters/host-capability-passive.ts` | `edd37b91bee623730f43bbdc6422084e6e63f7f9` |
| `src/adapters/host-adapter-detect.ts` | `43fd8de7c7f8d2bd2457ab484ecdc58977f72802` |
| `src/adapters/host-adapter-registry.ts` | `8b18d0215de467f3a70bd1ec46d75787d731c9af` |
| `src/kernel/model-runtime.ts` | `dc31d4b62f9babfc9e1abbe59d7b29fe68be3e62` |
| `tests/host-adapters.test.ts` | `873b6b53916a2b4ea19acc51b54c5b74845c91c0` |
| `tests/host-adapters-correction-03.test.ts` | `51b230a12a769c6b53bf6e10a695d1f4d21832a7` |
| `schemas/host-dispatch-bundle.schema.json` | `7ace4d8befd69f4bee7170038a75160f256a73da` |

## Existing truth

- S05.1-S05.5 are HEDS-approved and merged.
- host-dispatch currently calls `runtimeSnapshotFromHostDetection()`.
- passive M03 projection is conservative and already HEDS-approved.
- production active evidence contracts remain empty.
- vendor-specific active probes remain unauthorized.

## Lock

This slice changes only consumer trust wiring. It does not redefine PCCR, passive mapping, host ownership or dispatch bundle schema.
