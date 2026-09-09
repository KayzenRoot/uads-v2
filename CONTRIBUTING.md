# Contributing to UADS

UADS is an open-source project by **NexLabs**, licensed under Apache License 2.0.

## Ground rules

1. Read `docs/04-ARCHITECTURE.md` (Architecture Freeze v0.2) before large changes.
2. Keep **global-first** and **zero project footprint** defaults.
3. Do not package secrets into review bundles.
4. Extra ideas go to `docs/14-BACKLOG.md`, not into Prompt 001 scope.
5. Evidence-first: include commands/outputs for behavioral claims.
6. For repository changes, read `.engineering/PROTOCOL.md` and use the matching Work Order, Context Lock, Evidence Bundle, and Checkpoint Delta templates.

## Development

```bash
npm ci
npm run build
npm test
npm run validate:actions
npm run validate
```

The complete release gate is `npm run release:validate -- --output tmp/release-validation-report.json`; it records the exact command results needed for a release. Do not publish packages to npm from this repository.

## Pull requests

Use the PR template. Keep diffs focused. Do not commit `.env`, keys, or generated `dist/` or release output. Every behavioral claim should include evidence, and every release-affecting change must update `CHANGELOG.md` when appropriate.

For the engineering protocol adoption, use `npm run validate:engineering` in addition to the normal gates. Keep `.engineering/` limited to static governance records; do not commit UADS runtime sidecar state.

## Code of conduct

See `CODE_OF_CONDUCT.md`.
