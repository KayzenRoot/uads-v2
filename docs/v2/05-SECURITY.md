# UADS V2 — Security

Status: CANONICAL OVERLAY IN REVIEW

V1 security rules remain inherited unless explicitly superseded.

## V2 additions

- Worker concurrency is bounded to reduce resource-exhaustion and quota-abuse failure modes.
- Background workers MUST inherit the same scope, tool and approval boundaries as the coordinator.
- Host capabilities MUST be proven before enabling background/subagent/model-control features.
- Model/effort routing MUST NOT weaken HIGH_ASSURANCE proof obligations.
- Experience/Policy learning MUST be data-minimized, versioned, auditable and reversible.
- Learned policies MUST NOT authorize destructive, privileged, financial, release or security-sensitive actions.
- Cross-project Hive/UADS exchange MUST bind project identity, Work Order identity and source fingerprints.
- Evidence reuse MUST fail closed on stale code/test/config/schema/runtime/environment inputs when relevant.
- Secrets, raw credentials, absolute host paths and private prompt/output material MUST NOT enter durable evidence unless an explicit secure contract requires and protects it.
- UADS runtime state remains global-first under its sidecar; project repository governance artifacts remain static/auditable.

## M29 operational-security contract

Before a capability can be production-ready, applicable evidence MUST cover:
- Threat Model and trust boundaries;
- least privilege / RBAC or equivalent authorization boundaries;
- secret/credential storage, rotation and revocation;
- environment isolation and secure defaults;
- dependency/supply-chain controls and SBOM where appropriate;
- SAST/DAST/security validation appropriate to the attack surface;
- audit logging and tamper considerations;
- incident-response ownership, severity path and runbook;
- privacy, data-minimization and retention constraints.

A required security GAP blocks production readiness.
