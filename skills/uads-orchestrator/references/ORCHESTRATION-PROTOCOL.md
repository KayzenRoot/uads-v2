# Orchestration protocol

The host LLM interprets the user request. The TypeScript kernel is deterministic.

```
USER REQUEST -> SKILL / HOST LLM -> NORMALIZED INTAKE -> KERNEL -> WORK ORDER + ROUTING + CHECKPOINT
```

Do not re-scan the whole repository to resume. Use `uads resume`.
Do not expand scope during planning without recording the expansion.
Prompt 002 plans through the `plan` phase. Prompt 003 continues:

```
PLAN -> DISPATCH -> IMPLEMENT -> VERIFY -> INDEPENDENT REVIEW -> COMPLETE
```

`uads review` generates the review ZIP. Assurance uses `uads assurance start` / `uads assurance record`.

Prompt 010 host adapters (`cursor`, `codex`, and `generic-agent-skills`)
prepare a provider-neutral Host Dispatch Bundle only after reconstructing
current sidecar state. The adapter may serialize execution when host
subagents/parallel capability is not proven, but it cannot add specialists,
gates, evidence, assurance, scope, or model quality. Adapter resources and
bundles remain global/sidecar-only; provider API invocation remains outside
the kernel.

