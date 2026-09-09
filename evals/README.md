# Orchestrator and execution evals

Machine-readable cases for:

- `npm run eval:orchestrator` — routing selections E1–E8 + negative routing
- `npm run eval:execution` — lifecycle X1–X9 (happy path, fail verify, missing review, self-review, scope violation, correction loop, CRITICAL assurance, evidence spoof, digest/session integrity)
- `npm run eval:context` — Context Intelligence CCI1–CCI19 (local pack, shared utility, incremental reuse, delete/rename, cycles, radius, C5, unsafe paths, privacy, stale identity, commit refresh, dirty content, no-git freshness, unresolved preservation, truncated index, relationship classes, lexical false positives, computed-import determinism, reverse docs/config impact)
- `npm run eval:fault` — Fault localization FL1–FL18 (direct stack, failing-test mapping, related diff, shared utility, unrelated subsystem, ambiguity, distinct-attempt loop, post-fix memory reuse, dependency invalidation, secret-safe persist, repeated diagnose, content-aware identity, unrelated execution, post-fix+dependency, symlink/binding, stale live digest, post-finalize drift)
- `npm run eval:cost` — Evidence Cache / Cost Governor CC1–CC14 (exact HIT, relevant STALE, unrelated HIT, dependency/manifest/tool STALE, non-reusable review, corrupt fail-closed, cross-project reject, hard/soft budget, duplicate-work avoidance, secret-safe cache, truthful QPT)
- `npm run eval:model-routing` — provider-neutral Model Router MR1–MR22 (quality floors, ownership-aware runtime negotiation, no silent downgrade, deterministic selection, context/budget checks, escalation, cache hints, fallbacks, malicious input, and stale-plan invalidation)
- `npm run eval:specialist-routing` — global-first Specialist Registry and deterministic delegation SR1–SR26 (domain/gate/evidence/assurance coverage, minimum sufficiency, exact affected-area and structured dependency signals, independence, bounded parallel groups, disabled/experimental fail-closed behavior, and semantic stale/tamper/duplicate/corrupt identity)
- `npm run eval:adapters` — provider-neutral host adapter boundary AD1–AD36 (global ownership, detection, conservative capabilities, current-state dispatch preparation, sequential fallback, cross-project/stale/tamper rejection, root binding, and privacy)

Each JSON file is deterministic and local. No provider/model/network API calls.

UADS by NexLabs.
