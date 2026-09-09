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

A feature checklist without evidence is not completion.
