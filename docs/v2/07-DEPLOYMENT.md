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
