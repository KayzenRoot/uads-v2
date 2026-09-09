# UADS V2 — Module Program

Status: DISCOVERY INVENTORY

All 27 planned modules are explicit here and each has an individual discovery file. Presence is not approval or implementation.

## Standalone-first and local-first invariants
UADS V2 MUST remain usable without Hive V2. Core modules cannot require Hive packages/services at runtime. Hive connectivity is an optional bridge selected through capability negotiation. `SOLO` is a first-class mode; `HIVE_CONNECTED` adds context/governance exchange without changing UADS core ownership.

Normal operation is `LOCAL_FIRST`: no VPS, public server or SaaS control plane is mandatory. The protocol-neutral Core runs locally and exposes MCP as the primary agent-facing interface while retaining CLI for deterministic operations, CI, setup, diagnostics, benchmarking and recovery.

## Planning method
Each module follows S00–S07 from `docs/v2/operations/MODULE-SESSION-LIFECYCLE.md`. Every session includes test implications and ends with a repository update only after approval.

## Inventory
M01 Sequential Agent Orchestrator; M02 Background Worker Runtime; M03 Host Capability Detector; M04 Model Capability Registry; M05 Automatic Model Router 2.0; M06 Effort Autopilot; M07 Token & Quota Governor 2.0; M08 Review Pipeline 2.0; M09 Smart Gate Selector; M10 Fault Resolution Engine 2.0; M11 Experience Engine; M12 Policy Memory; M13 Adaptive Routing Learner; M14 Context Radius Optimizer; M15 Cursor Adapter V2; M16 Codex Adapter V2; M17 Project Resume Bootstrap; M18 UADS ↔ Hive Integration Bridge; M19 Evidence Cache 2.0; M20 Failure Memory 2.0; M21 Retry Controller; M22 Evidence-Driven Escalation; M23 Capability Negotiation Layer; M24 Observability & Cost Ledger; M25 Configuration & Policy Profiles; M26 Safe Learning / Rollback; M27 MCP Gateway & Interface Layer.
