# Contributing to UADS

UADS V2 is a proprietary, source-visible project by **NexLabs**. Public repository visibility, if enabled, does not make the project open source and does not grant reuse rights beyond the terms in `LICENSE`.

## Ground rules

1. Read `docs/04-ARCHITECTURE.md` (Architecture Freeze v0.2) before large changes.
2. Keep **global-first** and **zero project footprint** defaults.
3. Do not package secrets into review bundles.
4. Extra ideas go to `docs/14-BACKLOG.md`, not into Prompt 001 scope.
5. Evidence-first: include commands/outputs for behavioral claims.
6. For repository changes, read `.engineering/PROTOCOL.md` and use the matching Work Order, Context Lock, Evidence Bundle, and Checkpoint Delta templates.
7. Do not assume that submitting a pull request grants any right to reuse, redistribute, commercialize, sublicense, or create derivative products from UADS V2.

## Contribution licensing

External contributions are accepted only when NexLabs is satisfied that the contributor has the right to submit the material and that the contribution can be incorporated under terms approved by NexLabs. A pull request does not change the proprietary status of UADS V2.

NexLabs may request a separate contributor agreement or written rights grant before accepting material where ownership, provenance, patent rights, or downstream licensing could be ambiguous.

## Development

```bash
npm ci
npm run build
npm test
npm run validate:actions
npm run validate
```

The complete release gate is `npm run release:validate -- --output tmp/release-validation-report.json`; it records the exact command results needed for a release. Do not publish packages to npm from this repository unless NexLabs expressly authorizes that release and its licensing terms.

## Pull requests

Use the PR template. Keep diffs focused. Do not commit `.env`, keys, or generated `dist/` or release output. Every behavioral claim should include evidence, and every release-affecting change must update `CHANGELOG.md` when appropriate.

For the engineering protocol adoption, use `npm run validate:engineering` in addition to the normal gates. Keep `.engineering/` limited to static governance records; do not commit UADS runtime sidecar state.

## Code of conduct

See `CODE_OF_CONDUCT.md`.
