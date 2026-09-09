# generic

The Generic Agent Skills adapter installs the canonical
`skills/uads-orchestrator/` tree into the global
`~/.agents/skills/uads-orchestrator/` target (or an explicit
`$UADS_AGENT_SKILLS_HOME` override).

It proves only Skill consumption. `subagents` and `parallelAgents` are false
by default, so prepared bundles use sequential role cycling. Ownership hashes,
path safety, and zero project footprint are enforced by the common adapter
contract.

UADS by NexLabs. See `docs/` for Architecture Freeze v0.2.
