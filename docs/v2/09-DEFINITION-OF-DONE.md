# UADS V2 — Definition of Done

Status: CANONICAL OVERLAY IN REVIEW

UADS V2 is complete only when objective evidence proves all applicable conditions.

- [ ] V1 lineage and baseline are preserved and documented.
- [ ] Specialist max concurrency = 1 by default and is regression-tested.
- [ ] Parallel review fan-out is eliminated from the default path.
- [ ] Worker conversations are not user-visible when host capability permits background execution.
- [ ] Cursor adapter capability negotiation is validated.
- [ ] Codex adapter capability negotiation is validated.
- [ ] Automatic model routing is validated.
- [ ] Automatic reasoning/effort selection is validated.
- [ ] Simple work does not unnecessarily use EXTRA_HIGH.
- [ ] Review is sequential, delta-first, risk-adaptive and evidence-driven.
- [ ] Evidence Cache validity/invalidation is proven.
- [ ] Failure Memory / fault-resolution behavior is proven.
- [ ] Retry loops are bounded and hypothesis-aware.
- [ ] Token/quota/cost metrics are observable.
- [ ] HiveTaskEnvelope/UADSQualityBundle contracts are tested.
- [ ] No duplicated Hive canonical responsibility is introduced.
- [ ] Experience/Policy learning cannot override canonical truth.
- [ ] Learned policy rollback/kill switch exists before autonomous activation.
- [ ] Security/architecture/data-integrity regressions are absent.
- [ ] V1×V2 benchmark is published.
- [ ] Required CI/gates pass on exact merge candidate.
- [ ] Evidence Bundle is complete and fingerprint-bound.
- [ ] Final independent audit is APPROVED.
- [ ] Canonical checkpoint is updated only after approval.
- [ ] Release/deployment path has tested rollback or safe coexistence.
- [ ] B-001 V2 structured review-analysis events produce deterministic numerator, denominator, Duplicate Analysis Rate and raw-event hashes on the required benchmark.
- [ ] Every module has five enterprise-pillar classifications.
- [ ] Applicable Capacity Plan and load/stress/soak/burst evidence exist.
- [ ] Applicable latency/throughput/concurrency/queue/backpressure/saturation evidence exists.
- [ ] Applicable FMEA/fault-injection/restart/replay/dependency-outage/backup-restore/RTO-RPO evidence exists.
- [ ] Applicable Threat Model, least privilege, secrets, supply-chain/SBOM and security-validation evidence exists.
- [ ] Applicable structured logs/metrics/traces, correlation IDs, SLI/SLO, alerts, diagnostics and runbooks exist.
- [ ] Real-time dashboard surfaces are event-backed and expose error/degraded/UNAVAILABLE states truthfully.
- [ ] Applicable Migration Strategy, compatibility/deprecation, release gates, post-deploy verification and Rollback Plan are tested.
- [ ] No necessary enterprise pillar remains GAP.

A feature checklist without evidence is not completion.
