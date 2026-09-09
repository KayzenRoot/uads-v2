# agents

Canonical UADS specialist definitions for the current core registry. Copied to `~/.uads/agents/` and optionally to user-level Cursor agents as `uads-*` files.

Host-invokable core roles: repo-inspector, requirements-engineer, software-architect, implementation-planner, implementation-agent, test-engineer, independent-reviewer, security-reviewer, performance-reviewer, reliability-reviewer, checkpoint-manager.

The bounded domain catalog includes product-requirements-specialist, frontend-specialist, backend-api-specialist, database-specialist, mobile-client-specialist, platform-cloud-specialist, reliability-specialist, data-ai-specialist, web3-contract-specialist, finance-math-specialist, game-systems-specialist, documentation-dx-specialist, release-specialist, and quality-specialist. These descriptors are lean host-facing contracts; they do not invoke providers or grant production authority.

The TypeScript kernel emits routing; hosts/adapters invoke these roles. Do not launch provider APIs from the kernel.
