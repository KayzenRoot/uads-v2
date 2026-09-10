# UADS2-WO-011 — M03 S06.1 Test Plan

Status: FROZEN BEFORE IMPLEMENTATION

## Focused tests

- U011-T001 Cursor clean/present dispatch hostCapabilities all UNKNOWN.
- U011-T002 Codex clean/present dispatch hostCapabilities all UNKNOWN.
- U011-T003 Generic clean/present has only subagents=false and parallelAgents=false; zero TRUE.
- U011-T004 all three adapters dispatch sequential + role-cycling absent positive proof.
- U011-T005 bundle hostTargetRootDigest equals passive subject targetRootDigest.
- U011-T006 preparation writes compatibility runtime snapshot but no PCCR proof directory/files.
- U011-T007 root switch keeps bundle stale/fail-closed semantics.
- U011-T008 bundle privacy excludes host/UADS paths.
- U011-T009 host-dispatch source has no call to runtimeSnapshotFromHostDetection.
- U011-T010 runtime identity is deterministic for same proof-aware host facts.

## Regression

- host adapter suites;
- host capability passive/proof/probe/active suites;
- eval:adapters;
- full npm test;
- standard CI validation;
- exact-head four hosted gates.

## Benchmark

100 in-memory passive bridge derivations for dispatch context; report p50/p95.
Target p95 <= 25 ms, matching bounded passive bridge class. No production SLO claim.
