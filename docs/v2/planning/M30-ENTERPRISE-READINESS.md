# M30 WO-003 — Enterprise Readiness Contract

Status: PREFLIGHT

| Pillar | Status | WO-003 owner/proof |
| --- | --- | --- |
| Scale & load | COVERED | M27: event-size/query/client/retention bounds + benchmark |
| Resilience | COVERED | M28: immutable records, restart recovery, corrupt-record degradation |
| Operational security | COVERED | M29: sanitization, loopback-only, headers, no new deps/external assets |
| Production observability | COVERED | M30 directly: event spine, health, diagnostics, snapshot, SSE |
| Continuous safe operations | COVERED | M31: additive sidecar state, versioned schema, rollback/no destructive migration |

`COVERED` here means the Work Order has an explicit proof obligation. It does not mean the product is already production-ready.

## Capacity bounds to freeze during implementation

The executor must choose named constants for:
- maximum persisted event serialized bytes;
- default/max event query size;
- default retained event count;
- maximum concurrent SSE clients;
- heartbeat interval;
- stale/degraded freshness threshold if used.

The exact numeric values must be justified by simple local behavior/tests and documented. Do not present them as universal scale targets.

## Failure modes required

- invalid/corrupt event;
- unsupported schema version;
- hash mismatch;
- unwritable M30 storage;
- retention cleanup failure;
- disconnected SSE client;
- max-client saturation;
- unavailable existing UADS source;
- server bind failure.

## Security boundary

The first server is local operator tooling, not a LAN/cloud service. Non-loopback access requires a future explicit security/auth Work Order.

## Rollback

Removing the M30 command/code must leave pre-existing UADS sidecar domains untouched. The only new durable state is isolated under the M30 observability root and can be ignored by older code.
