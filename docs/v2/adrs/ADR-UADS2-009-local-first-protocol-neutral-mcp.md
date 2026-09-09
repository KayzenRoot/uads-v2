# ADR-UADS2-009 — Local-First Protocol-Neutral Core with MCP-First Agent Interface

Status: ACCEPTED
Date: 2026-09-09

## Context

UADS V2 is an internal engineering system intended primarily for private company use. The system must work without a VPS or always-on remote service. Cursor and Codex are primary interactive hosts, while CI, diagnostics, setup and deterministic automation still benefit from a CLI.

Treating MCP and CLI as mutually exclusive would couple the product to one transport and duplicate business logic.

## Decision

UADS V2 SHALL use a protocol-neutral headless core with thin adapters.

Primary interfaces:

1. **MCP Server** — primary agent-facing interface for Cursor, Codex and other MCP-capable hosts.
2. **CLI** — retained for deterministic operations, CI, installation, diagnostics, benchmarks, repository governance and recovery.
3. **Internal Service API / SDK boundary** — stable internal contract used by adapters and future integrations.

No domain intelligence may live exclusively in the MCP or CLI adapter. Both MUST call the same UADS Core services and preserve the same Work Order, HEDS, evidence, capability and policy semantics.

## Local-first deployment

The mandatory operating profile is LOCAL_FIRST.

- No VPS is required for normal operation.
- UADS Core, MCP server, state, caches, queues, evidence and optional supporting databases may run entirely on the user's workstation.
- MCP SHOULD initially support local stdio transport for agent hosts.
- Local HTTP transport MAY be added where a host requires it, bound to loopback/private interfaces by default.
- Docker MAY host supporting services and optional isolated UADS services, but the product MUST NOT require Docker for every lightweight command if a native local process is more efficient.
- Remote/cloud services are optional capabilities, never mandatory core dependencies.

## Security defaults

- bind network services to localhost/private network by default;
- no unauthenticated public listener;
- secrets remain outside repositories;
- least-privilege host adapters;
- explicit capability detection before enabling background execution or remote integrations;
- evidence and policy state remain locally controllable and exportable.

## MCP design constraints

- expose a small, high-level tool surface rather than one tool per internal function;
- prefer structured outputs and progressive disclosure;
- tools MUST preserve HEDS state and refuse invalid lifecycle transitions;
- tool availability MAY adapt to task phase/capability to reduce tool clutter;
- MCP failure MUST NOT make the CLI or core unusable.

## Consequences

Positive:
- full local operation without VPS;
- native agent tool calling with reduced prompt glue;
- CLI remains excellent for deterministic automation;
- Cursor/Codex adapters can share one core;
- future Hive/UGAS/SDK/API integrations do not require rewriting business logic;
- deployment can evolve from one workstation to LAN/server later without architectural replacement.

Trade-offs:
- one additional adapter/runtime surface must be tested;
- protocol contracts require versioning;
- local resource pressure must be observable;
- Docker networking and Windows filesystem boundaries require explicit tests.

## Module impact

A new NECESSARY discovery module is added:

- **M27 — MCP Gateway & Interface Layer**

M15 Cursor Adapter V2 and M16 Codex Adapter V2 integrate through M27 rather than owning separate UADS business logic.

## Non-goals

- no mandatory VPS;
- no mandatory SaaS control plane;
- no public multi-tenant service requirement;
- no removal of CLI;
- no duplication of UADS Core logic in host-specific adapters.
