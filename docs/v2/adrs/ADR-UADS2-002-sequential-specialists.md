# ADR-UADS2-002 — Sequential Specialists

Status: ACCEPTED  
Date: 2026-09-09

## Decision
The default UADS V2 execution model is one coordinator plus at most one active specialist worker. Specialist work is queued and sequential. Parallel specialist fan-out is disabled by default.

## Rationale
The V1 review path can amplify quota/tokens by spawning multiple agents. Predictable bounded concurrency is a correctness and cost-control requirement.

## Consequence
Concurrency invariant requires automated regression tests and runtime telemetry.
