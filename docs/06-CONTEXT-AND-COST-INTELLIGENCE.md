# 06 — Context and cost intelligence

Token cost is an architectural concern, not a prompt-tuning afterthought.

## Context routing

The kernel selects the smallest sufficient radius (C0–C5). Severity is monotonic: CRITICAL or architectural → C4; HIGH or cross-cutting → C3; local → C2; trivial → C1. C5 is exceptional, not default.

## Incremental index

`uads index` builds or incrementally refreshes repository intelligence in the sidecar. Reuse requires matching Git HEAD **and** a content-aware dirty digest (porcelain plus file bytes), not porcelain text alone. Clean checkouts that move HEAD still merge `git diff --name-status` between the persisted and current commits; unreachable previous HEAD fails closed into a full rebuild. No-Git indexes are never treated as current without revalidation. Discovery is not silently truncated: hitting an injectable file/depth bound marks `complete: false` and blocks impact, Context Packs, and dispatch. JS/TS extraction is lexically conservative: import/require/export syntax inside comments, strings, and template text is not treated as executable evidence, while `${ ... }` interpolations remain visible. Conservative `configures`, `documents`, `interface-reference`, and `manifest-reference` edges are emitted from explicit paths only. v0.4.0 is not semantic omniscience.

## Impact and Context Packs

`uads impact` and `uads context pack` produce metadata-first artifacts: repository-relative paths, digests, relation, reason, confidence, and a byte-heuristic token estimate. They do not copy source into the sidecar. Graph traversal enforces radius. Incoming `documents` / `configures` / `manifest-reference` edges contribute documentation or config context from C2 upward with edge-derived reasons; C1 stays named-files only. `uads context expand --reason ...` moves one level, refreshes impact/pack, and never widens product scope. C5 remains exceptional (`--approve-c5`).

## Token budget manager

Each Work Order declares provider-neutral `tokenBudget` with capability class `economy | balanced | strong | critical`. Soft overflow warns and recommends reuse or a narrower radius. Hard overflow is fail-closed: dispatch or context expansion that would exceed the hard limit is blocked. Pack token estimates are labeled `byte-heuristic`; they are not provider tokenizer counts.

## Evidence Cache

`uads verify` evaluates eligible gates against sidecar cache records. A HIT requires matching project, gate contract, tool identity, and the proven validity basis (candidate/source, dependency/interface/test neighbors, manifests/lock/config). Unrelated files outside that basis do not globally invalidate eligible evidence. Incomplete, truncated, corrupt, or cross-project cache/index state fails closed (MISS/STALE/NOT_REUSABLE/BLOCKED), never PASS.

Population happens only from authoritative PASS evidence. A HIT writes a **new** current-digest evidence record with `source=cache-reuse` and pointers to the cache record and decision. The originating record is not mutated. Current-digest FAIL/BLOCKED stays sticky.

Eligible in v0.6.0: `static`, `unit-test`, `contract-test`, `build`, `web3-unit`, and `integration-test` when environment identity is present. Not reusable across a changed digest: independent review, `security-review`, `performance-check`, architecture/migration/rollback, Web3 fuzz/invariant, financial/simulation invariants, `release-check`, and any gate whose validity cannot be proven.

`uads cache status` is a cheap sidecar read. `uads cache explain --gate` returns the decision, reason codes, and changed validity inputs.

## Cost Governor

The governor records allow/warn/block/reuse outcomes with reason codes. It avoids recommending a redundant eligible gate rerun when a valid HIT exists, and can reuse an unchanged Context Pack identity without rereading source. It must not skip required non-reusable gates, uncertain validity, or user-requested fresh evidence recording.

QPT is `verifiedQualityCoverage / max(1, estimatedContextTokens/1000)`. It is not dollars, latency, or observed provider tokens. `agentCallsReported` stays null unless the host reports calls.

`uads cost status` / `uads cost explain` read ledger/QPT without a repository scan.

## Cache-first prompt architecture

Context Packs expose optional `staticLayerDigest`, `semiStableLayerDigest`, and `dynamicLayerDigest` for provider-neutral cacheability. Provider prompt-caching APIs are not implemented.

## Fault localization

When verification fails, UADS normalizes evidence, computes a deterministic signature, ranks hypotheses, and emits the smallest sufficient diagnostic Context Pack. Ranking is heuristic, not calibrated probability. Diagnosis is not verified root cause; ranked candidates stay hypotheses. `verifiedRootCausePaths` stays empty unless independently proven. Verified correction is recorded only when the Failure Record is bound to the completed corrective execution, that run's current change digest, passing gates, and independent review. A stored execution digest is not enough if the live worktree has changed: stale failure recording is rejected until `uads verify` re-establishes coherence, and explicit resolution is refused unless the live canonical digest still equals the verified corrective digest. Failure evidence and verified memory cannot cross code-state boundaries. Compact Failure Memory is reusable only when the **post-correction** candidate/dependency validity basis still matches a complete current index; otherwise it is historical/advisory. Loop detection counts distinct failure observations with the same signature and the same content-aware change identity, not repeated `uads diagnose` on one record. Diagnostic expansion is one radius step and never jumps to C5.

## Model routing

The 0.8.0 Model Router turns a Work Order into a persisted, evidence-bearing Model Execution Plan. Routing is provider-neutral and never invokes a provider API. A profile records opaque provider/model identifiers, capability class (`economy | balanced | strong | critical`), reasoning class, context/output limits, boolean feature support, ordinal relative cost/latency, adapter provenance, and a content digest. Vendor prices, credentials, endpoint URLs, hooks, shell commands, and volatile catalogs are not part of the registry contract.

Negotiation is ownership-aware. `toolCalling`, `structuredOutput`, caching, context, telemetry, and vision are model/runtime intersections; `subagents` and `parallelAgents` are host/runtime-only; `modelSelection` is a router/runtime control. `unknown` is conservative false in every category. The router applies the Work Order quality floor before deterministic scoring, rejects insufficient context or output reserve, and sorts by minimum sufficient class, reasoning adequacy, context headroom, relative cost, relative latency, then `profileId`. Unknown cost is not treated as cheapest. Critical and other assurance-sensitive work fail closed when no sufficient proven profile exists; an empty registry is host-managed compatibility only for non-critical economy/balanced work and is explicitly recorded as such.

Failure Memory signals, loop detection, unresolved ambiguity, failed architecture review, and explicit routing reasons can raise the floor monotonically. A later attempt cannot silently return to a weaker tier for the same Work Order. Fallbacks are drawn only from candidates that preserve the floor. A stated preference can raise the floor but cannot lower it.

Plans persist in `~/.uads/workspaces/<project-id>/model-routing/`; the global registry is `~/.uads/registry/models/profiles.json`, and runtime snapshots are under `~/.uads/registry/runtime/capabilities/`. Dispatch rechecks the Work Order, change, registry, runtime, policy, and Context Pack identities and recomputes or blocks on stale state. Cache hints carry only Context Pack layer digests and usable booleans; they are not cache hits or provider cache identifiers.

If the runtime cannot parallelize, the plan records sequential execution. If it cannot spawn subagents, roles cycle explicitly. Usage telemetry is `null` unless the runtime and selected profile prove it. These fallbacks preserve quality gates and do not create a provider proxy.
