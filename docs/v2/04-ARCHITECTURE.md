# UADS V2 — Architecture

Status: CANONICAL OVERLAY IN REVIEW

## Core model

```text
User / HiveTaskEnvelope
        |
        v
UADS Coordinator
        |
        +--> Context / Risk / Impact
        |
        +--> Model + Effort Router
        |
        +--> Spawn Gate
                |
                +--> zero or one active specialist worker
        |
        +--> Selected Verification / Fault Resolution
        |
        +--> Evidence + Review Package
        |
        v
UADSQualityBundle / Main Session Result
```

Default concurrency invariant:

```text
coordinator_count = 1
max_active_specialist_workers = 1
parallel_specialist_fanout = false
```

## Main components

### Coordinator
Owns bounded task lifecycle and preserves Work Order identity.

### Sequential Agent Orchestrator
Maintains a queue. A next specialist cannot start until the active specialist reaches a terminal state.

### Background Worker Runtime
Executes a selected specialist without creating a new visible user conversation when the host proves support.

### Host Capability Layer
Detects runtime/adapter capabilities. Capability state is PROVEN, UNKNOWN/UNPROVEN, UNSUPPORTED or BLOCKED. Unknown never authorizes a feature.

### Model Router + Effort Autopilot
Selects a policy-compatible model/profile and reasoning class from proven runtime options. Routing is evidence- and budget-aware.

### Context Intelligence
Retains inherited C0-C5/progressive-context behavior. Context expands only when evidence or risk requires it.

### Evidence/Failure/Fault Layer
Evidence Cache, Failure Memory, fault localization, targeted verification and correction loops share immutable identity and invalidation rules.

### Review Pipeline
Implements HEDS-compatible delta-first review outputs. UADS executes and packages evidence; it does not duplicate Hive's canonical governance authority.

## Hive boundary

```text
HIVE V2
truth • durable memory • governance • macro planning • HEDS policy
       |
       | HiveTaskEnvelope
       v
UADS V2
context • routing • bounded execution • gates • fault repair • evidence
       |
       | UADSQualityBundle
       v
HIVE V2
reconcile • promote • canonical checkpoint
```

## Non-duplication principle

Analyze once when validity permits. Exchange evidence and identity rather than recomputing the same conclusion in both systems.

## Safety invariants

- no canonical truth mutation from learned policy;
- no hidden escalation to stronger model/effort without recorded reason;
- no unbounded specialist spawn;
- no retry without changed hypothesis/evidence;
- no proof reuse without validity;
- no next increment while current one is CORRECTION REQUIRED/BLOCKED.
