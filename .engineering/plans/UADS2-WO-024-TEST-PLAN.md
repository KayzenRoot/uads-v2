# UADS2-WO-024 Test Plan

Status: CANDIDATE
Scope: planning/governance only

## Verification gates
- ISF-T001: every new P0/P1 mechanism has one authoritative owner or explicit cross-cutting governance owner.
- ISF-T002: no ownership conflict permits two modules to mutate the same authoritative state independently.
- ISF-T003: M03 remains host-capability truth authority.
- ISF-T004: M07 hard economic limits precede broad model-bearing fan-out.
- ISF-T005: M21 remains retry authority; SIR/DEF do not create independent retry multiplication.
- ISF-T006: M30 remains projection/control plane, not second domain truth owner.
- ISF-T007: M31 exact-head/HEDS release authority is preserved.
- ISF-T008: user Model Lock, effort and parallelism controls remain hard constraints.
- ISF-T009: implementation waves have no prerequisite cycle.
- ISF-T010: first critical path exposes truthful cockpit before broad autonomous fan-out.
- ISF-T011: Parallel Specialist Execution cannot become production-enabled before M05/M06/M07 and required retry/side-effect safety.
- ISF-T012: privileged MCP/tool paths require capability + policy/security prerequisites.
- ISF-T013: self-improvement remains P2 and cannot block initial useful implementation.
- ISF-T014: heavyweight external runtimes remain experiment/defer unless separately proven.
- ISF-T015: Hive deep memory/RAG and UGAS media/marketing ownership remain outside UADS.
- ISF-T016: every CODEX_READY slice requires stable owner/objective/interfaces/proof IDs/risk/evidence/STOP CONDITION.
- ISF-T017: unresolved architecture yields BLOCKED/NEEDS_ARCHITECTURE rather than executor improvisation.
- ISF-T018: M27-M31 coverage is explicit.
- ISF-T019: GitHub-first rule is explicit and Codex is reserved for runtime/local evidence needs.
- ISF-T020: estimate to first unavoidable coding is stated as an estimate, not a guarantee.

## Exit criteria
All ISF-T001..T020 pass by document inspection on the exact PR head; standard repository gates are green; HEDS approves the planning freeze. No runtime code is changed.