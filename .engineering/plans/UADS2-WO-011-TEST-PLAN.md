# Test Plan — UADS2-WO-011

## Focused assertions
1. Generic adapter dispatch remains sequential and role-cycling under proof-aware projection.
2. Cursor/Codex declaration TRUE without enabling PCCR proof cannot make dispatch parallel or subagent-capable.
3. Dispatch hot-path read does not persist passive proof records when using compatibility projection.
4. Existing stale/cross-project/model-tamper/privacy/digest protections remain unchanged.

## Regression surface
- `tests/host-adapters.test.ts`
- full test suite
- lint/typecheck/build
- immutable action pin validation
- engineering protocol validation
- dependency audit
- packaging smoke
- CodeQL
- cross-platform compatibility

## Exact-head rule
Approval is permitted only against one exact PR head with all mandatory gates successful.
