# M23 — Capability Negotiation Layer
Status: DISCOVERY | Class: IMPORTANT

Mission: negotiate optional features among UADS core, host adapters and Hive bridge without assuming symmetric capabilities.

Standalone: negotiates host only when Hive absent. Hive connectivity is one optional peer.

Candidate technology radar, UNAPPROVED: capability lattice; version-range contract; downgrade transcript; feature dependency solver.

Sessions S00–S07 cover vocabulary, protocol, architecture, downgrade/security, compatibility property tests, implementation, multi-peer integration, freeze.

Mandatory tests: partial capability sets, incompatible versions, downgrade safety, unknown≠true, deterministic fallback.
