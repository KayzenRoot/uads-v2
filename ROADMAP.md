# Roadmap

UADS by NexLabs. Staged implementation.

## Prompt 001 — Foundation (complete)

Repository governance, Architecture Freeze v0.2 docs, minimal CLI (`help`, `doctor`, `status`, `review`), global install, Agent Skill entrypoint, schemas, tests, CI, privacy-minimized review ZIP.

## Prompt 002 — Orchestrator Kernel (complete)

Deterministic planning kernel: intake, repository map, scope/risk/domain/specialist/gates/context/budget, Work Order + routing decision + checkpoint, `inspect`/`plan`/`status`/`resume`, evals, Cursor `uads-*` adapter.

## Prompt 003 — Bounded Execution Engine (complete)

Dispatch, change digest, evidence ledger, independent assurance, correction loop, finalize guards, execution evals X1–X9. Correction 01 hardens digest, session identity, assurance ordering, gate contracts, sticky failures, and fail-closed corrupt state. Host performs edits; kernel stays provider-neutral.

## Prompt 004 — Context Intelligence (complete)

Incremental sidecar index, JS/TS dependency graph with evidence/confidence, test and conservative interface maps, impact reports, metadata-first Context Packs, C0–C5 graph enforcement, `uads index` / `impact` / `context pack`, context evals CCI1–CCI19. Correction 01 hardens commit-to-commit freshness, dirty content identity, no-Git revalidation, unresolved reuse, truncation fail-closed, and conservative relationship classes. Correction 02 hardens lexical extraction and reverse docs/config impact.

## Prompt 005 — Fault localization and Failure Memory (complete)

Normalized failure records, deterministic signatures, ranked hypotheses, diagnostic Context Packs, compact Failure Memory with post-correction validity/loop detection, CLI `failure`/`diagnose`/`failures`, fault evals FL1–FL18. C5 remains exceptional. Diagnosis is not verified root cause. Repeated diagnosis is not a repeated failure. Failure evidence and verified memory cannot cross code-state boundaries.

## Prompt 006 — Evidence Cache, Cost Governor & Token Economics (complete)

Deterministic evidence reuse with content-aware validity, conservative gate policy, operational soft/hard token budgets, provider-neutral QPT snapshot, CLI `cache`/`cost`, and cost evals CC1–CC14. Reuse never skips a required non-reusable gate. Architecture Freeze v0.2 NECESSARY subsystem; precedes provider/model routing.

## Next increments (planned)

1. Broader specialist catalog (still not a marketplace) — FUTURE; the bounded
   Prompt 009 catalog is sufficient for current routing and the complete 30+
   catalog remains explicitly deferred.
2. Provider adapters mapping capability classes to models — FUTURE for live
   provider-specific adapters; the provider-neutral capability/profile mapping
   and host-managed compatibility needed by the current contract are already
   delivered by Prompt 008.
3. Cursor adapter depth + generic/Codex execution - **DELIVERED for the
   bounded Prompt 012 scope**, limited to the Host Execution/Receipt Boundary
   after the already delivered dispatch-bundle preparation. The bounded
   capability is implemented and merged on `main` through PR #19; host/provider
   execution remains owned by the host and is not a UADS provider gateway.
4. UGAS integration (reserved under `integrations/ugas/`)

## Prompt 012 - Scope freeze (historical planning record)

Prompt 012 froze exactly one capability for a later implementation increment:
a bounded, provider-neutral host execution and receipt boundary for an
already validated Host Dispatch Bundle. This paragraph is now historical
planning context. At freeze time, the release remained `0.11.1` and host
adapters stopped at sidecar-only preparation; Implementation 001 was later
delivered after its independent review and is recorded below.

The selection is NECESSARY for the staged adapter-depth roadmap item after
reconciling the two preceding items against the pre-freeze repository state.
Prompt 009 already delivers the bounded specialist registry, while Prompt 008
already delivers provider-neutral capability/profile mapping and explicit
host-managed compatibility; live provider adapters are not a prerequisite
because provider invocation remains host-owned and out of scope. The current
product could prepare an identity-bound handoff but could not yet execute that
handoff through an ownership-safe host boundary or record a bounded
completion/failure receipt. Those historical constraints defined the
implementation that followed and required preservation of
global-first state, zero project footprint, provider neutrality, explicit
approval ownership, and fail-closed identity checks.

UGAS integration is not a prerequisite for the staged adapter-depth work and
remains FUTURE; deep UGAS work is excluded from Prompt 012. Provider gateways,
dashboards, marketplaces, deployment automation, and other expansions remain
excluded.

The frozen Work Order is
`ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001`. Its independent review gate
was the prerequisite recorded by the historical planning decision.

## Prompt 012 - Implementation 001 (delivered)

The bounded, provider-neutral Host Execution and Receipt Boundary is
implemented and merged on `main` through PR #19. It follows a current
Host Dispatch Bundle with an ownership-safe handoff, a strict sidecar-only
Host Execution Receipt, current and immutable history, 32-entry retention,
current-authority revalidation, and fail-closed replay, stale, tamper, and
approval-intent checks. HEB01-HEB52 and the complete validation matrix pass
for the final `main` identity
`bb27398d8caa80be4a550dc1c1a96e0042fdd808`.

The common Cursor, Codex, and Generic Agent Skills contract records bounded
host outcome facts only. UADS does not invoke providers, run arbitrary host
commands, or create approval proof; the host owns IDE/agent/provider
execution, and active approval-gated intent remains fail-closed without
durable authorization proof.

## Explicitly later

Marketplace, dashboard, cloud control plane, enterprise server, production third-party Skill registry, embeddings.

See `docs/14-BACKLOG.md`.
