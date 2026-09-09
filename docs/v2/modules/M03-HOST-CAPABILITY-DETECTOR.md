# M03 — Host Capability Detector
Status: DISCOVERY | Class: NECESSARY

Mission: prove what the current host can actually do before UADS enables subagents, background execution, model controls, tools or telemetry.

Standalone: mandatory in solo mode. Hive complement: publishes capability facts, never imports Hive runtime assumptions.

Candidate technology radar, UNAPPROVED: signed/cached capability snapshots; active probe sandbox; confidence/expiry model; negative-capability proof; drift detector.

Sessions S00–S07: capability vocabulary, probing research, snapshot architecture, spoofing/failure model, matrix tests, implementation, host integration, freeze.

Mandatory tests: UNKNOWN≠TRUE, stale snapshot invalidation, spoof rejection, version drift, safe degradation.
