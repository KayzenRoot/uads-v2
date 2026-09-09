# 07 — Quality gates

Evidence-first delivery requires gates. Prompt 001 implements the **foundation** gates for this repository. Prompt 002 adds a **selection engine** that chooses relevant gate IDs per Work Order (not a dump of every gate).

## Foundation gates (this repo)

- **Lint / static check:** `npm run lint` runs TypeScript `tsc --noEmit`. This is a compile/static check, not ESLint.
- Typecheck (`tsc --noEmit`; currently the same command as lint)
- Unit and CLI smoke tests (`vitest`)
- Orchestrator routing evals (`npm run eval:orchestrator`)
- Execution lifecycle evals (`npm run eval:execution`)
- Context, fault, cost, and model-routing evals (`npm run eval:context`, `eval:fault`, `eval:cost`, `eval:model-routing`)
- Agent Skills compatibility preflight (`npm run validate:skills`)
- Validation inventory + CLI smoke (`scripts/validate/validate-foundation.mjs`)
- Dependency audit (`npm audit`) captured as sidecar evidence
- Engineering delivery protocol artifacts (`npm run validate:engineering`)
- Assurance integrity evals (`npm run eval:assurance`, AS1–AS22), including typed specialist-obligation binding and findings-file path safety
- Normative adversarial fault-injection evals (`npm run eval:fault-injection`, FI1–FI16) plus retained legacy regression cases FI17–FI32
- CI on pull requests and pushes (`.github/workflows/ci.yml`)

Command outputs are written under `~/.uads/workspaces/<project-id>/evidence/` by `scripts/validate/capture-evidence.mjs`, not into git.

## Selected gate classes (kernel)

The planner picks from a canonical registry: static, unit-test, integration-test, contract-test, build, security-review, dependency-audit, performance-check, architecture-conformance, database-migration, rollback-validation, web3-unit/fuzz/invariant, financial-numerical-validation, simulation-invariant, and release-check. Selection remains relevant-only.

Style-only frontend work does not require Web3 fuzzing. DeFi withdrawal requires web3-unit, fuzz, invariant, and security review.

A selected Work Order gate is PASS only with current-digest evidence that matches the gate contract (command gates: command + exit 0 + output digest; review gates: mapped reviewer APPROVED). FAIL/BLOCKED evidence on the current digest stays blocking even if a later PASS is recorded. Cache-reuse PASS is explicit (`source=cache-reuse`) and only allowed for eligible gates whose validity basis still matches. Unknown or unselected gate IDs cannot satisfy a selected gate. Corrupt evidence JSON fails closed.

Assurance is a deterministic policy boundary, not a prose convention. Only exact recognized reviewer roles are accepted; each role maps only to its own canonical typed obligations from the current Specialist Selection Plan, and an implementer role or session cannot approve. Arbitrary required-evidence prose and caller-supplied booleans are not authority. APPROVED with a HIGH or CRITICAL finding is rejected. BLOCKED and CORRECTION_NEEDED verdicts require findings or stable reason codes. Finalize reconstructs the current run, digest, gate states, evidence references, reviewer sessions, and specialist selection before accepting approval.

The assurance and fault-injection evals are required CI gates and are represented in the exact-SHA receipt and Direct Review evidence as `eval-assurance` and `eval-fault-injection`. Compatibility PASS requires exact source SHA/tree, run and attempt, job/platform, Node 20, fixed check outcomes, downloaded artifact identity, and evidence digest validation; missing or ambiguous proof is incomplete, never PASS.

Model routing is a gate on execution selection, not a replacement for quality gates. A `BLOCKED` Model Execution Plan blocks dispatch; a selected profile does not make any test, review, security, financial, or release gate PASS. The router must retain the Work Order floor and proven runtime intersection across retries.
# Specialist routing gate

Prompt 009 adds `npm run eval:specialist-routing` with SR1–SR26. The gate covers core/domain/assurance selection, authoritative gate/evidence obligations, minimum sufficiency, security/performance/reliability separation, independence, bounded parallel groups, exact affected-area and structured dependency signals, corrupt/duplicate/disabled/experimental registry behavior, semantic stale/tamper invalidation, and cross-artifact binding. CI and Direct Review must include `eval-specialist-routing` and its parsed pass/fail/total summary.
