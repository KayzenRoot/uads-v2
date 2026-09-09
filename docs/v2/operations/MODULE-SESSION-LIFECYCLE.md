# UADS V2 — Module Session Lifecycle

Status: CANONICAL PLANNING PROCESS IN REVIEW

Every module begins in DISCOVERY and is planned through bounded sessions. Sessions may be split further when complexity requires it.

## Default sessions
- **S00 — Problem & Success Metrics:** problem, users, failure modes, measurable outcomes, standalone/Hive boundary.
- **S01 — Technology Radar:** existing techniques, new/proprietary technology candidates, novelty, cost and non-duplication with Hive V2.
- **S02 — Architecture & Boundaries:** components, contracts, state, execution flow, dependencies and modular boundaries.
- **S03 — Failure/Security Model:** abuse, concurrency, stale state, privacy, rollback/recovery and stop conditions.
- **S04 — Test & Benchmark Design:** proof obligations, regression tests, fault injection, performance/cost benchmarks and acceptance thresholds.
- **S05 — Implementation Slicing:** NECESSARY Work Orders, files/contracts, migration compatibility and delivery order.
- **S06 — Integration & Hardening:** Cursor/Codex/standalone/Hive modes, real-use journeys, resource behavior and regression breadth.
- **S07 — Module Freeze:** audit against Requirements/Scope/DoD, resolve contradictions, ratify ADRs and checkpoint the module.

## Approval flow
DISCUSS → PROPOSE → USER APPROVES → GIT UPDATE → RECONCILE → NEXT SESSION.

An unapproved idea remains `CANDIDATE`, never canonical behavior. Every approved session updates the module file plus affected Requirements/Architecture/ADRs/Backlog/Checkpoint/continuity state.

## Technology rule
Prefer technology that produces measurable advantage in quality, speed, token/cost efficiency, reliability or interoperability. “New” alone is not sufficient. Do not duplicate a Hive V2 capability; complement it through an optional contract/adapter where applicable.

## Test rule
Testing is designed with architecture, not appended after implementation. Every implementation slice must name the smallest sufficient verification plus wider risk-mandated regression. Bugs that escape or are caught materially feed permanent regression evidence.
