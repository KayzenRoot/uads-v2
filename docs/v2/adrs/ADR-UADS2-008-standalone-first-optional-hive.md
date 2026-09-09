# ADR-UADS2-008 — Standalone-First, Optional Hive Integration

Status: ACCEPTED
Date: 2026-09-09

## Decision
UADS V2 MUST be fully usable without Hive V2. The core architecture exposes a first-class `SOLO` operating mode. Hive integration is an optional bridge/capability producing `HIVE_CONNECTED` mode.

No core UADS module may require a Hive service/package to boot or perform its owned execution responsibilities. Hive-specific contracts remain behind a versioned integration boundary.

## Rationale
UADS is a useful execution runtime independently; coupling it to Hive would reduce portability, create a circular availability dependency and make failure isolation harder.

## Consequences
- every relevant module must document standalone behavior;
- integration tests include Hive-absent/degraded/incompatible cases;
- Hive adds canonical/durable context and governance exchange rather than replacing UADS local execution;
- disconnected operation must fail safely and remain useful.
