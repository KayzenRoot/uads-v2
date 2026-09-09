# M08 — Review Pipeline 2.0

Status: DISCOVERY | Class: NECESSARY

## Mission

Implement the **HIVE Engineering Delivery System (HEDS)** as the canonical UADS V2 review/delivery runtime while keeping UADS fully usable in `SOLO` mode and interoperable with Hive in `HIVE_CONNECTED` mode.

Canonical process contract: `docs/v2/operations/UADS-HEDS.md`.

This module MUST NOT create a second incompatible review framework or reimplement Hive's canonical-governance authority.

## Core implementation targets

M08 owns or coordinates runtime support for:
- Review Manifest (RM);
- Context Capsule (CC) consumption/presentation;
- Change Impact Manifest integration;
- Risk-Adaptive Review Router (RARR) integration;
- Selected Verification orchestration;
- Evidence Bundle assembly;
- delta-first reviewer entry/navigation;
- Correction Delta Protocol (CDP);
- explicit `APPROVED` / `CORRECTION REQUIRED` / `BLOCKED` verdict handling;
- TTTM instrumentation hooks;
- Defect Learning Loop handoff;
- Trusted Merge readiness contract;
- Action/Proof fingerprint receipts.

Supporting modules provide context, token/cost, gate-selection, fault, evidence-cache, failure-memory, retry, escalation and observability capabilities.

## HEDS design technologies

Accepted design targets:
- HEDS-P01 Work Intent Graph;
- HEDS-P02 Context Signal Budget;
- HEDS-P03 Proof Decay Index;
- HEDS-P04 Review Attention Router;
- HEDS-P05 Regression Escape Radar;
- HEDS-P06 Modular Boundary Sentinel;
- HEDS-P07 Complexity Budget Gate;
- HEDS-P08 Rework Cost Ledger;
- HEDS-P09 Acceptance Evidence Compiler;
- HEDS-P10 Project Bootstrap Contract Compiler.

They are architectural targets, not claims of existing runtime implementation.

Research candidates such as CEI, ESF, CWP, RCI, AFM, VDL, Independent Review Adversary, Blast-Radius Budget and Dependency Change Firewall remain `EXPERIMENT REQUIRED` until their dedicated discovery/benchmark gates approve them.

## Standalone contract

`SOLO` mode MUST provide a complete usable review path without Hive:

`Work Order → Context/Impact → Risk → Verification → Evidence → Review → Verdict → Correction/Trusted Merge readiness`.

Hive absence MUST NOT cause review unavailability.

## Hive complement

`HIVE_CONNECTED` mode MUST exchange compatible task/evidence artifacts without duplicating canonical truth:
- consume bounded canonical context/proof obligations from `HiveTaskEnvelope`;
- emit HEDS-compatible `UADSQualityBundle` evidence;
- leave project-level canonical promotion to Hive.

## Sessions S00–S07

### S00 — Problem & success metrics
Baseline current V1/V2 review cost, fan-out, duplicate analysis, review latency, defect detection and TTTM.

### S01 — Technology radar
Reconcile every HEDS technology against existing UADS/Hive capabilities. Classify `REUSE`, `ADAPT`, `INVENT`, `EXPERIMENT`, `OUT_OF_SCOPE`.

### S02 — Architecture & boundaries
Define RM/CC/impact/evidence/verdict schemas, state machine, SOLO/HIVE contracts and module ownership.

### S03 — Failure & security model
Model false PASS, stale proof, review fan-out, self-review, cross-project replay, capability fabrication, cache poisoning and evidence tampering.

### S04 — Test & benchmark design
Freeze regression, integration, fault-injection and HEDS benchmark corpus before implementation.

### S05 — Implementation slicing
Split implementation into small Work Orders with stable interfaces and measurable acceptance.

### S06 — Integration & hardening
Validate Cursor/Codex, standalone operation, Hive bridge, compatibility, performance and resource bounds.

### S07 — Module freeze
Publish objective evidence, architecture/ADR deltas, final benchmark and module checkpoint.

## Mandatory tests

At minimum:
- same-Work-Order Correction Delta preserves valid prior evidence;
- stale proof/evidence is rejected;
- invalid/unknown proof cannot PASS;
- reviewer begins from bounded manifest/context rather than forced repo-wide scan;
- progressive disclosure expands only on evidence/risk;
- maximum active specialist worker = 1;
- no unnecessary visible worker conversation when host supports background execution;
- implementer self-review cannot satisfy independent review;
- cross-project/cross-root replay rejected;
- risk tier changes required verification depth;
- HIGH_ASSURANCE proof obligations cannot be weakened by cache/cost policy;
- SOLO works with Hive absent;
- HIVE_CONNECTED uses compatible envelopes/bundles;
- explicit verdict required;
- Correction Delta cannot hide unresolved finding;
- TTTM/rework/token metrics remain attributable to the Work Order.

## Owner-approved B-001 event contract

V2 review MUST emit privacy-safe identity-bound structured analysis events sufficient for `normalized-structured-analysis-signature-v1`.

Minimum canonical fields:
- `eventType`;
- `gate`;
- `normalizedSubjectPath`;
- `normalizedFindingCode`;
- `evidenceDigest`;
- Work Order/review identity and timestamp.

M08 owns semantic emission at review-analysis boundaries. M30 owns authoritative event transport/operational surface. M24 owns Work Order/cost attribution.

Required V2 benchmark evidence MUST produce deterministic numerator, denominator, Duplicate Analysis Rate and raw-event hashes. Missing required event evidence fails closed.

## Enterprise dependencies

M27 performance/load, M28 failure/recovery, M29 security/evidence integrity, M30 observability and M31 safe release apply to M08.

## Promotion gate

M08 cannot be frozen merely because HEDS is documented. Runtime support must be demonstrated by tests, representative review scenarios and V1/current-baseline comparison showing improved or equal defect detection with lower or justified delivery cost.
