# UADS V2 — Current Checkpoint

Status: BOOTSTRAP APPROVED / MERGED; UADS2-WO-001 ACTIVE; B-001 AMENDMENT RECOMMENDED / OWNER DECISION PENDING
Date: 2026-09-09  
Completed Work Order: UADS2-BOOTSTRAP-001  
Active Work Order: UADS2-WO-001  
Active PR: #17  
Merged PR: #8  
Approved bootstrap PR head: `7c5b56a998103494feea6dd91e386f5696d44384`  
Main merge SHA: `ce1655b2e5a5d1220ba3af78fe08af59af3ff6f0`

## Canonical execution truth

UADS V1 remains the active existing product line. UADS V2 is the separately governed development line in `KayzenRoot/uads-v2`.

The bootstrap is objectively complete for its declared scope and was merged after HEDS audit with exact-head CI evidence. `UADS2-WO-001` is the active mandatory pre-runtime baseline increment.

## Frozen lineage

Source: `KayzenRoot/uads@312e32946798eb3abbb49a79af08e13efb7719dc`  
Source tree: `b2a6763045fc1dbb81b6ba2880bf1f77167d7133`

Bootstrap source reconciliation:
- V1 tracked files: 489;
- missing in V2 bootstrap: 0;
- mismatched blob SHA: 0;
- inherited workflows restored: 7/7;
- UADS V1 repository modified by bootstrap: NO.

## Bootstrap verification

Exact approved PR head `7c5b56a998103494feea6dd91e386f5696d44384`:
- CI: SUCCESS;
- CodeQL: SUCCESS;
- Dependency Review: SUCCESS;
- UADS Cross-Platform Compatibility: SUCCESS;
- unresolved review threads: 0;
- known HIGH/CRITICAL bootstrap defects: 0.

HEDS audit verdict: APPROVED.

GitHub did not permit the PR author to submit a formal APPROVE review on their own PR, so the objective HEDS verdict is recorded as a review comment rather than a GitHub approval-state review.

## Review operating model

UADS V2 adopts HEDS as its canonical review and engineering-delivery model.

Pipeline:
Source Lock → Work Order → Context Capsule → Implement → Change Impact Manifest → Risk Routing → Selected Verification → Evidence Bundle → Delta-First Review → Verified Correction Loop → Trusted Merge → Checkpoint Update → Learning Feedback.

Primary metric: Time-to-Trusted-Merge.

Proof reuse remains conservative/experiment-gated until validity and benchmark obligations are proven.

## Prompt delivery and local bootstrap convention

Effective from `UADS2-WO-001` onward:

1. Every user-facing executor/correction prompt prepared by the reviewer for local Codex/Cursor execution must also be delivered as a downloadable PDF. The repository may retain a Markdown source copy for versioning/diffability, but the user-facing execution artifact is PDF.
2. PDF prompts must be self-contained enough to preserve the active Work Order, source hierarchy, branch/PR target, tests/evidence obligations and STOP CONDITION when the conversation is continued in a new chat.
3. The first executor prompt used against a new/empty local UADS V2 working directory must bootstrap the local checkout from GitHub automatically before attempting Work Order execution.
4. The executor must not assume the repository already exists locally. If the configured local directory is empty, it must clone `KayzenRoot/uads-v2` into that directory (or initialize/fetch safely when Git metadata already exists), configure/verify `origin`, fetch remote refs, checkout the Work Order branch, and verify synchronization before modifying files.
5. The user should not be required to perform terminal Git synchronization manually when the executor can do it safely.
6. No force-push, destructive cleanup, history rewriting, deletion of unrelated local data, or replacement of a non-empty unrelated directory is authorized by this convention.
7. After bootstrap, all implementation/evidence work remains governed by the active Work Order and PR. Local state is not canonical truth; GitHub/checkpoint/ADRs remain authoritative.

Canonical Markdown executor prompt for the active increment:
`.engineering/executor-prompts/UADS2-WO-001-EXECUTOR-PROMPT.md`.

## Operating modes

- `SOLO`: UADS V2 must operate fully without Hive V2.
- `HIVE_CONNECTED`: Hive integration is optional and additive through explicit contracts.

Hive owns macro/canonical truth when connected. UADS owns bounded execution/micro-orchestration. UADS must not duplicate Hive canonical governance authority.

## Accepted dashboard priority

ADR-UADS2-009 is accepted. After the mandatory V1 operational baseline is approved, dashboard/observability foundations become an implementation priority. Operational data presented as real time must be evidence/event backed; errors and diagnostics are first-class dashboard data. The latest owner-approved visual concept is the canonical visual target. The binary reference image still requires repository versioning by an executor capable of safely committing the supplied image asset.

## Active known V2 targets

- BUG-UADS2-001: review specialist fan-out / quota waste.
- BUG-UADS2-002: per-specialist visible conversations.
- BUG-UADS2-003: duplicated review analysis.
- BUG-UADS2-004: model/reasoning effort over-provisioning.

These remain unresolved product targets. Bootstrap does not claim they are fixed.

## UADS2-WO-001 B-001 governance state

The exhaustive technical inspection found no authoritative structured
analysis-event stream on the frozen V1 supported paths. HEDS conditionally
recommended the B-001 amendment on reviewed head
`50b811bcad1435ce65e682d6fb46fda8e3857897`; the amendment proposal remains
pending explicit owner/auditor decision and has not been canonically applied.

The frozen V1 analysis-event source remains absent, so its Duplicate Analysis
Rate is retained as `UNAVAILABLE` (`0/0`) under the unchanged canonical rule.
If approved, the replacement V2 obligation is mandatory: privacy-safe,
identity-bound structured analysis events must provide deterministic numerator,
denominator, rate, and raw-event hashes before checkpoint promotion.

This is not checkpoint promotion or HEDS approval. The governance correction
head must pass exact-head CI, receive HEDS re-audit, and remain free of V2
runtime implementation before any promotion or merge.

## Repository governance follow-up

Issue #9 remains open for admin-only repository configuration such as branch protection and supported security settings. This did not invalidate the technical bootstrap merge, but repository-administration setup must not be declared complete until an admin-capable executor applies and audits those settings.

## Active NECESSARY increment

Execute `UADS2-WO-001 — V1 Operational Baseline & Multi-Agent Fan-out Reproduction` before implementing V2 runtime modules.

The baseline must measure at minimum:
- worker/specialist spawn count;
- maximum simultaneous specialists;
- visible worker-conversation count;
- token/quota amplification;
- review duration / TTTM components;
- retries/correction depth;
- selected model and reasoning effort;
- context radius;
- duplicated analysis;
- first-pass approval vs correction rate.

The initial structural PR #17 checks completed successfully on head `24b97abc21500cc511d6c241c7d95e9b702f7818`: CI, CodeQL, Dependency Review and UADS Cross-Platform Compatibility all SUCCESS. This does not constitute baseline completion; representative runtime evidence and the required Evidence Bundle remain mandatory.

After the baseline is evidence-bound and exact-head HEDS review returns APPROVED, promote the checkpoint and begin runtime planning. ADR-UADS2-009 requires dashboard-first observability to shape that sequencing.

Runtime V2 module implementation must not skip this baseline gate.
