# M31 — Release Engineering & Safe Operations
Status: DISCOVERY | Class: NECESSARY

Mission: make releases, migrations and operational changes reversible, observable and evidence-gated.

Owns reversible migration strategy, rollback plans, feature flags/canary/blue-green when justified, compatibility/deprecation, schema/contract versioning, release gates, operational change impact, post-deploy verification and rollback triggers.

M26 owns learned-policy rollback; M31 owns runtime/product/config/schema release operations.

Mandatory evidence: rollback drill, migration reversibility or explicit irreversible-change gate, compatibility matrix, canary abort, post-deploy health verification, upgrade/downgrade path and release Evidence Bundle.
