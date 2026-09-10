# M30 — Production Observability & Real-Time Operations
Status: DISCOVERY — S00 FROZEN / S01 FROZEN / S01.5 FROZEN / S02 FROZEN / S03 CANDIDATE — FINAL GATES + HEDS PENDING | Class: NECESSARY

Mission: provide the event-backed operational nervous system and canonical UADS V2 dashboard/operator surface required by ADR-UADS2-009.

Owns structured event spine, logs/metrics/traces where applicable, correlation/request/Work-Order IDs, SLI/SLO, alert rules, health/degraded/UNAVAILABLE states, real-time dashboard contracts, diagnostics and runbook/incident links.

Boundary: M24 owns Work Order/cost ledger semantics. M30 owns production telemetry transport, health/alerts and dashboard presentation.

B-001: M08 emits privacy-safe identity-bound review-analysis events; M30 carries the authoritative event surface; M24 attributes them to the Work Order. The unchanged duplicate rule must yield deterministic numerator, denominator, rate and raw-event hashes.

No dashboard element may claim real-time state from fabricated/stale mock data.

Mandatory tests: correlation continuity, event identity/hash stability, missing telemetry explicit, no double count, privacy/cardinality controls, alert correctness, dashboard freshness, degraded-source behavior, B-001 non-zero denominator on required V2 workloads and low telemetry overhead.

## Discovery sessions
- S00: FROZEN — problem framing, measurable objectives, anti-fabrication and foundation reconciliation.
- S01: FROZEN — standards-compatible observability posture, local-first default and evidence-gated scale path.
- S01.5: FROZEN — OTCL, TCL, AOBC/CBF, TPSC, PSCF and LOCP promoted; LDCB/COG/AAE experimental hooks.
- S02: FROZEN — Living Operations Organism architecture and state/command contracts; PR #58 merged as `27e5d996cf5d8a759d86ae2b84c94e3c37395b09`, HEDS `5166032126`.
- S03: CANDIDATE — failure, security, abuse, recovery and economic-safety analysis in UADS2-WO-018 / Issue #59 / PR #60. Final exact-head gates and HEDS are required before freeze.
- S04: BLOCKED until S03 final approval/merge — proof, benchmark and chaos-test design.

## Frozen S01 technology posture
- ADOPT standards-compatible OpenTelemetry semantic/OTLP boundary without mandatory runtime dependency.
- ADOPT Prometheus/OpenMetrics-compatible metric semantics; exporter remains optional/experimental.
- ADAPT the UADS immutable event spine and SSE local-first dashboard delivery.
- EXPERIMENT with trace-derived metrics, native histograms, pluggable OTLP/Prometheus export and evidence-gated distributed ingest.
- REJECT mandatory Grafana/Kafka/SaaS stacks, unbounded cardinality and synchronous heavy telemetry on critical paths.

## Frozen S01.5 proprietary shortlist
PROMOTED to S02 architecture:
- OTCL — Operational Truth Confidence Layer.
- TCL — Telemetry Continuity Ledger.
- AOBC — Adaptive Observability Budget Controller, including CBF cardinality firewall behavior.
- TPSC — Truth/Projection Separation Contract.
- PSCF — Privacy-Safe Correlation Fabric.
- LOCP — Living Operations Control Plane.

EXPERIMENT architecture hooks:
- LDCB — Local-to-Distributed Continuity Bridge.
- COG — Causal Operations Graph.
- AAE — Adaptive Attention Engine.

## Living Operations Organism direction
The dashboard is the primary operational control plane, not a passive reporting page. It must maximize practical visibility over modules, work, resources, health, errors, costs, evidence, releases, security, freshness and telemetry continuity, while invoking only governed commands owned by authoritative modules.

No dashboard projection may become a second source of truth. No command path may bypass module contracts, authorization, auditability, blast-radius limits or recovery semantics.

## S03 security/recovery candidate
M30 uses:
- fail-closed control for uncertain authorization/ownership/preconditions/blast radius;
- fail-visible observability for missing/stale/corrupt/partial sources;
- explicit R0-R4 command risk classes;
- owner-side authorization and idempotency;
- UNKNOWN_OUTCOME reconciliation without blind retry;
- TCL continuity/gap/replay evidence;
- AOBC/CBF bounds for amplification/cardinality/fan-out/storage pressure;
- privacy-safe correlation and optional exporter isolation;
- explicit containment of dashboard compromise, operator error, recovery loops and experimental COG/AAE misrepresentation.

## Critical token-spend safety
Token-spend runaway is classified CRITICAL and release-blocking. Future implementation/proof must enforce finite Economic Safety Envelopes, hierarchical budget conservation, bounded agent depth/descendants/concurrency, single-owner retries, progress-free-loop termination, duplicate expensive-call reconciliation, bounded context/RAG growth, safe fallback/ensemble policy, velocity anomaly circuit breakers and local deterministic HARD_STOP/kill switches.

M30 observes and presents this state; M07 owns budget state, M05 model routing, M06 effort selection, M04 capability truth, M15/M16 host adapters and M22 evidence-driven escalation.

## Model routing cockpit requirement
The Living Operations Organism must expose governed routing controls and truthful enforcement state, including:
- `MODEL_LOCK`: operator selects one proven available model/profile; M06 still auto-sizes effort per task;
- `CHEAPEST_QUALIFIED`: choose the least costly proven profile that meets the task quality/risk/tool/context floor;
- `QUALITY_FLOOR_AUTOROUTE`: select the most economical admissible route above an operator/policy quality floor;
- enforcement state `ENFORCED | VERIFIED_MATCH | HOST_FIXED | MISMATCH | UNKNOWN`;
- model/profile, effort, rationale, cheaper candidates rejected, tokens estimated/reserved/actual, cost/quota, retries/fallback/spawn ancestry and Economic Safety Envelope state.

If host state cannot be proved or a Model Lock mismatch exists, M30 must not fabricate control success. Mutating/model-bearing execution follows owner policy and may fail closed before spend.

## Governance note
WO-014G repaired missing WO-014 governance records. UADS2-WO-018G / PR #62 later reconstructed missing WO-015/016 governance artifacts explicitly as post-merge records and was HEDS-approved then merged as `6106dcbd67595bac9cd8251b987db3ebdbcb45ce`. These repairs improve auditability without rewriting historical chronology.
