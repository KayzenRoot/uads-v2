# UADS V2 — Deployment

Status: CANONICAL OVERLAY IN REVIEW

V1 remains independent and usable. V2 remains global-first unless an accepted ADR changes it: sidecar under `~/.uads/`, user-level Cursor/Codex adapter roots, no uncontrolled project-local runtime state.

## M31 safe-delivery contract
Applicable release/migration Work Orders define:
- release-readiness gates and exact candidate;
- schema/contract versioning;
- compatibility/deprecation policy;
- reversible migration strategy;
- feature flag/canary/blue-green only when justified;
- post-deploy verification;
- rollback triggers and tested rollback path;
- operator/runbook ownership;
- deployment-health evidence before promotion.

M28 owns backup/restore and RTO/RPO where applicable. M26 owns learned-policy rollback; M31 owns runtime/product/config/schema release rollback.

Until V2 release is explicitly approved, V1 remains the safe coexistence path.
