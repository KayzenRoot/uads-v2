# UADS V2 — Deployment

Status: CANONICAL OVERLAY IN REVIEW

## Development line

- UADS V1 repository remains independent and usable.
- UADS V2 development occurs only in `KayzenRoot/uads-v2`.
- Bootstrap begins from V1 SHA `312e32946798eb3abbb49a79af08e13efb7719dc`.

## Runtime strategy

V2 MUST preserve global-first installation semantics unless a dedicated accepted ADR changes them:
- UADS state under `~/.uads/`;
- Cursor integration under the user-level Cursor adapter root;
- Codex integration under the user-level Codex adapter root;
- no uncontrolled project-local runtime state.

## Release transition

Bootstrap does not rename package metadata, publish V2, create a tag or replace the installed V1. Versioning/package/release migration requires a separate Work Order after baseline and regression evidence.

## Rollback

Until V2 release is explicitly approved, rollback is simply continued use of the existing V1 installation/repository. V2 deployment work must never require destructive mutation of V1.

## M31 safe-delivery contract

Any production release/migration Work Order MUST define, where applicable:
- release-readiness gates and exact merge candidate;
- schema/contract versioning;
- backward/forward compatibility and deprecation policy;
- reversible migration strategy;
- feature flag, canary or blue/green only when justified by risk;
- post-deploy verification;
- rollback trigger and tested rollback path;
- operator/runbook ownership;
- deployment-health evidence before promotion.

M28 owns backup/restore and RTO/RPO objectives where applicable.
M26 rollback applies specifically to learned policy/experiments.
M31 owns runtime/product/config/schema release rollback.
