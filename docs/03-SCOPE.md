# 03 — Scope

## In scope (Prompt 006)

- Evidence Cache with deterministic validity basis, conservative gate reuse policy, and explainable decisions
- Cache population from authoritative PASS only; derived cache-reuse evidence on the current digest
- Cost Governor allow/warn/block/reuse decisions and operational soft/hard token budgets
- Provider-neutral QPT snapshot with a documented heuristic formula
- CLI: `cache status`, `cache explain`, `cost status`, `cost explain`
- Cost evals CC1–CC14

## In scope (Prompt 008)

- Provider-neutral Model Profile registry and Runtime Capability Snapshot schemas
- Deterministic quality-floor routing, capability intersection, context/budget checks, fallback, and monotonic failure escalation
- Evidence-bearing Model Execution Plans bound to Work Order, change, registry, runtime, policy, and Context Pack layer identities
- CLI: `models list|status|explain|route|register` and `capabilities status|explain`
- Global/sidecar persistence with zero project footprint, conservative runtime fallbacks, and no provider API invocation
- Model routing evals MR1–MR22 and adversarial registry/runtime tests

## In scope (Prompt 005)

- Normalized failure records, deterministic signatures, and secret-safe persist
- Fault ranking from stack, failing tests, related diffs, Test Map, dependency graph, and Interface Map
- Diagnostic Context Packs (metadata-first, radius-bound; C5 remains exceptional)
- Compact per-project Failure Memory with validity/invalidation and loop detection
- CLI: `failure record`, `diagnose`, `failures`, `failure show`
- Fault evals FL1–FL18

## In scope (Prompt 004, preserved)

- Incremental sidecar index, JS/TS graph, test/interface maps, impact reports, Context Packs
- CLI: `index`, `impact`, `context pack`, one-level `context expand`

## In scope (Prompt 003)

- Bounded execution lifecycle: dispatch, implement, verify, independent review, finalize
- Change digest binding, evidence ledger, assurance records, correction loop
- CLI: `dispatch`, `verify`, `evidence record`, `assurance start/record`, `finalize`, `context expand`
- Core agent definitions for currently selectable host-invokable specialists
- Execution evals X1–X7; existing orchestrator evals remain green

## In scope (Prompt 002, preserved)

- Deterministic orchestrator kernel: intake, inspect, scope, risk, domain, specialist, gates, context, token budget
- Sidecar Work Orders, routing decisions, checkpoints, repository-map cache
- CLI: `inspect`, `plan --request` (fallback), `plan --intake`, `status`, `resume`
- Cursor user-level `uads-*` adapter (isolated HOME in tests)

## Out of scope (Prompt 005)

- Provider/model diagnosis, embeddings, vector DB
- Rich failure analytics dashboards
- 30+ specialist catalog, marketplace, deep UGAS integration
- AST-for-all languages, network calls from the kernel

## Out of scope (Prompt 003)

- Semantic dependency/impact graph and embeddings
- Provider API clients, live provider catalogs, volatile pricing, and model invocation proxy/gateway
- Complete 30+ department specialist catalog
- Marketplace, dashboard, cloud control plane, enterprise server
- Deep UGAS integration
- Autonomous production deployment, wallet custody, on-chain execution
- Project-local UADS operational state

## Scope classification (runtime)

Every Work Order is classified before expansion:

- `trivial` — isolated wording or presentation
- `local` — one module
- `cross-cutting` — several modules, tests required
- `architectural` — public contracts, core architecture, storage/auth architecture

Only **NECESSARY** work enters the current Work Order. IMPORTANT/FUTURE items are recommendations. OUT_OF_SCOPE stays excluded. Execution classifies changed paths as in-scope, supporting, out-of-scope, or sensitive.
# Specialist scope boundary (Prompt 009)

The built-in catalog contains 11 core roles and 14 domain profiles. Security, performance, and reliability assurance remain distinct from implementation and support. UGAS and game-assets are explicitly outside this catalog and do not receive automatic integration or project footprint.

Selection uses a bounded minimum-sufficient greedy algorithm. It covers only domains, affected areas, risk signals, gates, dependencies, and evidence obligations present in the Work Order. Missing required coverage blocks dispatch rather than causing an unrelated specialist expansion.

## Prompt 012 scope freeze (planning only; implementation not started)

The sole NECESSARY next capability is a bounded, provider-neutral host
execution and receipt boundary for an already validated sidecar Host Dispatch
Bundle. The future implementation may deepen the existing Cursor, Codex, and
Generic Agent Skills adapter contract only enough to accept an explicit,
identity-bound handoff and persist a bounded execution receipt. It must not
turn the kernel into a provider gateway or autonomous approval authority.

The two earlier roadmap candidates were reconciled before this selection. The
bounded Prompt 009 registry (11 core roles and 14 domain profiles) satisfies
the current catalog contract; broader 30+ expansion is FUTURE. Prompt 008's
provider-neutral profile/capability mapping and `host-managed` compatibility
mode satisfy the current mapping boundary; live provider adapters remain
FUTURE and are not required before host execution because provider invocation
belongs to the host. These statements are reconciliations of pre-freeze
behavior, not completion claims for the Prompt 012 implementation.

This planning decision does not add runtime behavior, a new project footprint,
credentials, provider calls, or release artifacts. The future Work Order must
retain global-first state, zero project footprint, current Work Order/routing/
specialist/model/host-root identity checks, explicit approval ownership, and
fail-closed behavior for stale, replayed, tampered, cross-project, or
ambiguous receipts.

UGAS integration, provider API clients or invocation gateways, dashboards,
marketplaces, deployment automation, deep specialist expansion, and other
unselected capabilities remain IMPORTANT, FUTURE, or OUT_OF_SCOPE according
to the decision matrix and are not part of Prompt 012.
