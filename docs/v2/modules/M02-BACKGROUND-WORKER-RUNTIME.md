# M02 — Background Worker Runtime
Status: DISCOVERY | Class: NECESSARY

Mission: execute specialist work without multiplying user-visible conversations when the host proves a safe background/headless mechanism.

Standalone: provides an internal worker abstraction independent of Hive. Hive complement: Hive may observe bounded receipts, not worker UI/session internals.

Candidate technology radar, UNAPPROVED: in-process role isolation; structured worker envelopes; session multiplexing; headless host bridge; privacy-safe result channel.

Sessions S00–S07 cover visibility metrics, host primitives, isolation architecture, failure/privacy, tests, slices, Cursor/Codex integration and freeze.

Mandatory tests: one primary visible session where supported, capability-absent fallback, isolation, cancellation, result attribution, no cross-worker context leak.
