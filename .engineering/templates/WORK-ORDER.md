# Work Order — `ENG-<NAME>-<NNN>`

Status: `PROPOSED | ACTIVE | READY_FOR_REVIEW | COMPLETED | BLOCKED | CANCELLED`
Repository: `<owner>/<repo>`
Branch: `<type>/<short-name>`
Baseline Git SHA: `<40 lowercase hex>`
Head Git SHA: `<40 lowercase hex or pending>`
Scope class: `trivial | local | cross-cutting | architectural`
Risk: `LOW | MEDIUM | HIGH | CRITICAL`

## Objective

<One measurable objective.>

## Included scope

- `<path, contract, or bounded action>`

## Explicitly out of scope

- `<feature, migration, cleanup, dependency, or behavior not authorized>`

## Dependencies and assumptions

- `<dependency or UNKNOWN / NEEDS OWNER CONFIRMATION>`

## Acceptance criteria

- [ ] `<criterion with observable evidence>`

## Required gates and evidence

- Gates: `<exact existing gate IDs or commands>`
- Evidence: `<command, output, file, CI, or independent review reference>`

## Stop conditions

- `<stale context, scope expansion, destructive ambiguity, unresolved HIGH/CRITICAL, or other blocker>`

## Autonomy boundary

- Safe autonomous actions: `<inspect, bounded edit, local validation>`
- Requires maintainer/owner action: `<merge, promotion of canonical truth, destructive/external action>`

## Review and delivery

- Independent reviewer: `<role or identity>`
- PR title: `<title>`
- Evidence Bundle: `<relative path>`
- Checkpoint Delta: `<relative path>`
