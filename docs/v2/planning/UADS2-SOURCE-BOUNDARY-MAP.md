# UADS V2 — Source Boundary Map for Implementation

Status: CANDIDATE
Work Order: UADS2-WO-024
Base inspected: `b21cce7150c991dba347e28bb8e3752be9e2e941`

## Purpose
Map current repository source areas to implementation waves before executor work starts. This is a planning boundary map, not a declaration that every future mechanism must live in one named file.

## Current top-level runtime areas observed
- `src/adapters/` — external host/provider/tool integration boundary.
- `src/commands/` — CLI/operator command entry points, including dashboard-facing commands.
- `src/eval/` — evaluation/review-related runtime candidates.
- `src/github/` — GitHub-specific runtime/integration code.
- `src/kernel/` — core execution/runtime truth mechanisms and shared orchestration primitives.
- `src/lib/` — shared support utilities; avoid turning into unowned business logic.
- `src/release/` — release/provenance/release-engineering boundary.
- `src/cli.ts` — CLI composition/wiring; should not become domain authority.

Known existing M30 foundation includes `src/kernel/operational-events.ts` and `src/commands/dashboard.ts`. Known M03 production consumer boundary is `readHostCapabilityProjection()`; new consumers must not bypass it with weaker adapter declarations.

## Source-boundary rules
1. Domain truth belongs in owning module/kernel mechanisms, not CLI/dashboard projections.
2. `src/commands/` may translate operator intent into governed commands but must not directly mutate authoritative state behind module owners.
3. `src/adapters/` may report capabilities/protocol responses but cannot elevate them to trusted capability truth without M03/M29 proof/policy.
4. `src/lib/` must remain generic support. If a helper owns policy/state semantics, move it to an explicit owner boundary.
5. `src/release/` consumes HEDS/gate/provenance truth and must not fabricate successful release evidence.
6. Any model-bearing execution path must have M07 economic enforcement before dispatch.
7. Retry/replay logic must converge on M21/SIR/DEF ownership, not appear independently in adapters/commands.
8. Every runtime slice adds/updates a truthful M30 projection contract when operator-visible.

## Initial likely implementation boundaries

### I-WAVE-0 / M30 S05.1
Primary: `src/kernel/operational-events.ts`, M30 truth/projection kernel additions, `src/commands/dashboard.ts`, tests around operational events/dashboard/SSE.
Avoid: model calls for dashboard refresh; business-state ownership in UI command code.

### I-WAVE-1 / routing, effort, economics
Primary: `src/kernel/` for policy/runtime state, `src/adapters/` for host/provider execution adapters, `src/commands/` for governed operator config, M30 projection seams.
Expected new explicit namespaces/files rather than stuffing model/economic policy into `cli.ts`.

### I-WAVE-2 / capability, policy, MCP security
Primary: `src/adapters/` for protocol integration; `src/kernel/` or explicit security policy namespace for RCE/TCIR/TCF/PDFab/POE enforcement; tests must separate discovery from authorization.

### I-WAVE-3 / retry, side effects, durable execution
Primary: `src/kernel/` with explicit retry/effect/durability boundaries; adapters expose effect metadata but do not own replay policy.

### I-WAVE-4 / parallel specialists
Primary: orchestration primitives under `src/kernel/` or a dedicated orchestration namespace introduced by the implementation slice; provider/host adapters remain under `src/adapters/`; cockpit commands remain under `src/commands/`.
Do not place DAG/specialist scheduling logic inside dashboard code.

### I-WAVE-5 / scheduling and resource governance
Primary: kernel scheduler/resource modules plus M03 capability seam. OS/GPU/provider probes belong behind bounded adapters/probes, not scattered through scheduler logic.

### I-WAVE-6 / AFR and trajectory
Primary: bounded evidence runtime near kernel/eval boundaries; review consumers under `src/eval/`; M30 projection reads evidence, it does not become sole evidence owner.

### I-WAVE-7 / self-improvement
Primary: strategy/evaluation layer consuming AFR/EOL evidence. Learned policy cannot directly mutate security/economic/release rules.

### I-WAVE-8 / release/assurance
Primary: `src/release/`, `src/eval/`, dedicated verification tooling/tests as appropriate. High-assurance sandbox host code stays adapter-bound.

## Executor file-scope protocol
Before a CODEX_READY slice starts, the implementation prompt must include:
- files/directories expected to be touched;
- files/directories explicitly forbidden unless evidence proves necessary;
- interfaces that must be preserved;
- any new namespace/file requested rather than allowing arbitrary placement;
- tests/evidence paths;
- cleanup expectations.

If implementation discovers that the frozen source boundary is wrong, it must report `NEEDS_ARCHITECTURE` with evidence instead of silently relocating ownership.

## Immediate recommendation
The first executor-heavy slice remains the already-active M30 S05.1 branch. Before dispatching Codex, complete a dedicated GitHub-only implementation package that binds its frozen S02/S03/S04 contracts to current source files, exact test targets and proof IDs.