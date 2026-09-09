# Evidence Bundle — UADS2-WO-008 / M03 S05.3

Status: IMPLEMENTATION VERIFIED / FINAL EXACT-HEAD HEDS PENDING
Issue: #32
PR: #33
Base main: `f320243d28d95037f9e270e2d500606e791855c3`
Contract freeze: `a80a5e9d86230efffe9abe2e3e15d99ff2cb6262`
Implementation head: `cf53be42fe74075071edaac6c2eb90935f0a215f`

## Scope proof

Runtime/test additions are exactly:
- `schemas/host-capability-probe-descriptor.schema.json`
- `schemas/host-capability-probe-receipt.schema.json`
- `src/kernel/host-capability-probe.ts`
- `tests/host-capability-probe.test.ts`

No existing runtime file changed.
No package/lockfile/workflow change.
No Cursor/Codex/provider-specific probe.
No PCCR positive-proof compiler or host-dispatch migration.

## Runtime fingerprints

- descriptor schema: `6f5a5d7376f8353d672b153099a1931743d6d6f6`
- receipt schema: `d3c94a7d2f3ef1e4bff40646011c08015bbb382e`
- runtime: `eef453f0db1758723f59946db947f7c50407c843`
- tests: `14b4aefcc4849d1329ac433dd9786767a2fcc104`

## Safety boundary demonstrated

- production callers select a fixed registered probeId, not executable/args/env objects;
- only production descriptor is `uads.node.version.v1`;
- executable is exact `process.execPath`;
- no PATH lookup is required or trusted;
- child launch uses Node `execFile`, `shell:false`, `windowsHide:true`;
- only READ_ONLY_LOCAL + DENY network policy may spawn automatically;
- TEMPORARY_LOCAL/NETWORK_OBSERVE/MUTATING/COST_BEARING are non-executing policy blocks in this slice;
- environment is an explicit safe-name intersection and does not inherit test secret material;
- timeout uses AbortSignal;
- stdout/stderr have bounded maxBuffer;
- executable identity is hashed before and after execution; drift cannot return SUCCEEDED;
- raw stdout/stderr and executable path are not persisted;
- receipt path, digest and subject/probe/execution binding fail closed;
- single-flight key is subject + capability-or-none + probeId;
- executor does not invoke PCCR proof persistence and creates zero proof files.

## Frozen tests

M03-T031 through M03-T044: PASS.

Machine-readable map:
`.engineering/evidence/UADS2-WO-008/test-map.json`

## Hosted verification

Source CI: run `34413709632`, job `102673708260`.

- lint PASS;
- typecheck PASS;
- build PASS;
- 54/54 test files PASS;
- 508/508 tests PASS;
- all standard evals PASS;
- foundation/engineering validation PASS;
- dependency audit PASS;
- packaging smoke PASS;
- Dependency Review SUCCESS;
- CodeQL SUCCESS;
- Cross-Platform Compatibility SUCCESS on Linux/Node20 and Windows/Node20.

## Benchmarks

Machine-readable:
`.engineering/evidence/UADS2-WO-008/benchmark-evidence.json`

Primary:
- B2 50 probes: p50 4.376403 ms; p95 5.926256 ms <= 2000 ms; PASS.
- B5 100 concurrent callers: uniqueExecutionIds=1; uniqueReceiptDigests=1; spawnCount=1; inFlightAfter=0; completion 106.387404 ms; PASS.
- B3 receipt bytes=1,137 <= 65,536; PASS.
- B4 shellExecution=0, pathLookupExecution=0, blockedSpawn=0, leakedSecret=0, pccrProofCreated=0; PASS.

Validation rerun:
- B2 p95 9.152011 ms;
- B5 completion 104.629879 ms;
- B3 1,137 bytes;
- B4 all zero.

## Enterprise gates

- M27 COVERED: fixed descriptor limits, <=5s timeout, output ceilings, single-flight and B2/B5 proof.
- M28 COVERED: timeout/output/process/identity-drift states and corrupt receipt rejection.
- M29 COVERED: no shell/PATH/user descriptor/env leakage; executable identity binding.
- M30 NOT_APPLICABLE to truth in this slice: receipt is diagnostic substrate and does not determine capability truth; no new event type required.
- M31 COVERED: additive schemas/runtime only; rollback by ceasing calls.

## Known limitations

- only generic Node-current production self-test exists;
- SUCCEEDED receipt is explicitly not capability support;
- no Cursor/Codex active probe;
- no positive PCCR mapping from probe output;
- no future capability IDs;
- no host-dispatch integration;
- M03 remains not S07-frozen.

## Final gate

This evidence commit changes PR HEAD. Fresh exact-head CI / CodeQL / Dependency Review / Cross-Platform SUCCESS and zero unresolved threads are required before HEDS APPROVED.
