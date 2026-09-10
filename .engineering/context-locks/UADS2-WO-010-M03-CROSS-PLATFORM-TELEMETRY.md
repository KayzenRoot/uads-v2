# Context Lock — UADS2-WO-010 / M03 S05.5

Status: LOCKED
Base SHA: `5752d1ff7716027071464308eaec6e0a0aef3892`
Issue: #37

Frozen behavior:
- V2 root digest is lexical, case-preserving and adapter-domain separated.
- equivalent `.` / `..` path spellings collapse through `path.resolve`.
- PBF production executable is exact `process.execPath`.
- M30 event transport is non-authoritative for capability truth.
- S04 permits B6 <5% or explicit justified exception.

No vendor-specific probe is authorized.
