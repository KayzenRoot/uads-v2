# Work Order — UADS2-ARCH-001

Status: READY_FOR_REVIEW
Risk: STANDARD

## OBJECTIVE

Adopt a local-first, protocol-neutral UADS V2 architecture with MCP as the primary agent-facing interface while retaining the CLI as a first-class deterministic operations interface.

## SCOPE

- ADR-UADS2-009;
- Architecture local-first deployment profile;
- protocol-neutral Core + Ports & Adapters;
- MCP primary agent interface;
- CLI deterministic operations interface;
- M27 MCP Gateway & Interface Layer;
- module manifest/inventory update from 26 to 27;
- scope update.

## OUT OF SCOPE

- MCP runtime implementation;
- removing or rewriting the inherited CLI;
- VPS deployment;
- Hive/UGAS repository changes;
- public/multi-tenant hosting;
- Dockerizing every UADS process.

## ACCEPTANCE CRITERIA

- local operation does not require VPS or SaaS control plane;
- MCP and CLI share the same Core/domain logic;
- preferred initial MCP transport is local stdio;
- MCP failure cannot disable Core/CLI;
- M27 is explicit and NECESSARY;
- Cursor/Codex adapters depend on shared interface contracts, not duplicated domain logic;
- security defaults forbid public listeners by default;
- docs do not claim runtime implementation.

## TEST DESIGN OBLIGATION

M27 discovery must benchmark CLI direct vs MCP stdio for latency, token/context overhead, correctness, HEDS enforcement and Windows/local-Docker behavior before implementation is frozen.

## STOP CONDITION

Do not merge if the change introduces a mandatory VPS/cloud dependency, removes CLI fallback, duplicates domain logic into adapters, or falsely claims MCP runtime implementation.
