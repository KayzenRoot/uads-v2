# Test Plan — UADS2-WO-012

## Focused assertions
1. Cursor declaration TRUE remains UNKNOWN through the canonical consumer API without acceptable enabling proof.
2. Generic fixed negative capability remains FALSE through current passive NPC semantics.
3. Consumer reads do not create proof files by default.
4. Consumer reads do not create project-local runtime state.
5. Projection exposes privacy-safe subject/adapter metadata only.

## Regression surface
- `tests/host-capability-consumer.test.ts`
- existing host capability proof/passive suites
- existing host dispatch suites
- lint/typecheck/build
- engineering protocol validation
- dependency audit
- packaging smoke
- CodeQL
- cross-platform compatibility

## Exact-head rule
Approval is allowed only against one exact PR head where all mandatory gates succeed and the diff remains bounded to the consumer-boundary slice.
