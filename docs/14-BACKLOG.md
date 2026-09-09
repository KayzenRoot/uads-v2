# 14 — Backlog

## Prompt 012 scope freeze (historical planning record)

The sole NECESSARY next capability was bounded provider-neutral host execution
and receipt handling after `uads adapters prepare`. It was represented by
Work Order `ENG-PROMPT-012-HOST-EXECUTION-BOUNDARY-001`; this section records
the historical planning delta, its boundary, and its proof obligations.

Roadmap reconciliation for this freeze: the bounded Prompt 009 catalog is
already delivered, so only the broader 30+ catalog remains FUTURE. Prompt
008's provider-neutral capability/profile mapping and explicit host-managed
compatibility are already delivered; live provider-specific adapters remain
FUTURE, are not required to cross the host execution boundary, and remain
excluded from Prompt 012.

## Prompt 012 Implementation 001 - delivered and closed

The bounded Host Execution and Receipt Boundary defined by the historical
scope freeze is implemented on `main` and was merged through PR #19. The
delivered capability provides a provider-neutral handoff after a current
Host Dispatch Bundle, schema-closed sidecar-only receipts, current and
immutable history with 32-entry retention, current-authority revalidation,
and fail-closed replay, stale, tamper, and approval-intent handling.

The implementation is externally verified at final `main` SHA
`bb27398d8caa80be4a550dc1c1a96e0042fdd808` and tree
`cdc9db75a4e4dd07ac41ec562847a303a375b2ac`. UADS records bounded outcome
facts only: the host remains responsible for IDE, agent, and provider
execution, and UADS does not invoke providers or execute arbitrary commands.

This delivery does not close the deferred backlog items. The broader 30+
specialist catalog, live provider-specific adapters, UGAS integration,
provider gateway, dashboard/control plane, marketplace, cloud/enterprise
server, and deployment automation remain FUTURE.

Prompt 006 delivered Evidence Cache and the Cost Governor. Remaining ideas that must **not** land in this increment:

- Advanced semantic symbol graph / cross-language AST framework
- Full requirement-to-code traceability
- Ownership/risk maps beyond routing metadata
- Richer cache analytics / adaptive TTL / shared static metadata cache
- Vector embeddings / vector database
- Provider API clients and hard-coded model price tables
- Provider API clients, model invocation proxy/gateway, and live vendor catalog synchronization
- Complete 30+ department specialist catalog
- Production Skill registry / marketplace
- Dashboard, cloud control plane, enterprise server, remote graph service
- Deep UGAS integration (beyond `integrations/ugas/` stub)
- Policy-as-code engine in `policies/`
- Signed review bundles (beyond SHA-256)
- Optional in-project footprint opt-in flag UX
- Windows code-signing of the CLI
- Production deployment automation, wallet custody, on-chain execution
- Formal waiver UX for selected gates
- Provider/runtime negotiation beyond the bounded Linux/Windows Node 20 compatibility proof
- Assurance dashboards, remote reviewer coordination, signed attestations, or a general policy-as-code engine
- Other Prompt 012 capabilities and any deployment/provider gateway expansion

If a change is useful but not required for the current DoD, add it here rather than expanding `src/`.
# Specialist routing backlog boundaries

Out of scope for Prompt 009: live marketplace/catalog discovery, provider APIs or credentials, vendor pricing, a full 30+ specialist catalog, dashboard/telemetry UI, UGAS/game-assets integration, and Prompt 010 work. Future work may add explicitly reviewed profiles, richer adapter negotiation, and dashboard presentation without changing the fail-closed registry and selection identity contract.
