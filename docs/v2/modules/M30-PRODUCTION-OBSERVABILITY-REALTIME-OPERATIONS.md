# M30 — Production Observability & Real-Time Operations
Status: DISCOVERY — S00 FROZEN / S01 FROZEN / S01.5 FROZEN / S02 FROZEN / S03 FROZEN / S04 CANDIDATE — FINAL EXACT-HEAD GATES + HEDS PENDING | Class: NECESSARY

Mission: provide the event-backed operational nervous system and canonical UADS V2 dashboard/operator surface required by ADR-UADS2-009.

Owns structured event spine, logs/metrics/traces where applicable, correlation/request/Work-Order IDs, SLI/SLO, alert rules, health/degraded/UNAVAILABLE states, real-time dashboard contracts, diagnostics and runbook/incident links.

Boundary: M24 owns Work Order/cost ledger semantics. M30 owns production telemetry transport, health/alerts and dashboard presentation.

B-001: M08 emits privacy-safe identity-bound review-analysis events; M30 carries the authoritative event surface; M24 attributes them to the Work Order. The unchanged duplicate rule must yield deterministic numerator, denominator, rate and raw-event hashes.

No dashboard element may claim real-time state from fabricated/stale mock data.

## Discovery sessions
- S00: FROZEN — problem framing, measurable objectives, anti-fabrication and foundation reconciliation.
- S01: FROZEN — standards-compatible observability posture, local-first default and evidence-gated scale path.
- S01.5: FROZEN — OTCL, TCL, AOBC/CBF, TPSC, PSCF and LOCP promoted; LDCB/COG/AAE experimental hooks.
- S02: FROZEN — Living Operations Organism architecture and state/command contracts; PR #58 merged as `27e5d996cf5d8a759d86ae2b84c94e3c37395b09`, HEDS `5166032126`.
- S03: FROZEN — failure/security/recovery and CRITICAL token-spend economic-safety requirements; PR #60 merged as `ecbfdc32970f6e9f8831f163ceafad834d37d1d2`, HEDS `5166615573`.
- S04: CANDIDATE — proof/benchmark/chaos-test design in UADS2-WO-019 / Issue #63 / PR #64; final exact-head gates and HEDS pending.

## Frozen technology and architecture posture
- ADOPT standards-compatible OpenTelemetry semantic/OTLP boundary without mandatory runtime dependency.
- ADOPT Prometheus/OpenMetrics-compatible metric semantics; exporter remains optional/experimental.
- ADAPT the UADS immutable event spine and SSE local-first dashboard delivery.
- PROMOTED architecture concepts: OTCL, TCL, AOBC including CBF behavior, TPSC, PSCF and LOCP.
- EXPERIMENT hooks: LDCB, COG and AAE.
- REJECT mandatory Grafana/Kafka/SaaS stacks, unbounded cardinality and synchronous heavy telemetry on critical paths.

## Living Operations Organism direction
The dashboard is the primary operational control plane, not a passive reporting page. It must maximize practical visibility over modules, work, resources, health, errors, costs, evidence, releases, security, freshness and telemetry continuity, while invoking only governed commands owned by authoritative modules.

No dashboard projection may become a second source of truth. No command path may bypass module contracts, authorization, auditability, blast-radius limits or recovery semantics.

## Frozen S03 security/recovery doctrine
M30 uses fail-closed control for uncertain authorization/ownership/preconditions/blast radius; fail-visible observability for missing/stale/corrupt/partial sources; explicit R0-R4 command risk classes; owner-side authorization/idempotency; UNKNOWN_OUTCOME reconciliation without blind retry; TCL continuity/gap/replay evidence; AOBC/CBF bounds; privacy-safe correlation; and explicit containment of dashboard compromise, operator error, recovery loops and experimental COG/AAE misrepresentation.

## Critical token-spend safety
Token-spend runaway is CRITICAL and release-blocking. Future implementation/proof must enforce finite Economic Safety Envelopes, hierarchical budget conservation, bounded agent depth/descendants/concurrency, single-owner retries, progress-free-loop termination, duplicate expensive-call reconciliation, bounded context/RAG growth, safe fallback/ensemble policy, velocity anomaly circuit breakers and local deterministic HARD_STOP/kill switches.

M30 observes and presents this state; M07 owns budget state, M05 model routing, M06 effort selection, M04 capability truth, M15/M16 host adapters and M22 evidence-driven escalation.

## Model routing cockpit requirement
The Living Operations Organism exposes governed routing policy for:
- `MODEL_LOCK`: one proven available model/profile selected by the operator; M06 still auto-sizes effort per task;
- `CHEAPEST_QUALIFIED`: least-cost proven profile satisfying task quality/risk/tool/context floor;
- `QUALITY_FLOOR_AUTOROUTE`: most economical admissible route above policy quality floor;
- enforcement state `ENFORCED | VERIFIED_MATCH | HOST_FIXED | MISMATCH | UNKNOWN`;
- transparent model/profile, effort, rationale, rejected cheaper candidates, tokens estimated/reserved/actual, cost/quota, retries/fallback/spawn ancestry and Economic Safety Envelope state.

Model Lock mismatch or unproven host state cannot be rendered as successful enforcement or silently route elsewhere.

## S04 proof and benchmark candidate
S04 defines 50 stable proof IDs, 15 economic chaos scenarios and 12 CRITICAL economic release floors. Proof results are PASS/FAIL/BLOCKED/NOT_APPLICABLE; evidence classes distinguish LOCAL_MEASURED, PROVIDER_REPORTED, SIMULATED, DERIVED and UNKNOWN.

Economic release floors are absolute safety conditions and cannot use generic justified exceptions while the feature is production-enabled. Performance measurements remain TARGET or OBSERVATION until representative M27/M28 evidence justifies stronger claims. Historical local dashboard latency and Issue #39/M03 B6 telemetry overhead remain baselines/debt, not production SLOs.

## Governance note
WO-014G repaired missing WO-014 governance records. UADS2-WO-018G / PR #62 reconstructed missing WO-015/016 governance artifacts explicitly as post-merge records and merged as `6106dcbd67595bac9cd8251b987db3ebdbcb45ce`. These repairs improve auditability without rewriting historical chronology.
