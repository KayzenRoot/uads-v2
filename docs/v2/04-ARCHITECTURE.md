# UADS V2 — Architecture

Status: CANONICAL OVERLAY IN REVIEW

## Operating modes

UADS V2 is standalone-first.

```text
SOLO
User → UADS V2 Core → Result / Evidence

HIVE_CONNECTED
HiveTaskEnvelope → Optional Hive Bridge → UADS V2 Core → UADSQualityBundle → Hive
```

`SOLO` is a first-class mandatory mode. The UADS core MUST NOT require Hive packages, services or availability to boot, plan, execute, verify or review its owned work. `HIVE_CONNECTED` is additive through a versioned optional bridge. Loss, absence or incompatibility of Hive must degrade safely to the supported standalone boundary rather than break UADS core execution.

## Core model

```text
User / optional HiveTaskEnvelope
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
Main Session Result / optional UADSQualityBundle
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

### Optional Hive Integration Bridge
Translates versioned task/evidence contracts and capability state. It is an adapter boundary, not a core dependency. Hive cannot become necessary for normal UADS solo operation.

## Hive boundary

```text
HIVE V2
truth • durable memory • governance • macro planning • HEDS policy
       |
       | optional HiveTaskEnvelope
       v
UADS V2 BRIDGE
version/capability/identity validation
       |
       v
UADS V2 CORE
context • routing • bounded execution • gates • fault repair • evidence
       |
       | optional UADSQualityBundle
       v
HIVE V2
reconcile • promote • canonical checkpoint
```

## Non-duplication principle

Analyze once when validity permits. Exchange evidence and identity rather than recomputing the same conclusion in both systems. A capability already owned by Hive should become a bridge/contract in UADS when integration is useful, not a duplicate authority.

## Safety invariants

- standalone core remains operable with Hive absent;
- no canonical truth mutation from learned policy;
- no hidden escalation to stronger model/effort without recorded reason;
- no unbounded specialist spawn;
- no retry without changed hypothesis/evidence;
- no proof reuse without validity;
- no next increment while current one is CORRECTION REQUIRED/BLOCKED.
