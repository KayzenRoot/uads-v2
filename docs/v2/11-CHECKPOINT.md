# UADS V2 — Current Checkpoint

Status: UADS2-WO-007 APPROVED / MERGED; M03 S05.3 NEXT
Date: 2026-09-09

Completed Work Order: UADS2-WO-007
Completed PR: #31
Approved head: `f20a5a2b5354c69886a6c0ca39fe301f3e87103f`
Merge SHA: `a6b5e247065067d860627258fba7d123e465a78b`

## M03 S05.2 completion

Accepted:
- stable privacy-safe HostCapabilitySubject;
- exact normalized adapter contract digest;
- passive host-state digest bound into PCCR configurationDigest;
- zero passive SUPPORTED path;
- Cursor/Codex target presence remains ten UNKNOWN capabilities;
- generic adapter target present allows only `subagents=false` and `parallelAgents=false` through E2 NPC;
- missing/unproven/blocked target never creates UNSUPPORTED;
- target status/root/contract drift invalidates prior negative proof;
- restart re-evaluation deterministic;
- no child process/shell/network/vendor-specific active probe;
- WO-006 replay and cross-capability integrity protections preserved.

Exact-head proof:
- 53/53 files PASS;
- 489/489 tests PASS;
- CI / CodeQL / Dependency Review / Cross-Platform SUCCESS;
- B1 p95 2.178033 ms <= 25 ms;
- B2 p95 2.715253 ms <= 100 ms;
- B3 11,728 bytes/host <= 65,536;
- B4 all safety counters = 0.

## M03 state

M03 is not S07-frozen.

Completed runtime slices:
- S05.1 PCCR core;
- S05.2 subject identity + passive evidence bridge.

Still missing:
- bounded Probe Budget Fence runtime;
- schema-closed active-probe registry;
- generic safe READ_ONLY_LOCAL executor;
- single-flight / timeout / output/env ceilings;
- active-probe T031-T044 + B2/B5 proof;
- vendor-specific probe experiments;
- future capability vocabulary;
- S06 integration/hardening;
- S07 module freeze.

## Next NECESSARY increment

Create **UADS2-WO-008 — M03 S05.3 Probe Budget Fence Core & Generic Safe Probe Executor**.

WO-008 may implement the generic probe substrate using deterministic synthetic fixtures and Node built-ins on GitHub Actions.

It MUST NOT implement Cursor/Codex-specific probes or assert current capabilities on the user's local machine.

Expected focus:
1. schema-closed fixed probe descriptors;
2. side-effect class enforcement;
3. READ_ONLY_LOCAL automatic policy only;
4. no `shell:true`;
5. fixed/enum-bounded arguments;
6. minimal environment allowlist;
7. timeout + AbortSignal;
8. stdout/stderr byte ceilings;
9. executable identity binding;
10. single-flight per subject/capability;
11. T031-T044 and B2/B5 proof using controlled cross-platform fixtures.

This slice remains executable directly through GitHub/Actions; user-local Codex is not required yet.

## Repository follow-up

Issue #9 remains open for admin-only branch protection/security configuration.
