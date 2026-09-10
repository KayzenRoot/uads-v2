# M30 — Digital Operations Office

Status: CANDIDATE COCKPIT EXTENSION
Work Order: UADS2-WO-022
Issue: #68

## Purpose
Provide a game-like, office-style operational visualization of UADS activity while remaining a truthful M30 projection over authoritative runtime state.

## Modes
### LIVE
Displays only CURRENT/STALE/DEGRADED/UNAVAILABLE state supported by OTCL/TCL evidence. Animation never upgrades freshness or confidence.

### REPLAY
Animates historical HEP/event/GET data from a selected execution or time window. Replay is visibly labeled and performs no paid model work by default.

### GRAPH
A non-animated topology view of the same underlying agents, tasks, Work Orders, modules, dependencies, proofs and incidents.

### TABLE
Accessible deterministic operational table for users who prefer or require a non-animated view.

## Visual semantics
- avatar = real agent/executor/critic identity or clearly-labeled historical actor;
- desk/workstation = active owned task/execution;
- room/zone = project, module, review, CI, evidence, release, operations or incident-response domain;
- walking/handoff = real ownership or state transition event;
- connection/path = typed graph dependency or handoff;
- waiting = queue/backpressure/precondition wait;
- blocked = explicit blocked state;
- retry = M21-governed retry state;
- degraded/unavailable = M30 truth state;
- review room = AEG/HEDS activities;
- operations room = health, resource, incident and breaker state;
- release area = M31-controlled release readiness/progression.

No visual behavior may imply work that did not occur.

## Agent inspection
Selecting an agent/task should expose, when available and authorized:
- Work Order/task and owner;
- current state and freshness;
- parent/child ancestry;
- selected model/profile and resolved version;
- requested/applied effort;
- Harness Contract / harness fingerprint;
- graph impact/context slice references;
- tool activity summary;
- tokens reserved/consumed and monetary cost where known;
- retry count/owner;
- AEG role/findings if critic;
- proof/evidence links;
- current blocker/next governed action;
- timestamps and truth/continuity class.

Unknown information is rendered UNKNOWN/UNAVAILABLE, never zero or healthy.

## Operational layers
The office can progressively reveal:
1. People/agents and tasks
2. Work queues and handoffs
3. Module/project graph
4. Evidence/review graph
5. Cost/token flows
6. Resource pressure and host capability
7. Incident/alert state
8. Release/CI/checkpoint state
9. Context/RAG/cache flows
10. Historical causal timeline where evidence supports it.

## Performance and safety
- rendering uses M30 projections, not direct domain polling from every visual object;
- bounded update frequency and event coalescing;
- viewport/level-of-detail limits for large agent populations;
- off-screen actors may be aggregated;
- UI failure does not affect domain execution;
- animations can be disabled without losing information;
- no LLM call required to animate, replay, filter, group or inspect normal state;
- AOBC may reduce optional visual detail before degrading P1/P0 operational truth;
- visualization cannot issue arbitrary mutations; future controls route through LOCP governed command envelopes.

## Graph + Harness integration
The Office consumes graph projections from EGC/HGE and execution episodes from HEP. It can display GIR blast radius, GCS context neighborhoods, GPG proof obligations, harness trajectory and AEG/HEDS review state.

## S05.1 compatibility requirement
The current M30 S05.1 Truth Kernel & Living Cockpit slice must preserve stable projection identifiers, event correlation, freshness/continuity state and SSE projection seams so this Office can be added without replacing the truth kernel or event spine.

## Promotion rule
The office is operational visualization, not entertainment truth. It may become visually rich, including 2D/2.5D or light 3D presentation, only when performance benchmarks prove the chosen renderer does not materially degrade M30 truth delivery or system operation.