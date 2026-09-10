# UADS2-REPO-001-C02 — Public Visibility Preparation

Status: IMPLEMENTED / AWAITING PR AUDIT
Parent governance issue: #9
Owner: NexLabs
Repository: KayzenRoot/uads-v2

## Objective

Prepare UADS V2 for an intentional Private -> Public visibility transition without changing product runtime behavior, while preserving NexLabs ownership, removing contradictory Apache/open-source root declarations, and recording a bounded exposure audit.

## Scope

- replace current root Apache-2.0 license with a proprietary source-visible NexLabs license;
- align README, NOTICE, package metadata, and contribution policy;
- add a public repository policy and visibility transition gate;
- audit the current tracked tree for common credential/private-data patterns available through the connected GitHub integration;
- preserve historical licensing truth for prior copies/releases;
- keep runtime implementation unchanged.

## Out of scope

- changing GitHub repository visibility itself;
- rewriting Git history;
- revoking rights validly granted to historical copies;
- changing third-party dependency licenses;
- changing application runtime behavior;
- disabling CI/security gates;
- patent filing or formal trademark registration.

## Acceptance criteria

1. Root LICENSE is proprietary/source-visible and reserves rights not expressly granted.
2. README no longer advertises Apache-2.0 for current V2.
3. NOTICE no longer calls current V2 open source.
4. package.json points to uads-v2 and uses custom-license metadata.
5. CONTRIBUTING does not imply Apache/open-source contribution terms for current V2.
6. PUBLIC-REPOSITORY-POLICY.md records exposure controls, audit limitations, and the manual visibility gate.
7. No evident current-tree credential is found by the bounded pattern audit.
8. Product runtime files remain unchanged.
9. PR review confirms no accidental weakening of security or governance.
10. Repository visibility remains private until this increment is merged and a final pre-switch reconciliation is complete.

## Risk

HIGH governance/IP impact, LOW runtime impact.

The licensing change is intentionally prospective. It does not claim to cancel rights that may already have attached to previously distributed copies under Apache-2.0 or another license.

## Stop condition

Stop before changing repository visibility. After this increment is merged and reconciled, explicitly instruct the repository owner to perform the Private -> Public switch because the connected GitHub integration does not expose that administrative mutation.
