# UADS V2 — Scope

Status: CANONICAL OVERLAY IN REVIEW

## NECESSARY

1. Exact V1 baseline preservation and V2 lineage.
2. Sequential Agent Orchestrator.
3. Background Worker Runtime / single-visible-session contract.
4. Host Capability Detector and Capability Negotiation.
5. Model Capability Registry evolution.
6. Automatic Model Router 2.0.
7. Effort Autopilot.
8. Token & Quota Governor 2.0.
9. Review Pipeline 2.0 using HEDS canonical delta-first evidence.
10. Smart Gate Selector.
11. Fault Resolution Engine 2.0.
12. Evidence Cache 2.0 validity/invalidation.
13. Failure Memory 2.0.
14. Retry Controller and Evidence-Driven Escalation.
15. Cursor Adapter V2.
16. Codex Adapter V2.
17. Project Resume Bootstrap.
18. UADS ↔ Hive Integration Bridge.
19. V1 vs V2 baseline/benchmark and hardening.
20. Local-first deployment profile with no mandatory VPS or SaaS control plane.
21. Protocol-neutral UADS Core with shared service contracts.
22. MCP Gateway & Interface Layer as the primary agent-facing interface.
23. CLI retained as a first-class deterministic operations/CI/recovery interface.

## IMPORTANT / EXPERIMENT REQUIRED

- Experience Engine;
- Policy Memory;
- Adaptive Routing Learner;
- Context Radius Optimizer;
- Observability & Cost Ledger enhancements;
- learned-policy canaries and rollback;
- proof-validity reuse beyond conservative deterministic cases;
- adaptive MCP tool-surface reduction beyond deterministic phase/capability rules.

These do not become automatic release blockers until separately approved.

## FUTURE

- advanced bandit-based routing;
- predictive context radius;
- predictive retry avoidance;
- continuous profile benchmarking;
- controlled learning federation with Hive;
- optional LAN/remote service deployment profile;
- optional SDK/API interfaces built on the same protocol-neutral Core.

## OUT OF SCOPE FOR UADS

These belong to Hive V2 or another canonical owner:

- organization-wide/cross-project truth authority;
- canonical project Scope/DoD/Architecture/ADR authority;
- macro product planning/task graph ownership;
- canonical checkpoint promotion across projects;
- global organizational memory;
- duplicate HEDS governance engine;
- autonomous product re-planning;
- model-weight training/fine-tuning as an implicit runtime side effect.

The following are also explicitly NOT mandatory product requirements:

- VPS deployment;
- public internet exposure;
- SaaS control plane;
- multi-tenant hosting;
- removal of the CLI in favor of MCP-only operation.

No new functionality outside NECESSARY enters automatically.
