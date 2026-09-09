# codex

The Codex adapter uses the common provider-neutral host contract and installs
only canonical `uads-*.md` descriptors into the global
`~/.codex/agents/` target (or an explicit `$UADS_CODEX_HOME` override).

Codex detection does not imply provider authentication, model selection,
tool-calling, subagents, or parallel agents. Unknown capabilities remain
unproven, ownership conflicts fail closed, and the managed project is never
written.

UADS by NexLabs. See `docs/` for Architecture Freeze v0.2.
