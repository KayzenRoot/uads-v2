# Work Order — UADS2-WO-008

Status: ACTIVE — M03 S05.3 CONTRACT FROZEN
Module: M03 — Host Capability Detector
Slice: S05.3 — Probe Budget Fence Core & Generic Safe Probe Executor
Repository: `KayzenRoot/uads-v2`
Branch: `work/uads2-wo-008-m03-probe-budget-fence`
Base SHA: `f320243d28d95037f9e270e2d500606e791855c3`
Issue: #32
Risk: HIGH
ADRs: ADR-UADS2-011 / ADR-UADS2-012 — ACCEPTED

## Objective

Implement the generic active-probe safety substrate required by M03 without implementing any vendor-specific capability probe.

The slice creates a reusable, bounded execution boundary for future probes while keeping capability truth separate from execution receipts.

## Allowed runtime/test scope

Expected new files:
- `schemas/host-capability-probe-descriptor.schema.json`
- `schemas/host-capability-probe-receipt.schema.json`
- `src/kernel/host-capability-probe.ts`
- `tests/host-capability-probe.test.ts`

Existing runtime files are read-only unless a compile/test blocker proves a minimal change NECESSARY.

Planning/evidence/checkpoint files under `.engineering/` and `docs/v2/` may change.

## Explicitly out of scope

- no Cursor probe;
- no Codex probe;
- no provider API/network probe;
- no positive PCCR compilation from probe output;
- no new six capability IDs;
- no host-dispatch migration;
- no CLI/config/user descriptor loader;
- no arbitrary executable path or PATH search;
- no shell;
- no TEMPORARY_LOCAL automatic execution;
- no NETWORK/MUTATING/COST_BEARING automatic execution;
- no npm dependency;
- no M03 S07 freeze.

## Production execution rule

The only executable resolution rule in this slice is:
`node-current` → exact `process.execPath`.

No PATH lookup is used.

Production registry includes only bounded code-registered descriptors. Runtime callers select a registered `probeId`; they cannot submit executable/args/shell/env.

## Probe descriptor

Closed/versioned descriptor must bind at minimum:
- schema/version;
- probeId;
- purpose;
- availability: PRODUCTION | TEST_ONLY;
- capabilityId nullable;
- executableRule = node-current;
- fixedArgs;
- sideEffectClass;
- networkPolicy;
- timeoutMs <= 5000;
- maxStdoutBytes/maxStderrBytes;
- envAllowlist;
- parserId;
- supportedPlatforms;
- descriptorDigest.

Descriptor digest is deterministic and excludes descriptorDigest.

## Automatic safety policy

Only `READ_ONLY_LOCAL + networkPolicy=DENY` may spawn automatically.

The following return BLOCKED without child execution:
- TEMPORARY_LOCAL;
- NETWORK_OBSERVE;
- MUTATING;
- COST_BEARING;
- unsupported platform;
- TEST_ONLY outside NODE_ENV=test.

## Environment

Child receives only an explicit safe allowlist from the descriptor intersected with a hardcoded safe-name allowlist.

No API keys/tokens/cookies or arbitrary inherited variables.

The executable is absolute `process.execPath`; PATH is not required.

## Executable identity

Before spawn, compute a privacy-safe executable identity digest from:
- fixed identity domain;
- digest of realpath, never the raw path durably;
- stat size;
- mtimeMs;
- mode;
- platform/architecture.

Recompute after execution.

If pre/post identity differs:
- receipt status = IDENTITY_DRIFT;
- no capability proof is produced;
- receipt may be persisted for diagnostics.

## Execution

Use Node built-in `execFile`:
- `shell:false`;
- absolute process.execPath;
- fixed descriptor args only;
- AbortSignal timeout;
- common effective maxBuffer no greater than either stream ceiling;
- windowsHide=true;
- minimal env.

Status model:
- SUCCEEDED
- FAILED
- TIMED_OUT
- OUTPUT_LIMIT
- BLOCKED
- IDENTITY_DRIFT

No raw stdout/stderr persists.

## Receipt

Closed/versioned, privacy-safe receipt includes:
- executionId;
- probe/descriptor/subject/capability identity;
- status;
- executable identity digests;
- timestamps;
- exit code/signal;
- stdout/stderr digests and byte counts;
- parserId;
- bounded parsedSummary nullable;
- reasonCodes;
- receiptDigest.

Persist under:
`<UADS_HOME>/registry/runtime/capabilities/probe-runs/<subjectDigest>/<probeId>/<executionId>.json`

Read must enforce subject/probe/execution path binding and receipt digest.

## Single-flight

Concurrent calls with identical:
`subjectDigest | capabilityId-or-none | probeId`
share one in-flight Promise.

The in-flight entry is removed after settlement.

B5 requires 100 concurrent callers to observe exactly one executionId.

## Production builtin descriptor

Add one safe production self-test:
`uads.node.version.v1`
- node-current;
- args `--version`;
- READ_ONLY_LOCAL;
- DENY network;
- node-version parser;
- capabilityId null.

This validates executor mechanics only. It never creates capability truth.

## Test-only fixtures

Fixed code-registered TEST_ONLY descriptors may exercise:
- stdout overflow;
- stderr overflow;
- timeout;
- secret environment exclusion;
- single-flight;
- blocked side-effect classes.

No runtime descriptor injection API.

## Required frozen S04 tests

Implement and map:
- M03-T031 arbitrary command descriptor rejected.
- M03-T032 shell field/behavior rejected.
- M03-T033 unbounded/free-form arguments rejected.
- M03-T034 inherited secret environment absent.
- M03-T035 stdout ceiling enforced.
- M03-T036 stderr ceiling enforced.
- M03-T037 timeout aborts.
- M03-T038 mutating auto-run BLOCKED.
- M03-T039 network auto-run BLOCKED.
- M03-T040 cost-bearing auto-run BLOCKED.
- M03-T041 PATH-search/shadow cannot select executable.
- M03-T042 pre/post executable identity drift => IDENTITY_DRIFT.
- M03-T043 100 same-key callers single-flight.
- M03-T044 executor never commits PCCR proof; corrupt/partial receipt is rejected.

Also preserve WO-006/WO-007 regressions.

## Benchmark

### WO008-B2 generic local probe set
- production node-version self-test, bounded sample;
- p95 <= 2 seconds;
- no individual timeout budget > 5 seconds.

### WO008-B5 probe storm
100 same-key callers:
- unique executionIds = 1;
- no stale in-flight entry after completion;
- bounded completion time.

### Storage
Receipt <= 64 KiB.

### Safety
- shell executions = 0;
- PATH-resolved executable executions = 0;
- blocked side-effect descriptors spawned = 0;
- leaked test secret = 0;
- PCCR proof files created by executor = 0.

## Enterprise gates

M27: bounded descriptor sizes/output/time and single-flight.
M28: timeout/output/error receipts + corrupt receipt fail closed.
M29: no shell/PATH/user descriptor/env leakage; executable identity binding.
M30: this slice may emit no new event type; telemetry integration can remain future because execution receipt is not capability truth.
M31: additive files only; rollback by ceasing to call generic executor.

## Stop condition

STOP with CORRECTION REQUIRED/BLOCKED if:
- arbitrary runtime descriptor/executable/args can reach execFile;
- shell or PATH search is possible;
- inherited secret env reaches child;
- side-effect class outside READ_ONLY_LOCAL can spawn;
- identity drift can return SUCCEEDED;
- output/timeout limits are bypassed;
- single-flight fails;
- generic self-test creates positive capability truth;
- HIGH/CRITICAL defect remains.
