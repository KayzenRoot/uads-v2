# UADS2-WO-024 Context Lock

Status: LOCKED
Risk: HIGH planning
Base main SHA: b21cce7150c991dba347e28bb8e3752be9e2e941
Issue: #72

## Mission
Freeze implementation ownership and sequencing for the UADS V2 architecture already discovered/frozen, while keeping this Work Order GitHub-only and making later executor work implementation-focused rather than architecture-discovery-heavy.

## In scope
- ownership matrix for new UADS mechanisms;
- interface/seam map;
- implementation dependency graph;
- critical path and parallel-safe workstreams;
- implementation wave ordering;
- Codex-readiness criteria;
- explicit defer/experiment/post-V2 buckets;
- M27-M31 mapping;
- estimate of remaining GitHub-only preparation.

## Out of scope
- runtime code changes;
- local benchmarks or host-execution evidence;
- installing dependencies;
- implementing M30 S05.1 on this branch;
- Hive V2 deep memory/RAG/context ownership;
- UGAS V2 media/generation/marketing ownership.

## Governing invariants
1. GitHub-first. Codex is last resort for runtime/local evidence work.
2. No candidate becomes runtime dependency through this planning WO.
3. M03 remains capability-truth authority for host support.
4. M07 economic hard limits precede broad model-bearing parallelism.
5. M21 owns retry semantics; durable execution must not multiply retries.
6. M30 remains operational projection/control plane, never second domain truth owner.
7. M31 exact-head gates + HEDS remain mandatory.
8. User Model Lock/effort/parallelism controls remain authoritative constraints.
9. New research mechanisms must have one authoritative owning module or explicit cross-cutting governance owner.

## Stop condition
The first implementation slice can be handed to an executor with prerequisites, owner, interfaces, proof IDs, risk, expected evidence and stop condition already frozen. No redesign is required to start coding.