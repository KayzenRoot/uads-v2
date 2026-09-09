## Summary / why

<!-- What changed and why. -->

Protocol identity: <!-- ENG-...-... or N/A for a purely administrative change -->
Work Order: <!-- relative path or issue link -->
Context Lock: <!-- relative path -->
Evidence Bundle: <!-- relative path -->

## Scope

- Scope class: trivial / local / cross-cutting / architectural
- Work Order or issue: <!-- link or N/A -->
- Baseline Git SHA: <!-- exact 40-character SHA -->
- Head Git SHA at evidence collection: <!-- exact 40-character SHA or pending -->
- Cleanup inventory: <!-- relative path or N/A -->

## Architecture / security impact

- Architecture areas affected:
- Security impact:
- Changed files / areas:

- [ ] No UADS operational state was written into the managed project
- [ ] Sidecar workspace used if needed (`~/.uads/workspaces/<project-id>/`)

## Verification evidence

- [ ] Tests / evals executed: <!-- list exact commands and counts -->
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Review evidence or review ZIP path is recorded
- [ ] Backward compatibility considered
- [ ] Changelog / release note requirement considered
- [ ] Same baseline gates were rerun after the change
- [ ] Protocol artifact validation passed (`npm run validate:engineering`)

## Checklist

- [ ] Global-first and zero-project-footprint behavior preserved
- [ ] Evidence-first quality gates preserved
- [ ] Secrets were not committed
- [ ] No suspected-unused production material was deleted without a separate Work Order
- [ ] Context Lock is fresh/relocked, or stale events are explicitly recorded
- [ ] Checkpoint Delta is proposed only; canonical truth was not promoted by the executor
