# 09 — Performance

## Foundation constraints

- Review generation walks the tree once and skips heavy directories (`node_modules`, `dist`, caches)
- Per-file size cap for ZIP inclusion (1 MB)
- Binary extensions are skipped
- CLI commands are local and synchronous; no network required for `doctor` / `status` / `review`

## Later performance verification

When the orchestrator exists, performance gates apply when a change can affect latency, memory, or token use:

- Token budget adherence is a performance property of the agent loop
- Derived maps must be incremental where possible
- `uads index` on an unchanged repository reports `reused` rather than reparsing source
- A single-file modification must not unconditionally reparse the whole tree
- Do not re-scan the full repository on `status` or `resume`

Prompt 004 records reuse evidence in index-state (`mode`, `filesParsed`, `filesReused`). It does not invent universal performance SLAs.

## Prompt 011 stabilization boundary

Cross-platform compatibility is bounded to Node.js 20 on Linux and Windows runners. The required smoke covers clean dependency installation, typecheck/build, adapter/root-binding evaluation, and an isolated global package installation with no writes to the managed project. It proves compatibility for the tested SHA only; it is not a universal performance SLA or provider-runtime claim.
