# UADS V2 — I-WAVE-0..4 Interface Freeze

Status: CANDIDATE
Work Order: UADS2-WO-024
Scope: implementation seams only; no runtime implementation claim

## Purpose
Freeze the minimum authoritative interfaces required for the first implementation waves so an executor can implement slices without redesigning ownership or inventing cross-module contracts.

## Global invariants
1. M03 capability truth is authoritative; consumers use the proof-aware projection boundary.
2. M30 projects operational truth and governed controls but never becomes domain truth owner.
3. M24 owns economic accounting truth; M07 owns economic enforcement.
4. M21 owns retries and UNKNOWN_OUTCOME reconciliation policy.
5. M29 owns privileged policy/tool-security decisions.
6. HEDS/AEG independence remains outside builder authority.
7. No interface interprets UNKNOWN as ALLOW, HEALTHY, ZERO COST, SUPPORTED or CURRENT.
8. Every model-bearing path is bounded by finite ESE before dispatch.
9. Every state-changing external effect has side-effect class and reconciliation identity before durable replay.
10. User Model Lock and cockpit parallelism ceilings are constraints, never hints.

## IF-001 Host Capability Projection
Owner: M03
Consumers: M05, M29, M30, scheduler/resource layer
Required semantics:
- capabilityId
- supportTruth: SUPPORTED | UNSUPPORTED | UNKNOWN | BLOCKED | STALE
- evidenceLevel
- observedAt/evaluatedAt/freshness
- source/evidence references
- runtime identity digest where applicable
Consumer rule: only current valid SUPPORTED evidence at sufficient CEL may enable a capability.

## IF-002 Model Routing Decision
Owner: M05
Inputs:
- task class/risk
- required capabilities
- IF-001 capability projection
- user Model Lock / routing mode
- provider availability/quota truth
- M07 economic allowance
Outputs:
- selected model/provider/profile OR BLOCKED/UNKNOWN
- rationale code
- considered/rejected candidates
- requested capability set
- decision evidence refs
No silent fallback or broadcast.

## IF-003 Effort Decision
Owner: M06
Inputs:
- task complexity/risk
- selected model/profile
- user fixed effort or Effort Autopilot
- budget constraints
Outputs:
- requestedEffort
- appliedEffort state: APPLIED | HOST_FIXED | MISMATCH | UNKNOWN
- rationale/evidence refs
Rule: MAX is exceptional last resort, never default.

## IF-004 Economic Safety Envelope
Owner: M07
Inputs:
- project/WO/execution/agent ancestry
- model/provider/profile
- parent remaining capacity
Outputs/enforcement:
- finite token budget
- finite monetary budget where price known
- max calls/retries/delegation/fanout/concurrency/context/wall time
- reservations/consumed counters
- breaker/kill-switch state
- parent budget identity
Rule: child reservation cannot create capacity; UNKNOWN accounting creates no new capacity.

## IF-005 Economic Accounting Projection
Truth owner: M24
Projection: M30
Fields:
- accounting class: PROVIDER_REPORTED | LOCALLY_ESTIMATED | ESTIMATED | UNKNOWN
- tokens/cost reserved, consumed, remaining
- provider/model attribution
- retries/fallback/delegation ancestry
- reconciliation state
M30 may aggregate/present but never rewrite M24 accounting truth.

## IF-006 Operational State Envelope
Owner: M30
Fields:
- sourceId/sourceOwnerModule/sourceSchemaVersion
- subjectId
- observedAt/evaluatedAt/freshnessLeaseMs
- truthClass SOURCE | DERIVED | INFERRED
- truthState CURRENT | STALE | DEGRADED | UNAVAILABLE
- continuityState CONTIGUOUS | GAP_KNOWN | GAP_UNKNOWN | REPLAYING | UNAVAILABLE
- reasonCode
- privacy-safe correlations
- lineageRefs/evidenceRefs
- bounded value
Rule: no fabricated CURRENT/LIVE.

## IF-007 Governed Command Envelope
Presentation/orchestration: M30
Authoritative execution: owner module
Fields:
- commandId/type/version
- ownerModule
- subjectId
- actor/auth context
- riskClass
- preconditions
- idempotencyKey
- requestedAt/deadline/timeout
- requestedEffect
- blastRadiusClass
- rollback/recovery capability ref
- auditCorrelationId
Lifecycle: PROPOSED, AUTHORIZING, REJECTED, ACCEPTED, RUNNING, SUCCEEDED, FAILED, CANCELLED, TIMED_OUT, UNKNOWN_OUTCOME.
UNKNOWN_OUTCOME never triggers blind retry.

