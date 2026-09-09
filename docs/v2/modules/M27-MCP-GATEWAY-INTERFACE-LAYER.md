# M27 — MCP Gateway & Interface Layer

Status: DISCOVERY
Class: NECESSARY

## Mission

Provide the primary agent-facing MCP interface for UADS V2 while preserving a protocol-neutral Core and the existing CLI as a deterministic operational interface.

## Required operating model

- LOCAL_FIRST is mandatory.
- Normal operation requires no VPS.
- Initial preferred MCP transport: local stdio.
- Optional local HTTP transport may be supported where required by host capability.
- Cursor and Codex adapters consume M27 contracts rather than duplicating UADS domain logic.
- MCP outage or incompatibility must not disable the UADS Core or CLI.

## Candidate technologies

UNAPPROVED until S01:
- Adaptive Tool Surface (phase/capability-aware MCP tool exposure)
- HEDS-Native MCP lifecycle guards
- progressive structured responses
- tool/result validity fingerprints
- local transport negotiation
- host-specific capability adapters
- schema/version negotiation

## S00 — Problem & Success Metrics

Measure current CLI/prompt glue, tool-discovery overhead, token usage, latency, repeated instructions, host integration friction and error rate.

## S01 — Technology Radar

Classify each candidate as REUSE / ADAPT / INVENT / EXPERIMENT / OUT_OF_SCOPE. Compare MCP stdio, local HTTP and direct CLI invocation for latency, reliability and token efficiency.

## S02 — Architecture & Boundaries

Define protocol-neutral Core service contracts, MCP server boundary, CLI adapter boundary, Cursor/Codex integration, schemas, versioning and security defaults.

## S03 — Failure & Security Model

Cover malformed tool calls, tool-surface explosion, unauthorized filesystem/network access, stale schemas, MCP host mismatch, transport failure, secret leakage and lifecycle bypass attempts.

## S04 — Test & Benchmark Design

Mandatory comparisons:
- CLI direct vs MCP stdio latency
- token/context overhead
- deterministic output equivalence
- HEDS lifecycle enforcement
- Cursor integration
- Codex integration
- MCP unavailable fallback to CLI/core
- Windows + Docker/local filesystem behavior

## S05 — Implementation Slicing

Implement smallest vertical slice first: status/doctor/context/review entrypoints through shared Core contracts, then expand only with evidence.

## S06 — Integration & Hardening

Validate Cursor, Codex, CI/CLI coexistence, local-only deployment, capability negotiation, logging, resource bounds and security.

## S07 — Module Freeze

Freeze only after objective benchmark shows MCP improves agent integration without unacceptable latency, correctness, security or maintenance regression.

## Non-goals

- replacing the CLI;
- requiring a VPS;
- moving canonical UADS logic into MCP handlers;
- exposing every internal function as an MCP tool;
- requiring Hive for normal operation.
