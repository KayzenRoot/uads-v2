# UADS V2 — Security

Status: CANONICAL OVERLAY IN REVIEW

V1 security rules remain inherited unless explicitly superseded.

## Core invariants
Bounded worker concurrency; inherited worker scope/tool/approval boundaries; proven capabilities only; HIGH_ASSURANCE cannot be weakened by cost/routing; learned policies cannot authorize privileged/destructive/security-sensitive actions; cross-project exchange binds identity/fingerprints; evidence reuse fails closed when stale; secrets/private host data are excluded from durable evidence unless explicitly protected.

## M29 operational-security contract
Applicable production evidence must cover:
- Threat Model and trust boundaries;
- least privilege / RBAC or equivalent authorization;
- secret storage, rotation and revocation;
- environment isolation and secure defaults;
- dependency/supply-chain policy and SBOM where appropriate;
- SAST/DAST/security validation appropriate to attack surface;
- audit-log integrity;
- incident-response ownership, severity path and runbook;
- privacy/data minimization and retention.

A required security GAP blocks production readiness.
