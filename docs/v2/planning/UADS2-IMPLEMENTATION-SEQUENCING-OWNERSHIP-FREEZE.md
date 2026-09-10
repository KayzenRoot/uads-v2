# UADS V2 — Implementation Sequencing & Ownership Freeze

Status: CANDIDATE
Work Order: UADS2-WO-024
Issue: #72

## 1. Objective
Translate the frozen architecture/research program into an implementation order that reduces Codex planning overhead, prevents ownership collisions, exposes early runtime truth in the Living Cockpit, and keeps expensive/model-bearing capabilities behind economic, capability, policy and replay-safety foundations.

## 2. Ownership freeze

| Mechanism | Authoritative owner | Supporting modules | Notes |
|---|---|---|---|
| Host capability proof / PCCR / CEL / NPC / CLDS / PBF | M03 | M30, M29 | M03 truth must never be replaced by adapter declarations |
| Model selection / provider routing / Model Lock | M05 | M03, M06, M07, M24, M30 | capability proof before preference |
| Effort selection / Effort Autopilot / PEF | M06 | M05, M07, M24, M30 | requested vs applied effort must remain truthful |
| Economic Safety Envelope / hierarchy / breaker / SEB | M07 | M05, M06, M24, M30 | hard economic limits precede fan-out |
| AEG / critic orchestration / HEDS 2.1 integration | M08 + governance | M07, M22, M30, M31 | builder never grades itself |
| Retry ownership / UNKNOWN_OUTCOME reconciliation | M21 | SIR/DEF owners, M30 | one retry authority |
| Evidence-driven escalation | M22 | M08, M05, M06, M07 | bounded escalation only |
| Economic ledger/accounting truth | M24 | M07, M30 | M24 truth, M30 projection |
| Scale/load controls | M27 | scheduler, queues, M30 | owns representative scale engineering |
| Resilience/recovery | M28 | DEF/SIR/M21/M30 | recovery proof ownership |
| Operational security / supply chain | M29 | TCF/RCE/PDFab/SAS/M31 | security policy authority |
| Observability/Living Cockpit/OTCL/TCL/TPSC/PSCF/AOBC | M30 | all producing modules | projection/control plane only |
| Release engineering / provenance / promotion gates | M31 | M08, M29, M30 | exact-head release authority |
| TCF / RCE / MCP Policy Gateway / TCIR | M29 with M03 capability seam | M05, M21, M30 | no tool privilege from discovery alone |
| PDFab / POE / privilege non-amplification | M29 | M03, M07, M30 | deny-by-default mutation/control paths |
| SIR | M28 with M21 retry seam | M29, M30 | classifies side effects and replay safety |
| DEF / DCL / DDJ / RBC | M28 | M21, M07, M30 | deterministic decision state; effects externalized |
| Parallel Prompt Graph / Specialist Agent Router / PWG / MIR / ECF | orchestration core, mapped through M05/M06/M07/M21 | M22, M30 | broad fan-out disabled until prerequisites prove safe |
| Adaptive scheduler / PCG / queues/backpressure/resource awareness | M27 | M03, M07, M24, M30 | bounded concurrency from proven host/provider pressure |
| AFR / HEP / trajectory evidence | M30 evidence surface + M08 review consumption | M24, M29 | no hidden chain-of-thought storage requirement |
| Self-improvement EOL/SCP/DQS/SPG/LBF/EDS | cross-cutting governance with routing/scheduler owners | M05, M06, M07, M22, M30, M31 | optimization inside hard envelope only |

## 3. Hard prerequisite chains

### Chain A — truthful cockpit first
M03 frozen capability truth -> M30 S05.1 Truth Kernel/Living Cockpit -> later operational controls.

### Chain B — safe model routing
M03 capability proof -> M05 routing -> M06 effort -> M07 ESE/economic breaker -> M24 accounting projection -> M30 cockpit controls.

### Chain C — safe parallel specialists
M05 + M06 + M07 -> task DAG/decomposer -> specialist registry/router -> PWG -> ECF -> bounded dispatch -> MIR -> AEG/HEDS.

### Chain D — durable/replay-safe execution
M21 retry ownership -> SIR side-effect classification -> DEF checkpoints/decision journal -> UNKNOWN_OUTCOME reconciliation -> AFR/HEP evidence -> M28 recovery proof.

### Chain E — privileged tools/MCP
M03 capability evidence -> RCE/TCIR -> TCF -> PDFab/POE -> sandbox selection -> MCP Policy Gateway -> tool invocation -> AFR/M30 audit.

### Chain F — safe learning
AFR/EOL evidence -> objective quality/cost metrics -> SCP/DQS -> shadow evaluation -> SPG/LBF -> canary -> M31 promotion. Hard policy/budget/security/user locks remain outside learnable space.

## 4. Implementation waves

### I-WAVE-0 — Observability spine / M30 S05.1
Priority: P0
Parallelism: LOW; foundational.
Goal: finish the already-active Truth Kernel + Living Cockpit vertical slice.
Why first: every later system should become visible as it is implemented.
Codex necessity: YES for runtime implementation/testing; repository planning can still be finalized here first.

### I-WAVE-1 — Routing + effort + economic safety foundations
Priority: P0
Slices:
- IW1-01 M05 proof-aware model routing and Model Lock contract/runtime;
- IW1-02 M06 per-task effort + requested/applied truth;
- IW1-03 M07 ESE hierarchy, reservations, HARD_STOP and breaker;
- IW1-04 M24 accounting seam + M30 economic projection.
Parallel-safe: design can proceed in parallel; runtime integration should respect dependencies M05 -> M06 and M07 before broad paid fan-out.