## IF-008 Retry/Reconciliation Decision
Owner: M21
Inputs:
- attempt identity
- failure/timeout/cancellation state
- side-effect class
- idempotency/reconciliation identity
- remaining retry/ESE capacity
Outputs:
- RETRY_SAFE | RECONCILE_FIRST | DO_NOT_RETRY | BLOCKED | UNKNOWN
- next attempt identity if authorized
- reason/evidence
Rule: only one retry authority.

## IF-009 Side-Effect Safety Record
Owner: M28/SIR with M21 seam
Classes:
- PURE
- CACHEABLE_READ
- IDEMPOTENT_EFFECT
- NON_IDEMPOTENT_EFFECT
- IRREVERSIBLE_EFFECT
Fields:
- operation identity
- target/resource
- effect class
- idempotency mechanism/ref
- reconciliation mechanism/ref
- replay allowance
- rollback/compensation capability
No unclassified state-changing effect may enter durable automatic replay.

## IF-010 Durable Execution Checkpoint
Owner: M28/DEF
Fields:
- execution/workflow identity
- deterministic decision-state version/digest
- completed step identities
- pending step identities
- committed side-effect references
- reservations/accounting refs
- policy/capability/runtime compatibility fingerprint
- checkpoint integrity/provenance
Resume rule: compatibility mismatch -> BLOCKED/RECONCILE, never optimistic replay.

## IF-011 Tool Compatibility & Capability Grant
Owners: M29 + M03 seam
Components:
- RCE runtime/protocol compatibility
- TCIR tool catalog digest/freshness
- TCF required capabilities
- PDFab/POE policy decision and obligations
- sandbox assurance requirement/result
Final execution grant: ALLOW only when all required proofs/obligations are satisfied. Missing/expired proof -> UNKNOWN/BLOCKED.

## IF-012 Parallel Execution Policy
Owners: orchestration + M07/M30 controls
Requested modes: OFF | AUTO | ECO | BALANCED | TURBO | CUSTOM
Fields:
- scope: execution | WO | project | global default
- policy lease/expiry
- max concurrent agents
- max total agents
- max delegation depth
- token/cost ceilings
- model-routing constraint
- effort constraint
- kill/drain controls
Effective policy = strictest combination of user ceiling, ESE, capability, quota, conflict graph, policy/security and PWG decision.

## IF-013 Task Graph Node
Owner: orchestration core
Fields:
- taskId/version
- parent objective/WO
- task class/risk
- dependencies
- expected inputs/outputs
- owner/specialist requirement
- model/tool capability requirements
- file/symbol/resource claims where known
- side-effect expectations
- proof IDs
- completion evidence refs
Graph rule: cycles or UNKNOWN critical dependency block parallel dispatch until resolved.

## IF-014 Specialist Assignment
Owner: specialist router
Inputs:
- IF-013 task node
- specialist competence evidence
- model/effort/capability/economic constraints
Outputs:
- specialist identity/role
- evidence-backed qualification state
- assigned model/profile/effort policy
- tool capability envelope
- reservation refs
No self-declared competence as sole qualification.

## IF-015 Parallelism Worthiness Decision
Owner: PWG
Inputs:
- dependency DAG
- conflict/resource claims
- ESE
- provider/host pressure
- estimated wall-clock/cost/integration overhead
- operator mode/ceilings
Outputs: SEQUENTIAL | PARALLEL_BOUNDED | HYBRID | BLOCKED_UNKNOWN_DEPENDENCY
All estimates carry evidence/confidence class; UNKNOWN stays UNKNOWN.

## IF-016 Merge & Integration Result
Owner: MIR
Inputs: specialist outputs/evidence
Checks:
- overlapping edits
- API/schema/type compatibility
- dependency compatibility
- integration tests
- semantic conflicts
- side-effect reconciliation
Outputs: INTEGRATED | CORRECTION_REQUIRED | BLOCKED plus evidence refs.
AEG/HEDS occurs after integration, not as substitute for it.

## Interface freeze rule
Any implementation that needs to change ownership or weaken semantics above returns NEEDS_ARCHITECTURE rather than silently changing the contract. Additive schema/version evolution is allowed only through an explicit governed change.