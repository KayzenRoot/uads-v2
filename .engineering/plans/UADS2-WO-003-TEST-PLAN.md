# Test Plan — UADS2-WO-003 / M30 Foundation

Status: PREFLIGHT

## Unit / schema

- valid generic operational event accepted;
- unknown property rejected;
- unsupported schema version rejected;
- malformed timestamps rejected;
- invalid severity/status rejected;
- `review.analysis` without any B-001 required field rejected;
- valid `review.analysis` accepted;
- event content hash recomputes identically;
- persisted secret-like values are redacted/omitted by existing sanitization rules;
- payload/event size ceiling enforced.

## Persistence / resilience

- observability directories are created only inside sidecar workspace;
- event write produces one immutable record;
- same persisted event reloads with same identity/hash;
- corrupted JSON record is skipped and health becomes DEGRADED;
- hash-mismatched record is skipped and health becomes DEGRADED;
- unsupported version becomes degraded evidence;
- missing/unreadable observability source becomes UNAVAILABLE without taking down unrelated status;
- restart/reinstantiation reads prior valid events;
- retention removes only M30 event records and never adjacent sidecar domains;
- bounded list limit enforced.

## Security

- dashboard defaults to `127.0.0.1`;
- non-loopback host rejected;
- path traversal endpoints do not exist/are rejected;
- HTTP security headers present;
- no CDN/external asset dependency;
- event/output sanitization prevents durable secret leakage;
- API response does not expose absolute host paths from internal state.

## Dashboard / real-time

- `/api/snapshot` returns objective project/M30 state;
- `/api/events` obeys hard limit;
- real-time stream emits persisted events in order observable to one client;
- client disconnect is cleaned up;
- max concurrent stream clients enforced;
- error/diagnostic event appears in recent activity;
- missing source field appears as UNAVAILABLE/degraded, not fake value;
- dashboard HTML has no mock operational metrics.

## B-001

Create at least two bounded `review.analysis` test events with a non-zero denominator. Recompute `normalized-structured-analysis-signature-v1` from persisted events and verify deterministic numerator/denominator/rate and raw hashes. This proves the M30 transport/schema surface only, not full M08 integration.

## Scale/load evidence

Benchmark in an isolated temporary UADS_HOME:
- event write throughput;
- write p50/p95;
- bounded recent-read p50/p95;
- retention behavior at/over configured cap;
- dashboard snapshot latency;
- memory/process observations if available.

Do not invent universal production SLOs from one developer machine. Report environment, sample count, method and limitations.

## Regression

Run:
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- focused M30 Vitest
- `npm test`
- relevant evals;
- `npm run validate:engineering`
- `npm run validate` when bounded and conclusive;
- exact-head GitHub CI gates.

Any inconclusive test is labeled INCONCLUSIVE, never PASS.