### I-WAVE-2 — Tool/capability/policy security
Priority: P0/P1
Slices:
- IW2-01 RCE + TCIR compatibility records;
- IW2-02 TCF enforcement seam;
- IW2-03 PDFab + POE deny-by-default decisions;
- IW2-04 sandbox assurance selector + capability degradation truth;
- IW2-05 MCP Policy Gateway compatibility implementation.

### I-WAVE-3 — Retry, side effects, durable execution
Priority: P0/P1
Slices:
- IW3-01 M21 retry ownership enforcement;
- IW3-02 SIR effect taxonomy + registry;
- IW3-03 idempotency/reconciliation identities;
- IW3-04 DEF checkpoint/decision journal;
- IW3-05 crash/restart/replay proof harness.

### I-WAVE-4 — Parallel Specialist Execution
Priority: P1
Prerequisites: I-WAVE-1 and critical portions of I-WAVE-2/I-WAVE-3.
Slices:
- IW4-01 Prompt Planning Graph/decomposer;
- IW4-02 Specialist Agent Registry + competence baseline;
- IW4-03 Specialist Agent Router;
- IW4-04 PWG + conflict/parallelism analysis;
- IW4-05 Parallel bounded dispatcher + ESE reservations;
- IW4-06 MIR integration referee;
- IW4-07 Cockpit OFF/AUTO/ECO/BALANCED/TURBO/CUSTOM controls.
Initial default: OFF/AUTO conservative. TURBO cannot ship without economic and concurrency proof.

### I-WAVE-5 — Adaptive scheduling/performance
Priority: P1
Slices:
- resource/pressure envelope;
- bounded queues/backpressure;
- PCG adaptive concurrency;
- workload affinity;
- critical-path optimizer;
- fairness/quota controls;
- representative M27 benchmarks.

### I-WAVE-6 — AFR / trajectory / advanced AEG
Priority: P1
Goal: durable bounded agent flight records, trajectory review, policy/economic/side-effect review modes and richer Digital Operations Office projections.

### I-WAVE-7 — Governed self-improvement
Priority: P2 after stable evidence volume exists.
Start modes: OFF/OBSERVE/SHADOW only. CANARY/GOVERNED AUTO require later evidence.

### I-WAVE-8 — selective advanced assurance
Priority: P2/P3.
Includes formal state-machine models, TLA+ candidates, adversarial history verification, controlled disruption/chaos, provenance/attestation hardening, high-assurance sandbox profiles.
Use only where risk/value justifies cost.

## 5. Critical path to first useful system

M30 S05.1 -> M05 -> M06 -> M07 -> M24/M30 economic visibility -> M21/SIR minimal safety -> Parallel Specialist Execution minimal vertical slice.

This path gives the operator a truthful cockpit early, then safe cost-aware routing, then replay/retry safety, then parallel specialists.

## 6. Parallel-safe planning workstreams before Codex

The following can still be completed through GitHub without runtime code:
A. freeze module-interface contracts for I-WAVE-0..4;
B. freeze proof-ID-to-slice mapping;
C. create implementation-ready Test Plans/STOP CONDITIONS;
D. create Codex Execution Package templates and per-slice prompt contracts;
E. map likely source directories/files from current repository code;
F. establish DEFER/EXPERIMENT/POST-V2 register;
G. finalize cockpit projection fields/commands for the first waves.

## 7. DEFER / EXPERIMENT / POST-V2

### Must not block first implementation
- mandatory Temporal Server;
- mandatory OPA/Cedar engine embedding;
- Kafka/Mimir/Tempo/Grafana stack;
- gVisor as default sandbox;
- WebSocket replacing SSE;
- learned autonomous promotion;
- TLA+ for routine low-risk paths;
- probabilistic causal graph/AAE as release authority.

### Experiment later
- Temporal runtime integration;
- Cedar engine vs OPA engine benchmark;
- OTel Collector/runtime SDK;
- gVisor HIGH_ASSURANCE profile;
- native histograms;
- counterfactual strategy learning;
- agent digital twin.

## 8. Codex Readiness Gate (CRG)

A slice is CODEX_READY only when all applicable items are frozen:
1. stable slice ID and owner;
2. objective/non-goals;
3. prerequisite versions/SHAs;
4. authoritative interfaces/contracts;
5. likely affected code boundaries;
6. risk class and blast radius;
7. economic envelope for model-bearing executor work;
8. proof IDs/test matrix;
9. platform matrix Windows/Linux where applicable;
10. M30 projection requirements;
11. recovery/rollback/reconciliation requirements;
12. Evidence Bundle format;
13. exact STOP CONDITION;
14. no unresolved architecture decision required from executor.

If any mandatory field is UNKNOWN, the executor should not improvise architecture. Return BLOCKED/NEEDS_ARCHITECTURE instead.

## 9. Estimate to first unavoidable coding

After this WO freezes, approximately 2-4 focused GitHub-only planning increments remain before the first executor-heavy slice should be dispatched. Those increments should be interface freeze, proof mapping, source-boundary mapping and Codex execution packaging.

Estimated pre-code preparation completion after this document: roughly 90-93%, subject to review of current runtime code boundaries and unresolved architecture conflicts.

## 10. Enterprise pillars

M27: I-WAVE-5 owns representative scale/load; earlier waves expose bounded hooks.
M28: I-WAVE-3 owns durable recovery/replay semantics.
M29: I-WAVE-2 owns capability/policy/tool/supply-chain security.
M30: I-WAVE-0 provides early truthful observability and all later wave projections.
M31: every implementation wave ships only through exact-head gates, HEDS, provenance and rollback-ready release process.

## 11. Stop condition

This planning freeze is complete when every P0/P1 implementation mechanism has one authoritative owner, prerequisite chain, wave, interface seam, Codex Readiness requirements and defer/experiment disposition, with no cycle that forces an executor to redesign architecture before starting the first slice.