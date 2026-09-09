# UADS V2 — Planning Master v0.1

Status: DRAFT FOR MODULE DISCOVERY  
Date: 2026-09-09

This planning master preserves the initial V2 ideas discussed before repository bootstrap. It is subordinate to the canonical V2 Source Pack. Inclusion here does not automatically authorize implementation.

## Known V1 defects to resolve

### BUG-UADS2-001 — Review specialist fan-out
Review can spawn too many agents simultaneously and consume quota/tokens disproportionately.

Target: one coordinator + maximum one active specialist worker, sequential queue, parallel fan-out disabled by default.

### BUG-UADS2-002 — One visible conversation per specialist
Workers can create separate chats. Target: one visible primary session; specialist execution in background/headless/in-process when host capability is proven.

### BUG-UADS2-003 — Duplicated review analysis
Review may re-read/recompute already-valid evidence. Target: validity-bound Evidence Cache and delta-only recomputation.

### BUG-UADS2-004 — Over-provisioned model/reasoning effort
Simple tasks may use unnecessarily strong reasoning. Target: automatic model and effort selection with evidence-driven escalation.

## Proposed module program

| # | Module | Classification | Purpose |
|---:|---|---|---|
| 01 | Sequential Agent Orchestrator | NECESSARY | coordinator + max one worker, queue and lifecycle |
| 02 | Background Worker Runtime | NECESSARY | silent/headless worker execution where supported |
| 03 | Host Capability Detector | NECESSARY | prove host/runtime capabilities |
| 04 | Model Capability Registry | NECESSARY | versioned model/profile capabilities |
| 05 | Automatic Model Router 2.0 | NECESSARY | choose safest efficient available profile |
| 06 | Effort Autopilot | NECESSARY | LOW/MEDIUM/HIGH/EXTRA_HIGH sizing when exposed |
| 07 | Token & Quota Governor 2.0 | NECESSARY | budgets, spawn/retry/escalation limits, QPT |
| 08 | Review Pipeline 2.0 | NECESSARY | sequential HEDS-compatible review pipeline |
| 09 | Smart Gate Selector | NECESSARY | risk/impact-aware verification selection |
| 10 | Fault Resolution Engine 2.0 | NECESSARY | evidence-driven fault localization and repair |
| 11 | Experience Engine | IMPORTANT / EXPERIMENT | learn operational strategy from outcomes |
| 12 | Policy Memory | IMPORTANT / EXPERIMENT | versioned evidence-backed learned policies |
| 13 | Adaptive Routing Learner | IMPORTANT / EXPERIMENT | tune model/effort/context routing from evidence |
| 14 | Context Radius Optimizer | IMPORTANT | adaptive C0-C5 expansion |
| 15 | Cursor Adapter V2 | NECESSARY | capability-aware Cursor integration |
| 16 | Codex Adapter V2 | NECESSARY | capability-aware Codex integration |
| 17 | Project Resume Bootstrap | NECESSARY | resume repo/project with minimal reorientation |
| 18 | UADS ↔ Hive Integration Bridge | NECESSARY | bounded task/evidence contracts |
| 19 | Evidence Cache 2.0 | NECESSARY | content-addressed validity/invalidation/receipts |
| 20 | Failure Memory 2.0 | NECESSARY | bounded failure signatures and verified fixes |
| 21 | Retry Controller | NECESSARY | prohibit blind repeated retry loops |
| 22 | Evidence-Driven Escalation | NECESSARY | model/effort escalation only with evidence |
| 23 | Capability Negotiation Layer | IMPORTANT | degrade safely across host capability differences |
| 24 | Observability & Cost Ledger | IMPORTANT | per-WO cost, worker, token, retry and review metrics |
| 25 | Configuration & Policy Profiles | IMPORTANT | global/project policy controls without unsafe override |
| 26 | Safe Learning / Rollback | IMPORTANT / EXPERIMENT | canary, kill switch, versioned rollback |

## Initial implementation sequence

0. V1 operational baseline and bug reproduction.
1. Agent concurrency fix.
2. Conversation isolation/background worker abstraction.
3. Host detection + capability registry.
4. Model Router 2.0 + Effort Autopilot.
5. Review Pipeline 2.0.
6. Cost/QPT/Quota Governor.
7. Context/Evidence/Failure upgrades.
8. Hive V2 bridge.
9. Experience Engine observation-only.
10. Policy Memory / adaptive routing experiment.
11. Hardening and V1×V2 benchmark.

## Learning boundary

Experience Engine may learn operational facts such as which model/effort/context strategy performs best for a task class. It may not decide or modify canonical product Scope, Architecture, ADRs, DoD or checkpoint truth.

## Hive non-duplication

Hive V2 owns macro/canonical memory/governance/HEDS policy. UADS V2 owns bounded execution/micro-orchestration and emits HEDS-compatible evidence. A module that duplicates an accepted Hive responsibility must be removed, narrowed or converted into an adapter/contract before implementation.
