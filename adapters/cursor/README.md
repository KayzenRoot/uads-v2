# cursor

The Cursor adapter uses the common host-adapter contract. It copies canonical
`agents/uads-*.md` descriptors to the user-level Cursor agents directory only:
`~/.cursor/agents/` or `$UADS_CURSOR_HOME/.cursor/agents/`.

Ownership hashes are stored in global UADS state. Unmanaged or user-modified
files block update/uninstall; unrelated agents remain untouched. It never
writes project-level `.cursor/agents`. Hosts still invoke
`skills/uads-orchestrator/SKILL.md` and the CLI.

UADS by NexLabs. See `docs/` for Architecture Freeze v0.2.
