# M19 — Evidence Cache 2.0
Status: DISCOVERY | Class: NECESSARY

Mission: reuse deterministic evidence only when its full validity basis remains provably unchanged.

Standalone: local content-addressed cache. Hive complement: can exchange proof references, not trust foreign cache blindly.

Candidate technology radar, UNAPPROVED: Merkle validity graph; proof dependency closure; proof-decay score; signed reuse receipt.

Sessions S00–S07 include validity research, cache architecture, poisoning/staleness, shadow benchmarks, slices, Hive proof references, freeze.

Mandatory tests: code/test/config/lock/schema/runtime drift invalidates when relevant, forged cache rejected, HIGH_ASSURANCE policy override, false-reuse benchmark.
