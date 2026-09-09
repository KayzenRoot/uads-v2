# Evidence Bundle — UADS2-WO-007 / M03 S05.2

Status: HEDS APPROVED / MERGED
Issue: #30
PR: #31
Base main: `384e24ba947382d68a8215f494041cee7cf15670`
Planning freeze: `8164aa0551257a1ef826884d67149c312e38edf1`
Executor-prompt head: `7a9cbb098e58b761e1e15acd0bc10e1e3b140dc8`
Implementation head: `3683c3d125d32558409f2362ef722b414114fb14`

## Scope proof

Runtime/test additions are exactly:
- `src/kernel/host-capability-subject.ts`
- `src/adapters/host-capability-passive.ts`
- `tests/host-capability-passive.test.ts`

No existing runtime source was edited.
No package/lockfile/workflow/schema-legacy/event-enum change.
No child process, shell, network or vendor-specific active probe.

Other PR files are planning/governance/executor/checkpoint/evidence artifacts only.

## Runtime file fingerprints

- `src/kernel/host-capability-subject.ts`: blob `563f2de0b53f83940b29220504dbd1573b16813c`
- `src/adapters/host-capability-passive.ts`: blob `edd37b91bee623730f43bbdc6422084e6e63f7f9`
- `tests/host-capability-passive.test.ts`: blob `37857d6ce417d130734ebf079eece3851ca3577b`

## Accepted behavior demonstrated

### Host subject identity
- privacy-safe subject excludes timestamps and raw paths;
- same semantic host/root/contract facts yield stable subjectDigest;
- target-root or adapter changes alter subject identity;
- adapter contract digest includes normalized exact fixed capability declaration.

### Passive evidence semantics
- host/root presence creates zero positive TRUE capabilities;
- Cursor present -> ten UNKNOWN;
- Codex present -> ten UNKNOWN;
- generic adapter present -> only `subagents` and `parallelAgents` become E2 NPC UNSUPPORTED;
- generic adapter absent -> all UNKNOWN, including those fixed false declarations;
- blocked target -> all UNKNOWN projection;
- there is no passive SUPPORTED proof path.

### Drift / replay
- target presence/status drift changes passive configuration digest;
- prior generic negative proof evaluates STALE after target disappears;
- root switch stales prior proof;
- WO-006 cross-capability replay protection remains active;
- restart can re-read global PCCR and re-evaluate against exact current basis.

### Privacy/security
- subject/bridge durable surface contains no absolute host path;
- exact adapter contract normalization rejects mutated fixed definitions;
- no `node:child_process`, shell, HTTP/network or Hive dependency is introduced;
- telemetry failure is independent of proof truth.

## Test evidence

Source: CI run `34411074895`, job `102665372314`.

- lint PASS;
- typecheck PASS;
- build PASS;
- 53/53 test files PASS;
- 489/489 tests PASS;
- orchestrator/execution/context/fault/cost/model/specialist/adapter/assurance/fault-injection evals PASS;
- engineering/foundation validation PASS;
- dependency audit PASS;
- packaging smoke PASS.

Machine-readable mapping:
`.engineering/evidence/UADS2-WO-007/test-map.json`

## Benchmark evidence

Machine-readable:
`.engineering/evidence/UADS2-WO-007/benchmark-evidence.json`

Primary CI sample:
- U007-B1 subject + ten-proof compile: p50 1.347386 ms; p95 2.639622 ms; target <= 25 ms; PASS.
- U007-B2 compile + persist + project: p50 2.222090 ms; p95 3.453904 ms; target <= 100 ms; PASS.
- U007-B3 ten proof storage: 11,728 bytes/host; target <= 65,536; PASS.
- U007-B4 inferredPositiveTrue=0, absenceUnsupported=0, replayAccepted=0, driftMisses=0; PASS.

Validation rerun:
- B1 p95 2.583335 ms;
- B2 p95 3.440235 ms;
- B3 11,728 bytes;
- B4 all counters 0.

## Hosted gates on implementation head

- CI: SUCCESS.
- Dependency Review: SUCCESS.
- CodeQL: SUCCESS.
- Cross-Platform Compatibility: SUCCESS on Linux/Node 20 and Windows/Node 20.
- PR #31 mergeable: true.
- unresolved review threads at evidence freeze: 0.

Because this Evidence Bundle commit changes the PR head, all mandatory gates MUST rerun on the new final head before HEDS approval.

## Enterprise readiness

- M27 COVERED: work is bounded to ten passive capabilities; B1/B2/B3 pass.
- M28 COVERED: absent/blocked/drift/restart paths fail closed deterministically.
- M29 COVERED: no path/secret persistence, exact contract/root binding, replay tests, no process/network execution.
- M30 COVERED: best-effort existing `evidence.lifecycle`; telemetry does not determine truth.
- M31 COVERED: additive bridge; no legacy schema expansion; rollback can stop using bridge while preserving WO-006 PCCR core.

## Known limitations

- no runtime version discovery beyond current passive detection;
- no positive host capability proof exists yet;
- no Cursor/Codex active probe;
- no six future capability IDs;
- host-dispatch is not migrated to the new passive bridge in this slice;
- M03 is not S07-frozen.

## HEDS gate

Do not merge until a fresh exact-head audit confirms:
- unchanged runtime implementation semantics;
- CI / CodeQL / Dependency Review / Cross-Platform SUCCESS;
- unresolved threads = 0;
- no HIGH/CRITICAL defect.


## Final exact-head HEDS evidence

Exact reviewed head: `f20a5a2b5354c69886a6c0ca39fe301f3e87103f`
Merge SHA: `a6b5e247065067d860627258fba7d123e465a78b`
Exact-head CI run: `34411724139`
Exact-head CI job: `102667437567`

Final exact-head proof:
- 53/53 test files PASS;
- 489/489 tests PASS;
- CI SUCCESS;
- CodeQL SUCCESS;
- Dependency Review SUCCESS;
- Cross-Platform Compatibility SUCCESS;
- unresolved review threads = 0;
- PR mergeable at audit = true.

Exact-head benchmark sample:
- B1 p50 = 1.095714 ms; p95 = 2.178033 ms; PASS;
- B2 p50 = 1.835861 ms; p95 = 2.715253 ms; PASS;
- B3 = 11,728 bytes/host; PASS;
- B4 all four safety counters = 0; PASS.

Validation rerun:
- B1 p95 = 2.184672 ms;
- B2 p95 = 2.808117 ms;
- B3 = 11,728 bytes;
- B4 all counters = 0.

Runtime blobs on final HEDS head are identical to the implementation-tested snapshot.
