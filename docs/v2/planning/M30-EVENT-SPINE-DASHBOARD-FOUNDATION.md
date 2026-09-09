# M30 S00/S02 — Event Spine & Dashboard Operator Foundation

Status: PREFLIGHT DESIGN
Work Order: UADS2-WO-003

## Technology decision for this slice

Use the existing TypeScript/Node 20 runtime and standard-library HTTP stack. No React/Next/Vite/Express/WebSocket dependency is introduced.

Real-time browser delivery uses Server-Sent Events. This is sufficient for one-way operator telemetry and avoids a new dependency/supply-chain surface.

## Storage model

Extend the existing global-first project workspace:

```text
~/.uads/workspaces/<projectId>/
  observability/
    events/
      <eventId>.json
    health.json
```

One immutable file per event avoids a shared append log becoming a corruption/concurrency choke point. A later M27 benchmark may justify segmentation/compaction, but this Work Order does not pre-optimize.

Readers:
- validate schema;
- verify eventHash;
- sort/bound results using persisted timestamps and identity;
- skip invalid records;
- report invalid-record counts as degraded state.

Retention:
- bounded configurable constant in code;
- cleanup restricted to the M30 event directory;
- cleanup failures degrade health but never delete unrelated sidecar data.

## Event identity

`eventId` is generated once with cryptographically strong UUID/entropy.
`eventHash` is deterministic SHA-256 of a canonicalized event representation excluding the hash itself.

The hash is integrity/provenance, not a secret/signature.

## Data minimization

Persist only bounded operational attributes. All strings pass through existing operational sanitization before validation/write. Absolute paths, credentials, raw prompts and arbitrary provider output are not event payload defaults.

## Dashboard server

Local-only Node HTTP server:
- loopback binding only in this slice;
- no external asset/CDN request;
- security headers;
- objective snapshot endpoint;
- bounded recent-event endpoint;
- SSE event stream;
- static operator shell;
- explicit HEALTHY/DEGRADED/UNAVAILABLE display.

The dashboard must remain usable if some existing sidecar sources are missing.

## Initial operator surface

- system/M30 health;
- active project identity;
- active Work Order/execution identity when objectively available;
- recent activity;
- recent errors/diagnostics;
- event counts;
- existing status/cost/cache/model/adapter fields only when retrievable without fabrication.

The design should follow the owner-approved dark technical visual direction while preserving accessibility and performance. Exact visual fidelity is a separate acceptance layer once the original binary reference is versioned in the repository.

## B-001 bridge contract

This slice defines and proves transport/schema support for `review.analysis`.
It does NOT implement M08 semantic review analysis.

When M08 later emits these events, M30 must preserve:
`eventType | gate | normalizedSubjectPath | normalizedFindingCode | evidenceDigest`
without lossy transformation, while M24 retains Work Order attribution.

## Extension boundary

Future modules emit through a small M30 event API. They must not write dashboard-specific state directly. The dashboard is a projection of objective events/state, not a second source of truth.
