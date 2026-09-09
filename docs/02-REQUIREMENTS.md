# 02 — Requirements

Normative requirements for UADS (NexLabs). Architecture Freeze v0.2.

## Functional (foundation)

| ID | Requirement |
| --- | --- |
| F1 | Identify the current git repository root from cwd |
| F2 | Compute a stable project fingerprint and project-id |
| F3 | Create/read a global sidecar under `~/.uads/workspaces/<project-id>/` |
| F4 | Default to zero project footprint |
| F5 | CLI commands: `--help`, `doctor`, `inspect`, `plan`, `dispatch`, `verify`, `evidence`, `assurance`, `finalize`, `index`, `impact`, `context`, `failure`, `diagnose`, `failures`, `cache`, `cost`, `models`, `capabilities`, `status`, `resume`, `review` |
| F6 | Generate a review ZIP outside the project with SHA-256 checksum |
| F7 | Exclude secrets and heavy/generated directories from review ZIPs |
| F8 | Global install skeleton populates `~/.uads/{core,skills,agents,adapters,cache,workspaces}` without silent overwrites |
| F9 | Agent Skill entrypoint exists at `skills/uads-orchestrator/SKILL.md` with one-level `references/` |
| F10 | JSON schemas exist for intake, checkpoint, work order, routing decision, evidence, review, profile, repository map, execution-run, execution-packet, evidence-record, review-record |
| F11 | Orchestrator kernel plans Work Orders, routing decisions, context radius, and checkpoints in the sidecar |
| F12 | `uads resume` reconstructs next action from sidecar state without a full repository rescan |
| F13 | Orchestrator eval suite (`npm run eval:orchestrator`) covers mandatory routing cases including non-selections |
| F14 | Execution engine dispatches a planned Work Order, binds a change digest, records evidence/reviews, and refuses unsupported completion |
| F15 | Execution eval suite (`npm run eval:execution`) covers happy path, fail verify, missing review, self-review, scope violation, correction loop, CRITICAL assurance, evidence spoof, and digest/session integrity |
| F16 | Context Intelligence builds an incremental sidecar index, impact graph, and metadata-first Context Packs |
| F17 | Fault localization normalizes failures, ranks hypotheses, emits a diagnostic Context Pack, and records compact Failure Memory |
| F18 | Fault eval suite (`npm run eval:fault`) covers FL1–FL18 |
| F19 | Evidence Cache reuses only proven-valid PASS for eligible gates; Cost Governor enforces token budgets and records QPT |
| F20 | Cost eval suite (`npm run eval:cost`) covers CC1–CC14 |
| F21 | Provider-neutral Model Execution Plan and runtime capability negotiation persist globally/sidecar with no provider API calls |
| F22 | Model routing eval suite (`npm run eval:model-routing`) covers MR1–MR22 and fail-closed adversarial behavior |
| F23 | Specialist selection derives deterministic domain, gate, evidence, assurance, affected-area, and structured dependency obligations; dispatch/resume reject stale or divergent specialist state |
| F24 | Cursor, Codex, and Generic Agent Skills adapters detect, install, uninstall, and prepare identity-bound host dispatch bundles using global-only ownership-safe state |

## Non-functional

| ID | Requirement |
| --- | --- |
| NF1 | Portable CLI (Node.js 20+); no proprietary runtime for basics |
| NF2 | Open-source ready (Apache-2.0, governance docs) |
| NF3 | Security-conscious packaging of review artifacts |
| NF4 | Token-aware architecture documented even before the orchestrator exists |
| NF5 | Foundation is tested; CI must pass |

## Future (not this increment)

Provider API clients, vendor price catalogs, 30+ specialist catalog, marketplace, dashboard, cloud control plane, deep UGAS integration, embeddings, provider-model diagnosis, and autonomous provider execution.

## Prompt 012 planning decision (not implemented)

The next implementation scope is frozen to one capability: a bounded,
provider-neutral host execution and receipt boundary for an identity-bound
Host Dispatch Bundle. This planned capability is a continuation of F24's
adapter handoff boundary, not provider invocation, credential handling,
autonomous approval, dashboard/control-plane behavior, or deployment. No new
functional requirement is claimed as complete by this planning record.

The pre-freeze reconciliation is explicit: the bounded Prompt 009 specialist
catalog is delivered, while its broader 30+ expansion remains future; Prompt
008 already supplies provider-neutral capability/profile mapping, model
execution plans, and host-managed compatibility without provider calls. Live
provider-specific adapters therefore remain future and are not a predecessor
for the selected host boundary.
# Specialist routing requirements (Prompt 009)

Specialist delegation is global-first and sidecar-only. A normalized Work Order is bound to a deterministic Specialist Selection Plan containing the Work Order digest, routing digest, registry digest, policy digest, and optional change/impact/gate-contract digests. The plan must make selected coverage, assurance, evidence obligations, rejection reasons, conflicts, and dependency groups inspectable without exposing chain-of-thought.

The registry is provider-neutral, schema-closed, bounded, and screened for secrets, host paths, commands, hooks, duplicates, unknown domains/functions, and unsafe implementation/review combinations. Disabled profiles are never selected; experimental profiles require explicit policy allowance and cannot silently satisfy critical assurance.
