# ADR-UADS2-003 — Single Visible Session

Status: ACCEPTED  
Date: 2026-09-09

## Decision
UADS exposes one primary user-visible session. Specialists execute as background/headless/in-process workers only when the host proves that capability. Unsupported capability never becomes an assumed feature.

## Consequence
Adapters must implement explicit capability negotiation and safe fallback.
